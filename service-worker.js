const CACHE='jarvis-gentlecare-v3710';
const FALLBACK='./index.html';

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const isNavigation=event.request.mode==='navigate'||event.request.destination==='document';

  if(isNavigation){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
          }
          return response;
        })
        .catch(async()=>{
          const exact=await caches.match(event.request);
          if(exact)return exact;
          const fallback=await caches.match(FALLBACK);
          return fallback||new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><title>MAVIK indisponible</title><body style="font-family:system-ui;background:#031019;color:white;padding:32px"><h1>MAVIK</h1><p>La page n’a pas pu être chargée. Revenez à l’accueil puis actualisez.</p><a href="./index.html" style="color:#46e36d">Retour à l’accueil</a></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
        })
    );
    return;
  }

  if(url.pathname.endsWith('/version.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});