/** URL-safe training module id from assignment title + timestamp. */
export function makeAssessmentId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "assessment"}-${Date.now().toString(36)}`;
}
