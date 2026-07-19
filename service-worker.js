const CACHE='jarvis-gentlecare-v25';
const CORE=['./','./index.html','./planning.html','./employe.html','./admin.html','./gestion.html','./clients.html','./stock.html','./devis.html','./ordres.html','./vehicule.html','./gcos-comms.js','./jarvis-core.js','./icon.svg','./manifest.webmanifest','./storage.js','./install.js','./boot.js','./jarvis-responsive.css','./atelier-responsive.css'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const nav=event.request.mode==='navigate'||event.request.destination==='document';
  if(nav){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      let finalResponse=response;
      if(url.pathname.endsWith('/employe.html')){
        const html=await response.text();
        finalResponse=new Response(html.replace('</head>','<link rel="stylesheet" href="atelier-responsive.css?v=25"></head>'),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
      }else if(url.pathname.endsWith('/admin.html')){
        let html=await response.text();
        html=html.replace("['▤','Devis','Offres et validations','']","['▤','Devis','Offres et validations','devis.html']")
          .replace("['◫','Commandes','Achats et livraisons','']","['◫','Ordres de travail','Suivi atelier','ordres.html']")
          .replace("['🏭','Fournisseurs','Contacts techniques','']","['🏭','Fournisseurs','Contacts techniques','stock.html?tab=suppliers']")
          .replace("['❄','Stocks','Glace et consommables','']","['❄','Stocks','Glace et consommables','stock.html']")
          .replace("['🛠','Interventions','Rapports et qualité','employe.html']","['🛠','Interventions','Rapports et qualité','ordres.html']")
          .replace("['🚘','Véhicules','Dossiers et photos','clients.html']","['🚘','Véhicules 360°','Historique et diagnostic Jarvis','vehicule.html']");
        finalResponse=new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      const copy=finalResponse.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return finalResponse;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))))
});