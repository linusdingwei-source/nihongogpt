import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import {
  uploadToStorage,
  userStoragePathPrefix,
  getSignedUrlForStorageUrl,
} from '@/lib/storage';
import { MAX_COVER_IMAGE_BYTES } from '@/lib/cover-image-limit';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = MAX_COVER_IMAGE_BYTES;

/** 从扩展名推断 MIME（部分浏览器 File.type 为空） */
function mimeFromFilename(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/**
 * POST /api/upload/cover
 * 上传牌组封面图：支持 multipart file 或 JSON base64（粘贴截图）。
 * 存储路径：users/{userId}/covers/{timestamp}-{filename}；单张上限见 lib/cover-image-limit.ts
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

    // Content-Type 大小写不统一；非 JSON 一律按 multipart 解析（含缺失/异常头时的 FormData 上传）
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (contentType.includes('application/json')) {
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
          errorResponse(
            ErrorCodes.BAD_REQUEST,
            `Image size must be under ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB`
          ),
          { status: 400 }
        );
      }
      const ext = mimeType.replace('image/', '') === 'jpeg' ? 'jpg' : mimeType.replace('image/', '');
      filename = `cover.${ext}`;
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          errorResponse(
            ErrorCodes.BAD_REQUEST,
            'Use multipart/form-data with field "file", or application/json with image (data URL)'
          ),
          { status: 400 }
        );
      }
      const resolvedMime =
        file.type && ALLOWED_TYPES.includes(file.type)
          ? file.type
          : mimeFromFilename(file.name);
      if (!resolvedMime || !ALLOWED_TYPES.includes(resolvedMime)) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'Only JPEG, PNG, WebP images are allowed'),
          { status: 400 }
        );
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          errorResponse(
            ErrorCodes.BAD_REQUEST,
            `Image size must be under ${MAX_COVER_IMAGE_BYTES / (1024 * 1024)}MB`
          ),
          { status: 400 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      filename = `cover.${ext}`;
      mimeType = resolvedMime;
    }

    const pathPrefix = userStoragePathPrefix(userId, 'covers');
    const result = await uploadToStorage(buffer, filename, mimeType, { pathPrefix });
    // 私有桶下浏览器需签名 URL 才能预览；签名为短期（24h），入库仍用永久 object URL
    const displayUrl =
      (await getSignedUrlForStorageUrl(result.url, 86400)) ?? result.url;

    return NextResponse.json(
      successResponse({
        url: result.url,
        displayUrl,
      })
    );
  } catch (err) {
    console.error('Upload cover error:', err);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to upload image'),
      { status: 500 }
    );
  }
}
