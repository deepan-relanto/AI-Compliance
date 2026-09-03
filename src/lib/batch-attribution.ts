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
 * Show currently assigned modules, plus historically invited ones, plus
 * progress stamped on this batch only when the module is not assigned to a
 * different batch (avoids Hyderabad false positives after republish).
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
  hasProgressOnBatch: boolean;
  assignedToOtherBatch: boolean;
}): boolean {
  if (input.currentlyAssigned) return true;
  if (input.hasInviteForBatch) return true;
  if (input.hasProgressOnBatch && !input.assignedToOtherBatch) return true;
  return false;
}
