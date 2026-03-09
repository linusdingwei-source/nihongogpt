import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { getSignedUrlForStorageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// GET /api/cards/study - 获取待学习的卡片
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const deckId = searchParams.get('deckId');
    const deckName = searchParams.get('deck') || undefined;
    const cardType = searchParams.get('type'); // 'word' | 'sentence' | null (all)
    const sourceId = searchParams.get('sourceId') || undefined; // 选中资源时只学习该来源的卡片
    const limit = parseInt(searchParams.get('limit') || '20');

    console.log(`[StudyAPI] Request - userId: ${userId}, deckId: ${deckId}, sourceId: ${sourceId}, cardType: ${cardType}`);

    const now = new Date();

    // 构建查询条件
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      userId,
      category: 'CARD', // 只学习卡片，不学习笔记
    };

    // 仅当未按来源筛选时，才要求必须有背面内容且必须到期
    if (!sourceId) {
      where.backContent = { not: '' };
      where.OR = [
        { nextReviewAt: null },
        { nextReviewAt: { lte: now } },
      ];
      
      if (deckId) {
        where.deckId = deckId;
      } else if (deckName) {
        where.deckName = deckName;
      }
    } else {
      // 按来源筛选时，放宽限制以确保能看到卡片
      where.sourceId = sourceId;
    }

    // 根据类型筛选 (word -> 单词, sentence -> 非单词)
    if (cardType === 'word' || cardType === 'WORD') {
      where.cardType = '单词';
    } else if (cardType === 'sentence' || cardType === 'SENTENCE') {
      where.cardType = { not: '单词' };
    }

    console.log(`[StudyAPI] Final Where Clause:`, JSON.stringify(where, null, 2));

    // 查询待学习的卡片
    // 优先级：新卡片优先，然后是过期时间最早的
    const cards = await prisma.card.findMany({
      where,
      orderBy: [
        { nextReviewAt: 'asc' }, // null 值会排在最前面
        { createdAt: 'asc' },
      ],
      take: limit,
      select: {
        id: true,
        frontContent: true,
        backContent: true,
        cardType: true,
        audioUrl: true,
        timestamps: true,
        kanaText: true,
        deckName: true,
        interval: true,
        easeFactor: true,
        reviewCount: true,
        nextReviewAt: true,
        lastReviewedAt: true,
        createdAt: true,
      },
    });

    console.log(`[StudyAPI] Result - found ${cards.length} cards`);

    // 如果没搜到卡片且带了 sourceId，做个诊断查询
    if (cards.length === 0 && sourceId) {
      const totalRaw = await prisma.card.count({
        where: { userId, sourceId, category: 'CARD' }
      });
      console.log(`[StudyAPI] Diagnostic - Total cards for this sourceId (any type/deck/review): ${totalRaw}`);
      
      if (totalRaw > 0) {
        // 查一下这些卡片的具体属性，看是哪项过滤掉了
        const sample = await prisma.card.findFirst({
          where: { userId, sourceId, category: 'CARD' },
          select: { cardType: true, backContent: true, deckId: true, deckName: true }
        });
        console.log(`[StudyAPI] Sample card attributes:`, sample);
      }
    }

    // 统计待学习卡片数量
    const [newCount, reviewCount, totalFromSource] = await Promise.all([
      prisma.card.count({
        where: {
          ...where,
          nextReviewAt: null,
        },
      }),
      prisma.card.count({
        where: {
          ...where,
          nextReviewAt: { lte: now },
        },
      }),
      sourceId ? prisma.card.count({ where }) : Promise.resolve(0),
    ]);
    const total = sourceId ? totalFromSource : newCount + reviewCount;

    // 为音频 URL 生成签名
    const cardsWithSignedUrls = await Promise.all(cards.map(async (card) => ({
      ...card,
      audioUrl: await getSignedUrlForStorageUrl(card.audioUrl),
    })));

    return NextResponse.json(
      successResponse({
        cards: cardsWithSignedUrls,
        stats: {
          new: newCount,
          review: reviewCount,
          total,
        },
      })
    );
  } catch (error) {
    console.error('Get study cards error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch study cards'),
      { status: 500 }
    );
  }
}
