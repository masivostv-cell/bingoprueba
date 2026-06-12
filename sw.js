const CACHE_NAME = "dian-clientes-v3";
const APP_SHELL = [
  "./",
  "./calendario.html",
  "./calendario_actualizado.html",
  "./admin_calendario.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      try { await cache.add(url); } catch (e) { console.warn("No se pudo cachear", url, e); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isNavigation(request){
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

async function networkFirst(request, fallbackUrl){
  const cache = await caches.open(CACHE_NAME);
  try{
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  }catch(e){
    return (await cache.match(request)) || (await cache.match(fallbackUrl)) || Response.error();
  }
}

async function staleWhileRevalidate(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if(response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if(request.method !== "GET") return;

  const url = new URL(request.url);

  if(isNavigation(request)){
    const fallback = url.pathname.includes("admin_calendario") ? "./admin_calendario.html" : "./calendario.html";
    event.respondWith(networkFirst(request, fallback));
    return;
  }

  if(url.origin === self.location.origin){
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if(url.hostname.includes("gstatic.com") || url.hostname.includes("googleapis.com") || url.hostname.includes("cdn.jsdelivr.net")){
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./calendario.html";
  event.waitUntil(clients.openWindow(targetUrl));
});
