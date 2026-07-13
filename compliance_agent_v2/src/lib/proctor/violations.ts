export const PROCTOR_MAX_WARNINGS = 3;

export type ProctorViolationReason =
  | "Exited Fullscreen"
  | "Switched Browser Tab"
  | "Window Lost Focus"
  | "Attempted Navigation";

export const PROCTOR_VIOLATION_MESSAGES: Record<ProctorViolationReason, string> = {
  "Exited Fullscreen": "You exited fullscreen mode. Stay in fullscreen for the entire session.",
  "Switched Browser Tab": "You switched away from the assessment tab.",
  "Window Lost Focus": "The assessment window lost focus.",
  "Attempted Navigation": "You attempted to leave or refresh the page.",
};

export function isProctorViolationReason(value: string): value is ProctorViolationReason {
  return value in PROCTOR_VIOLATION_MESSAGES;
}
