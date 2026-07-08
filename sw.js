// Sunday Studio — offline app-shell service worker
// This file MUST be uploaded to the exact same folder as sunday-studio.html
// (renamed to index.html or whatever you're serving it as) — service workers
// only work when served from the same origin/path as the page using them.

const CACHE_NAME = 'sunday-studio-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // App shell (this HTML file, fonts, etc.): try the network first so you
  // always get the latest version, fall back to cache if offline.
  // Your backend API calls (Google Apps Script) always go straight to the
  // network as normal — this only affects the app shell itself.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
