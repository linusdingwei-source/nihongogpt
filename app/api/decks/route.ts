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

    const [myDecks, collectedDecks] = await Promise.all([
      prisma.deck.findMany({
        where: { userId },
        include: {
          _count: {
            select: { cards: true },
          },
          user: {
            select: { name: true, image: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.collectedDeck.findMany({
        where: { userId },
        include: {
          deck: {
            include: {
              _count: {
                select: { cards: true },
              },
              user: {
                select: { name: true, image: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
      })
    ]);

    const formatDeck = async (deck: any, isCollected = false) => ({
      id: deck.id,
      name: deck.name,
      coverImageUrl: await getSignedUrlForStorageUrl(deck.coverImageUrl ?? null),
      cardCount: deck._count?.cards || 0,
      isPublic: deck.isPublic,
      description: deck.description,
      shareToken: deck.shareToken,
      author: deck.user?.name || 'Anonymous',
      authorImage: deck.user?.image || null,
      isCollected,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    });

    const formattedMyDecks = await Promise.all(myDecks.map(d => formatDeck(d)));
    const formattedCollectedDecks = await Promise.all(collectedDecks.map(c => formatDeck(c.deck, true)));

    return NextResponse.json(
      successResponse({
        decks: formattedMyDecks,
        collectedDecks: formattedCollectedDecks,
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

    const { name, coverImageUrl, isPublic, description } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck name is required'),
        { status: 400 }
      );
    }
    const deckName = name.trim();
    const cover = typeof coverImageUrl === 'string' && coverImageUrl.trim() ? coverImageUrl.trim() : null;

    const nameTaken = await prisma.deck.findUnique({
      where: { userId_name: { userId, name: deckName } },
    });
    if (nameTaken) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck name already exists'),
        { status: 400 }
      );
    }

    const deck = await prisma.deck.create({
      data: {
        userId,
        name: deckName,
        isPublic: !!isPublic,
        description: description || null,
        shareToken: isPublic ? Math.random().toString(36).substring(2, 15) : null,
        ...(cover !== null && { coverImageUrl: cover }),
      },
    });

    return NextResponse.json(successResponse({ 
      deck: {
        ...deck,
        coverImageUrl: await getSignedUrlForStorageUrl(deck.coverImageUrl ?? null),
      }
    }));
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

    const { id, newName, coverImageUrl, isPublic, description } = await request.json();

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

    if (trimmedNewName === undefined && cover === undefined && isPublic === undefined && description === undefined) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Provide updates (newName, cover, isPublic, or description)'),
        { status: 400 }
      );
    }

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

    const updateData: { name?: string; coverImageUrl?: string | null; isPublic?: boolean; description?: string | null; shareToken?: string | null } = {};
    if (trimmedNewName !== undefined) updateData.name = trimmedNewName;
    if (cover !== undefined) updateData.coverImageUrl = cover;
    if (isPublic !== undefined) {
      updateData.isPublic = isPublic;
      if (isPublic && !deck.shareToken) {
        updateData.shareToken = Math.random().toString(36).substring(2, 15);
      }
    }
    if (description !== undefined) updateData.description = description;

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

    return NextResponse.json(successResponse({ 
      deck: {
        ...updatedDeck,
        coverImageUrl: await getSignedUrlForStorageUrl(updatedDeck.coverImageUrl ?? null),
      }
    }));
  } catch (error) {
    console.error('Rename deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to rename deck'),
      { status: 500 }
    );
  }
}

