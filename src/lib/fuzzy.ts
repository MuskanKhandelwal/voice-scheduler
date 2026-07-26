// Bag-of-significant-words fuzzy title matching, shared by the dedupe guard
// (don't create a task that's a near-copy of an existing one) and the
// move/delete resolver (which existing event does "move the budget review"
// refer to?). Strips punctuation, short words, and common suffixes so
// "finding contacts" ≈ "find contact".

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => w.replace(/(ing|ies|es|s)$/, ""))
  );
}

export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** True if `title` closely matches any of the token sets in `others`. */
export function isNearDuplicateTitle(title: string, others: Set<string>[], threshold = 0.7): boolean {
  const a = titleTokens(title);
  if (!a.size) return false;
  return others.some((b) => tokenOverlap(a, b) >= threshold);
}
