import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { getSignedUrlForStorageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
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

    const { id } = params;

    const deck = await prisma.deck.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { cards: true },
        },
      },
    });

    if (!deck) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Deck not found'),
        { status: 404 }
      );
    }

    const deckWithSignedUrl = {
      id: deck.id,
      name: deck.name,
      coverImageUrl: await getSignedUrlForStorageUrl(deck.coverImageUrl ?? null),
      cardCount: deck._count.cards,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };

    return NextResponse.json(
      successResponse({
        deck: deckWithSignedUrl,
      })
    );
  } catch (error) {
    console.error('Get deck details error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch deck details'),
      { status: 500 }
    );
  }
}
