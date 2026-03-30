/**
 * 用户隔离的云存储路径前缀（见 docs/OSS_STORAGE_LAYOUT.md）
 * 统一为 `users/{userId}/{segment}/`，便于按用户统计与注销时整前缀删除。
 */
export type UserStorageSegment = 'sources' | 'covers' | 'audio' | 'anki';

export function userStoragePathPrefix(
  userId: string,
  segment: UserStorageSegment
): string {
  return `users/${userId}/${segment}`;
}
