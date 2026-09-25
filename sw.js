// Service worker: keeps a copy of the app on the phone so it opens offline.
//
// Strategy: "network first" — when online, always load the newest files (so updates
// show up right away) and refresh the saved copy; when offline, use the saved copy.
// Requests to other sites (like Anthropic's AI) are never touched.
//
// When you add or rename a file, add it to FILES below and bump VERSION.
const VERSION = '0.4.1';
const CACHE = `study-cards-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/api.js',
  'js/app.js',
  'js/ui.js',
  'js/version.js',
  'js/lib/answers.js',
  'js/lib/chapters.js',
  'js/lib/files.js',
  'js/lib/importer.js',
  'js/lib/srs.js',
  'js/lib/transfer.js',
  'js/local/ai.js',
  'js/local/ai/claude.js',
  'js/local/ai/models.js',
  'js/local/db.js',
  'js/local/review.js',
  'js/local/seed.js',
  'js/local/sets.js',
  'js/modes/flashcards.js',
  'js/modes/index.js',
  'js/modes/learn.js',
  'js/modes/review.js',
  'js/pages/backup.js',
  'js/pages/editor.js',
  'js/pages/home.js',
  'js/pages/notes.js',
  'js/pages/set.js',
  'js/pages/settings.js',
  'js/pages/study.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Remove saved copies of older versions.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('study-cards-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    return Response.error();
  }
}
