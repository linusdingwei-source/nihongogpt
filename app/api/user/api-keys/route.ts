import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { createApiKeyForUser, listApiKeysForUser } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/api-keys
 * List all API keys for the authenticated user
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required'),
        { status: 401 }
      );
    }

    const apiKeys = await listApiKeysForUser(session.user.id);

    return NextResponse.json(
      successResponse({ apiKeys })
    );
  } catch (error) {
    console.error('List API keys error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list API keys'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/api-keys
 * Create a new API key for the authenticated user
 * Body: { name: string, expiresInDays?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required'),
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, expiresInDays } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'API key name is required'),
        { status: 400 }
      );
    }

    // Calculate expiration date if provided
    let expiresAt: Date | undefined;
    if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const result = await createApiKeyForUser(session.user.id, name.trim(), expiresAt);

    return NextResponse.json(
      successResponse({
        apiKey: {
          id: result.id,
          name: name.trim(),
          key: result.rawKey, // Only returned once on creation
          keyPrefix: result.keyPrefix,
          expiresAt: expiresAt?.toISOString() || null,
          createdAt: result.createdAt.toISOString(),
        },
        message: 'API key created successfully. Please copy the key now - it will not be shown again.',
      })
    );
  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create API key'),
      { status: 500 }
    );
  }
}
