(()=>{
  const moduleId=document.body.dataset.module||'';
  const directionOnly=new Set(['prospects','partenaires','fournisseurs','achats','factures','paiements','equipe','campagnes','conformite','securite','assurances','financement','sous-traitants','journal']);
  const shared=new Set(['stock','rapports','documents','taches','formations','evenements','maintenance','incidents','qualite','equipements']);
  const parse=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')||fallback}catch{return fallback}};
  let session=parse(sessionStorage,'jarvis-session',null);
  if(session?.temporaryUntil&&Date.now()>new Date(session.temporaryUntil).getTime()){
    sessionStorage.removeItem('jarvis-session');
    session=null;
  }
  const accounts=parse(localStorage,'jarvis-accounts',[]);
  const user=accounts.find(account=>account.id===session?.id)||null;
  const allowed=!!user&&(user.role==='direction'||(user.role==='employee'&&shared.has(moduleId)));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function auditDenied(reason){
    const key='mavik-audit-log';
    const log=parse(localStorage,key,[]);
    log.unshift({id:crypto.randomUUID?.()||String(Date.now()),at:new Date().toISOString(),userId:user?.id||'guest',userName:user?.name||'Utilisateur non connecté',role:user?.role||'guest',module:moduleId,action:'access.denied',recordId:null,title:'Accès refusé',details:{reason}});
    localStorage.setItem(key,JSON.stringify(log.slice(0,2000)));
  }

  function deny(){
    const reason=!user?'Vous devez d’abord vous connecter à MAVIK.':'Ce module est réservé à la Direction et son moteur de données n’a pas été chargé pour votre profil.';
    auditDenied(reason);
    document.body.innerHTML=`<div class="shell"><aside class="side"><div class="brand"><img src="assets/brand/gentlecare-logo.png" alt="GentleCarE"><small>Accès protégé</small></div><nav class="nav"><a href="index.html">⌂ <span>Connexion / accueil</span></a><a href="modules.html">▦ <span>Tous les modules</span></a><a href="alpha/workshop/index.html">🛠 <span>Poste atelier</span></a><a href="planning.html">▣ <span>Planning</span></a><a href="ameliorations.html">💡 <span>Demander une fonction</span></a></nav><div class="side-foot"><strong>MAVIK 0.41.0</strong><small>● Moindre privilège actif</small></div></aside><main class="main"><header class="topbar"><strong>Module protégé</strong><div class="user"><div class="avatar">${esc((user?.name||'?')[0])}</div><div><strong>${esc(user?.name||'Non connecté')}</strong><small class="muted">${esc(user?.role||'guest')}</small></div></div></header><div class="content"><section class="hero"><div><h1>Accès non autorisé</h1><div class="muted">${esc(reason)}</div></div></section><section class="card" style="margin-top:12px"><div class="denied"><strong>Aucune donnée sensible n’a été chargée.</strong><p>Les droits ne peuvent pas être étendus par un bouton ou une simple demande. La Direction doit valider l’habilitation et le besoin professionnel.</p><div class="actions"><a class="btn primary" href="${!user?'index.html?redirect='+encodeURIComponent(location.pathname.split('/').pop()):'ameliorations.html'}">${!user?'Se connecter':'Formuler une demande adaptée'}</a><a class="btn" href="modules.html">Retour aux modules</a></div></div></section></div></main></div><script src="mavik-stability.js?v=4100"><\/script>`;
  }

  if(!CONFIGURED())return;
  if(!allowed){deny();return;}
  const script=document.createElement('script');
  script.src='module-page.js?v=4000';
  script.onerror=()=>{document.body.innerHTML='<main class="empty"><h1>Module indisponible</h1><p>Le moteur de page n’a pas pu être chargé.</p><a class="btn" href="diagnostic.html">Ouvrir le diagnostic</a></main>'};
  document.body.appendChild(script);

  function CONFIGURED(){return directionOnly.has(moduleId)||shared.has(moduleId)}
})();