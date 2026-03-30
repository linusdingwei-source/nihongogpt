/**
 * Deck Tools for MCP Server
 * Provides tools for creating, listing, getting, updating, and deleting decks
 */

import { getClient } from '../client.js';

// Types
export interface Deck {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  shareToken?: string;
  cardCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeckListResponse {
  decks: Deck[];
}

export interface DeckDetailResponse {
  deck: Deck;
  cards?: Array<{
    id: string;
    frontContent: string;
    backContent: string;
    cardType: string;
  }>;
}

// Tool implementations
export async function createDeck(params: {
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<{ success: boolean; deck?: Deck; error?: string }> {
  const client = getClient();
  
  const response = await client.post<{ deck: Deck }>('/api/decks', {
    name: params.name,
    description: params.description,
    isPublic: params.isPublic ?? false,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to create deck' };
  }

  return {
    success: true,
    deck: response.data?.deck,
  };
}

export async function listDecks(): Promise<{ success: boolean; decks?: Deck[]; error?: string }> {
  const client = getClient();
  
  const response = await client.get<DeckListResponse>('/api/decks');

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to list decks' };
  }

  return {
    success: true,
    decks: response.data?.decks,
  };
}

export async function getDeck(params: {
  id: string;
  includeCards?: boolean;
}): Promise<{ success: boolean; deck?: Deck; cards?: DeckDetailResponse['cards']; error?: string }> {
  const client = getClient();
  
  const queryParams: Record<string, string> = {};
  if (params.includeCards) queryParams.includeCards = 'true';

  const response = await client.get<DeckDetailResponse>(`/api/decks/${params.id}`, queryParams);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Deck not found' };
  }

  return {
    success: true,
    deck: response.data?.deck,
    cards: response.data?.cards,
  };
}

export async function updateDeck(params: {
  id: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
}): Promise<{ success: boolean; deck?: Deck; error?: string }> {
  const client = getClient();
  
  const updateData: Record<string, unknown> = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.isPublic !== undefined) updateData.isPublic = params.isPublic;

  const response = await client.patch<{ deck: Deck }>(`/api/decks/${params.id}`, updateData);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to update deck' };
  }

  return {
    success: true,
    deck: response.data?.deck,
  };
}

export async function deleteDeck(params: {
  id: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  
  const response = await client.delete(`/api/decks/${params.id}`);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to delete deck' };
  }

  return { success: true };
}

// Tool definitions for MCP
export const deckToolDefinitions = [
  {
    name: 'create_deck',
    description: 'Create a new deck to organize flashcards',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the deck',
        },
        description: {
          type: 'string',
          description: 'Description of the deck',
        },
        isPublic: {
          type: 'boolean',
          description: 'Whether the deck should be publicly visible',
          default: false,
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_decks',
    description: 'List all decks owned by the user',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_deck',
    description: 'Get details of a specific deck, optionally including its cards',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The deck ID',
        },
        includeCards: {
          type: 'boolean',
          description: 'Whether to include the cards in the deck',
          default: false,
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_deck',
    description: 'Update deck properties',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The deck ID to update',
        },
        name: {
          type: 'string',
          description: 'New name for the deck',
        },
        description: {
          type: 'string',
          description: 'New description for the deck',
        },
        isPublic: {
          type: 'boolean',
          description: 'Whether the deck should be publicly visible',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_deck',
    description: 'Delete a deck. Note: Cards in the deck will be preserved but unassigned.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The deck ID to delete',
        },
      },
      required: ['id'],
    },
  },
];
