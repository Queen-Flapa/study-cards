// Spaced repetition: which cards are due, and recording answers.
// Same rules as the PC server's modules/review.js, using the same lib/srs.js.
import { AppError, nowIso, req, tx } from './db.js';
import { newProgress, previewIntervals, schedule } from '../lib/srs.js';

async function cardsWithProgress(setId) {
  return tx(['cards', 'progress'], 'readonly', async (s) => {
    const cards = (await req(s.cards.index('set_id').getAll(Number(setId))))
      .sort((a, b) => a.position - b.position || a.id - b.id);
    const out = [];
    for (const c of cards) {
      const p = await req(s.progress.get(c.id));
      out.push({
        id: c.id, term: c.term, definition: c.definition,
        ease: p?.ease ?? null, interval_days: p?.interval_days ?? null, reps: p?.reps ?? null,
        lapses: p?.lapses ?? null, due_at: p?.due_at ?? null,
      });
    }
    return out;
  });
}

function withPreview(card) {
  const p = card.due_at ? card : newProgress();
  return { ...card, is_new: !card.due_at, preview: previewIntervals(p) };
}

export async function reviewStats(setId) {
  const now = nowIso();
  const stats = { total: 0, new: 0, due: 0, learning: 0, mastered: 0, next_due_at: null };
  for (const c of await cardsWithProgress(setId)) {
    stats.total++;
    if (!c.due_at) { stats.new++; continue; }
    if (c.due_at <= now) stats.due++;
    else if (!stats.next_due_at || c.due_at < stats.next_due_at) stats.next_due_at = c.due_at;
    if (c.interval_days >= 21) stats.mastered++;
    else stats.learning++;
  }
  return stats;
}

export async function dueCards(setId, newLimit = 20) {
  const now = nowIso();
  const cards = await cardsWithProgress(setId);
  const due = cards.filter((c) => c.due_at && c.due_at <= now).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const fresh = cards.filter((c) => !c.due_at).slice(0, Math.max(0, Number(newLimit) || 0));
  return [...due, ...fresh].map(withPreview);
}

export async function gradeCard(cardId, grade) {
  cardId = Number(cardId);
  grade = Number(grade);
  if (![0, 1, 2, 3].includes(grade)) throw new AppError(400, 'grade must be 0, 1, 2 or 3');
  const now = new Date();
  const next = await tx(['cards', 'progress'], 'readwrite', async (s) => {
    if (!(await req(s.cards.get(cardId)))) throw new AppError(404, 'Card not found');
    const current = (await req(s.progress.get(cardId))) ?? newProgress();
    const n = schedule(current, grade, now);
    await req(s.progress.put({ card_id: cardId, ...n, last_reviewed_at: now.toISOString() }));
    return n;
  });
  return { card_id: cardId, ...next, preview: previewIntervals(next, now) };
}

export async function resetProgress(setId) {
  await tx(['cards', 'progress'], 'readwrite', async (s) => {
    for (const c of await req(s.cards.index('set_id').getAll(Number(setId)))) {
      await req(s.progress.delete(c.id));
    }
  });
  return { ok: true };
}
