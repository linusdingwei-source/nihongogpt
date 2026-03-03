# 云存储后端配置说明

项目支持多种云存储后端，**通过环境变量切换，无需改代码**。

## 配置方式

在 **`.env`** 或部署环境（如 SAE 环境变量）中设置：

```bash
STORAGE_PROVIDER=vercel-blob   # 或 aliyun-oss | aws-s3 | cloudflare-r2
```

再根据所选后端配置对应的环境变量即可。

## 支持的后端

| STORAGE_PROVIDER   | 说明       | 必需环境变量 |
|--------------------|------------|--------------|
| `vercel-blob`      | Vercel Blob（默认） | `BLOB_READ_WRITE_TOKEN` |
| `aliyun-oss`       | 阿里云 OSS | `OSS_REGION`, `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`；可选 `OSS_PREFIX` 指定 Bucket 下固定目录（与其它应用共用 Bucket 时使用） |
| `aws-s3`           | AWS S3     | `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| `cloudflare-r2`    | Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

## 示例

**使用 Vercel Blob（国际版 / Vercel 部署）：**
```bash
STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx
```

**使用阿里云 OSS（大陆版 / SAE 部署）：**
```bash
STORAGE_PROVIDER=aliyun-oss
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-bucket-name
# 与其它应用共用同一 Bucket 时，用 OSS_PREFIX 指定本项目的固定目录（如 nihongogpt）
OSS_PREFIX=nihongogpt
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
```

## 代码位置

- **配置与校验**：`lib/storage-config.ts`（`getStorageProvider()`、`assertStorageEnv()`）
- **上传入口**：`lib/storage.ts` 的 `uploadToStorage()`，内部按 `STORAGE_PROVIDER` 分发到对应实现
- **各后端实现**：`lib/storage/vercel-blob.ts`、`lib/storage/aliyun-oss.ts` 等

切换后端只需修改环境变量并配置对应密钥，无需改代码。
