import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { uploadToStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * POST /api/upload/cover
 * 上传牌组封面图：支持 multipart file 或 JSON base64（粘贴截图）。
 * 存储路径：users/{userId}/covers/{timestamp}-{filename}
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);

    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'File is required'),
          { status: 400 }
        );
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'Only JPEG, PNG, WebP images are allowed'),
          { status: 400 }
        );
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'Image size must be under 2MB'),
          { status: 400 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      filename = `cover.${ext}`;
      mimeType = file.type;
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      const dataUrl = typeof body.image === 'string' ? body.image : '';
      const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'JSON body must include image as data URL (data:image/...;base64,...)'),
          { status: 400 }
        );
      }
      mimeType = match[1];
      const base64 = match[2];
      if (!ALLOWED_TYPES.includes(mimeType)) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'Only JPEG, PNG, WebP images are allowed'),
          { status: 400 }
        );
      }
      buffer = Buffer.from(base64, 'base64');
      if (buffer.length > MAX_SIZE) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'Image size must be under 2MB'),
          { status: 400 }
        );
      }
      const ext = mimeType.replace('image/', '') === 'jpeg' ? 'jpg' : mimeType.replace('image/', '');
      filename = `cover.${ext}`;
    } else {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Use multipart/form-data with file, or application/json with image (data URL)'),
        { status: 400 }
      );
    }

    const pathPrefix = `users/${userId}/covers`;
    const result = await uploadToStorage(buffer, filename, mimeType, { pathPrefix });

    return NextResponse.json(successResponse({ url: result.url }));
  } catch (err) {
    console.error('Upload cover error:', err);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to upload image'),
      { status: 500 }
    );
  }
}
