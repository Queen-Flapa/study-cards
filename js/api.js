// Every data operation the pages use goes through here — the same list as the
// PC version's api.js. On the PC these are requests to the local server; on the
// phone they run right here, against the phone's own storage.
import * as sets from './local/sets.js';
import * as review from './local/review.js';
import * as ai from './local/ai.js';
import { seedIfNew } from './local/seed.js';

const ready = seedIfNew().catch((err) => console.error('Setup failed', err));

// Wait for first-run setup, and give errors the same shape as the PC version (err.status).
const wrap = (fn) => async (...args) => {
  await ready;
  try {
    return await fn(...args);
  } catch (err) {
    if (err.status) throw err;
    console.error(err);
    const e = new Error(err?.name === 'QuotaExceededError'
      ? 'Your phone is out of storage space.'
      : `Something went wrong: ${err?.message || err}`);
    e.status = 500;
    throw e;
  }
};

export const api = {
  // Sets
  listSets: wrap(sets.listSets),
  getSet: wrap(sets.getSet),
  createSet: wrap(sets.createSet),
  updateSet: wrap(sets.updateSet),
  deleteSet: wrap(sets.deleteSet),

  // Spaced repetition
  reviewStats: wrap(review.reviewStats),
  dueCards: wrap(review.dueCards),
  gradeCard: wrap(review.gradeCard),
  resetProgress: wrap(review.resetProgress),

  // AI
  aiStatus: wrap(ai.aiStatus),
  aiSaveSettings: wrap(ai.aiSaveSettings),
  aiEstimate: wrap(ai.aiEstimate),
  aiFlashcards: wrap(ai.aiFlashcards),
};
