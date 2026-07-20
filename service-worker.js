const CACHE='jarvis-gentlecare-v310';
const CORE=['./','./index.html','./planning.html','./employe.html','./admin.html','./gestion.html','./clients.html','./stock.html','./devis.html','./ordres.html','./vehicule.html','./direction.html','./gcos-comms.js','./jarvis-core.js','./mavik-insights.js','./mavik-updater.js','./mavik-update-settings.js','./version.json','./icon.svg','./manifest.webmanifest','./storage.js','./install.js','./boot.js','./jarvis-responsive.css','./atelier-responsive.css','./alpha/workshop/','./alpha/workshop/index.html','./alpha/workshop/workshop.css','./alpha/workshop/workshop-app.js','./core/application/workshop-orchestrator.js','./core/events/event-bus.js','./core/workflow/graph-workflow-engine.js','./core/interventions/intervention-engine.js','./core/resources/resource-manager.js','./core/decision/decision-engine.js'];
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const nav=event.request.mode==='navigate'||event.request.destination==='document';
  if(nav){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('text/html'))return response;
      let html=await response.text();
      if(url.pathname.includes('/alpha/workshop/')){
        const untouched=new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
        const copy=untouched.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return untouched;
      }
      if(url.pathname.endsWith('/employe.html')&&!html.includes('atelier-responsive.css'))html=html.replace('</head>','<link rel="stylesheet" href="atelier-responsive.css?v=301"></head>');
      if(url.pathname.endsWith('/admin.html')){
        html=html.replace("['▤','Devis','Offres et validations','']","['▤','Devis','Offres et validations','devis.html']")
          .replace("['◫','Commandes','Achats et livraisons','']","['◫','Ordres de travail','Suivi atelier','ordres.html']")
          .replace("['🏭','Fournisseurs','Contacts techniques','']","['🏭','Fournisseurs','Contacts techniques','stock.html?tab=suppliers']")
          .replace("['❄','Stocks','Glace et consommables','']","['❄','Stocks','Glace et consommables','stock.html']")
          .replace("['🛠','Interventions','Rapports et qualité','employe.html']","['🛠','Interventions','Rapports et qualité','ordres.html']")
          .replace("['🚘','Véhicules','Dossiers et photos','clients.html']","['🚘','Véhicules 360°','Historique et diagnostic Jarvis','vehicule.html']")
          .replace("['🎓','Formation','Compétences','']","['📊','Direction','Rentabilité et prévisions','direction.html']");
      }
      html=html.replace(/GCOS v1\.0/g,'MAVIK GCOS v0.31.0').replace(/MAVIK GCOS v0\.30\.[01]/g,'MAVIK GCOS v0.31.0');
      if(!html.includes('mavik-insights.js'))html=html.replace('</body>','<script src="mavik-insights.js?v=301"></script></body>');
      if(!html.includes('gcos-comms.js'))html=html.replace('</body>','<script src="gcos-comms.js?v=301"></script></body>');
      if(!html.includes('jarvis-core.js'))html=html.replace('</body>','<script src="jarvis-core.js?v=301"></script></body>');
      if(!html.includes('mavik-updater.js'))html=html.replace('</body>','<script src="mavik-updater.js?v=301"></script></body>');
      if(!html.includes('mavik-update-settings.js'))html=html.replace('</body>','<script src="mavik-update-settings.js?v=301"></script></body>');
      if(!html.includes('jarvisGlobalButton'))html=html.replace('</body>',`<style>#jarvisGlobalButton{position:fixed;right:18px;bottom:18px;z-index:41000;width:62px;height:62px;border-radius:50%;border:1px solid #80e8ff;background:radial-gradient(circle at 35% 30%,#eaffff,#46d9ff 25%,#087fa8 50%,#03131c 76%);color:#fff;font-size:1.55rem;box-shadow:0 0 24px #00cfff88;cursor:pointer}#jarvisGlobalButton:active{transform:scale(.94)}@media(max-width:720px){#jarvisGlobalButton{right:14px;bottom:78px;width:56px;height:56px}}</style><button id="jarvisGlobalButton" aria-label="Ouvrir Jarvis" title="Parler à Jarvis">🎙</button></body>`);
      const finalResponse=new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      const copy=finalResponse.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return finalResponse;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  if(url.pathname.endsWith('/version.json')){event.respondWith(fetch(event.request,{cache:'no-store'}));return}
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
