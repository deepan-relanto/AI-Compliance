/**
 * A batch is a roster. Courses/assessments are assigned independently.
 * One "seat" is one person on one assigned course — the only KPI that
 * stays honest when a batch has many courses.
 */

export function assignedSeatCount(
  memberCount: number,
  modulesAssigned: number,
): number {
  return Math.max(0, memberCount) * Math.max(0, modulesAssigned);
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((100 * part) / whole)));
}

export function batchSeatCompletion(input: {
  memberCount: number;
  modulesAssigned: number;
  completed: number;
}): number {
  return percentOf(
    input.completed,
    assignedSeatCount(input.memberCount, input.modulesAssigned),
  );
}

export function seatMixPercents(input: {
  seats: number;
  completed: number;
  inProgress: number;
  locked: number;
}): { completed: number; inProgress: number; locked: number } {
  const completed = Math.max(0, input.completed);
  const inProgress = Math.max(0, input.inProgress);
  const locked = Math.max(0, input.locked);
  const used = completed + inProgress + locked;
  const denom = input.seats > 0 ? Math.max(input.seats, used) : used;
  if (denom <= 0) return { completed: 0, inProgress: 0, locked: 0 };
  return {
    completed: (100 * completed) / denom,
    inProgress: (100 * inProgress) / denom,
    locked: (100 * locked) / denom,
  };
}
