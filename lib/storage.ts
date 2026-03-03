/**
 * 云存储工具函数
 * 后端由配置控制：通过环境变量 STORAGE_PROVIDER 选择（vercel-blob | aliyun-oss | aws-s3 | cloudflare-r2）
 * 见 lib/storage-config.ts
 */

import { getStorageProvider } from './storage-config';
import type { StorageProviderType } from './storage-config';

export interface StorageConfig {
  provider: StorageProviderType;
  // Vercel Blob 配置
  vercelBlobToken?: string;
  // 阿里云 OSS 配置
  ossRegion?: string;
  ossBucket?: string;
  ossAccessKeyId?: string;
  ossAccessKeySecret?: string;
  // AWS S3 配置
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  // Cloudflare R2 配置
  r2AccountId?: string;
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
}

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
}

/** 上传时可选的路径前缀，用于按用户/类型管理（见 docs/OSS_STORAGE_LAYOUT.md） */
export interface UploadOptions {
  pathPrefix?: string;
}

/**
 * 上传文件到云存储
 * @param options.pathPrefix 若提供，则 object key = pathPrefix + '/' + timestamp + '-' + basename(filename)
 */
export async function uploadToStorage(
  fileBuffer: Buffer,
  filename: string,
  contentType: string = 'audio/mpeg',
  options?: UploadOptions
): Promise<UploadResult> {
  const provider = getStorageProvider();
  const pathPrefix = options?.pathPrefix;
  const basename = pathPrefix ? filename.replace(/^.*[/\\]/, '') || filename : filename;

  switch (provider) {
    case 'vercel-blob': {
      const { uploadToVercelBlob } = await import('./storage/vercel-blob');
      return uploadToVercelBlob(fileBuffer, filename, contentType, pathPrefix ? { pathPrefix, basename } : undefined);
    }
    case 'aliyun-oss': {
      const { uploadToAliyunOSS } = await import('./storage/aliyun-oss');
      return uploadToAliyunOSS(fileBuffer, filename, contentType, pathPrefix ? { pathPrefix, basename } : undefined);
    }
    case 'aws-s3': {
      const { uploadToAWSS3 } = await import('./storage/aws-s3');
      return uploadToAWSS3(fileBuffer, filename, contentType, pathPrefix ? { pathPrefix, basename } : undefined);
    }
    case 'cloudflare-r2': {
      const { uploadToCloudflareR2 } = await import('./storage/cloudflare-r2');
      return uploadToCloudflareR2(fileBuffer, filename, contentType, pathPrefix ? { pathPrefix, basename } : undefined);
    }
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

/**
 * 若当前为阿里云 OSS 且 URL 为本 Bucket 的地址，则返回签名 URL（私有桶访问）；否则返回原 URL。
 */
export async function getSignedUrlForStorageUrl(
  url: string | null,
  expiresSeconds: number = 3600
): Promise<string | null> {
  if (!url || !url.startsWith('http')) return url;
  if (getStorageProvider() !== 'aliyun-oss') return url;
  const { getSignedUrl: ossGetSignedUrl, isOurOssUrl, getOssKeyFromUrl } = await import('./storage/aliyun-oss');
  if (!isOurOssUrl(url)) return url;
  const key = getOssKeyFromUrl(url);
  if (!key) return url;
  return ossGetSignedUrl(key, expiresSeconds);
}
