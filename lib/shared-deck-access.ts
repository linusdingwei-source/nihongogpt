import { prisma } from '@/lib/prisma';

export type ResolveDeckScopeResult =
  | { ok: true; dataOwnerUserId: string }
  | { ok: false; status: 401 | 403 | 404 };

/**
 * 解析「按 deckId 拉取卡片/来源/目录」时应用哪一用户的库：
 * - 牌组所有者本人：用自己的 userId
 * - 公开牌组（isPublic）：任意访客可读，使用牌组所有者的 userId
 * - 非公开且非本人：403；无登录/匿名身份且非公开：401
 */
export async function resolveDeckScopedDataOwner(
  requestUserId: string | null,
  deckId: string | null | undefined
): Promise<ResolveDeckScopeResult> {
  if (!deckId) {
    if (!requestUserId) return { ok: false, status: 401 };
    return { ok: true, dataOwnerUserId: requestUserId };
  }

  const deck = await prisma.deck.findFirst({
    where: { id: deckId },
    select: { userId: true, isPublic: true },
  });
  if (!deck) return { ok: false, status: 404 };

  if (requestUserId && deck.userId === requestUserId) {
    return { ok: true, dataOwnerUserId: requestUserId };
  }
  if (deck.isPublic) {
    return { ok: true, dataOwnerUserId: deck.userId };
  }
  if (!requestUserId) return { ok: false, status: 401 };
  return { ok: false, status: 403 };
}

/** 沿 parent 链解析来源所属 deckId（子资源可能只挂 parent） */
export async function resolveSourceTreeDeckId(sourceId: string): Promise<string | null> {
  const visited = new Set<string>();
  let id: string | null = sourceId;
  while (id && !visited.has(id)) {
    visited.add(id);
    const cursorId: string = id;
    const row: { deckId: string | null; parentSourceId: string | null } | null =
      await prisma.source.findUnique({
        where: { id: cursorId },
        select: { deckId: true, parentSourceId: true },
      });
    if (!row) return null;
    if (row.deckId) return row.deckId;
    id = row.parentSourceId;
  }
  return null;
}

export async function viewerMayReadSource(
  requestUserId: string | null,
  source: { userId: string; deckId: string | null; id: string }
): Promise<boolean> {
  if (requestUserId && source.userId === requestUserId) return true;
  const deckId = source.deckId ?? (await resolveSourceTreeDeckId(source.id));
  if (!deckId) return false;
  const deck = await prisma.deck.findFirst({
    where: { id: deckId },
    select: { isPublic: true },
  });
  return deck?.isPublic === true;
}
