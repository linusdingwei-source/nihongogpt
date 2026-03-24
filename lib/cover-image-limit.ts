/** 牌组封面上传大小上限（须与 `app/api/upload/cover` 一致） */
export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export function maxCoverImageSizeLabelMb(): number {
  return MAX_COVER_IMAGE_BYTES / (1024 * 1024);
}
