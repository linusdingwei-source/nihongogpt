import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { getSignedUrlForStorageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

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

    const decks = await prisma.deck.findMany({
      where: { userId },
      include: {
        _count: {
          select: { cards: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const decksWithSignedUrls = await Promise.all(
      decks.map(async (deck) => ({
        id: deck.id,
        name: deck.name,
        coverImageUrl: await getSignedUrlForStorageUrl(deck.coverImageUrl ?? null),
        cardCount: deck._count.cards,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
      }))
    );

    return NextResponse.json(
      successResponse({
        decks: decksWithSignedUrls,
      })
    );
  } catch (error) {
    console.error('Get decks error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch decks'),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { name, coverImageUrl } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck name is required'),
        { status: 400 }
      );
    }
    const deckName = name.trim();
    const cover = typeof coverImageUrl === 'string' && coverImageUrl.trim() ? coverImageUrl.trim() : null;

    // 检查牌组是否已存在
    const existingDeck = await prisma.deck.findUnique({
      where: {
        userId_name: {
          userId,
          name: deckName,
        },
      },
    });

    if (existingDeck) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck already exists'),
        { status: 409 }
      );
    }

    const deck = await prisma.deck.create({
      data: {
        userId,
        name: deckName,
        ...(cover !== null && { coverImageUrl: cover }),
      },
    });

    return NextResponse.json(successResponse({ deck }));
  } catch (error) {
    console.error('Create deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create deck'),
      { status: 500 }
    );
  }
}

// 重命名牌组
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { id, newName, coverImageUrl } = await request.json();

    if (!id) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck ID is required'),
        { status: 400 }
      );
    }

    const trimmedNewName = typeof newName === 'string' ? newName.trim() : undefined;
    const cover = coverImageUrl === undefined
      ? undefined
      : (typeof coverImageUrl === 'string' && coverImageUrl.trim() ? coverImageUrl.trim() : null);

    if (trimmedNewName === undefined && cover === undefined) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Provide newName and/or coverImageUrl to update'),
        { status: 400 }
      );
    }

    // 查找牌组
    const deck = await prisma.deck.findFirst({
      where: { id, userId },
    });

    if (!deck) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Deck not found'),
        { status: 404 }
      );
    }

    const oldName = deck.name;

    // 若仅更新封面，不重命名
    if (trimmedNewName !== undefined && oldName !== trimmedNewName) {
      const existingDeck = await prisma.deck.findUnique({
        where: {
          userId_name: {
            userId,
            name: trimmedNewName,
          },
        },
      });

      if (existingDeck) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'A deck with this name already exists'),
          { status: 409 }
        );
      }
    }

    const updateData: { name?: string; coverImageUrl?: string | null } = {};
    if (trimmedNewName !== undefined) updateData.name = trimmedNewName;
    if (cover !== undefined) updateData.coverImageUrl = cover;

    const updatedDeck = await prisma.$transaction(async (tx) => {
      const updated = await tx.deck.update({
        where: { id },
        data: updateData,
      });

      if (trimmedNewName !== undefined && oldName !== trimmedNewName) {
        await tx.card.updateMany({
          where: {
            userId,
            deckName: oldName,
          },
          data: { deckName: trimmedNewName },
        });
      }

      return updated;
    });

    return NextResponse.json(successResponse({ deck: updatedDeck }));
  } catch (error) {
    console.error('Rename deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to rename deck'),
      { status: 500 }
    );
  }
}

