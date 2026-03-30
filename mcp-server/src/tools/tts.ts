/**
 * TTS (Text-to-Speech) Tools for MCP Server
 * Provides tools for generating audio from Japanese text
 */

import { getClient } from '../client.js';

// Types
export interface TTSResponse {
  audio: string; // Base64 encoded audio
  format: string;
  credits: number;
}

export interface TTSEnhancedResponse {
  audioUrl: string;
  timestamps?: Array<{
    begin_time: number;
    end_time: number;
    text: string;
  }>;
  credits: number;
}

// Tool implementations
export async function generateTTS(params: {
  text: string;
}): Promise<{ success: boolean; audio?: string; format?: string; credits?: number; error?: string }> {
  const client = getClient();
  
  const response = await client.post<TTSResponse>('/api/tts/generate', {
    text: params.text,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to generate TTS' };
  }

  return {
    success: true,
    audio: response.data?.audio,
    format: response.data?.format,
    credits: response.data?.credits,
  };
}

export async function generateTTSEnhanced(params: {
  text: string;
  includeTimestamps?: boolean;
}): Promise<{ success: boolean; audioUrl?: string; timestamps?: TTSEnhancedResponse['timestamps']; credits?: number; error?: string }> {
  const client = getClient();
  
  const response = await client.post<TTSEnhancedResponse>('/api/tts/generate-enhanced', {
    text: params.text,
    includeTimestamps: params.includeTimestamps ?? true,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to generate enhanced TTS' };
  }

  return {
    success: true,
    audioUrl: response.data?.audioUrl,
    timestamps: response.data?.timestamps,
    credits: response.data?.credits,
  };
}

// Tool definitions for MCP
export const ttsToolDefinitions = [
  {
    name: 'generate_tts',
    description: 'Generate text-to-speech audio for Japanese text. Returns base64 encoded MP3 audio.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The Japanese text to convert to speech',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'generate_tts_enhanced',
    description: 'Generate enhanced text-to-speech with word-level timestamps. Returns a URL to the audio file and optional timestamps for karaoke-style highlighting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The Japanese text to convert to speech',
        },
        includeTimestamps: {
          type: 'boolean',
          description: 'Whether to include word-level timestamps for highlighting',
          default: true,
        },
      },
      required: ['text'],
    },
  },
];
