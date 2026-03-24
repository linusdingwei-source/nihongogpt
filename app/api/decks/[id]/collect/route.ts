import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const deckId = params.id;

    // 检查牌组是否存在且公开
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    });

    if (!deck) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Deck not found'),
        { status: 404 }
      );
    }

    if (!deck.isPublic && deck.userId !== userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.FORBIDDEN, 'This deck is private'),
        { status: 403 }
      );
    }

    // 检查是否已收藏
    const existing = await prisma.collectedDeck.findUnique({
      where: {
        userId_deckId: { userId, deckId }
      }
    });

    if (existing) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Already collected'),
        { status: 400 }
      );
    }

    await prisma.collectedDeck.create({
      data: { userId, deckId }
    });

    return NextResponse.json(successResponse({ message: 'Collected' }));
  } catch (error) {
    console.error('Collect deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to collect deck'),
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const deckId = params.id;

    await prisma.collectedDeck.deleteMany({
      where: { userId, deckId }
    });

    return NextResponse.json(successResponse({ message: 'Uncollected' }));
  } catch (error) {
    console.error('Uncollect deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to uncollect deck'),
      { status: 500 }
    );
  }
}
