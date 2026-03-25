import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { getSignedDeckCoverUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const deck = await prisma.deck.findUnique({
      where: { shareToken: token },
      include: {
        _count: {
          select: { cards: true },
        },
        user: {
          select: { name: true, image: true }
        },
      },
    });

    if (!deck) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Shared deck not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({
        deck: {
          id: deck.id,
          name: deck.name,
          coverImageUrl: await getSignedDeckCoverUrl(deck.coverImageUrl ?? null),
          description: deck.description,
          cardCount: deck._count.cards,
          author: deck.user?.name || 'Anonymous',
          authorImage: deck.user?.image || null,
          updatedAt: deck.updatedAt,
        },
      })
    );
  } catch (error) {
    console.error('Get shared deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch shared deck'),
      { status: 500 }
    );
  }
}
