export function normalizeMcqPrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

export function dedupeMcqsByPrompt<T extends { id: string; prompt: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeMcqPrompt(item.prompt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** One checkpoint every 3 slides starting at slide 3. */
export function gateCountForSlides(slideCount: number): number {
  let count = 0;
  for (let slide = 3; slide <= Math.max(slideCount, 3); slide += 3) {
    count++;
  }
  return count;
}
