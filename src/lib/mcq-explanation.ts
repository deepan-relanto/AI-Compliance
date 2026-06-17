const GENERIC_EXPLANATION_MARKERS = [
  "approved compliance process instead of taking an unsafe shortcut",
  "follows the approved compliance process and avoids unsafe shortcuts",
  "checks whether the learner applies the approved compliance process",
];

/** True when explanation is missing or uses the old generic template. */
export function isGenericExplanation(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  const lower = text.trim().toLowerCase();
  return GENERIC_EXPLANATION_MARKERS.some((marker) => lower.includes(marker));
}

/** Ensure stored explanations are two short, readable sentences. */
export function normalizeMcqExplanation(
  explanation: string | null | undefined,
  correctOptionLabel: string,
): string {
  const cleaned = explanation?.trim();
  if (cleaned && !isGenericExplanation(cleaned)) {
    return toTwoSentences(cleaned, correctOptionLabel);
  }
  return buildDefaultTwoLineExplanation(correctOptionLabel);
}

function toTwoSentences(text: string, correctOptionLabel: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`.trim();
  }

  if (parts.length === 1 && parts[0].length > 20) {
    return `${parts[0]} ${secondLineForWrongChoices()}`;
  }

  return buildDefaultTwoLineExplanation(correctOptionLabel);
}

function secondLineForWrongChoices(): string {
  return `The other options skip required approvals or use channels that are not allowed for client or company data.`;
}

export function buildDefaultTwoLineExplanation(correctOptionLabel: string): string {
  const action = correctOptionLabel.trim() || "the approved compliance process";
  return `${action} follows the policy taught in this module. The other choices create avoidable security, privacy, or approval risk.`;
}

/** Split explanation for UI (always returns 1–2 lines). */
export function formatExplanationLines(explanation: string): string[] {
  const normalized = explanation.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length >= 2) {
    return [sentences[0], sentences.slice(1).join(" ")];
  }
  return [normalized];
}
