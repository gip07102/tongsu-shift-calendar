const CACHE_NAME = 'tongsu-shift-calendar-recovery-20261017-v1';
const SCOPE = new URL('./', self.registration.scope);
const HOME_URL = SCOPE.href;
const INDEX_URL = new URL('index.html', SCOPE).href;

async function cleanHtmlResponse(response) {
  if (!response || !response.ok) throw new Error('Bad response');
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function fetchLatestCalendar() {
  const bust = new URL(HOME_URL);
  bust.searchParams.set('__tongsu_recovery', '20261017v1');
  const response = await fetch(bust.href, { cache: 'reload', redirect: 'follow' });
  const clean = await cleanHtmlResponse(response);
  const ct = (clean.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) throw new Error('Latest app is not HTML');
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([
    cache.put(HOME_URL, clean.clone()),
    cache.put(INDEX_URL, clean.clone())
  ]);
  return clean;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await fetchLatestCalendar();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();

    // Force every currently open window on this origin to reload the real calendar.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(async client => {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin && u.pathname.startsWith(SCOPE.pathname)) {
          u.searchParams.set('__tongsu_recovered', '1');
          await client.navigate(u.href);
        }
      } catch (_) {}
    }));
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        const clean = await cleanHtmlResponse(fresh);
        const ct = (clean.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(Promise.all([
            cache.put(HOME_URL, clean.clone()),
            cache.put(INDEX_URL, clean.clone())
          ]));
        }
        return clean;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(HOME_URL)) || (await cache.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(request, { cache: 'no-store' });
    } catch (_) {
      const hit = await caches.match(request);
      return hit || Response.error();
    }
  })());
});
