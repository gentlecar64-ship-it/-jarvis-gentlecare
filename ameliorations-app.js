(()=>{
  const REQUEST_KEY='mavik-improvement-requests';
  const AUDIT_KEY='mavik-improvement-audit';
  const parse=(key,fallback=[])=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const session=(()=>{try{return JSON.parse(sessionStorage.getItem('jarvis-session')||'null')}catch{return null}})();
  const accounts=parse('jarvis-accounts',[]);
  const user=accounts.find(a=>a.id===session?.id)||{id:'guest',name:'Utilisateur non connecté',role:'guest'};
  const isDirection=user.role==='direction';
  let requests=parse(REQUEST_KEY,[]);
  let audit=parse(AUDIT_KEY,[]);
  const $=id=>document.getElementById(id);

  $('userName').textContent=user.name;
  $('userRole').textContent=isDirection?'Direction':user.role==='employee'?'Employé':'Session non détectée';
  $('avatar').textContent=(user.name||'?').trim().charAt(0).toUpperCase();
  $('scopeText').textContent=isDirection?'La Direction voit et statue sur toutes les demandes.':'Vous voyez uniquement vos propres demandes.';

  function log(action,details={}){
    audit.unshift({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),at:new Date().toISOString(),userId:user.id,userName:user.name,role:user.role,action,details});
    audit=audit.slice(0,500);
    save(AUDIT_KEY,audit);
    renderAudit();
  }

  function analyse(payload){
    const text=[payload.title,payload.module,payload.category,payload.description,payload.expected,payload.dataAccess].join(' ').toLowerCase();
    const contains=words=>words.some(word=>text.includes(word));
    const credentials=contains(['mot de passe','password','code secret','token','clé api','cle api','identifiant bancaire']);
    const privateMail=contains(['mail personnel','message personnel','message privé','message prive','courriel privé','courriel prive']);
    const finance=contains(['compte bancaire','banque','solde bancaire','salaire','paie','comptabilité','comptabilite','trésorerie','tresorerie']);
    const otherMail=contains(['mails des autres','mail d’un autre','mail d un autre','messagerie d’un autre','messagerie d un autre','boîte personnelle','boite personnelle']);
    const surveillance=contains(['surveillance','géolocalisation','geolocalisation','caméra','camera','microphone','écoute','ecoute','enregistrer les salariés','enregistrer les salaries','suivi caché','suivi cache']);
    const hr=contains(['dossier salarié','dossier salarie','sanction','évaluation salarié','evaluation salarie','absence maladie','donnée de santé','donnee de sante']);
    const rights=payload.category==='access'||contains(['droit admin','administrateur','accès direction','acces direction','permission','habilitation','voir tous les comptes']);
    const externalAction=contains(['envoyer automatiquement','envoi automatique','supprimer automatiquement','publier automatiquement','valider automatiquement','signer automatiquement']);
    const irreversible=contains(['supprimer','effacer','annuler','modifier une facture','virement','payer','paiement']);
    const lowRisk=payload.category==='interface'||contains(['bouton','menu','filtre','tri','raccourci','couleur','libellé','libelle','champ','affichage','planning visuel']);

    if(credentials||privateMail){
      return {code:'refused',label:'Refusé — sécurité / vie privée',risk:'Critique',canJarvis:false,reasons:['La demande vise des secrets d’authentification ou des correspondances privées.'],next:'La demande n’est pas transmissible à l’implantation.'};
    }
    if(!isDirection&&(finance||otherMail||rights)){
      return {code:'refused',label:'Refusé — hors habilitation',risk:'Critique',canJarvis:false,reasons:['Le rôle Employé ne permet pas d’accéder aux comptes, aux données financières, aux messages d’autrui ou aux fonctions Direction.'],next:'Une autre solution limitée aux besoins du poste doit être formulée.'};
    }
    if(surveillance||hr){
      return {code:'legal',label:'Contrôle juridique obligatoire',risk:'Élevé',canJarvis:false,reasons:['La demande concerne la surveillance, les ressources humaines ou des données sensibles.','Information préalable, proportionnalité et base légale doivent être vérifiées.'],next:'Direction puis examen juridique/CNIL avant tout prototype en production.'};
    }
    if(finance||otherMail||rights||externalAction||irreversible||payload.category==='communication'){
      return {code:'direction',label:'Validation Direction obligatoire',risk:'Élevé',canJarvis:true,reasons:['La demande change des habilitations, agit sur des données sensibles ou produit une action externe/irréversible.'],next:'Jarvis peut préparer une spécification, mais ne déploie rien sans validation Direction et, selon le cas, contrôle juridique.'};
    }
    if(lowRisk||payload.category==='workflow'){
      return {code:'auto',label:'Préparation Jarvis autorisée',risk:'Faible',canJarvis:true,reasons:['La demande améliore l’interface ou l’organisation sans élargir les droits ni effectuer d’action irréversible.'],next:'Jarvis peut préparer le prototype. La publication générale reste tracée et validée par la Direction.'};
    }
    return {code:'direction',label:'Analyse Direction nécessaire',risk:'Modéré',canJarvis:true,reasons:['Le périmètre n’est pas assez précis pour une implantation automatique sûre.'],next:'Jarvis prépare les questions techniques et la Direction décide du périmètre.'};
  }

  function submit(event){
    event.preventDefault();
    const payload={
      id:crypto.randomUUID?.()||String(Date.now()),
      title:$('title').value.trim(),module:$('module').value,category:$('category').value,priority:$('priority').value,
      description:$('description').value.trim(),expected:$('expected').value.trim(),dataAccess:$('dataAccess').value.trim(),
      requesterId:user.id,requesterName:user.name,requesterRole:user.role,createdAt:new Date().toISOString(),status:'Soumise'
    };
    payload.analysis=analyse(payload);
    payload.status=payload.analysis.code==='refused'?'Refusée':payload.analysis.code==='auto'?'À préparer':payload.analysis.code==='legal'?'Contrôle juridique':'Validation Direction';
    requests.unshift(payload);
    save(REQUEST_KEY,requests);
    log('improvement.submitted',{requestId:payload.id,title:payload.title,decision:payload.analysis.code});
    event.target.reset();
    render();
    openTab('requests');
  }

  function visibleRequests(){return isDirection?requests:requests.filter(r=>r.requesterId===user.id||r.requesterName===user.name)};
  function className(code){return ['auto','direction','legal','refused','done'].includes(code)?code:'direction'};

  function renderRequests(){
    const q=($('search').value||'').toLowerCase();
    const list=visibleRequests().filter(r=>[r.title,r.module,r.description,r.requesterName,r.status].join(' ').toLowerCase().includes(q));
    $('requestList').innerHTML=list.length?list.map(r=>{
      const actions=isDirection&&r.analysis.code!=='refused'?`<div class="actions" style="margin-top:10px"><button class="btn primary" data-action="approve" data-id="${r.id}">Valider la préparation</button><button class="btn" data-action="done" data-id="${r.id}">Marquer implantée</button><button class="btn danger" data-action="reject" data-id="${r.id}">Refuser</button></div>`:'';
      return `<article class="request"><div class="request-head"><div><strong>${esc(r.title)}</strong><small>${esc(r.module)} · ${esc(r.requesterName)} · ${new Date(r.createdAt).toLocaleString('fr-FR')}</small></div><span class="status ${className(r.analysis?.code)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p><div class="decision"><strong>Analyse Jarvis : ${esc(r.analysis?.label||'À analyser')}</strong><div>${(r.analysis?.reasons||[]).map(esc).join('<br>')}</div><div style="margin-top:7px"><b>Suite :</b> ${esc(r.analysis?.next||'Validation nécessaire.')}</div></div>${actions}</article>`;
    }).join(''):'<div class="muted">Aucune demande visible pour ce profil.</div>';
  }

  function updateRequest(id,action){
    const request=requests.find(r=>r.id===id);if(!request||!isDirection)return;
    if(action==='approve'){request.status='Préparation validée';request.approvedBy=user.name;request.approvedAt=new Date().toISOString();}
    if(action==='done'){request.status='Implantée';request.analysis.code='done';request.completedBy=user.name;request.completedAt=new Date().toISOString();}
    if(action==='reject'){request.status='Refusée par la Direction';request.analysis.code='refused';request.rejectedBy=user.name;request.rejectedAt=new Date().toISOString();}
    save(REQUEST_KEY,requests);log('improvement.status.changed',{requestId:id,status:request.status});render();
  }

  function renderMetrics(){
    const scope=visibleRequests();
    const values=[['Demandes',scope.length],['Préparables',scope.filter(r=>r.analysis?.code==='auto').length],['À valider',scope.filter(r=>['direction','legal'].includes(r.analysis?.code)).length],['Bloquées',scope.filter(r=>r.analysis?.code==='refused').length]];
    $('metrics').innerHTML=values.map(([label,value])=>`<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
  }
  function renderAudit(){
    const scope=isDirection?audit:audit.filter(a=>a.userId===user.id);
    $('auditLog').textContent=scope.length?scope.map(a=>`${new Date(a.at).toLocaleString('fr-FR')} · ${a.userName} · ${a.action}\n${JSON.stringify(a.details)}`).join('\n\n'):'Aucune opération.';
  }
  function render(){renderMetrics();renderRequests();renderAudit();}

  function openTab(name){
    document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.tab)));
  document.querySelectorAll('[data-tab-open]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.tabOpen)));
  $('requestForm').addEventListener('submit',submit);
  $('search').addEventListener('input',renderRequests);
  $('requestList').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button)updateRequest(button.dataset.id,button.dataset.action)});
  $('clearAudit').addEventListener('click',()=>{if(!isDirection)return; if(confirm('Effacer le journal local des améliorations ?')){audit=[];save(AUDIT_KEY,audit);renderAudit();}});
  $('exportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),requests:visibleRequests(),audit:isDirection?audit:audit.filter(a=>a.userId===user.id)},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mavik-dossier-ameliorations.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    log('improvement.exported',{count:visibleRequests().length});
  });
  render();
})();
