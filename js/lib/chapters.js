// Organizing a pile of notes files into chapters. Pure functions (no page code),
// so they can be tested on their own.
//
// How chapters are detected, in order:
//   1. Subfolders:   "Unit 1/intro.txt", "Unit 2/cells.txt"  → one chapter per subfolder
//   2. Number prefix: "1.1 Laptops.txt", "1.2 Phones.txt", "2.1 Ports.txt",
//                     "Chapter 3 - Cells.txt", "Week 04 notes.txt" → grouped by the first number
//   3. Otherwise every file goes into a single chapter.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const PREFIX_WORDS = 'chapter|chap|ch|unit|module|mod|section|sec|lesson|week|wk|part|domain|topic|lecture|lec';
const NUMBER_PREFIX = new RegExp(`^\\s*(?:(${PREFIX_WORDS})\\.?[\\s_-]*)?0*(\\d{1,3})(?=[\\s._\\-:)]|$)`, 'i');

/** "3.5 BIOS Settings.txt" → "BIOS Settings";  "Chapter 2 - Cells.txt" → "Cells" */
export function topicFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const cleaned = base
    .replace(new RegExp(`^\\s*(?:(?:${PREFIX_WORDS})\\.?[\\s_-]*)?[\\d.]+[\\s\\-_:.)]*`, 'i'), '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || base.trim();
}

function chapterNumber(name) {
  const m = name.match(NUMBER_PREFIX);
  if (!m) return null;
  return { word: m[1] ? capitalize(m[1].replace(/^(ch|chap)$/i, 'chapter').replace(/^wk$/i, 'week')
                                        .replace(/^mod$/i, 'module').replace(/^sec$/i, 'section').replace(/^lec$/i, 'lecture'))
                      : null,
           n: Number(m[2]) };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * @param {{path: string, text: string}[]} files  path like "Comptia A+/1.1 Laptop Hardware.txt"
 * @returns {{
 *   title: string,                   // folder name, if there is one
 *   strategy: 'subfolders' | 'numbers' | 'single',
 *   chapters: { key: string, name: string, files: {path, name, topic, text}[] }[],
 *   skipped: { path: string, reason: string }[],
 * }}
 */
export function organizeNotes(files) {
  const skipped = [];
  let list = files
    .map((f) => ({ ...f, path: f.path.replace(/\\/g, '/') }))
    .sort((a, b) => collator.compare(a.path, b.path));

  // A shared top folder (what you picked) becomes the title, not a chapter.
  const firstSegs = new Set(list.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : '')));
  const title = firstSegs.size === 1 && [...firstSegs][0] ? [...firstSegs][0] : '';
  list = list.map((f) => {
    const rel = title ? f.path.slice(title.length + 1) : f.path;
    const name = rel.split('/').pop();
    return { ...f, rel, name, topic: topicFromFilename(name) };
  });

  // Skip empty files and exact duplicates.
  const seen = new Map();
  list = list.filter((f) => {
    const body = f.text.replace(/\r\n?/g, '\n').trim();
    if (!body) { skipped.push({ path: f.path, reason: 'empty file' }); return false; }
    if (seen.has(body)) { skipped.push({ path: f.path, reason: `same text as ${seen.get(body)}` }); return false; }
    seen.set(body, f.name);
    return true;
  });

  // 1. Subfolders
  const inSubfolder = list.filter((f) => f.rel.includes('/'));
  if (inSubfolder.length > 0) {
    const groups = new Map();
    for (const f of list) {
      const key = f.rel.includes('/') ? f.rel.split('/')[0] : '(top level)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    if (groups.size > 1) {
      const chapters = [...groups].map(([key, fs]) => ({ key, name: key === '(top level)' ? 'General' : key, files: fs }));
      return { title, strategy: 'subfolders', chapters, skipped };
    }
  }

  // 2. Number prefixes
  const numbered = list.map((f) => ({ f, num: chapterNumber(f.name) }));
  const matched = numbered.filter((x) => x.num);
  const distinct = new Set(matched.map((x) => x.num.n));
  if (distinct.size > 1 && matched.length >= list.length * 0.6) {
    const groups = new Map();
    for (const { f, num } of numbered) {
      const key = num ? String(num.n) : 'other';
      if (!groups.has(key)) groups.set(key, { word: num?.word, files: [] });
      groups.get(key).files.push(f);
    }
    const chapters = [...groups]
      .sort(([a], [b]) => (a === 'other') - (b === 'other') || collator.compare(a, b))
      .map(([key, g]) => ({ key, name: key === 'other' ? 'Other' : `${g.word || 'Chapter'} ${key}`, files: g.files }));
    return { title, strategy: 'numbers', chapters, skipped };
  }

  // 3. Everything together
  return { title, strategy: 'single', chapters: [{ key: 'all', name: title || 'Notes', files: list }], skipped };
}

/**
 * Split a chapter's files into request-sized batches. Each file is labeled
 * with its topic so the AI knows where one note ends and the next begins.
 * A single file bigger than `maxChars` is split at blank lines.
 */
export function makeBatches(files, maxChars = 8000) {
  const pieces = [];
  for (const f of files) {
    const header = `### ${f.topic}\n`;
    const body = f.text.replace(/\r\n?/g, '\n').trim();
    if (header.length + body.length <= maxChars) {
      pieces.push({ text: header + body, files: [f.name] });
      continue;
    }
    // Too big: split on paragraphs (or hard-split a giant paragraph).
    let chunk = '';
    const flush = () => { if (chunk.trim()) pieces.push({ text: `${header}${chunk.trim()}`, files: [f.name] }); chunk = ''; };
    for (let para of body.split(/\n\s*\n/)) {
      while (para.length > maxChars - header.length) {
        flush();
        pieces.push({ text: header + para.slice(0, maxChars - header.length), files: [f.name] });
        para = para.slice(maxChars - header.length);
      }
      if (header.length + chunk.length + para.length + 2 > maxChars) flush();
      chunk += para + '\n\n';
    }
    flush();
  }

  // Pack small pieces together up to the limit.
  const batches = [];
  for (const p of pieces) {
    const last = batches.at(-1);
    if (last && last.text.length + 2 + p.text.length <= maxChars) {
      last.text += '\n\n' + p.text;
      for (const name of p.files) if (!last.files.includes(name)) last.files.push(name);
    } else {
      batches.push({ text: p.text, files: [...p.files] });
    }
  }
  return batches;
}

/** "Covers: Laptop Hardware, Mobile Device Networks, …" */
export function describeChapter(files, max = 8) {
  const topics = [...new Set(files.map((f) => f.topic))];
  const shown = topics.slice(0, max).join(', ');
  return `Covers: ${shown}${topics.length > max ? `, and ${topics.length - max} more` : ''}`;
}
