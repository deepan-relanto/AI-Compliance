/** Pick the later of two ISO timestamps. */
export function laterIso(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * When this learner was assigned this course in this batch.
 * Never use module.created_at (course authored date) or progress.created_at
 * (first open) — those made every row look the same or look like a start date.
 *
 * GREATEST(joined this batch, first invite wave for this batch×module).
 */
export function resolveAssignedAt(input: {
  userJoinedBatchAt: string | null;
  firstInviteThisBatch: string | null;
  moduleFirstInviteThisBatch: string | null;
}): string | null {
  const cohort =
    input.firstInviteThisBatch ?? input.moduleFirstInviteThisBatch ?? null;
  return laterIso(input.userJoinedBatchAt, cohort);
}
