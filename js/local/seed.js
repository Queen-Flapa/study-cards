// Adds one example set the very first time the app runs, so it isn't empty.
import { getSetting, setSetting } from './db.js';
import { createSet, listSets } from './sets.js';

export async function seedIfNew() {
  if (await getSetting('seeded', false)) return;
  if ((await listSets()).length === 0) {
    await createSet({
      title: 'Example: Spanish basics',
      description: 'A sample set to try things out. Feel free to edit or delete it.',
      cards: [
        ['hola', 'hello'], ['adiós', 'goodbye'], ['por favor', 'please'], ['gracias', 'thank you'],
        ['sí', 'yes'], ['agua', 'water'], ['libro', 'book'], ['casa', 'house'],
      ].map(([term, definition]) => ({ term, definition })),
    });
  }
  await setSetting('seeded', true);
}
