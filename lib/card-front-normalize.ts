/**
 * 卡片正面去重规范化（与 app/api/cards/generate 一致，供前后端共用）
 */
export function normalizeCardFrontForDedupe(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。．.!！?？、，,]+$/u, '')
    .trim();
}

export type DedupeableCardItem = { text: string; type: string; pageNumber?: number };

/**
 * 按「类型 + 规范化正文」去重，保留先出现的项。
 * @param crossBatchSeen 若传入，会与本次结果合并去重（用于 PDF 多页跨页去重）
 */
export function dedupeTargetCardItems<T extends DedupeableCardItem>(
  items: T[],
  crossBatchSeen?: Set<string>
): T[] {
  const seen = crossBatchSeen ?? new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.type}::${normalizeCardFrontForDedupe(item.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
