/*
 * FISHY's service worker, hand-written (no Workbox):
 *  - Share to FISHY: Android's share sheet POSTs what was shared (a picture, a video, a voice note,
 *    a PDF or a message) to /share. Firebase Hosting can't take a POST, so it is caught here, kept
 *    in Cache Storage under a one-time key, and the page opens at /?shared=<key>. The page reads it
 *    once and deletes it. Nothing leaves the phone here.
 *  - Basic offline: the app shell (the page and its built files) is cached on install, and the
 *    page's own files as they load; the page always tries the network first.
 */

const SHELL = 'fishy-shell-v1';
const SHARES = 'fishy-shares';
/** A share the page never opened is dropped after a day. */
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const page = await fetch('/', { cache: 'no-cache' });
      if (page.ok) {
        const html = await page.clone().text();
        await cache.put('/', page);
        // The built script and styles named in the page (hashed names, so they never change).
        const built = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll([...new Set([...built, '/manifest.webmanifest', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png'])]).catch(() => undefined);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== SHELL && name !== SHARES) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    // The page: the network first (always the newest build), the cached shell offline.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/', { cacheName: SHELL })) ?? Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Built files have hashed names: a cached copy is always right.
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: SHELL });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL).then((c) => c.put(request, copy)));
        }
        return response;
      })(),
    );
  }
});

/** Keeps what was shared under a one-time key and sends the page to it (303: open it with a GET). */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const key = crypto.randomUUID();
    const cache = await caches.open(SHARES);
    await dropOldShares(cache);
    const files = [];
    const media = form.getAll('media').filter((f) => typeof f !== 'string' && f.size > 0);
    for (const [i, file] of media.slice(0, 4).entries()) {
      const path = `/shared/${key}/${i}`;
      await cache.put(path, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
      files.push({ path, name: file.name || `shared-${i + 1}`, type: file.type || '' });
    }
    const field = (name) => {
      const v = form.get(name);
      return typeof v === 'string' ? v.slice(0, 20000) : '';
    };
    const meta = { at: Date.now(), title: field('title'), text: field('text'), url: field('url'), files };
    await cache.put(`/shared/${key}/meta`, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    return Response.redirect(`/?shared=${key}`, 303);
  } catch (e) {
    console.warn('[FISHY] share failed', e);
    return Response.redirect('/?shared=failed', 303);
  }
}

async function dropOldShares(cache) {
  const now = Date.now();
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (!path.endsWith('/meta')) continue;
    const meta = await (await cache.match(req))?.json().catch(() => null);
    if (meta && now - meta.at < SHARE_TTL_MS) continue;
    const prefix = path.slice(0, -'meta'.length);
    for (const r of await cache.keys()) if (new URL(r.url).pathname.startsWith(prefix)) await cache.delete(r);
  }
}
