// Checking typed answers. Forgiving about capitals, extra spaces and
// punctuation; accents count as "almost right" (still correct, with a note).

function clean(s) {
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // ignore anything in (parentheses)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Compare what the user typed with the expected answer.
 * An answer like "hello, hi" also accepts just "hello" or "hi".
 * @returns {'correct' | 'accent' | 'wrong'}
 */
export function checkAnswer(given, expected) {
  const g = clean(given);
  if (!g) return 'wrong';
  const options = [expected, ...String(expected).split(/[,;/]/)].map(clean).filter(Boolean);
  if (options.includes(g)) return 'correct';
  const gNoAccent = stripAccents(g);
  if (options.some((o) => stripAccents(o) === gNoAccent)) return 'accent';
  return 'wrong';
}
