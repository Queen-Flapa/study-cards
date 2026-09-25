// On-phone storage. The PC version keeps data in a SQLite file through its server;
// here everything is stored in the browser's own database (IndexedDB), on the phone.
//
// Stores (like tables):
//   sets       { id, title, description, created_at, updated_at }
//   cards      { id, set_id, term, definition, position }       index: set_id
//   progress   { card_id, ease, interval_days, reps, lapses, due_at, last_reviewed_at }
//   ai_usage   { id, created_at, purpose, model, input_tokens, output_tokens, cost_usd }
//   settings   { key, value }

const DB_NAME = 'study-cards';
const DB_VERSION = 1;

let dbPromise = null;

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Like the PC version's migrations: add a new `if (old < N)` block for each change.
    request.onupgradeneeded = (e) => {
      const db = request.result;
      const old = e.oldVersion;
      if (old < 1) {
        db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        const cards = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
        cards.createIndex('set_id', 'set_id');
        db.createObjectStore('progress', { keyPath: 'card_id' });
        db.createObjectStore('ai_usage', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other tabs of this app and try again.'));
  });
  // Ask Android not to clear our data when the phone is low on space.
  navigator.storage?.persist?.().catch(() => {});
  return dbPromise;
}

/** Turn an IndexedDB request into a promise. */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Run `fn(stores)` inside one transaction. Everything succeeds or nothing does.
 * Inside `fn`, only await `req(...)` calls — awaiting anything else ends the transaction early.
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDb();
  const names = [].concat(storeNames);
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    let failed = null;
    t.oncomplete = () => (failed ? reject(failed) : resolve(result));
    t.onerror = () => reject(failed || t.error);
    t.onabort = () => reject(failed || t.error || new Error('Saving failed'));
    Promise.resolve()
      .then(() => fn(stores))
      .then((r) => (result = r))
      .catch((err) => {
        failed = err;
        try { t.abort(); } catch { /* already finished */ }
      });
  });
}

export const nowIso = () => new Date().toISOString();

export async function getSetting(key, fallback) {
  const row = await tx('settings', 'readonly', (s) => req(s.settings.get(key)));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await tx('settings', 'readwrite', (s) => req(s.settings.put({ key, value })));
}
