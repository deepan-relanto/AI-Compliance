/** Detect multi-select from learner-facing prompt text. */
export function isMultiSelectPrompt(prompt: string): boolean {
  return /\[select all that apply\]/i.test(prompt);
}

/** Parse stored correct_option_id — single "a" or multi "a,c,e". */
export function parseCorrectOptionIds(stored: string): string[] {
  return stored
    .split(/[,|]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeCorrectOptionStorage(
  correctOptionId?: string,
  correctOptionIds?: string[],
): string {
  if (correctOptionIds?.length) {
    const unique = [
      ...new Set(correctOptionIds.map((id) => id.trim().toLowerCase()).filter(Boolean)),
    ];
    unique.sort();
    return unique.join(",");
  }
  if (!correctOptionId?.trim()) return "";
  const parts = parseCorrectOptionIds(correctOptionId);
  if (parts.length > 1) {
    parts.sort();
    return parts.join(",");
  }
  return correctOptionId.trim().toLowerCase();
}

export function isMultiSelectAnswer(correctStored: string, prompt?: string): boolean {
  if (parseCorrectOptionIds(correctStored).length > 1) return true;
  return prompt ? isMultiSelectPrompt(prompt) : false;
}

export function validateMcqSelection(selected: string[], correctStored: string): boolean {
  const correct = new Set(parseCorrectOptionIds(correctStored));
  const picked = new Set(selected.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (correct.size === 0 || picked.size === 0) return false;
  if (correct.size !== picked.size) return false;
  for (const id of correct) {
    if (!picked.has(id)) return false;
  }
  return true;
}
