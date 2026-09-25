// Reading text files (or whole folders of them) that the user picks or drags in.
// Runs entirely in the browser — nothing is uploaded until you choose to convert.
import { h } from '../ui.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB of text is a *lot* of notes
const MAX_FILES = 500;
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.text', '.csv', '.tsv'];
const JUNK = /^(\.|desktop\.ini$|thumbs\.db$)/i; // hidden/system files we silently ignore

const isText = (file) =>
  file.type.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

export async function readTextFile(file) {
  if (!isText(file)) throw new Error(`"${file.name}" isn't a text file. Save your notes as .txt first.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is too big (over 2 MB).`);
  return (await file.text()).replace(/^﻿/, ''); // drop the invisible marker some editors add
}

/**
 * Read many files at once. Anything that isn't a readable text file is
 * reported in `skipped` instead of stopping the whole import.
 * @param {{file: File, path: string}[]} entries
 */
export async function readNotesFiles(entries) {
  const files = [];
  const skipped = [];
  const wanted = entries.filter((e) => !JUNK.test(e.file.name));
  for (const e of wanted.slice(0, MAX_FILES)) {
    try {
      files.push({ path: e.path, text: await readTextFile(e.file) });
    } catch (err) {
      skipped.push({ path: e.path, reason: isText(e.file) ? 'too big' : 'not a text file' });
    }
  }
  if (wanted.length > MAX_FILES) skipped.push({ path: '…', reason: `only the first ${MAX_FILES} files were read` });
  return { files, skipped };
}

/** Turns "Biology_notes-ch3.txt" into "Biology notes ch3". */
export function titleFromFilename(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

// Walk a dragged-in folder (and its subfolders) to get every file with its path.
async function walkEntry(entry, prefix = '') {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [{ file, path: prefix + file.name }];
  }
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const children = [];
  // readEntries returns results in chunks; keep asking until it returns nothing.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map((c) => walkEntry(c, `${prefix}${entry.name}/`)));
  return nested.flat();
}

async function entriesFromDrop(dataTransfer) {
  const items = [...(dataTransfer.items || [])]
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (items.length) return (await Promise.all(items.map((e) => walkEntry(e)))).flat();
  return [...dataTransfer.files].map((file) => ({ file, path: file.name }));
}

/**
 * A drop zone with "Choose file(s)" and (optionally) "Choose folder" buttons.
 * Calls onFiles([{ file, path }]) — path includes folders, e.g. "Biology/Unit 1/cells.txt".
 */
export function fileDropZone({ onFiles, label = 'Drop a .txt file here, or', multiple = false, folders = false }) {
  const toEntries = (list) => [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  const pick = (input) => () => {
    if (input.files.length) onFiles(toEntries(input.files));
    input.value = '';
  };
  const fileInput = h('input', { type: 'file', accept: TEXT_EXTENSIONS.join(',') + ',text/plain', multiple, hidden: true });
  fileInput.addEventListener('change', pick(fileInput));
  const folderInput = h('input', { type: 'file', hidden: true, multiple: true });
  folderInput.webkitdirectory = true;
  folderInput.addEventListener('change', pick(folderInput));

  const zone = h('div', { class: 'dropzone' },
    h('span', {}, label, ' '),
    h('button', { type: 'button', class: 'btn small', onClick: () => fileInput.click() }, multiple ? 'Choose files' : 'Choose file'),
    folders ? h('button', { type: 'button', class: 'btn small', onClick: () => folderInput.click() }, 'Choose folder') : null,
    fileInput, folders ? folderInput : null);

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const entries = await entriesFromDrop(e.dataTransfer);
    if (entries.length) onFiles(multiple || folders ? entries : entries.slice(0, 1));
  });
  return zone;
}
