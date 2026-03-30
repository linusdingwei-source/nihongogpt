import { createHash, randomBytes } from 'crypto';
import { prisma } from './prisma';

const API_KEY_PREFIX = 'nkg_';

/**
 * Generate a new API key
 * @returns The raw API key (only shown once) and its hash
 */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  // Generate 32 random bytes and convert to base64
  const randomPart = randomBytes(32).toString('base64url');
  const rawKey = `${API_KEY_PREFIX}${randomPart}`;
  
  // Hash the key for storage
  const keyHash = hashApiKey(rawKey);
  
  // Store prefix for identification (first 8 chars after prefix)
  const keyPrefix = `${API_KEY_PREFIX}${randomPart.substring(0, 4)}...`;
  
  return { rawKey, keyHash, keyPrefix };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key and return the user ID if valid
 * @param apiKey The raw API key from the request
 * @returns User ID if valid, null otherwise
 */
export async function validateApiKey(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);
  
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
    },
  });

  if (!apiKeyRecord) {
    return null;
  }

  // Check if key is expired
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Ignore errors for last used update
  });

  return apiKeyRecord.userId;
}

/**
 * Get API key from request headers
 * Supports both X-API-Key header and Authorization: Bearer prefix
 */
export function getApiKeyFromRequest(request: Request): string | null {
  // Check X-API-Key header first
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader && apiKeyHeader.startsWith(API_KEY_PREFIX)) {
    return apiKeyHeader;
  }

  // Check Authorization header with Bearer token that looks like an API key
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }

  return null;
}

/**
 * Create a new API key for a user
 */
export async function createApiKeyForUser(
  userId: string,
  name: string,
  expiresAt?: Date
): Promise<{ id: string; rawKey: string; keyPrefix: string; createdAt: Date }> {
  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
      keyPrefix,
      expiresAt,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  return {
    id: apiKey.id,
    rawKey,
    keyPrefix,
    createdAt: apiKey.createdAt,
  };
}

/**
 * List API keys for a user (without the actual key values)
 */
export async function listApiKeysForUser(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete an API key
 */
export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  try {
    await prisma.apiKey.delete({
      where: {
        id: keyId,
        userId, // Ensure user owns this key
      },
    });
    return true;
  } catch {
    return false;
  }
}
