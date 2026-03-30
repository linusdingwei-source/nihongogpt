/**
 * HTTP Client for NihongoGPT API
 */

import { Config } from './config.js';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class ApiClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
    };
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(`${this.config.apiUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    return response.json() as Promise<ApiResponse<T>>;
  }
}

// Global client instance (initialized on server start)
let clientInstance: ApiClient | null = null;

export function initClient(config: Config): ApiClient {
  clientInstance = new ApiClient(config);
  return clientInstance;
}

export function getClient(): ApiClient {
  if (!clientInstance) {
    throw new Error('API client not initialized. Call initClient() first.');
  }
  return clientInstance;
}
