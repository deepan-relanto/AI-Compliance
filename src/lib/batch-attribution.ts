/**
 * Batch attribution for multi-batch learners.
 *
 * Progress and email rows store a single `batch_id`. For people in more than
 * one batch that stamp is often `users.batch_id` (primary) rather than the
 * batch the module is actually assigned to. Admin analytics then looks like
 * Hyderabad owns AI-basics because three Planning members also sit in Hyderabad.
 *
 * Read-time rule (never rewrites stored rows):
 * 1. Keep the stored batch if that batch currently has the module assigned.
 * 2. Otherwise use the learner's membership ∩ module assignment (oldest first).
 * 3. Otherwise keep the stored batch (historical / unassigned modules).
 *
 * Module list on a batch (analytics Courses / Compliance):
 * Show currently assigned modules, historically invited ones, and any module
 * with progress attributed to this batch (so seat KPIs match completions).
 * Mis-stamped progress remaps away via attribution before it counts here.
 */

export function resolveAttributedBatchId(input: {
  storedBatchId: string | null;
  storedBatchHasAssignment: boolean;
  membershipAssignedBatchIds: string[];
}): string | null {
  const stored = input.storedBatchId?.trim() || null;
  if (stored && input.storedBatchHasAssignment) {
    return stored;
  }
  const assigned = input.membershipAssignedBatchIds
    .map((id) => id.trim())
    .filter(Boolean);
  if (assigned.length > 0) {
    return assigned[0];
  }
  return stored;
}

/** Whether admin analytics should list a module on a batch roster. */
export function moduleVisibleOnBatch(input: {
  currentlyAssigned: boolean;
  hasInviteForBatch: boolean;
  /** Progress remapped to this batch at read time. */
  hasAttributedProgress: boolean;
}): boolean {
  if (input.currentlyAssigned) return true;
  if (input.hasInviteForBatch) return true;
  if (input.hasAttributedProgress) return true;
  return false;
}
