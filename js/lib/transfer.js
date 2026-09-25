// Export/import format, shared by the PC and Android versions, so sets can move
// between them. Pure functions (no page code), so they can be tested on their own.
//
// File format (JSON):
// { "format": "study-cards-export", "version": 1, "exported_at": "…", "source": "pc" | "android",
//   "sets": [ { "title": "…", "description": "…", "cards": [ { "term": "…", "definition": "…" } ] } ] }

export const FORMAT = 'study-cards-export';

export function buildExport(sets, source) {
  return {
    format: FORMAT,
    version: 1,
    exported_at: new Date().toISOString(),
    source,
    sets: sets.map((s) => ({
      title: s.title,
      description: s.description || '',
      cards: s.cards.map((c) => ({ term: c.term, definition: c.definition })),
    })),
  };
}

export function exportFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `study-cards-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Read an export file's text. Throws a friendly Error if it isn't one. */
export function parseExport(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new Error("That file isn't a Study Cards backup (it's not valid JSON).");
  }
  if (data?.format !== FORMAT || !Array.isArray(data.sets)) {
    throw new Error("That file isn't a Study Cards backup.");
  }
  if (data.version > 1) throw new Error('That backup was made by a newer version of the app. Update this app first.');
  return data.sets
    .map((s) => ({
      title: String(s?.title ?? '').trim(),
      description: String(s?.description ?? '').trim(),
      cards: (Array.isArray(s?.cards) ? s.cards : [])
        .map((c) => ({ term: String(c?.term ?? '').trim(), definition: String(c?.definition ?? '').trim() }))
        .filter((c) => c.term && c.definition),
    }))
    .filter((s) => s.title);
}

const sameCards = (a, b) =>
  a.length === b.length && a.every((c, i) => c.term === b[i].term && c.definition === b[i].definition);

/**
 * Decide what to do with each incoming set, compared with the sets you already have:
 *   'skip'   — you already have an identical set (same title and cards)
 *   'rename' — a different set with that title exists, so it's imported as "Title (imported)"
 *   'new'    — imported as is
 * @param incoming  sets from parseExport
 * @param existing  your current sets, each { title, cards }
 */
export function planImport(incoming, existing) {
  const titles = new Set(existing.map((s) => s.title));
  return incoming.map((set) => {
    if (existing.some((e) => e.title === set.title && sameCards(e.cards, set.cards))) {
      return { set, action: 'skip', title: set.title };
    }
    if (!titles.has(set.title)) {
      titles.add(set.title);
      return { set, action: 'new', title: set.title };
    }
    let n = 1;
    let title = `${set.title} (imported)`;
    while (titles.has(title)) title = `${set.title} (imported ${++n})`;
    titles.add(title);
    return { set, action: 'rename', title };
  });
}
