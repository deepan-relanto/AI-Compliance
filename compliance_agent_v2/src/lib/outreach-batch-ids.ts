/**
 * Which batches an outbound training/course send may touch.
 * `null` means "every currently assigned batch" (first publish / MCQ ready).
 */
export function resolveOutreachBatchIds(input: {
  batchId?: string | null;
  batchIds?: string[] | null;
}): string[] | null {
  const fromList = (input.batchIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (fromList.some((id) => id.toLowerCase() === "all")) return null;
  if (fromList.length > 0) return [...new Set(fromList)];
  const one = (input.batchId ?? "").trim();
  if (!one || one.toLowerCase() === "all") return null;
  return [one];
}
