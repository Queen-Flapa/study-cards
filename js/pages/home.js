// Home page: the list of your study sets.
import { api } from '../api.js';
import { h, mount, pageHeader, plural } from '../ui.js';

export async function homePage(root) {
  const sets = await api.listSets();

  const newBtn = [
    h('a', { class: 'btn', href: '#/notes' }, '✨ From notes'),
    h('a', { class: 'btn primary', href: '#/sets/new' }, '+ New set'),
  ];

  if (sets.length === 0) {
    mount(root,
      pageHeader('Your sets'),
      h('div', { class: 'empty' },
        h('h2', {}, 'No study sets yet'),
        h('p', { class: 'muted' }, 'Create your first set of flashcards to get started.'),
        h('div', { class: 'actions center' }, newBtn)));
    return;
  }

  mount(root,
    pageHeader('Your sets', plural(sets.length, 'set'), ...newBtn),
    h('div', { class: 'set-grid' },
      sets.map((s) =>
        h('a', { class: 'set-tile', href: `#/sets/${s.id}` },
          h('h3', {}, s.title),
          h('span', { class: 'pill' }, plural(s.card_count, 'term')),
          s.description ? h('p', { class: 'muted clamp' }, s.description) : null))));
}
