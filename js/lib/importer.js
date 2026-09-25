// Turns pasted text into cards. Works with text copied from Quizlet's export,
// spreadsheets (tab-separated), or simple "term - definition" lists.

export const TERM_SEPARATORS = [
  { id: 'tab', label: 'Tab', value: '\t' },
  { id: 'comma', label: 'Comma', value: ',' },
  { id: 'dash', label: 'Dash ( - )', value: ' - ' },
  { id: 'colon', label: 'Colon ( : )', value: ':' },
];

export const CARD_SEPARATORS = [
  { id: 'newline', label: 'New line', value: '\n' },
  { id: 'semicolon', label: 'Semicolon', value: ';' },
];

/**
 * @returns {{ cards: {term:string, definition:string}[], skipped: string[] }}
 */
export function parseImport(text, termSep = '\t', cardSep = '\n') {
  const cards = [];
  const skipped = [];
  const chunks = text.replace(/\r\n?/g, '\n').split(cardSep);
  for (const raw of chunks) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(termSep);
    if (at <= 0) {
      skipped.push(line);
      continue;
    }
    const term = line.slice(0, at).trim();
    const definition = line.slice(at + termSep.length).trim();
    if (term && definition) cards.push({ term, definition });
    else skipped.push(line);
  }
  return { cards, skipped };
}

/** Guess the separator used in pasted text. */
export function guessTermSeparator(text) {
  // Pick the separator found in the most lines (tab wins ties, then the list order).
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 50);
  let best = { id: 'tab', hits: 0 };
  for (const sep of TERM_SEPARATORS) {
    const hits = lines.filter((l) => l.includes(sep.value)).length;
    if (hits > best.hits) best = { id: sep.id, hits };
  }
  return best.id;
}
