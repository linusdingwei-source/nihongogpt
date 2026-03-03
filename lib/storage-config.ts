/**
 * 云存储后端配置
 * 通过环境变量 STORAGE_PROVIDER 选择后端，无需改代码即可切换 BLOB / OSS / S3 / R2。
 *
 * 配置方式（.env 或部署环境变量）：
 *   STORAGE_PROVIDER=vercel-blob   → Vercel Blob（需 BLOB_READ_WRITE_TOKEN）
 *   STORAGE_PROVIDER=aliyun-oss    → 阿里云 OSS（需 OSS_*；可选 OSS_PREFIX 指定 Bucket 下固定目录，便于与其它应用共用 Bucket）
 *   STORAGE_PROVIDER=aws-s3        → AWS S3（需 S3_*）
 *   STORAGE_PROVIDER=cloudflare-r2 → Cloudflare R2（需 R2_*）
 */

export type StorageProviderType =
  | 'vercel-blob'
  | 'aliyun-oss'
  | 'aws-s3'
  | 'cloudflare-r2';

const PROVIDER_ENV_KEYS: Record<StorageProviderType, string[]> = {
  'vercel-blob': ['BLOB_READ_WRITE_TOKEN'],
  'aliyun-oss': ['OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET'],
  'aws-s3': ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
  'cloudflare-r2': ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
};

const VALID_PROVIDERS: StorageProviderType[] = [
  'vercel-blob',
  'aliyun-oss',
  'aws-s3',
  'cloudflare-r2',
];

/**
 * 当前使用的存储后端（由环境变量 STORAGE_PROVIDER 决定，默认 vercel-blob）
 */
export function getStorageProvider(): StorageProviderType {
  const raw = process.env.STORAGE_PROVIDER?.toLowerCase().trim() || 'vercel-blob';
  if (VALID_PROVIDERS.includes(raw as StorageProviderType)) {
    return raw as StorageProviderType;
  }
  throw new Error(
    `Invalid STORAGE_PROVIDER="${raw}". Valid values: ${VALID_PROVIDERS.join(', ')}`
  );
}

/**
 * 检查当前 provider 所需的环境变量是否已配置（用于启动时快速失败）
 */
export function assertStorageEnv(): void {
  const provider = getStorageProvider();
  const keys = PROVIDER_ENV_KEYS[provider];
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Storage provider "${provider}" requires these env vars: ${keys.join(', ')}. Missing: ${missing.join(', ')}`
    );
  }
}

/**
 * 是否当前为阿里云 OSS 后端
 */
export function isAliyunOSS(): boolean {
  return getStorageProvider() === 'aliyun-oss';
}

/**
 * 是否当前为 Vercel Blob 后端
 */
export function isVercelBlob(): boolean {
  return getStorageProvider() === 'vercel-blob';
}
