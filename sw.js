/* Raute: keeps a copy of every file so the app opens without a connection.
   Change VERSION whenever you change any file, so browsers fetch the new copies. */
const VERSION = 'v6';
const CACHE = 'raute-' + VERSION;
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "vendor/fonts.css",
  "vendor/katex.min.css",
  "vendor/marked.min.js",
  "vendor/purify.min.js",
  "vendor/katex.min.js",
  "fonts/KaTeX_AMS-Regular.woff2",
  "fonts/KaTeX_Caligraphic-Bold.woff2",
  "fonts/KaTeX_Caligraphic-Regular.woff2",
  "fonts/KaTeX_Fraktur-Bold.woff2",
  "fonts/KaTeX_Fraktur-Regular.woff2",
  "fonts/KaTeX_Main-Bold.woff2",
  "fonts/KaTeX_Main-BoldItalic.woff2",
  "fonts/KaTeX_Main-Italic.woff2",
  "fonts/KaTeX_Main-Regular.woff2",
  "fonts/KaTeX_Math-BoldItalic.woff2",
  "fonts/KaTeX_Math-Italic.woff2",
  "fonts/KaTeX_SansSerif-Bold.woff2",
  "fonts/KaTeX_SansSerif-Italic.woff2",
  "fonts/KaTeX_SansSerif-Regular.woff2",
  "fonts/KaTeX_Script-Regular.woff2",
  "fonts/KaTeX_Size1-Regular.woff2",
  "fonts/KaTeX_Size2-Regular.woff2",
  "fonts/KaTeX_Size3-Regular.woff2",
  "fonts/KaTeX_Size4-Regular.woff2",
  "fonts/KaTeX_Typewriter-Regular.woff2",
  "fonts/atkinson-hyperlegible-latin-400-italic.woff2",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "fonts/atkinson-hyperlegible-latin-700-italic.woff2",
  "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/atkinson-hyperlegible-latin-ext-400-italic.woff2",
  "fonts/atkinson-hyperlegible-latin-ext-400-normal.woff2",
  "fonts/atkinson-hyperlegible-latin-ext-700-italic.woff2",
  "fonts/atkinson-hyperlegible-latin-ext-700-normal.woff2",
  "fonts/bricolage-grotesque-latin-ext-opsz-normal.woff2",
  "fonts/bricolage-grotesque-latin-opsz-normal.woff2",
  "fonts/jetbrains-mono-latin-ext-wght-normal.woff2",
  "fonts/jetbrains-mono-latin-wght-normal.woff2"
];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's HTTP cache, so a new version never saves stale copies.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('raute-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // The page itself: newest copy when online, saved copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put('index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Everything else: saved copy first.
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
