/**
 * Source Tools for MCP Server
 * Provides tools for uploading, listing, getting, and deleting learning sources
 */

import { getClient } from '../client.js';

// Types
export interface Source {
  id: string;
  name: string;
  type: string;
  content?: string;
  contentUrl?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  deckId?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceListResponse {
  sources: Source[];
}

// Tool implementations
export async function uploadSource(params: {
  name: string;
  type: 'text';
  content: string;
  deckId?: string;
}): Promise<{ success: boolean; source?: Source; error?: string }> {
  const client = getClient();
  
  // For text content, we use JSON body
  const response = await client.post<{ source: Source }>('/api/sources', {
    name: params.name,
    type: params.type,
    content: params.content,
    deckId: params.deckId,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to upload source' };
  }

  return {
    success: true,
    source: response.data?.source,
  };
}

export async function listSources(params: {
  deckId?: string;
  type?: string;
  folderId?: string;
}): Promise<{ success: boolean; sources?: Source[]; error?: string }> {
  const client = getClient();
  
  const queryParams: Record<string, string> = {};
  if (params.deckId) queryParams.deckId = params.deckId;
  if (params.type) queryParams.type = params.type;
  if (params.folderId) queryParams.folderId = params.folderId;

  const response = await client.get<SourceListResponse>('/api/sources', queryParams);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to list sources' };
  }

  return {
    success: true,
    sources: response.data?.sources,
  };
}

export async function getSource(params: {
  id: string;
}): Promise<{ success: boolean; source?: Source; error?: string }> {
  const client = getClient();
  
  const response = await client.get<{ source: Source }>(`/api/sources/${params.id}`);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Source not found' };
  }

  return {
    success: true,
    source: response.data?.source,
  };
}

export async function updateSource(params: {
  id: string;
  name?: string;
  folderId?: string | null;
}): Promise<{ success: boolean; source?: Source; error?: string }> {
  const client = getClient();
  
  const updateData: Record<string, unknown> = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.folderId !== undefined) updateData.folderId = params.folderId;

  const response = await client.patch<{ source: Source }>(`/api/sources/${params.id}`, updateData);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to update source' };
  }

  return {
    success: true,
    source: response.data?.source,
  };
}

export async function deleteSource(params: {
  id: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  
  const response = await client.delete(`/api/sources/${params.id}`);

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to delete source' };
  }

  return { success: true };
}

// Tool definitions for MCP
export const sourceToolDefinitions = [
  {
    name: 'upload_source',
    description: 'Upload a text source as learning material. The source can be used later for generating flashcards.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name for the source (e.g., "Japanese Grammar Notes")',
        },
        type: {
          type: 'string',
          enum: ['text'],
          description: 'Type of source. Currently only "text" is supported via MCP.',
          default: 'text',
        },
        content: {
          type: 'string',
          description: 'The text content of the source (Japanese text, notes, etc.)',
        },
        deckId: {
          type: 'string',
          description: 'Optional: Associate the source with a specific deck',
        },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'list_sources',
    description: 'List all learning sources (text, files, etc.) for the user',
    inputSchema: {
      type: 'object' as const,
      properties: {
        deckId: {
          type: 'string',
          description: 'Filter sources by deck ID',
        },
        type: {
          type: 'string',
          description: 'Filter by source type (text, file, audio, image, pdf)',
        },
        folderId: {
          type: 'string',
          description: 'Filter by folder ID',
        },
      },
    },
  },
  {
    name: 'get_source',
    description: 'Get details of a specific source by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The source ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_source',
    description: 'Update source properties (name, folder)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The source ID to update',
        },
        name: {
          type: 'string',
          description: 'New name for the source',
        },
        folderId: {
          type: 'string',
          description: 'Move to a folder (use null for root)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_source',
    description: 'Delete a source by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The source ID to delete',
        },
      },
      required: ['id'],
    },
  },
];
