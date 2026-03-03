import { put } from '@vercel/blob';
import type { UploadResult } from '../storage';

export async function uploadToVercelBlob(
  fileBuffer: Buffer,
  filename: string,
  contentType: string,
  pathOpts?: { pathPrefix: string; basename: string }
): Promise<UploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  const timestamp = Date.now();
  const uniqueFilename = pathOpts
    ? `${pathOpts.pathPrefix}/${timestamp}-${pathOpts.basename}`
    : filename;

  const blob = await put(uniqueFilename, fileBuffer, {
    access: 'public',
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: blob.url,
    filename: uniqueFilename,
    size: fileBuffer.length,
  };
}

