/** Network-only navigation. No API responses, sessions or booking pages are stored. */
export const offlineWorker = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline / غير متصل</title><body style="font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>You are offline</h1><p>Connect to the internet and reload this page. Booking and account changes require a connection.</p><section lang="ar" dir="rtl"><h1>أنت غير متصل</h1><p>اتصل بالإنترنت وأعد تحميل الصفحة. الحجز وتعديل الحساب يتطلبان اتصالاً.</p></section></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
`;
