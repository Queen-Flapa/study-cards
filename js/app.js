// The app's "router": looks at the address bar (#/sets/3 …) and shows the right page.
import { h, mount } from './ui.js';
import { homePage } from './pages/home.js';
import { setPage } from './pages/set.js';
import { editorPage } from './pages/editor.js';
import { studyPage } from './pages/study.js';
import { notesPage } from './pages/notes.js';
import { settingsPage } from './pages/settings.js';

// Add a new page by adding a line here: [pattern, pageFunction]
const routes = [
  [/^\/$/, homePage],
  [/^\/sets\/new$/, editorPage],
  [/^\/sets\/(\d+)$/, setPage],
  [/^\/sets\/(\d+)\/edit$/, editorPage],
  [/^\/sets\/(\d+)\/study\/([\w-]+)$/, studyPage],
  [/^\/notes$/, notesPage],
  [/^\/sets\/(\d+)\/notes$/, notesPage],
  [/^\/settings$/, settingsPage],
];

const root = document.getElementById('app');
let cleanup = null; // pages can return a function that runs when you leave them

async function render() {
  const path = location.hash.slice(1) || '/';
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  window.scrollTo(0, 0);

  // Each page draws into a fresh container. If you navigate away before a
  // page finishes loading, it harmlessly draws into a detached container.
  const view = h('div', { class: 'view' });
  mount(root, view);

  for (const [pattern, page] of routes) {
    const match = path.match(pattern);
    if (!match) continue;
    try {
      const result = await page(view, ...match.slice(1));
      if (view.isConnected) cleanup = result;
      else if (typeof result === 'function') result();
    } catch (err) {
      console.error(err);
      mount(view, h('div', { class: 'empty' },
        h('h2', {}, 'Something went wrong'),
        h('p', { class: 'muted' }, err.message),
        h('a', { class: 'btn', href: '#/' }, 'Back to your sets')));
    }
    return;
  }
  mount(view, h('div', { class: 'empty' },
    h('h2', {}, 'Page not found'), h('a', { class: 'btn', href: '#/' }, 'Back to your sets')));
}

// Offline support: a "service worker" keeps a copy of the app on the phone so it
// opens without internet. When a new version is published, it's picked up the
// next time the app is opened with internet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support unavailable', err));
}

window.addEventListener('hashchange', render);
render();
