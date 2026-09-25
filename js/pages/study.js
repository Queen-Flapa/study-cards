// Shared frame for every study mode: top bar, progress bar, and the mode itself.
import { api } from '../api.js';
import { getMode } from '../modes/index.js';
import { h, mount, plural, progressBar, toast } from '../ui.js';

export async function studyPage(root, setId, modeId) {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`Unknown study mode "${modeId}"`);
  const set = await api.getSet(setId);

  const status = h('span', { class: 'muted small' });
  const bar = progressBar();
  const container = h('div', { class: 'study-area' });

  mount(root,
    h('div', { class: 'study-top' },
      h('a', { class: 'back', href: `#/sets/${set.id}` }, `← ${set.title}`),
      h('strong', {}, `${mode.icon} ${mode.name}`),
      status),
    bar,
    container);

  if (set.cards.length < mode.minCards) {
    mount(container, h('div', { class: 'empty' },
      h('p', {}, `${mode.name} needs at least ${plural(mode.minCards, 'card')}.`),
      h('a', { class: 'btn', href: `#/sets/${set.id}/edit` }, 'Add cards')));
    return;
  }

  const ctx = {
    api,
    toast,
    setProgress: (fraction) => bar.update(fraction),
    setStatus: (text) => (status.textContent = text),
  };
  return mode.start(container, set, ctx);
}
