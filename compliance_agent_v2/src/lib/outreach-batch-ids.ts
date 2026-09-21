/** Coerce JSON `batchIds` (or similar id arrays) into trimmed strings. */
export function parseStringIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Which batches an outbound training/course send may touch.
 * `null` means "every currently assigned batch" (first publish / MCQ ready).
 */
export function resolveOutreachBatchIds(input: {
  batchId?: string | null;
  batchIds?: string[] | null;
}): string[] | null {
  const fromList = parseStringIdList(input.batchIds);
  if (fromList.some((id) => id.toLowerCase() === "all")) return null;
  if (fromList.length > 0) return [...new Set(fromList)];
  const one = (input.batchId ?? "").trim();
  if (!one || one.toLowerCase() === "all") return null;
  return [one];
}
