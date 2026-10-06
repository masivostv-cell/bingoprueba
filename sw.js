/* Mr Cheff · service worker
   Guarda una copia de la app en el equipo para que abra SIN INTERNET.
   - La app: siempre intenta traer la versión más nueva; si no hay internet,
     abre la copia guardada (así las actualizaciones automáticas siguen igual).
   - Íconos y librerías: se guardan y se reutilizan.
   - Firebase y todo lo demás: pasa directo, no se toca (los datos los maneja la app). */
const CACHE='mrcheff-app-v1';
const ESTATICOS=['manifest.webmanifest','mrcheff-192.png','mrcheff-512.png','mrcheff.svg','mrcheff.ico'];
const CDN=['cdnjs.cloudflare.com','cdn.jsdelivr.net'];
const CLAVE_APP='__mrcheff_rutas__';

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ESTATICOS.map(u=>
    fetch(u,{cache:'reload'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.indexOf('mrcheff-')===0&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

function sinQuery(u){ const x=new URL(u); x.search=''; x.hash=''; return x.href; }
async function rutasApp(){
  try{ const c=await caches.open(CACHE); const r=await c.match(CLAVE_APP); return r? await r.json() : []; }catch(e){ return []; }
}
async function guardarRuta(ruta){
  const c=await caches.open(CACHE); const l=await rutasApp();
  if(l.indexOf(ruta)<0){ l.push(ruta); await c.put(CLAVE_APP,new Response(JSON.stringify(l),{headers:{'Content-Type':'application/json'}})); }
}
/* la app le pide que se guarde a sí misma apenas abre */
self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.tipo==='cachear' && d.url){
    e.waitUntil((async()=>{
      const c=await caches.open(CACHE), key=sinQuery(d.url);
      await guardarRuta(new URL(key).pathname);
      try{ const r=await fetch(key,{cache:'no-store'}); if(r.ok) await c.put(key,r.clone()); }catch(err){}
      if(e.source) e.source.postMessage({tipo:'cacheado',ok:!!(await c.match(key))});
    })());
  }
});

function conTiempo(p,ms){ return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('tiempo')),ms))]); }

async function navegar(req){
  const url=new URL(req.url), rutas=await rutasApp();
  const esApp=rutas.indexOf(url.pathname)>=0 || /\/restaurante(\.html?)?\/?$/i.test(url.pathname);
  if(!esApp) return fetch(req);                         // el resto del sitio, normal
  const c=await caches.open(CACHE), key=sinQuery(req.url);
  try{
    const r=await conTiempo(fetch(req,{cache:'no-store'}),7000);
    if(r && r.ok){ c.put(key,r.clone()); guardarRuta(url.pathname); }
    return r;
  }catch(err){
    const g=await c.match(key) || await c.match(req,{ignoreSearch:true});
    if(g) return g;
    return new Response('<meta charset="utf-8"><body style="font-family:sans-serif;padding:30px;background:#16181f;color:#fff">'+
      '<h2>Mr Cheff</h2><p>No hay internet y este equipo todavía no tiene la app guardada.</p>'+
      '<p>Conéctalo una vez y ábrela; desde ahí funciona sin internet.</p></body>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
}
async function cacheConRepaso(req){
  const c=await caches.open(CACHE), g=await c.match(req);
  const red=fetch(req).then(r=>{ if(r && (r.ok||r.type==='opaque')) c.put(req,r.clone()); return r; }).catch(()=>null);
  return g || (await red) || new Response('',{status:504});
}

self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin){
    if(CDN.indexOf(url.hostname)>=0) e.respondWith(cacheConRepaso(req));
    return;                                            // Firebase y demás: directo
  }
  if(req.mode==='navigate'){ e.respondWith(navegar(req)); return; }
  if(/\.(png|svg|ico|webmanifest)$/i.test(url.pathname)) e.respondWith(cacheConRepaso(req));
});
