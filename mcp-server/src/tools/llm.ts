/**
 * LLM Analysis Tools for MCP Server
 * Provides tools for analyzing Japanese text using LLM
 */

import { getClient } from '../client.js';

// Types
export interface AnalysisResult {
  markdown: string;
  html: string;
  kanaText?: string;
}

export interface AnalyzeResponse {
  analysis: AnalysisResult;
  credits: number;
}

// Tool implementations
export async function analyzeText(params: {
  text: string;
}): Promise<{ success: boolean; analysis?: AnalysisResult; credits?: number; error?: string }> {
  const client = getClient();
  
  const response = await client.post<AnalyzeResponse>('/api/llm/analyze', {
    text: params.text,
  });

  if (!response.success) {
    return { success: false, error: response.error?.message || 'Failed to analyze text' };
  }

  return {
    success: true,
    analysis: response.data?.analysis,
    credits: response.data?.credits,
  };
}

// Tool definitions for MCP
export const llmToolDefinitions = [
  {
    name: 'analyze_text',
    description: 'Analyze Japanese text using LLM. Returns translation, grammar explanation, vocabulary breakdown, and reading (kana). Useful for understanding Japanese sentences before creating flashcards.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The Japanese text to analyze (sentence, phrase, or word)',
        },
      },
      required: ['text'],
    },
  },
];
