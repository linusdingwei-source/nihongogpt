/**
 * Card Tools for MCP Server
 * Provides tools for creating, listing, getting, updating, and deleting flashcards
 */

import { getClient } from '../client.js';

// Types
export interface Card {
  id: string;
  frontContent: string;
  backContent: string;
  cardType: string;
  category: string;
  audioUrl?: string;
  deckId?: string;
  deckName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CardListResponse {
  cards: Card[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CardGenerateResponse {
  card: Card;
  credits: number;
}

// Tool implementations
export async function createCard(params: {
  text: string;
  cardType?: string;
  deckName?: string;
  includePronunciation?: boolean;
}): Promise<{ success: boolean; card?: Card; error?: string; credits?: number }> {
  const client = getClient();
  
  const response = await client.post<CardGenerateResponse>('/api/cards/generate', {
    text: params.text,
    cardType: params.cardType || '问答题（附翻转卡片）',
    deckName: params.deckName || 'default',
    includePronunciation: params.includePronunciation ?? true,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to create card' };
  }

  return {
    success: true,
    card: response.data?.card,
    credits: response.data?.credits,
  };
}

export async function listCards(params: {
  page?: number;
  limit?: number;
  deckName?: string;
  search?: string;
  category?: string;
}): Promise<{ success: boolean; cards?: Card[]; pagination?: CardListResponse['pagination']; error?: string }> {
  const client = getClient();
  
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = params.page.toString();
  if (params.limit) queryParams.limit = params.limit.toString();
  if (params.deckName) queryParams.deck = params.deckName;
  if (params.search) queryParams.search = params.search;
  if (params.category) queryParams.category = params.category;

  const response = await client.get<CardListResponse>('/api/cards', queryParams);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to list cards' };
  }

  return {
    success: true,
    cards: response.data?.cards,
    pagination: response.data?.pagination,
  };
}

export async function getCard(params: {
  id: string;
}): Promise<{ success: boolean; card?: Card; error?: string }> {
  const client = getClient();
  
  const response = await client.get<{ card: Card }>(`/api/cards/${params.id}`);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Card not found' };
  }

  return {
    success: true,
    card: response.data?.card,
  };
}

export async function updateCard(params: {
  id: string;
  frontContent?: string;
  backContent?: string;
  cardType?: string;
  deckName?: string;
  tags?: string[];
}): Promise<{ success: boolean; card?: Card; error?: string }> {
  const client = getClient();
  
  const updateData: Record<string, unknown> = {};
  if (params.frontContent !== undefined) updateData.frontContent = params.frontContent;
  if (params.backContent !== undefined) updateData.backContent = params.backContent;
  if (params.cardType !== undefined) updateData.cardType = params.cardType;
  if (params.deckName !== undefined) updateData.deckName = params.deckName;
  if (params.tags !== undefined) updateData.tags = params.tags;

  const response = await client.put<{ card: Card }>(`/api/cards/${params.id}`, updateData);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to update card' };
  }

  return {
    success: true,
    card: response.data?.card,
  };
}

export async function deleteCard(params: {
  id: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  
  const response = await client.delete(`/api/cards/${params.id}`);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to delete card' };
  }

  return { success: true };
}

// Tool definitions for MCP
export const cardToolDefinitions = [
  {
    name: 'create_card',
    description: 'Create a new flashcard from Japanese text. The system will automatically analyze the text using LLM (translation, grammar, vocabulary) and optionally generate TTS audio.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The Japanese text to create a flashcard from (e.g., a sentence or word)',
        },
        cardType: {
          type: 'string',
          description: 'Type of card: "问答题（附翻转卡片）" (Q&A flip card), "单词" (vocabulary), "句子卡" (sentence)',
          default: '问答题（附翻转卡片）',
        },
        deckName: {
          type: 'string',
          description: 'Name of the deck to add the card to',
          default: 'default',
        },
        includePronunciation: {
          type: 'boolean',
          description: 'Whether to generate TTS audio for pronunciation',
          default: true,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_cards',
    description: 'List flashcards with optional filtering and pagination',
    inputSchema: {
      type: 'object' as const,
      properties: {
        page: {
          type: 'number',
          description: 'Page number (1-based)',
          default: 1,
        },
        limit: {
          type: 'number',
          description: 'Number of cards per page',
          default: 20,
        },
        deckName: {
          type: 'string',
          description: 'Filter by deck name',
        },
        search: {
          type: 'string',
          description: 'Search query for card content',
        },
        category: {
          type: 'string',
          description: 'Filter by category: "CARD" or "NOTE"',
        },
      },
    },
  },
  {
    name: 'get_card',
    description: 'Get details of a specific flashcard by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The card ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_card',
    description: 'Update an existing flashcard',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The card ID to update',
        },
        frontContent: {
          type: 'string',
          description: 'New front content (question/Japanese text)',
        },
        backContent: {
          type: 'string',
          description: 'New back content (answer/analysis in HTML)',
        },
        cardType: {
          type: 'string',
          description: 'New card type',
        },
        deckName: {
          type: 'string',
          description: 'Move to a different deck',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the card',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_card',
    description: 'Delete a flashcard by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The card ID to delete',
        },
      },
      required: ['id'],
    },
  },
];
