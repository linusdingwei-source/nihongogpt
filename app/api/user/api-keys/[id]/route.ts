import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { deleteApiKey } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/user/api-keys/[id]
 * Delete an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required'),
        { status: 401 }
      );
    }

    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'API key ID is required'),
        { status: 400 }
      );
    }

    const deleted = await deleteApiKey(session.user.id, id);

    if (!deleted) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'API key not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({ message: 'API key deleted successfully' })
    );
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete API key'),
      { status: 500 }
    );
  }
}
