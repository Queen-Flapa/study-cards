// Study sets: create / read / update / delete. Same rules as the PC server's modules/sets.js.
import { AppError, nowIso, req, tx } from './db.js';

function parseBody(body) {
  const title = String(body?.title ?? '').trim();
  if (!title) throw new AppError(400, 'Title is required');
  const description = String(body?.description ?? '').trim();
  const cards = (Array.isArray(body?.cards) ? body.cards : [])
    .map((c) => ({
      id: Number.isInteger(c?.id) ? c.id : null,
      term: String(c?.term ?? '').trim(),
      definition: String(c?.definition ?? '').trim(),
    }))
    .filter((c) => c.term || c.definition);
  if (cards.some((c) => !c.term || !c.definition)) {
    throw new AppError(400, 'Every card needs both a term and a definition');
  }
  return { title, description, cards };
}

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

async function cardsOf(stores, setId) {
  const cards = await req(stores.cards.index('set_id').getAll(setId));
  return cards.sort(byPosition);
}

export async function listSets() {
  return tx(['sets', 'cards'], 'readonly', async (s) => {
    const sets = await req(s.sets.getAll());
    for (const set of sets) set.card_count = await req(s.cards.index('set_id').count(set.id));
    return sets.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  });
}

export async function getSet(id) {
  id = Number(id);
  return tx(['sets', 'cards'], 'readonly', async (s) => {
    const set = await req(s.sets.get(id));
    if (!set) throw new AppError(404, 'Set not found');
    const cards = (await cardsOf(s, id)).map(({ id, term, definition, position }) => ({ id, term, definition, position }));
    return { ...set, cards };
  });
}

export async function createSet(body) {
  const { title, description, cards } = parseBody(body);
  const id = await tx(['sets', 'cards'], 'readwrite', async (s) => {
    const now = nowIso();
    const setId = await req(s.sets.add({ title, description, created_at: now, updated_at: now }));
    for (const [i, c] of cards.entries()) {
      await req(s.cards.add({ set_id: setId, term: c.term, definition: c.definition, position: i }));
    }
    return setId;
  });
  return getSet(id);
}

// Saves the whole set. Cards that keep their id also keep their study progress.
export async function updateSet(id, body) {
  id = Number(id);
  const { title, description, cards } = parseBody(body);
  await tx(['sets', 'cards', 'progress'], 'readwrite', async (s) => {
    const set = await req(s.sets.get(id));
    if (!set) throw new AppError(404, 'Set not found');
    await req(s.sets.put({ ...set, title, description, updated_at: nowIso() }));
    const existing = new Set((await cardsOf(s, id)).map((c) => c.id));
    for (const c of cards) if (c.id && !existing.has(c.id)) c.id = null; // not in this set → new card
    const keep = new Set(cards.filter((c) => c.id).map((c) => c.id));
    for (const oldId of existing) {
      if (!keep.has(oldId)) {
        await req(s.cards.delete(oldId));
        await req(s.progress.delete(oldId));
      }
    }
    for (const [i, c] of cards.entries()) {
      const row = { set_id: id, term: c.term, definition: c.definition, position: i };
      await req(c.id ? s.cards.put({ ...row, id: c.id }) : s.cards.add(row));
    }
  });
  return getSet(id);
}

export async function deleteSet(id) {
  id = Number(id);
  await tx(['sets', 'cards', 'progress'], 'readwrite', async (s) => {
    for (const c of await cardsOf(s, id)) {
      await req(s.cards.delete(c.id));
      await req(s.progress.delete(c.id));
    }
    await req(s.sets.delete(id));
  });
  return null;
}
