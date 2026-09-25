// ── Study mode registry ───────────────────────────────────────────
// Every way of studying a set is a "mode" in its own file. To add a new one
// (for example an AI quiz later), create modes/<name>.js exporting an object
// shaped like the ones below, then add it to this list. It will automatically
// appear on every set's page.
//
// A mode looks like:
//   {
//     id: 'flashcards',              // used in the URL: #/sets/1/study/flashcards
//     name: 'Flashcards',
//     description: 'Flip through…',
//     icon: '🃏',
//     minCards: 1,                   // hide/disable the mode for smaller sets
//     start(container, set, ctx) {   // draw the mode into `container`
//       return () => {}              // optional: clean-up when leaving
//     },
//   }
// `ctx` gives the mode helpers: { api, toast, setProgress(fraction), setStatus(text) }

import { flashcards } from './flashcards.js';
import { learn } from './learn.js';
import { review } from './review.js';

export const modes = [flashcards, learn, review];

export const getMode = (id) => modes.find((m) => m.id === id);
