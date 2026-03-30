/**
 * MCP Server Configuration
 * 
 * Environment Variables:
 * - NIHONGOGPT_API_URL: Base URL of the NihongoGPT API (e.g., https://nihongogpt.com)
 * - NIHONGOGPT_API_KEY: API key for authentication (starts with nkg_)
 */

export interface Config {
  apiUrl: string;
  apiKey: string;
}

export function getConfig(): Config {
  const apiUrl = process.env.NIHONGOGPT_API_URL;
  const apiKey = process.env.NIHONGOGPT_API_KEY;

  if (!apiUrl) {
    throw new Error('NIHONGOGPT_API_URL environment variable is required');
  }

  if (!apiKey) {
    throw new Error('NIHONGOGPT_API_KEY environment variable is required');
  }

  if (!apiKey.startsWith('nkg_')) {
    throw new Error('NIHONGOGPT_API_KEY must start with "nkg_"');
  }

  // Remove trailing slash from URL
  const normalizedUrl = apiUrl.replace(/\/+$/, '');

  return {
    apiUrl: normalizedUrl,
    apiKey,
  };
}
