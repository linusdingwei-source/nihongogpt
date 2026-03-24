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
    
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const publicDecks = await prisma.deck.findMany({
      where: {
        isPublic: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        _count: {
          select: { cards: true },
        },
        user: {
          select: { name: true, image: true }
        },
        collections: userId ? {
          where: { userId }
        } : false
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const formattedDecks = await Promise.all(
      publicDecks.map(async (deck) => ({
        id: deck.id,
        name: deck.name,
        coverImageUrl: await getSignedUrlForStorageUrl(deck.coverImageUrl ?? null),
        description: deck.description,
        cardCount: deck._count.cards,
        author: deck.user?.name || 'Anonymous',
        authorImage: deck.user?.image || null,
        isCollected: !!(deck.collections && deck.collections.length > 0),
        updatedAt: deck.updatedAt,
      }))
    );

    return NextResponse.json(
      successResponse({
        decks: formattedDecks,
      })
    );
  } catch (error) {
    console.error('Get public decks error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch public decks'),
      { status: 500 }
    );
  }
}
