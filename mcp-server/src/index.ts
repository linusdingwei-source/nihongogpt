#!/usr/bin/env node

/**
 * NihongoGPT MCP Server
 * 
 * A Model Context Protocol server that enables AI agents to interact with
 * the NihongoGPT Japanese flashcard learning platform.
 * 
 * Features:
 * - Create and manage flashcards with AI-powered analysis
 * - Organize cards into decks
 * - Upload and manage learning sources
 * - Analyze Japanese text (translation, grammar, vocabulary)
 * - Generate TTS audio for pronunciation practice
 * 
 * Usage:
 * Set environment variables:
 *   NIHONGOGPT_API_URL=https://your-nihongogpt-instance.com
 *   NIHONGOGPT_API_KEY=nkg_your_api_key
 * 
 * Run:
 *   node dist/index.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig } from './config.js';
import { initClient } from './client.js';

// Import tools
import {
  createCard,
  listCards,
  getCard,
  updateCard,
  deleteCard,
  cardToolDefinitions,
} from './tools/cards.js';

import {
  createDeck,
  listDecks,
  getDeck,
  updateDeck,
  deleteDeck,
  deckToolDefinitions,
} from './tools/decks.js';

import {
  uploadSource,
  listSources,
  getSource,
  updateSource,
  deleteSource,
  sourceToolDefinitions,
} from './tools/sources.js';

import {
  analyzeText,
  llmToolDefinitions,
} from './tools/llm.js';

import {
  generateTTS,
  generateTTSEnhanced,
  ttsToolDefinitions,
} from './tools/tts.js';

// Initialize configuration and client
const config = getConfig();
initClient(config);

// Create MCP server
const server = new Server(
  {
    name: 'nihongogpt-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Combine all tool definitions
const allToolDefinitions = [
  ...cardToolDefinitions,
  ...deckToolDefinitions,
  ...sourceToolDefinitions,
  ...llmToolDefinitions,
  ...ttsToolDefinitions,
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allToolDefinitions,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as Record<string, unknown>;

  try {
    let result: unknown;

    switch (name) {
      // Card tools
      case 'create_card':
        result = await createCard({
          text: params.text as string,
          cardType: params.cardType as string | undefined,
          deckName: params.deckName as string | undefined,
          includePronunciation: params.includePronunciation as boolean | undefined,
        });
        break;

      case 'list_cards':
        result = await listCards({
          page: params.page as number | undefined,
          limit: params.limit as number | undefined,
          deckName: params.deckName as string | undefined,
          search: params.search as string | undefined,
          category: params.category as string | undefined,
        });
        break;

      case 'get_card':
        result = await getCard({
          id: params.id as string,
        });
        break;

      case 'update_card':
        result = await updateCard({
          id: params.id as string,
          frontContent: params.frontContent as string | undefined,
          backContent: params.backContent as string | undefined,
          cardType: params.cardType as string | undefined,
          deckName: params.deckName as string | undefined,
          tags: params.tags as string[] | undefined,
        });
        break;

      case 'delete_card':
        result = await deleteCard({
          id: params.id as string,
        });
        break;

      // Deck tools
      case 'create_deck':
        result = await createDeck({
          name: params.name as string,
          description: params.description as string | undefined,
          isPublic: params.isPublic as boolean | undefined,
        });
        break;

      case 'list_decks':
        result = await listDecks();
        break;

      case 'get_deck':
        result = await getDeck({
          id: params.id as string,
          includeCards: params.includeCards as boolean | undefined,
        });
        break;

      case 'update_deck':
        result = await updateDeck({
          id: params.id as string,
          name: params.name as string | undefined,
          description: params.description as string | undefined,
          isPublic: params.isPublic as boolean | undefined,
        });
        break;

      case 'delete_deck':
        result = await deleteDeck({
          id: params.id as string,
        });
        break;

      // Source tools
      case 'upload_source':
        result = await uploadSource({
          name: params.name as string,
          type: 'text',
          content: params.content as string,
          deckId: params.deckId as string | undefined,
        });
        break;

      case 'list_sources':
        result = await listSources({
          deckId: params.deckId as string | undefined,
          type: params.type as string | undefined,
          folderId: params.folderId as string | undefined,
        });
        break;

      case 'get_source':
        result = await getSource({
          id: params.id as string,
        });
        break;

      case 'update_source':
        result = await updateSource({
          id: params.id as string,
          name: params.name as string | undefined,
          folderId: params.folderId as string | null | undefined,
        });
        break;

      case 'delete_source':
        result = await deleteSource({
          id: params.id as string,
        });
        break;

      // LLM tools
      case 'analyze_text':
        result = await analyzeText({
          text: params.text as string,
        });
        break;

      // TTS tools
      case 'generate_tts':
        result = await generateTTS({
          text: params.text as string,
        });
        break;

      case 'generate_tts_enhanced':
        result = await generateTTSEnhanced({
          text: params.text as string,
          includeTimestamps: params.includeTimestamps as boolean | undefined,
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Handle list resources request (provides access to user's data)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // List available resource types
  return {
    resources: [
      {
        uri: 'nihongogpt://decks',
        name: 'Decks',
        description: 'List all flashcard decks',
        mimeType: 'application/json',
      },
      {
        uri: 'nihongogpt://cards',
        name: 'Cards',
        description: 'List all flashcards',
        mimeType: 'application/json',
      },
      {
        uri: 'nihongogpt://sources',
        name: 'Sources',
        description: 'List all learning sources',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle read resource request
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let result: unknown;

    if (uri === 'nihongogpt://decks') {
      result = await listDecks();
    } else if (uri === 'nihongogpt://cards') {
      result = await listCards({ limit: 100 });
    } else if (uri === 'nihongogpt://sources') {
      result = await listSources({});
    } else if (uri.startsWith('nihongogpt://deck/')) {
      const id = uri.replace('nihongogpt://deck/', '');
      result = await getDeck({ id, includeCards: true });
    } else if (uri.startsWith('nihongogpt://card/')) {
      const id = uri.replace('nihongogpt://card/', '');
      result = await getCard({ id });
    } else if (uri.startsWith('nihongogpt://source/')) {
      const id = uri.replace('nihongogpt://source/', '');
      result = await getSource({ id });
    } else {
      throw new Error(`Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('NihongoGPT MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
