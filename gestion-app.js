(()=>{
  const WORKSHOP_KEY='mavik.workshop.orchestrator.v1';
  const BILLING_KEY='mavik.billing.v1';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const euro=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(value)||0);
  const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback}catch{return fallback}};
  const session=parse(sessionStorage.getItem('jarvis-session'),null);
  const accounts=parse(localStorage.getItem('jarvis-accounts'),[]);
  const user=accounts.find(account=>account.id===session?.id);
  if(!user||user.role!=='direction'){location.replace('index.html');return;}

  let state={interventions:[],resources:[],environment:{}};
  let legacyClients=[];
  let legacyVehicles=[];
  let suppliers=[];
  let stockItems=[];
  let billing=[];
  let clients=[];
  let vehicles=[];
  let currentTab='dashboard';
  let toastTimer;

  function notify(message,error=false){const toast=$('toast');toast.textContent=message;toast.style.borderColor=error?'var(--red)':'var(--cyan)';toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,3400)}
  function task(intervention,id){return intervention.tasks?.find(item=>item.id===id)}
  function isDone(intervention,id){return task(intervention,id)?.status==='DONE'}
  function date(value){return value?new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'Non renseigné'}
  function workshop(){return parse(localStorage.getItem(WORKSHOP_KEY),{interventions:[],resources:[],environment:{}})}
  function saveWorkshop(){localStorage.setItem(WORKSHOP_KEY,JSON.stringify(state))}
  function keyForClient(client){return String(client.email||client.phone||client.name||client.id||'').trim().toLowerCase()}
  function keyForVehicle(vehicle){return String(vehicle.registration||vehicle.plate||vehicle.id||'').trim().toUpperCase()}
  function clientName(client){return client.name||[client.firstName,client.lastName].filter(Boolean).join(' ')||'Client'}
  function vehicleName(vehicle){return vehicle.name||[vehicle.brand,vehicle.model].filter(Boolean).join(' ')||'Véhicule'}
  function missing(intervention){const values=[intervention.client?.name,intervention.client?.phone,intervention.client?.email,intervention.vehicle?.name,intervention.vehicle?.registration,intervention.servicePackageId,Number(intervention.priceTtc)>0?intervention.priceTtc:'',intervention.clientRequest];return values.filter(value=>!String(value??'').trim()).length}

  async function loadLegacy(){
    if(!window.JarvisStorage)return;
    [legacyClients,legacyVehicles,suppliers,stockItems]=await Promise.all([
      JarvisStorage.all('clients'),JarvisStorage.all('vehicles'),JarvisStorage.all('suppliers'),JarvisStorage.all('stock')
    ]);
  }
  async function syncInterventionsToDirectory(){
    if(!window.JarvisStorage)return;
    const clientKeys=new Set(legacyClients.map(keyForClient));
    const vehicleKeys=new Set(legacyVehicles.map(keyForVehicle));
    for(const intervention of state.interventions||[]){
      const client=intervention.client||{};
      const cKey=keyForClient(client);
      let directoryClient=legacyClients.find(item=>keyForClient(item)===cKey);
      if(cKey&&!clientKeys.has(cKey)){
        directoryClient=await JarvisStorage.put('clients',{name:client.name||'',phone:client.phone||'',email:client.email||'',type:'Client atelier',sourceInterventionId:intervention.id,createdAt:intervention.createdAt||new Date().toISOString()});
        legacyClients.push(directoryClient);clientKeys.add(cKey);
      }
      const vehicle=intervention.vehicle||{};
      const vKey=keyForVehicle(vehicle);
      if(vKey&&!vehicleKeys.has(vKey)){
        const saved=await JarvisStorage.put('vehicles',{clientId:directoryClient?.id||'',plate:vehicle.registration||'',brand:'',model:vehicle.name||'',mileage:vehicle.mileage||0,vin:vehicle.vin||'',sourceInterventionId:intervention.id,createdAt:intervention.createdAt||new Date().toISOString()});
        legacyVehicles.push(saved);vehicleKeys.add(vKey);
      }
    }
  }
  function mergeDirectory(){
    const clientMap=new Map();
    for(const item of legacyClients){clientMap.set(keyForClient(item)||item.id,{...item,name:clientName(item),source:'directory',interventionIds:[]});}
    for(const intervention of state.interventions||[]){
      const raw=intervention.client||{};const key=keyForClient(raw)||raw.id||intervention.id;
      const existing=clientMap.get(key)||{id:raw.id||`client-${intervention.id}`,name:raw.name||'',phone:raw.phone||'',email:raw.email||'',type:'Client atelier',source:'atelier',interventionIds:[]};
      existing.name=raw.name||existing.name;existing.phone=raw.phone||existing.phone;existing.email=raw.email||existing.email;existing.interventionIds=[...(existing.interventionIds||[]),intervention.id];clientMap.set(key,existing);
    }
    clients=[...clientMap.values()].sort((a,b)=>clientName(a).localeCompare(clientName(b),'fr'));
    const vehicleMap=new Map();
    for(const item of legacyVehicles){vehicleMap.set(keyForVehicle(item)||item.id,{...item,name:vehicleName(item),registration:item.registration||item.plate||'',source:'directory'});}
    for(const intervention of state.interventions||[]){
      const raw=intervention.vehicle||{};const key=keyForVehicle(raw)||raw.id||intervention.id;
      const existing=vehicleMap.get(key)||{id:raw.id||`vehicle-${intervention.id}`,name:raw.name||'',registration:raw.registration||'',source:'atelier'};
      Object.assign(existing,{name:raw.name||existing.name,registration:raw.registration||existing.registration,vin:raw.vin||existing.vin,mileage:raw.mileage||existing.mileage,interventionId:intervention.id,clientName:intervention.client?.name||'',clientEmail:intervention.client?.email||''});vehicleMap.set(key,existing);
    }
    vehicles=[...vehicleMap.values()].sort((a,b)=>vehicleName(a).localeCompare(vehicleName(b),'fr'));
  }
  function resource(id){return state.resources?.find(item=>item.id===id)}
  function setHash(tab){location.hash=tab;}
  function tabFromHash(){const value=location.hash.replace('#','');return ['dashboard','clients','vehicules','devis','stock','rapports','facturation'].includes(value)?value:'dashboard'}
  function renderNav(){document.querySelectorAll('[data-tab]').forEach(link=>link.classList.toggle('active',link.dataset.tab===currentTab));document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==currentTab);$('pageTitle').textContent={dashboard:'Gestion GentleCarE',clients:'Clients',vehicules:'Véhicules',devis:'Devis',stock:'Stock & fournisseurs',rapports:'Rapports',facturation:'Facturation'}[currentTab];}
  function renderMetrics(){
    const quotes=(state.interventions||[]).filter(item=>item.quote);
    const readyInvoices=(state.interventions||[]).filter(item=>isDone(item,'client-validation')&&Number(item.priceTtc)>0);
    const paid=billing.filter(item=>item.status==='Payée').reduce((sum,item)=>sum+Number(item.amount||0),0);
    const values=[['Clients',clients.length],['Véhicules',vehicles.length],['Dossiers',state.interventions?.length||0],['Devis envoyés',quotes.filter(item=>isDone(item,'quote')).length],['À facturer',readyInvoices.filter(item=>!billing.some(invoice=>invoice.interventionId===item.id)).length],['Encaissé',euro(paid)]];
    $('metrics').innerHTML=values.map(([label,value])=>`<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');
  }
  function renderDashboard(){
    const actions=(state.interventions||[]).filter(item=>missing(item)>0||!isDone(item,'quote')||!item.logistics?.interventionAt).slice(0,8);
    $('dashboardActions').innerHTML=actions.length?actions.map(item=>`<div class="record"><div><strong>${esc(item.vehicle?.name||'Véhicule à renseigner')}</strong><small>${esc(item.client?.name||'Client')} · ${missing(item)} information(s) manquante(s) · devis ${esc(item.quote?.status||'à préparer')}</small></div><a class="btn" href="alpha/workshop/?intervention=${encodeURIComponent(item.id)}">Ouvrir</a></div>`).join(''):'<div class="empty">Aucun dossier urgent.</div>';
    const upcoming=(state.interventions||[]).filter(item=>item.logistics?.interventionAt).sort((a,b)=>new Date(a.logistics.interventionAt)-new Date(b.logistics.interventionAt)).slice(0,8);
    $('dashboardPlanning').innerHTML=upcoming.length?upcoming.map(item=>`<div class="record"><div><strong>${esc(item.vehicle?.name||'Véhicule')}</strong><small>${esc(item.client?.name||'Client')} · ${date(item.logistics.interventionAt)}</small></div><span class="pill">${item.logistics?.intakeMode==='naza-pickup'?'Naza':'Dépôt client'}</span></div>`).join(''):'<div class="empty">Aucun rendez-vous planifié.</div>';
  }
  function renderClients(){
    const query=$('clientSearch').value.trim().toLowerCase();
    const list=clients.filter(item=>[item.name,item.phone,item.email,item.type].join(' ').toLowerCase().includes(query));
    $('clientCount').textContent=`${clients.length} client(s)`;
    $('clientList').innerHTML=list.length?list.map(item=>{const related=(state.interventions||[]).filter(intervention=>item.interventionIds?.includes(intervention.id)||keyForClient(intervention.client||{})===keyForClient(item));return `<article class="entity"><div class="entity-head"><div><strong>${esc(clientName(item))}</strong><span class="pill">${esc(item.type||'Client')}</span><small>${esc(item.phone||'Téléphone manquant')} · ${esc(item.email||'E-mail manquant')}</small></div><div class="actions"><button class="btn" data-new-dossier="${esc(item.id)}">Nouveau dossier</button><button class="btn" data-edit-client="${esc(item.id)}">Modifier</button></div></div><div class="linked">${related.length?related.map(intervention=>`<a href="alpha/workshop/?intervention=${encodeURIComponent(intervention.id)}">${esc(intervention.vehicle?.name||'Dossier')} · ${esc(intervention.quote?.status||'Devis à préparer')}</a>`).join(''):'Aucun dossier atelier lié.'}</div></article>`}).join(''):'<div class="empty">Aucun client trouvé.</div>';
  }
  function renderVehicles(){
    const query=$('vehicleSearch').value.trim().toLowerCase();
    const list=vehicles.filter(item=>[item.name,item.registration,item.vin,item.clientName].join(' ').toLowerCase().includes(query));
    $('vehicleCount').textContent=`${vehicles.length} véhicule(s)`;
    $('vehicleList').innerHTML=list.length?list.map(item=>`<article class="entity"><div class="entity-head"><div><strong>${esc(vehicleName(item))}</strong><span class="pill">${esc(item.registration||'Sans immatriculation')}</span><small>${esc(item.clientName||'Propriétaire à rattacher')} · ${item.mileage?esc(item.mileage)+' km':'Kilométrage manquant'}</small></div><div class="actions">${item.interventionId?`<a class="btn" href="alpha/workshop/?intervention=${encodeURIComponent(item.interventionId)}">Fiche atelier</a>`:`<button class="btn" data-new-vehicle-dossier="${esc(item.id)}">Créer un dossier</button>`}<button class="btn" data-edit-vehicle="${esc(item.id)}">Modifier</button></div></div></article>`).join(''):'<div class="empty">Aucun véhicule trouvé.</div>';
  }
  function renderQuotes(){
    const query=$('quoteSearch').value.trim().toLowerCase();
    const list=(state.interventions||[]).filter(item=>[item.quote?.number,item.client?.name,item.vehicle?.name,item.vehicle?.registration].join(' ').toLowerCase().includes(query)).sort((a,b)=>(b.quote?.sentAt||b.updatedAt||'').localeCompare(a.quote?.sentAt||a.updatedAt||''));
    $('quoteList').innerHTML=list.length?list.map(item=>{const status=isDone(item,'client-validation')?'Accepté':isDone(item,'quote')?'Envoyé':item.quote?.draft?'Brouillon':'À préparer';return `<article class="entity"><div class="entity-head"><div><strong>${esc(item.quote?.number||'Devis non numéroté')}</strong><span class="pill ${status==='Accepté'?'ok':status==='Envoyé'?'blue':'warn'}">${status}</span><small>${esc(item.client?.name||'Client')} · ${esc(item.vehicle?.name||'Véhicule')} · ${euro(item.priceTtc)}</small></div><div class="actions"><a class="btn" href="alpha/workshop/?intervention=${encodeURIComponent(item.id)}">Ouvrir le devis</a>${status==='Accepté'?`<button class="btn primary" data-plan="${item.id}">Planifier</button>`:''}</div></div></article>`}).join(''):'<div class="empty">Aucun devis.</div>';
  }
  function renderStock(){
    const ice=resource('dry-ice'),dinitrol=resource('dinitrol-stock'),pit=resource('lift');
    $('dryIce').value=ice?.quantity??0;$('dinitrol').value=dinitrol?.quantity??0;$('humidity').value=state.environment?.humidity??55;$('pit').value=pit?.status||'AVAILABLE';
    $('supplierList').innerHTML=suppliers.length?suppliers.map(item=>`<article class="entity"><div><strong>${esc(item.name)}</strong><small>${esc([item.contact,item.phone,item.email].filter(Boolean).join(' · ')||'Coordonnées à compléter')}</small></div></article>`).join(''):'<div class="empty">Aucun fournisseur enregistré.</div>';
    $('stockItemList').innerHTML=stockItems.length?stockItems.map(item=>`<article class="entity"><div class="entity-head"><div><strong>${esc(item.name)}</strong><small>${esc(item.quantity||0)} ${esc(item.unit||'unité')} · seuil ${esc(item.threshold||0)}</small></div><span class="pill ${Number(item.quantity)<=Number(item.threshold)?'warn':'ok'}">${Number(item.quantity)<=Number(item.threshold)?'À commander':'Disponible'}</span></div></article>`).join(''):'<div class="empty">Les ressources principales sont gérées ci-dessus.</div>';
  }
  function reports(){const list=[];for(const intervention of state.interventions||[]){for(const report of intervention.reports||[])list.push({...report,intervention});if(intervention.lastReport&&!list.some(item=>item.id===intervention.lastReport.id))list.push({...intervention.lastReport,intervention});}return list;}
  function renderReports(){const list=reports();$('reportList').innerHTML=list.length?list.map(item=>`<article class="entity"><div class="entity-head"><div><strong>${esc(item.number||'Rapport')}</strong><span class="pill ${item.validatedAt?'ok':'warn'}">${item.validatedAt?'Validé':'À valider'}</span><small>${esc(item.intervention?.vehicle?.name||'Véhicule')} · ${esc(item.intervention?.client?.name||'Client')} · version ${esc(item.version||1)}</small></div><a class="btn" href="alpha/workshop/?intervention=${encodeURIComponent(item.intervention.id)}">Dossier</a></div></article>`).join(''):'<div class="empty">Aucun rapport généré.</div>'}
  function invoiceNumber(){return `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`}
  function renderBilling(){
    const candidates=(state.interventions||[]).filter(item=>isDone(item,'client-validation')&&Number(item.priceTtc)>0);
    $('invoiceCandidates').innerHTML=candidates.length?candidates.map(item=>{const invoice=billing.find(entry=>entry.interventionId===item.id);return `<article class="entity"><div class="entity-head"><div><strong>${esc(item.vehicle?.name||'Véhicule')}</strong><small>${esc(item.client?.name||'Client')} · ${euro(item.priceTtc)} · devis accepté</small></div>${invoice?`<span class="pill ${invoice.status==='Payée'?'ok':'blue'}">${esc(invoice.number)} · ${esc(invoice.status)}</span>`:`<button class="btn primary" data-invoice="${item.id}">Créer la facture</button>`}</div></article>`}).join(''):'<div class="empty">Aucun devis accepté à facturer.</div>';
    $('invoiceList').innerHTML=billing.length?billing.slice().reverse().map(item=>`<article class="entity"><div class="entity-head"><div><strong>${esc(item.number)}</strong><span class="pill ${item.status==='Payée'?'ok':item.status==='Envoyée'?'blue':'warn'}">${esc(item.status)}</span><small>${esc(item.clientName)} · ${esc(item.vehicleName)} · ${euro(item.amount)}</small></div><div class="actions"><button class="btn" data-invoice-status="${item.id}" data-status="Envoyée">Envoyée</button><button class="btn primary" data-invoice-status="${item.id}" data-status="Payée">Payée</button></div></div></article>`).join(''):'<div class="empty">Aucune facture créée.</div>';
  }
  function renderAll(){renderMetrics();renderDashboard();renderClients();renderVehicles();renderQuotes();renderStock();renderReports();renderBilling();renderNav();}

  function openModal(type,item={}){
    const clientOptions=clients.map(client=>`<option value="${esc(client.id)}" ${item.clientId===client.id?'selected':''}>${esc(clientName(client))}</option>`).join('');
    if(type==='client')$('modalContent').innerHTML=`<h2>${item.id?'Modifier':'Nouveau'} client</h2><form id="entityForm" class="form"><input type="hidden" name="id" value="${esc(item.id||'')}"><label>Nom complet<input name="name" required value="${esc(item.name||'')}"></label><label>Téléphone<input name="phone" value="${esc(item.phone||'')}"></label><label>E-mail<input name="email" type="email" value="${esc(item.email||'')}"></label><label>Type<select name="type"><option>Particulier</option><option>Entreprise</option><option>Club</option><option>Partenaire</option></select></label><label class="wide">Adresse<input name="address" value="${esc(item.address||'')}"></label><label class="wide">Notes<textarea name="notes">${esc(item.notes||'')}</textarea></label><div class="actions wide"><button class="btn" type="button" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div></form>`;
    if(type==='vehicle')$('modalContent').innerHTML=`<h2>${item.id?'Modifier':'Nouveau'} véhicule</h2><form id="entityForm" class="form"><input type="hidden" name="id" value="${esc(item.id||'')}"><label>Client<select name="clientId"><option value="">À rattacher</option>${clientOptions}</select></label><label>Immatriculation<input name="plate" required value="${esc(item.registration||item.plate||'')}"></label><label>Marque<input name="brand" value="${esc(item.brand||'')}"></label><label>Modèle<input name="model" value="${esc(item.model||item.name||'')}"></label><label>Kilométrage<input name="mileage" type="number" value="${esc(item.mileage||'')}"></label><label>VIN<input name="vin" value="${esc(item.vin||'')}"></label><label class="wide">Notes<textarea name="notes">${esc(item.notes||'')}</textarea></label><div class="actions wide"><button class="btn" type="button" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div></form>`;
    $('modal').classList.add('open');
    $('modalContent').querySelector('[data-close]').onclick=closeModal;
    $('entityForm').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));if(!window.JarvisStorage)return notify('Stockage local indisponible.',true);if(type==='client')await JarvisStorage.put('clients',data);else{data.plate=String(data.plate||'').toUpperCase();data.mileage=Number(data.mileage)||0;await JarvisStorage.put('vehicles',data);}closeModal();await reload();notify(type==='client'?'Client enregistré.':'Véhicule enregistré.');};
  }
  function closeModal(){$('modal').classList.remove('open')}
  function prefillAndOpen(client,vehicle){sessionStorage.setItem('mavik-new-intervention-prefill',JSON.stringify({clientName:client?.name||'',clientPhone:client?.phone||'',clientEmail:client?.email||'',vehicleName:vehicle?vehicleName(vehicle):'',registration:vehicle?.registration||vehicle?.plate||''}));location.href='alpha/workshop/?new=1';}
  async function reload(){state=workshop();billing=parse(localStorage.getItem(BILLING_KEY),[]);await loadLegacy();await syncInterventionsToDirectory();mergeDirectory();renderAll();}

  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-tab]');if(tab){event.preventDefault();setHash(tab.dataset.tab);return;}
    const add=event.target.closest('[data-add]');if(add){openModal(add.dataset.add);return;}
    const editClient=event.target.closest('[data-edit-client]');if(editClient){openModal('client',clients.find(item=>item.id===editClient.dataset.editClient)||{});return;}
    const editVehicle=event.target.closest('[data-edit-vehicle]');if(editVehicle){openModal('vehicle',vehicles.find(item=>item.id===editVehicle.dataset.editVehicle)||{});return;}
    const newDossier=event.target.closest('[data-new-dossier]');if(newDossier){prefillAndOpen(clients.find(item=>item.id===newDossier.dataset.newDossier));return;}
    const newVehicleDossier=event.target.closest('[data-new-vehicle-dossier]');if(newVehicleDossier){const vehicle=vehicles.find(item=>item.id===newVehicleDossier.dataset.newVehicleDossier);const client=clients.find(item=>item.id===vehicle?.clientId);prefillAndOpen(client,vehicle);return;}
    const plan=event.target.closest('[data-plan]');if(plan){location.href=`planning.html?intervention=${encodeURIComponent(plan.dataset.plan)}&action=planifier`;return;}
    const invoice=event.target.closest('[data-invoice]');if(invoice){const intervention=state.interventions.find(item=>item.id===invoice.dataset.invoice);if(!intervention)return;billing.push({id:crypto.randomUUID(),number:invoiceNumber(),interventionId:intervention.id,clientName:intervention.client?.name||'',vehicleName:intervention.vehicle?.name||'',amount:Number(intervention.priceTtc)||0,status:'Brouillon',createdAt:new Date().toISOString()});localStorage.setItem(BILLING_KEY,JSON.stringify(billing));renderBilling();notify('Facture créée.');return;}
    const status=event.target.closest('[data-invoice-status]');if(status){const invoice=billing.find(item=>item.id===status.dataset.invoiceStatus);if(invoice){invoice.status=status.dataset.status;invoice.updatedAt=new Date().toISOString();localStorage.setItem(BILLING_KEY,JSON.stringify(billing));renderBilling();notify(`Facture marquée ${invoice.status.toLowerCase()}.`);}return;}
  });
  window.addEventListener('hashchange',()=>{currentTab=tabFromHash();renderNav();});
  $('clientSearch').oninput=renderClients;$('vehicleSearch').oninput=renderVehicles;$('quoteSearch').oninput=renderQuotes;
  $('saveResources').onclick=()=>{state.environment=state.environment||{};state.environment.humidity=Number($('humidity').value)||0;const ice=resource('dry-ice'),dinitrol=resource('dinitrol-stock'),pit=resource('lift');if(ice)ice.quantity=Number($('dryIce').value)||0;if(dinitrol)dinitrol.quantity=Number($('dinitrol').value)||0;if(pit){pit.name='Fosse atelier';pit.status=$('pit').value;}saveWorkshop();notify('Ressources atelier enregistrées.');renderStock();};
  $('modal').onclick=event=>{if(event.target===$('modal'))closeModal()};
  $('userName').textContent=user.name;$('avatar').textContent=(user.name||'?')[0].toUpperCase();$('logout').onclick=()=>{sessionStorage.removeItem('jarvis-session');sessionStorage.removeItem('jarvis-booted');location.replace('index.html')};
  function clock(){const now=new Date();$('clock').textContent=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});$('date').textContent=now.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','')}
  clock();setInterval(clock,1000);currentTab=tabFromHash();reload().catch(error=>notify(error.message||'Chargement impossible',true));
})();
