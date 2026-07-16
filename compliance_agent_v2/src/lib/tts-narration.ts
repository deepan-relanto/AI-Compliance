const PAGE_COUNTER = /\b0?\d{1,2}\s*\/\s*0?\d{1,2}\b/gi;
const MODULE_COUNTER = /\bmodule\s+\d+\s+of\s+\d+\b/gi;
const NUMBER_ONLY = /^[\s\d./:–—-]+$/;

/** Remove slide chrome that should never be spoken aloud. */
export function sanitizeNarrationSource(text: string): string {
  return text
    .replace(/&ne;|≠/gi, " does not equal ")
    .replace(PAGE_COUNTER, " ")
    .replace(MODULE_COUNTER, " ")
    .replace(/\bconfidential\s*\|\s*relanto academy\b/gi, " ")
    .replace(/\brelanto\s*·\s*(?:ai fundamentals|scenario-based learning)\b/gi, " ")
    .replace(/\brelanto course\b/gi, " ")
    .replace(/\b(?:course overview|introduction|key concepts)\s*$/gi, " ")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** True only for text long enough to work as a useful spoken beat. */
export function isSpeakableNarration(text: string): boolean {
  const clean = sanitizeNarrationSource(text);
  if (!clean || NUMBER_ONLY.test(clean)) return false;
  const words = clean.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (clean.length < 45 || words.length < 8) return false;
  return /[.!?]/.test(clean) || clean.length >= 100;
}
