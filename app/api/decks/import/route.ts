import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

// Maximum cards per import
const MAX_CARDS_PER_IMPORT = 5000;

interface ImportCard {
  frontContent: string;
  backContent: string;
  tags?: string[];
  cardType?: string;
}

interface ImportRequest {
  deckName: string;
  cards: ImportCard[];
  description?: string;
}

/**
 * POST /api/decks/import
 * Import cards into a new or existing deck
 */
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

    const body: ImportRequest = await request.json();
    const { deckName, cards, description } = body;

    // Validation
    if (!deckName || typeof deckName !== 'string' || !deckName.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Deck name is required'),
        { status: 400 }
      );
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'At least one card is required'),
        { status: 400 }
      );
    }

    if (cards.length > MAX_CARDS_PER_IMPORT) {
      return NextResponse.json(
        errorResponse(
          ErrorCodes.BAD_REQUEST,
          `Maximum ${MAX_CARDS_PER_IMPORT} cards per import`
        ),
        { status: 400 }
      );
    }

    // Validate each card
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card.frontContent || typeof card.frontContent !== 'string') {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, `Card ${i + 1}: frontContent is required`),
          { status: 400 }
        );
      }
      if (!card.backContent || typeof card.backContent !== 'string') {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, `Card ${i + 1}: backContent is required`),
          { status: 400 }
        );
      }
    }

    const trimmedDeckName = deckName.trim();

    // Find or create deck
    let deck = await prisma.deck.findUnique({
      where: {
        userId_name: {
          userId,
          name: trimmedDeckName,
        },
      },
    });

    if (!deck) {
      deck = await prisma.deck.create({
        data: {
          userId,
          name: trimmedDeckName,
          description: description || `Imported from Anki`,
        },
      });
    }

    // Create cards in batches
    const BATCH_SIZE = 100;
    let createdCount = 0;
    let skippedCount = 0;

    // Get existing front contents for deduplication
    const existingCards = await prisma.card.findMany({
      where: {
        userId,
        deckId: deck.id,
      },
      select: {
        frontContent: true,
      },
    });
    const existingFronts = new Set(existingCards.map(c => c.frontContent.trim().toLowerCase()));

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      
      // Filter out duplicates
      const newCards = batch.filter(card => {
        const normalized = card.frontContent.trim().toLowerCase();
        if (existingFronts.has(normalized)) {
          return false;
        }
        existingFronts.add(normalized);
        return true;
      });

      skippedCount += batch.length - newCards.length;

      if (newCards.length > 0) {
        await prisma.card.createMany({
          data: newCards.map(card => ({
            userId,
            deckId: deck!.id,
            deckName: trimmedDeckName,
            frontContent: card.frontContent.trim(),
            backContent: card.backContent,
            cardType: card.cardType || 'Anki Import',
            tags: card.tags || [],
            category: 'CARD',
          })),
        });
        
        createdCount += newCards.length;
      }
    }

    // Get final deck stats
    const cardCount = await prisma.card.count({
      where: {
        userId,
        deckId: deck.id,
      },
    });

    return NextResponse.json(
      successResponse({
        deck: {
          id: deck.id,
          name: deck.name,
          description: deck.description,
          cardCount,
        },
        imported: createdCount,
        skipped: skippedCount,
        total: cards.length,
        message: `Successfully imported ${createdCount} cards${skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''}`,
      })
    );
  } catch (error) {
    console.error('Import deck error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to import deck'),
      { status: 500 }
    );
  }
}
