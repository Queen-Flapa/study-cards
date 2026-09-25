// A single set: study modes, progress, and the list of cards.
import { api } from '../api.js';
import { modes } from '../modes/index.js';
import { h, mount, navigate, pageHeader, plural, timeFromNow, toast } from '../ui.js';

export async function setPage(root, id) {
  const [set, stats] = await Promise.all([api.getSet(id), api.reviewStats(id)]);

  async function onDelete() {
    if (!confirm(`Delete "${set.title}" and all its cards? This can't be undone.`)) return;
    await api.deleteSet(set.id);
    toast('Set deleted');
    navigate('/');
  }

  async function onReset() {
    if (!confirm('Reset spaced-repetition progress for this set?')) return;
    await api.resetProgress(set.id);
    toast('Progress reset');
    setPage(root, id);
  }

  const modeTiles = modes.map((m) => {
    const enough = set.cards.length >= m.minCards;
    let badge = null;
    if (m.id === 'review' && stats.due + stats.new > 0) {
      badge = h('span', { class: 'badge' }, stats.due + Math.min(stats.new, 20));
    }
    return h(enough ? 'a' : 'div', {
      class: `mode-tile${enough ? '' : ' disabled'}`,
      href: enough ? `#/sets/${set.id}/study/${m.id}` : null,
      title: enough ? null : `Needs at least ${plural(m.minCards, 'card')}`,
    },
      h('span', { class: 'mode-icon', 'aria-hidden': 'true' }, m.icon),
      h('span', { class: 'mode-name' }, m.name, badge),
      h('span', { class: 'muted small' }, enough ? m.description : `Add at least ${plural(m.minCards, 'card')}`));
  });

  const statItems = [
    ['New', stats.new],
    ['Due now', stats.due],
    ['Learning', stats.learning],
    ['Mastered', stats.mastered],
  ];

  mount(root,
    h('a', { class: 'back', href: '#/' }, '← All sets'),
    pageHeader(set.title, set.description || plural(set.cards.length, 'term'),
      h('a', { class: 'btn', href: `#/sets/${set.id}/notes` }, '✨ Add from notes'),
      h('a', { class: 'btn', href: `#/sets/${set.id}/edit` }, 'Edit'),
      h('button', { class: 'btn danger-ghost', onClick: onDelete }, 'Delete')),

    h('div', { class: 'mode-grid' }, modeTiles),

    set.cards.length ? h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Spaced repetition progress'),
        h('button', { class: 'link small', onClick: onReset }, 'Reset')),
      h('div', { class: 'stats' },
        statItems.map(([label, n]) => h('div', { class: 'stat' },
          h('strong', {}, n), h('span', { class: 'muted small' }, label)))),
      stats.due === 0 && stats.next_due_at
        ? h('p', { class: 'muted small' }, `Next review ${timeFromNow(stats.next_due_at)}.`)
        : null) : null,

    h('section', {},
      h('h2', {}, `Terms in this set (${set.cards.length})`),
      set.cards.length === 0
        ? h('p', { class: 'muted' }, 'No cards yet. ',
            h('a', { href: `#/sets/${set.id}/edit` }, 'Add some'), ' or ',
            h('a', { href: `#/sets/${set.id}/notes` }, 'make them from your notes'), '.')
        : h('ol', { class: 'term-list' },
            set.cards.map((c) => h('li', {},
              h('div', { class: 'term' }, c.term),
              h('div', { class: 'definition' }, c.definition))))));
}
