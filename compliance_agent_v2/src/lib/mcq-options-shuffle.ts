/** Seeded shuffle — stable for the same seed string. */
export function seededShuffle<T>(items: T[], seedText: string): T[] {
  const arr = [...items];
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;

/**
 * Shuffle option labels and reassign ids a–d so the correct answer
 * is not stuck on letter "a".
 */
export function shuffleAndRemapMcqOptions(
  options: { id: string; label: string }[],
  correctOptionId: string,
  seed: string,
): { options: { id: string; label: string }[]; correctOptionId: string } {
  if (options.length !== 4) {
    return { options, correctOptionId };
  }

  const shuffled = seededShuffle(options, seed);
  const oldToNew = new Map<string, string>();
  shuffled.forEach((opt, index) => {
    oldToNew.set(opt.id, OPTION_LETTERS[index]);
  });

  return {
    options: shuffled.map((opt, index) => ({
      id: OPTION_LETTERS[index],
      label: opt.label,
    })),
    correctOptionId: oldToNew.get(correctOptionId) ?? correctOptionId,
  };
}

/** Shuffle display order only — ids stay tied to each option. */
export function shuffleOptionsForDisplay(
  options: { id: string; label: string }[],
  seed: string,
): { id: string; label: string }[] {
  return seededShuffle(options, seed);
}
