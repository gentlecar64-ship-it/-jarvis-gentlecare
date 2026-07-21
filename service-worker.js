const CACHE='jarvis-gentlecare-v4000';
const STABILITY='mavik-stability.js?v=4000';

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});

async function withStability(response){
  if(!response||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  const src=new URL(STABILITY,self.registration.scope).href;
  const tag=`<script src="${src}"></script>`;
  if(/<script[^>]+mavik-stability\.js[^>]*><\/script>/i.test(html))html=html.replace(/<script[^>]+mavik-stability\.js[^>]*><\/script>/ig,tag);
  else html=html.includes('</body>')?html.replace('</body>',`${tag}</body>`):html+tag;
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function fallbackHtml(){
  const base=self.registration.scope;
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MAVIK hors ligne</title><body style="font-family:system-ui;background:#031019;color:white;padding:24px"><h1>MAVIK GCOS</h1><h2>Connexion indisponible</h2><p>La page n’a pas pu être téléchargée. Les données locales sont conservées.</p><p><a style="color:#8ff0aa" href="${base}index.html">Accueil</a> · <a style="color:#8fe7ff" href="${base}modules.html">Modules</a> · <a style="color:#8fe7ff" href="${base}alpha/workshop/index.html">Atelier</a> · <a style="color:#8fe7ff" href="${base}planning.html">Planning</a> · <a style="color:#8fe7ff" href="${base}ameliorations.html">Améliorations</a> · <a style="color:#ffd277" href="${base}update.html">Mise à jour</a></p><script src="${base}${STABILITY}"></script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const navigation=event.request.mode==='navigate'||event.request.destination==='document';
  if(navigation){
    event.respondWith((async()=>{
      try{
        const network=await fetch(event.request,{cache:'no-store'});
        const stable=await withStability(network);
        if(stable?.ok)caches.open(CACHE).then(cache=>cache.put(event.request,stable.clone())).catch(()=>{});
        return stable;
      }catch{
        const cached=await caches.match(event.request);
        return cached||fallbackHtml();
      }
    })());
    return;
  }
  if(url.pathname.endsWith('/version.json')||url.pathname.endsWith('/health.json')||url.pathname.endsWith('/mavik-stability.js')||url.pathname.endsWith('/module-page.js')||url.pathname.endsWith('/module-shell.css')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{if(response?.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});return response}).catch(()=>caches.match(event.request)));
});