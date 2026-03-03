import type { UploadResult } from '../storage';

export async function uploadToAliyunOSS(
  fileBuffer: Buffer,
  filename: string,
  contentType: string,
  pathOpts?: { pathPrefix: string; basename: string }
): Promise<UploadResult> {
  // 动态 import，配合 next.config serverExternalPackages 从 node_modules 加载
  let OSS: typeof import('ali-oss');
  try {
    OSS = (await import('ali-oss')).default;
  } catch {
    throw new Error('ali-oss package is not installed. Run: npm install ali-oss');
  }

  if (!process.env.OSS_REGION || !process.env.OSS_BUCKET || 
      !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
    throw new Error('Aliyun OSS configuration is incomplete');
  }

  // ali-oss 要求 region 格式为 oss-cn-{地域}，如 oss-cn-hangzhou
  let region = process.env.OSS_REGION.trim().replace(/^["']|["']$/g, '').trim();
  if (!region) {
    throw new Error('OSS_REGION is empty. Use e.g. oss-cn-hangzhou or cn-hangzhou');
  }
  if (!region.startsWith('oss-')) {
    region = `oss-${region}`;
  }
  region = region.toLowerCase();

  let client;
  try {
    client = new OSS({
      region,
      bucket: process.env.OSS_BUCKET.trim(),
      accessKeyId: process.env.OSS_ACCESS_KEY_ID.trim(),
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET.trim(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('region')) {
      throw new Error(
        `OSS region 格式错误（当前值: ${region}）。请将 .env 中 OSS_REGION 设为阿里云 OSS 地域 ID，例如：oss-cn-hangzhou、oss-cn-shanghai、oss-cn-beijing。若只填 cn-hangzhou 也会自动补全。`
      );
    }
    throw err;
  }

  // 可选：OSS_PREFIX 指定 Bucket 下的固定目录，便于与其它应用共用同一 Bucket（如 nihongogpt）
  const rawPrefix = (process.env.OSS_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');
  const prefix = rawPrefix ? `${rawPrefix}/` : '';

  const timestamp = Date.now();
  const uniqueFilename = pathOpts
    ? `${prefix}${pathOpts.pathPrefix}/${timestamp}-${pathOpts.basename}`
    : `${prefix}audio/${timestamp}-${filename}`;

  const result = await client.put(uniqueFilename, fileBuffer, {
    contentType,
  });

  return {
    url: result.url,
    filename: uniqueFilename,
    size: fileBuffer.length,
  };
}

/** 判断是否为当前配置的 OSS Bucket 的 URL */
export function isOurOssUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.aliyuncs.com')) return false;
    const bucket = (process.env.OSS_BUCKET ?? '').trim();
    let region = (process.env.OSS_REGION ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!region.startsWith('oss-')) region = `oss-${region}`;
    region = region.toLowerCase();
    const expectedHost = `${bucket}.${region}.aliyuncs.com`;
    return u.hostname === expectedHost;
  } catch {
    return false;
  }
}

/** 从 OSS 完整 URL 解析出 object key */
export function getOssKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const key = u.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    return null;
  }
}

/** 生成私有 Bucket 的签名访问 URL（默认 1 小时有效）
 * 使用 response-content-disposition=inline，使 PDF/图片在 iframe 中预览而非下载
 */
export async function getSignedUrl(
  objectKey: string,
  expiresSeconds: number = 3600,
  contentDisposition: 'inline' | 'attachment' = 'inline'
): Promise<string> {
  let OSS: any;
  try {
    const mod = await import('ali-oss');
    OSS = mod.default || mod;
  } catch {
    throw new Error('ali-oss package is not installed');
  }
  if (!process.env.OSS_REGION || !process.env.OSS_BUCKET || !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
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

  const responseQueries: Record<string, string> = {
    'response-content-disposition': contentDisposition,
  };

  // signatureUrlV4 更可靠，支持覆盖响应头
  const url = await client.signatureUrlV4('GET', expiresSeconds, {
    queries: responseQueries,
  }, objectKey);

  return typeof url === 'string' ? url : String(url);
}

