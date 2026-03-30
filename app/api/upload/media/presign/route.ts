import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { getStorageProvider } from '@/lib/storage-config';
import { userStoragePathPrefix } from '@/lib/storage-path';

export const dynamic = 'force-dynamic';

// Maximum file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Allowed MIME types for media
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
}

/**
 * POST /api/upload/media/presign
 * Get a presigned URL for uploading media directly to storage
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

    const body: PresignRequest = await request.json();
    const { filename, contentType, size } = body;

    // Validate content type
    if (!ALLOWED_TYPES[contentType]) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, `Unsupported file type: ${contentType}`),
        { status: 400 }
      );
    }

    // Validate file size
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`),
        { status: 400 }
      );
    }

    const provider = getStorageProvider();
    const timestamp = Date.now();
    const ext = ALLOWED_TYPES[contentType];
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const objectKey = `${userStoragePathPrefix(userId, 'anki')}/${timestamp}-${safeFilename}.${ext}`;

    if (provider === 'aliyun-oss') {
      const signedUrl = await getOSSPresignedPutUrl(objectKey, contentType);
      return NextResponse.json(
        successResponse({
          uploadUrl: signedUrl,
          publicUrl: getOSSPublicUrl(objectKey),
          objectKey,
          method: 'PUT',
        })
      );
    } else if (provider === 'vercel-blob') {
      // For Vercel Blob, client uploads through our API
      return NextResponse.json(
        successResponse({
          provider: 'vercel-blob',
          objectKey,
          // Vercel Blob uses a different approach - client uploads through our API
          uploadUrl: '/api/upload/media/blob',
          method: 'POST',
        })
      );
    } else {
      // Fallback: upload through server
      return NextResponse.json(
        successResponse({
          provider,
          uploadUrl: '/api/upload/media',
          method: 'POST',
        })
      );
    }
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to generate presigned URL'),
      { status: 500 }
    );
  }
}

/**
 * Get OSS presigned PUT URL for direct upload
 */
async function getOSSPresignedPutUrl(
  objectKey: string,
  contentType: string,
  expiresSeconds: number = 3600
): Promise<string> {
  // Dynamic import ali-oss
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let OSS: any;
  try {
    // @ts-expect-error - ali-oss has no type declarations
    const mod = await import('ali-oss');
    OSS = mod.default || mod;
    if (OSS && OSS.default && typeof OSS !== 'function') {
      OSS = OSS.default;
    }
  } catch (e) {
    console.error('Failed to import ali-oss:', e);
    throw new Error('ali-oss package load failed');
  }

  if (!process.env.OSS_REGION || !process.env.OSS_BUCKET ||
    !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
    throw new Error('Aliyun OSS configuration is incomplete');
  }

  let region = process.env.OSS_REGION.trim().replace(/^["']|["']$/g, '').trim();
  if (!region.startsWith('oss-')) region = `oss-${region}`;
  region = region.toLowerCase();

  const client = new OSS({
    region,
    bucket: process.env.OSS_BUCKET.trim(),
    accessKeyId: process.env.OSS_ACCESS_KEY_ID.trim(),
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET.trim(),
    secure: true,
  });

  // Generate presigned URL for PUT operation
  const url = await client.signatureUrlV4('PUT', expiresSeconds, {
    headers: {
      'Content-Type': contentType,
    },
  }, objectKey);

  return typeof url === 'string' ? url : String(url);
}

/**
 * Get the public URL for an OSS object
 */
function getOSSPublicUrl(objectKey: string): string {
  const bucket = process.env.OSS_BUCKET?.trim() || '';
  let region = process.env.OSS_REGION?.trim().replace(/^["']|["']$/g, '').trim() || '';
  if (!region.startsWith('oss-')) region = `oss-${region}`;
  region = region.toLowerCase();
  
  return `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
}
