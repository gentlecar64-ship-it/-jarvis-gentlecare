'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DIRECTION_ROLES = new Set(['admin', 'associate']);
const DELIVERY_RATE_HT = 85;
const VAT_RATE = 20;
const DELIVERY_START = '08:30';
const DELIVERY_END = '09:30';
const DELIVERY_ASSIGNEE = 'Séverine';
const DELIVERY_RESOURCE = 'Camion';
const ORDER_LEAD_WORKDAYS = 2;
const INDUSTRIAL_KEYS = [
  'industrialSite','industrialMachineFunction','industrialDimensions','industrialMaterials','industrialZones','industrialEnergySources',
  'industrialConsignation','industrialProductionConstraints','industrialAccessMeans','industrialWasteRecovery','industrialSafetyRules','industrialShutdownWindow'
];
const FEATURE_KEYS = [
  'photoUrls','photoAnalysis','photoAnalysisConfirmed','dirtLevel','dirtyAreas','accessConstraints',...INDUSTRIAL_KEYS,
  'deliveryRequired','deliveryDestination','deliveryTrips','deliveryRateHt','deliveryAssignee','deliveryVehicle','estimatedDryIceKg'
];

function text(value) { return String(value || '').trim(); }
function bool(value) { return value === true || value === 'true' || value === 'on' || value === 1; }
function number(value) { const parsed=Number(String(value ?? '').replace(/\s/g,'').replace(',','.')); return Number.isFinite(parsed)&&parsed>=0?parsed:0; }
function safeList(store, collection) { try { return store.list(collection)||[]; } catch { return []; } }
function direction(user={}) { return DIRECTION_ROLES.has(user.role); }
function isoDate(value=new Date()) { const date=value instanceof Date?value:new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10); }
function workdaysBetween(from,to) { let cursor=new Date(`${isoDate(from)}T12:00:00`); const end=new Date(`${isoDate(to)}T12:00:00`); let count=0; while(cursor<end){cursor.setDate(cursor.getDate()+1);if(![0,6].includes(cursor.getDay()))count+=1;} return count; }
function parseJson(value,fallback) { if(value&&typeof value==='object')return value; try{return JSON.parse(String(value||''));}catch{return fallback;} }
function euro(value) { return Number(value||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}); }
function json(res,status,body) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body)); }
function html(res,status,body) { res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body); }
function js(res,body) { res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(body); }
function redirect(res,location) { res.writeHead(302,{Location:location,'Cache-Control':'no-store'});res.end(); }
async function readBody(req) { const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>10_000_000)throw Object.assign(new Error('GCOS_BODY_TOO_LARGE'),{status:413});chunks.push(chunk);}if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('GCOS_INVALID_JSON'),{status:400});} }
function authUser(req) { return require('./auth').authenticate(req); }
function requireUser(req) { const user=authUser(req);if(!user)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401});return user; }
function requireDirection(user) { if(!direction(user))throw Object.assign(new Error('DIRECTION_ACCESS_REQUIRED'),{status:403}); }

function extraFields(input={}) {
  const photoUrls=Array.isArray(input.photoUrls)?input.photoUrls.map(text).filter(Boolean):parseJson(input.photoUrls||input.photoUrlsJson,[]).map(text).filter(Boolean);
  const photoAnalysis=parseJson(input.photoAnalysis||input.photoAnalysisJson,{});
  const deliveryRequired=bool(input.deliveryRequired)&&number(input.deliveryTrips||1)>0;
  const deliveryTrips=deliveryRequired?Math.max(1,Math.min(2,number(input.deliveryTrips||1))):0;
  const deliveryRateHt=deliveryRequired?DELIVERY_RATE_HT:0;
  const deliveryAmountHt=deliveryRateHt*deliveryTrips;
  const deliveryAmountTtc=deliveryAmountHt*(1+VAT_RATE/100);
  const extras={
    photoUrls,photoAnalysis,photoAnalysisConfirmed:bool(input.photoAnalysisConfirmed),
    dirtLevel:text(input.dirtLevel),dirtyAreas:text(input.dirtyAreas),accessConstraints:text(input.accessConstraints),
    deliveryRequired,deliveryDestination:text(input.deliveryDestination||'Bayonne'),deliveryTrips,deliveryRateHt,deliveryAmountHt,deliveryAmountTtc,
    deliveryAssignee:deliveryRequired?DELIVERY_ASSIGNEE:'',deliveryVehicle:deliveryRequired?DELIVERY_RESOURCE:'',deliveryStartTime:DELIVERY_START,deliveryEndTime:DELIVERY_END,
    estimatedDryIceKg:number(input.estimatedDryIceKg)
  };
  for(const key of INDUSTRIAL_KEYS)extras[key]=text(input[key]);
  return extras;
}
function hasActualVehicleFeatureInput(input={},extras={}) {
  if(extras.photoUrls.length)return true;
  if(Object.keys(extras.photoAnalysis||{}).length)return true;
  if(extras.dirtLevel||extras.dirtyAreas||extras.accessConstraints)return true;
  if(INDUSTRIAL_KEYS.some((key)=>text(input[key])))return true;
  return false;
}
function featureText(extras,category) {
  const lines=['','PHOTOGRAPHIES ET CONSTAT DE VISITE',`Photographies enregistrées : ${extras.photoUrls.length}`,`Identification visuelle confirmée par l’utilisateur : ${extras.photoAnalysisConfirmed?'OUI':'NON'}`];
  if(extras.photoAnalysis?.limitations)lines.push(`Limite de l’analyse : ${extras.photoAnalysis.limitations}`);
  if(extras.dirtLevel)lines.push(`Niveau d’encrassement constaté : ${extras.dirtLevel}`);
  if(extras.dirtyAreas)lines.push(`Zones sales ou à traiter : ${extras.dirtyAreas}`);
  if(extras.accessConstraints)lines.push(`Accès, démontages ou protections : ${extras.accessConstraints}`);
  if(category==='industriel'){
    lines.push('','ÉTUDE INDUSTRIELLE — INFORMATIONS RECUEILLIES');
    const labels={industrialSite:'Entreprise et site',industrialMachineFunction:'Machine et fonction',industrialDimensions:'Dimensions / poids',industrialMaterials:'Matériaux / revêtements',industrialZones:'Zones et résultat attendu',industrialEnergySources:'Énergies et organes sensibles',industrialConsignation:'Consignation',industrialProductionConstraints:'Contraintes de production',industrialAccessMeans:'Accès / levage / balisage',industrialWasteRecovery:'Ventilation / confinement / déchets',industrialSafetyRules:'Règles de sécurité et documents',industrialShutdownWindow:'Fenêtre d’arrêt'};
    for(const key of INDUSTRIAL_KEYS)lines.push(`${labels[key]} : ${extras[key]||'À compléter avant validation définitive'}`);
  }
  if(extras.deliveryRequired){
    lines.push('','SERVICE LIVRAISON',`Destination : ${extras.deliveryDestination||'Bayonne'}`,`Nombre de voyages : ${extras.deliveryTrips}`,`Tarif : ${euro(extras.deliveryRateHt)} HT par heure et par voyage`,`Montant livraison : ${euro(extras.deliveryAmountHt)} HT — ${euro(extras.deliveryAmountTtc)} TTC`,`Planning ressource : ${extras.deliveryAssignee} · ${extras.deliveryVehicle} · ${extras.deliveryStartTime}–${extras.deliveryEndTime} par voyage`);
  }
  return lines.join('\n');
}
function preparedQuoteInput(input={}) {
  const extras=extraFields(input);
  const category=text(input.requestCategory||input.vehicleType);
  const tariff=require('./tariff-catalog').get(input.tariffKey||input.packageKey);
  const baseServicePriceTtc=number(input.serviceBaseTtc||input.finalPrice||input.customPrice||input.targetPrice||tariff?.totalTtc);
  const totalTtc=baseServicePriceTtc+extras.deliveryAmountTtc;
  const fallbackIndustrial=category==='industriel';
  return {
    ...input,...extras,category,
    brand:text(input.brand||(fallbackIndustrial?'Équipement industriel':'')),
    model:text(input.model||(fallbackIndustrial?(extras.industrialMachineFunction||'Machine à identifier'):'')),
    photoUrl:text(input.photoUrl||extras.photoUrls[0]),
    serviceBaseTtc:baseServicePriceTtc,
    finalPrice:totalTtc||number(input.finalPrice),customPrice:totalTtc||number(input.customPrice),targetPrice:totalTtc||number(input.targetPrice),
    standardPriceTtc:number(input.standardPriceTtc||baseServicePriceTtc)+extras.deliveryAmountTtc
  };
}
function patchVisual(visualUrl,extras) {
  if(!visualUrl||!String(visualUrl).startsWith('/generated/quotes/'))return;
  const relative=decodeURIComponent(String(visualUrl).replace(/^\/+/,''));const target=path.resolve(PUBLIC_DIR,relative);
  if(!target.startsWith(path.resolve(PUBLIC_DIR))||!fs.existsSync(target))return;
  let svg=fs.readFileSync(target,'utf8');if(svg.includes('PHOTO-FIRST MAVIK 0.28'))return;
  const details=[`${extras.photoUrls.length} photo(s) de visite conservée(s)`];
  if(extras.deliveryRequired)details.push(`Livraison ${extras.deliveryDestination} : ${extras.deliveryTrips} voyage(s) · ${euro(extras.deliveryAmountHt)} HT`);
  svg=svg.replace('</svg>',`<text x="72" y="1860" font-size="14" fill="#9bd9ef" font-weight="800">PHOTO-FIRST MAVIK 0.28 — ${details.join(' · ')}</text></svg>`);
  fs.writeFileSync(target,svg,'utf8');
}
function installQuotePatches() {
  const quoteStudio=require('./quote-studio-service');
  if(!quoteStudio.__mavikPhotoDeliveryPatched){
    const originalPreview=quoteStudio.preview.bind(quoteStudio);const originalConfirm=quoteStudio.confirm.bind(quoteStudio);
    quoteStudio.preview=function previewPhotoDelivery(store,input={},user={}){
      const prepared=preparedQuoteInput(input);const extras=extraFields(prepared);const result=originalPreview(store,prepared,user);
      result.data.photoIntake={photoUrls:extras.photoUrls,analysis:extras.photoAnalysis,confirmed:extras.photoAnalysisConfirmed};
      result.data.industrial=prepared.category==='industriel'?Object.fromEntries(INDUSTRIAL_KEYS.map((key)=>[key,prepared[key]])):null;
      result.data.delivery=extras.deliveryRequired?extras:null;
      result.quoteText=`${result.quoteText}${featureText(extras,prepared.category)}`;
      if(!extras.photoUrls.length&&!prepared.photoUrl){result.canCreate=false;if(!result.data.missingFields.includes('photo générale'))result.data.missingFields.unshift('photo générale');result.data.warnings.unshift('Commencez le devis par une photo générale de l’élément présenté.');}
      if((extras.photoUrls.length||prepared.photoUrl)&&!extras.photoAnalysisConfirmed){result.canCreate=false;if(!result.data.missingFields.includes('identification photo confirmée'))result.data.missingFields.push('identification photo confirmée');result.data.warnings.push('La catégorie, la couleur et l’immatriculation ou référence proposées à partir des photos doivent être confirmées humainement.');}
      if(prepared.category==='industriel')result.data.warnings.push('Le questionnaire industriel remplace le questionnaire automobile : site, machine, matériaux, énergies, consignation, production, accès et sécurité doivent être détaillés.');
      return result;
    };
    quoteStudio.confirm=function confirmPhotoDelivery(store,input={},user={}){
      const prepared=preparedQuoteInput(input);const extras=extraFields(prepared);
      if(!extras.photoUrls.length&&!prepared.photoUrl)throw Object.assign(new Error('FIRST_PHOTO_REQUIRED'),{status:409,missingFields:['photo générale']});
      if(!extras.photoAnalysisConfirmed)throw Object.assign(new Error('PHOTO_IDENTIFICATION_CONFIRMATION_REQUIRED'),{status:409,missingFields:['confirmation humaine de l’identification photo']});
      const result=originalConfirm(store,prepared,user);const exactText=`${result.quoteText}${featureText(extras,prepared.category)}`;
      const lines=[{label:result.quote.service||prepared.service||'Prestation',quantity:1,totalTtc:prepared.serviceBaseTtc}];
      if(extras.deliveryRequired)lines.push({label:`Service livraison ${extras.deliveryDestination} — ${extras.deliveryTrips} voyage(s)`,quantity:extras.deliveryTrips,unitPriceHt:DELIVERY_RATE_HT,totalHt:extras.deliveryAmountHt,totalTtc:extras.deliveryAmountTtc});
      const quote=store.update('quotes',result.quote.id,{...extras,serviceBaseTtc:prepared.serviceBaseTtc,lines,quoteText:exactText,mailDraftText:exactText,vehiclePhotoUrl:extras.photoUrls[0]||prepared.photoUrl,auditTrail:[...(result.quote.auditTrail||[]),{action:'photo-first-quote-confirmed',changedAt:new Date().toISOString(),changedBy:user.name||user.id||'',photoCount:extras.photoUrls.length,photoAnalysisConfirmed:extras.photoAnalysisConfirmed,industrial:prepared.category==='industriel',delivery:extras.deliveryRequired?{trips:extras.deliveryTrips,rateHt:DELIVERY_RATE_HT,amountHt:extras.deliveryAmountHt}:null}]});
      const currentVehicle=safeList(store,'vehicles').find((item)=>item.id===result.vehicle.id)||result.vehicle;
      const vehiclePatch={dirtLevel:extras.dirtLevel||currentVehicle.dirtLevel,dirtyAreas:extras.dirtyAreas||currentVehicle.dirtyAreas,accessConstraints:extras.accessConstraints||currentVehicle.accessConstraints};
      if(extras.photoUrls.length){vehiclePatch.photoUrl=extras.photoUrls[0];vehiclePatch.photoUrls=extras.photoUrls;}
      if(Object.keys(extras.photoAnalysis||{}).length)vehiclePatch.photoAnalysis=extras.photoAnalysis;
      for(const key of INDUSTRIAL_KEYS)if(prepared[key])vehiclePatch[key]=prepared[key];
      const vehicle=store.update('vehicles',result.vehicle.id,vehiclePatch);
      for(const photo of safeList(store,'photos').filter((item)=>extras.photoUrls.includes(item.url)))store.update('photos',photo.id,{quoteId:quote.id,clientId:quote.clientId,vehicleId:quote.vehicleId});
      for(const document of result.documents||[])if(document.category==='Devis texte')store.update('documents',document.id,{content:exactText,photoUrls:extras.photoUrls,deliveryAmountHt:extras.deliveryAmountHt});
      if(result.communication?.id)store.update('communications',result.communication.id,{message:exactText,status:'Prêt à envoyer immédiatement après validation — fournisseur de messagerie à confirmer'});
      patchVisual(result.visualUrl,extras);
      return {...result,quote,vehicle,quoteText:exactText,delivery:extras.deliveryRequired?extras:null,photoIntake:{photoUrls:extras.photoUrls,analysis:extras.photoAnalysis}};
    };
    quoteStudio.__mavikPhotoDeliveryPatched=true;
  }
  const quoteRequests=require('./quote-requests');
  if(!quoteRequests.__mavikPhotoDeliveryPatched){
    const originalSave=quoteRequests.saveDraft.bind(quoteRequests);const originalSubmit=quoteRequests.submit.bind(quoteRequests);
    quoteRequests.saveDraft=function saveFeatureDraft(store,input={},user={}){
      const result=originalSave(store,input,user);const extras=extraFields(input);
      const request=store.update('quoteRequests',result.request.id,{...extras,photoUrl:text(input.photoUrl||extras.photoUrls[0]),serviceBaseTtc:number(input.serviceBaseTtc||input.finalPrice||input.targetPrice),featureVersion:'0.28'});
      if(result.vehicle?.id&&hasActualVehicleFeatureInput(input,extras)){
        const current=safeList(store,'vehicles').find((item)=>item.id===result.vehicle.id)||result.vehicle;const patch={};
        if(extras.photoUrls.length){patch.photoUrl=extras.photoUrls[0];patch.photoUrls=extras.photoUrls;}
        if(Object.keys(extras.photoAnalysis||{}).length)patch.photoAnalysis=extras.photoAnalysis;
        if(extras.dirtLevel)patch.dirtLevel=extras.dirtLevel;if(extras.dirtyAreas)patch.dirtyAreas=extras.dirtyAreas;if(extras.accessConstraints)patch.accessConstraints=extras.accessConstraints;
        for(const key of INDUSTRIAL_KEYS)if(text(input[key]))patch[key]=text(input[key]);
        if(Object.keys(patch).length)result.vehicle=store.update('vehicles',current.id,patch);
      }
      return {...result,request};
    };
    quoteRequests.submit=function submitFeatureRequest(store,input={},user={}){
      const result=originalSubmit(store,input,user);const extras=extraFields(input);const proposal=quoteStudio.preview(store,{...input,clientId:result.client?.id||input.clientId,vehicleId:result.vehicle?.id||input.vehicleId},user);
      const request=store.update('quoteRequests',result.request.id,{...extras,photoUrl:text(input.photoUrl||extras.photoUrls[0]),jarvisProposal:proposal,jarvisQuoteText:proposal.quoteText,featureVersion:'0.28'});
      return {...result,request,proposal};
    };
    quoteRequests.__mavikPhotoDeliveryPatched=true;
  }
  const jarvis=require('./jarvis-extended');
  if(!jarvis.__mavikPhotoQuotePatched){
    const original=jarvis.execute.bind(jarvis);
    jarvis.execute=function executePhotoQuote(store,input={}){const command=text(input.text||input.command).toLowerCase();if(/^(faire |créer |ouvrir )?(un )?devis[.! ]*$/.test(command)||/commence(r)? (un )?devis/.test(command))return{type:'open-photo-quote',answer:'J’ouvre le devis. Commencez par prendre une photo générale, puis ajoutez les zones sales ou à traiter.',links:[{label:'Ouvrir le devis photo',url:'/quotes?photo=1'}]};return original(store,input);};
    jarvis.__mavikPhotoQuotePatched=true;
  }
}

function stockRecord(store) { return safeList(store,'stockItems').find((item)=>/glace.*carbon|carbon.*glace|dry.?ice/i.test(`${item.name||item.article||''} ${item.category||''}`))||null; }
function createOrderTask(store,quote,required,available,startDate,user) {
  const existing=safeList(store,'tasks').find((item)=>item.quoteId===quote.id&&/commander.*glace/i.test(item.title||'')&&!/termin/i.test(item.status||''));if(existing)return existing;
  return store.create('tasks',{title:`Commander la glace carbonique — ${quote.number}`,status:'À faire',priority:'Haute',assignee:'Direction',dueDate:isoDate(new Date()),quoteId:quote.id,clientId:quote.clientId,vehicleId:quote.vehicleId,instructions:`Date atelier prévue : ${startDate}. Besoin estimé : ${required||'à confirmer'} kg. Stock MAVIK : ${available===null?'non renseigné':`${available} kg`}. Modifier ou passer la commande avant confirmation client.`,createdBy:user.id||'',createdByName:user.name||''});
}
function dryIceGate(store,quote,startDate,user) {
  const stock=stockRecord(store);const available=stock?number(stock.quantity??stock.quantityInStock):null;const required=number(quote.estimatedDryIceKg||quote.dryIceEstimatedKg||quote.glaceEstimatedKgMax||(quote.requestCategory==='industriel'?0:20));const lead=workdaysBetween(new Date(),startDate);
  if(required>0&&available!==null&&available>=required)return{ok:true,available,required,leadWorkdays:lead,orderRequired:false};
  if(lead>=ORDER_LEAD_WORKDAYS){const task=createOrderTask(store,quote,required,available,startDate,user);return{ok:true,available,required,leadWorkdays:lead,orderRequired:true,taskId:task.id,warning:'Stock insuffisant ou non confirmé : commande à modifier ou passer avant le rendez-vous.'};}
  throw Object.assign(new Error('DRY_ICE_STOCK_OR_ORDER_LEAD_REQUIRED'),{status:409,missingFields:['stock de glace suffisant ou délai pour modifier/passer la commande']});
}
function cancelOldDeliveryBlocks(store,quoteId,user) { for(const block of safeList(store,'planningBlocks').filter((item)=>item.quoteId===quoteId&&item.deliveryResourceBlock&&!/annul/i.test(item.status||'')))store.update('planningBlocks',block.id,{status:'Annulée',cancelledAt:new Date().toISOString(),cancelledBy:user.name||user.id||''}); }
function createDeliveryBlocks(store,quote,user) {
  cancelOldDeliveryBlocks(store,quote.id,user);if(!quote.deliveryRequired||!number(quote.deliveryTrips))return[];
  const dates=[quote.proposedDropoffDate||quote.estimatedStartDate,quote.estimatedDeliveryDate].filter(Boolean);const count=Math.min(number(quote.deliveryTrips),dates.length||1);const blocks=[];
  for(let index=0;index<count;index+=1){const date=dates[index]||quote.estimatedStartDate;blocks.push(store.create('planningBlocks',{title:`${DELIVERY_RESOURCE} — En livraison — ${quote.number}`,type:'Livraison',startDate:date,endDate:date,startTime:DELIVERY_START,endTime:DELIVERY_END,status:'Active',blocksWorkshop:false,assignedUserName:DELIVERY_ASSIGNEE,assignee:DELIVERY_ASSIGNEE,resource:DELIVERY_RESOURCE,vehicleResource:DELIVERY_RESOURCE,quoteId:quote.id,clientId:quote.clientId,vehicleId:quote.vehicleId,deliveryResourceBlock:true,deliveryTripNumber:index+1,notes:`${quote.deliveryDestination||'Bayonne'} · ${DELIVERY_RATE_HT} € HT/h · voyage ${index+1}/${quote.deliveryTrips}`,createdBy:user.id||'',createdByName:user.name||''}));}
  return blocks;
}
function installPlanningPatch() {
  const planning=require('./planning-service');if(planning.__mavikDeliveryStockPatched)return;const original=planning.scheduleQuote.bind(planning);
  planning.scheduleQuote=function scheduleWithResources(store,input={},user={}){if(!direction(user))throw Object.assign(new Error('PLANNING_DIRECTION_REQUIRED'),{status:403});if(input.cancelReservation===true)return original(store,input,user);const quote=safeList(store,'quotes').find((item)=>item.id===input.quoteId||item.number===input.quoteId);if(!quote)throw Object.assign(new Error('QUOTE_NOT_FOUND'),{status:404});const startDate=isoDate(input.startDate||quote.estimatedStartDate);const stock=startDate?dryIceGate(store,quote,startDate,user):null;const result=original(store,input,user);const updated=safeList(store,'quotes').find((item)=>item.id===result.quote.id)||result.quote;return{...result,stock,deliveryBlocks:createDeliveryBlocks(store,updated,user)};};
  planning.__mavikDeliveryStockPatched=true;
}
function rescheduleFromClientEmail(store,input,user) {
  requireDirection(user);if(!bool(input.clientAgreementConfirmed))throw Object.assign(new Error('CLIENT_EMAIL_AGREEMENT_REQUIRED'),{status:409});if(!text(input.sourceEmailId||input.clientAgreementText))throw Object.assign(new Error('CLIENT_EMAIL_PROOF_REQUIRED'),{status:409});
  const planning=require('./planning-service');const quote=safeList(store,'quotes').find((item)=>item.id===input.quoteId||item.number===input.quoteId);if(!quote)throw Object.assign(new Error('QUOTE_NOT_FOUND'),{status:404});
  const proposal=planning.propose(store,{quoteId:quote.id,durationDays:number(quote.estimatedDurationDays||1),earliestDate:input.requestedDate||new Date(),expertRequired:quote.expertReviewRequired,expertApproved:quote.expertReviewStatus==='Approuvée'});if(proposal.blocked)throw Object.assign(new Error(proposal.reason||'NO_CAPACITY'),{status:409});
  const result=planning.scheduleQuote(store,{quoteId:quote.id,inspectionDate:proposal.inspection?.date||quote.inspectionDate,inspectionTime:proposal.inspection?.time||quote.inspectionTime,dropoffDate:proposal.intervention.dropoffDate,dropoffTime:proposal.intervention.dropoffTime,startDate:proposal.intervention.startDate,endDate:proposal.intervention.endDate,deliveryDate:proposal.intervention.deliveryDate,deliveryTime:proposal.intervention.deliveryTime,confirmed:true},user);
  const updated=store.update('quotes',result.quote.id,{rescheduledFromClientEmail:true,rescheduledAt:new Date().toISOString(),rescheduledBy:user.name||user.id||'Jarvis',clientAgreementConfirmed:true,clientAgreementSource:text(input.sourceEmailId||input.clientAgreementText),previousRequestedDate:text(input.requestedDate),auditTrail:[...(result.quote.auditTrail||[]),{action:'rescheduled-after-client-email-agreement',changedAt:new Date().toISOString(),changedBy:user.name||user.id||'Jarvis',source:text(input.sourceEmailId||input.clientAgreementText),nearestDate:proposal.intervention.startDate,stock:result.stock}]});
  store.create('tasks',{title:`Planning modifié après accord client — ${updated.number}`,status:'À faire',priority:'Haute',assignee:'Équipe GentleCarE',dueDate:isoDate(new Date()),quoteId:updated.id,clientId:updated.clientId,vehicleId:updated.vehicleId,instructions:`Nouvelle date la plus proche : ${updated.estimatedStartDate}. Accord client conservé : ${text(input.sourceEmailId||input.clientAgreementText)}. Vérifier la tâche de glace si elle a été créée.`,createdBy:user.id||'',createdByName:user.name||''});
  return{...result,quote:updated,proposal,teamNotified:true};
}

function navigationFeatureScript() { return `\n;(()=>{const run=async()=>{try{const r=await fetch('/api/auth/me',{cache:'no-store'});const d=await r.json();const direction=['admin','associate'].includes(d.user?.role);document.querySelectorAll('a[href="/planning"]').forEach(a=>{if(!direction){a.href='/workshop-day';a.textContent=a.textContent.replace(/Planning.*/i,'Atelier du jour')}});const containers=[document.querySelector('.side .nav'),document.querySelector('.mobile'),document.querySelector('.nav')].filter(Boolean);for(const c of containers){if(!c.querySelector('a[href="/workshop-day"]')){const a=document.createElement('a');a.href='/workshop-day';a.innerHTML='<b>◷</b>Atelier du jour';c.appendChild(a)}}}catch{}};run()})();\n`; }
function quoteFetchAugmentScript() { return `\n;(()=>{if(window.__MAVIK_QUOTE_FETCH_AUGMENT__)return;window.__MAVIK_QUOTE_FETCH_AUGMENT__=true;const previous=window.fetch;const ids=${JSON.stringify(FEATURE_KEYS)};const read=(id)=>document.getElementById(id)?.value||'';const checked=(id)=>document.getElementById(id)?.checked===true;const extras=()=>{const out={};for(const id of ids){if(id==='photoUrls')out.photoUrls=(()=>{try{return JSON.parse(read('photoUrlsJson')||'[]')}catch{return[]}})();else if(id==='photoAnalysis')out.photoAnalysis=(()=>{try{return JSON.parse(read('photoAnalysisJson')||'{}')}catch{return{}}})();else if(['photoAnalysisConfirmed','deliveryRequired'].includes(id))out[id]=id==='deliveryRequired'?checked(id):read(id)==='true';else out[id]=read(id)}return out};window.fetch=async function(input,init={}){const url=typeof input==='string'?input:input?.url||'';if(/^\/api\/(quote-requests\/(draft|submit)|quote-studio\/(preview|confirm))/.test(url)&&init.body){try{const body=JSON.parse(init.body);init={...init,body:JSON.stringify({...body,...extras()})}}catch{}}const response=await previous(input,init);if(/\/api\/quote-requests\/(draft|submit)$/.test(url))response.clone().json().then(d=>{if(d.request?.id)window.MAVIKQuoteRequestId=d.request.id}).catch(()=>{});return response};document.addEventListener('click',e=>{const b=e.target.closest('[data-load-request]');if(!b)return;setTimeout(async()=>{try{const r=await previous('/api/quote-requests/'+encodeURIComponent(b.dataset.loadRequest),{cache:'no-store'});const d=await r.json();window.MAVIKQuotePhotoHydrate?.(d.request||{})}catch{}},50)},true)})();\n`; }
function hydrateScript() { return `\n;window.MAVIKQuotePhotoHydrate=(r={})=>{const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};set('photoUrlsJson',JSON.stringify(r.photoUrls||[]));set('photoAnalysisJson',JSON.stringify(r.photoAnalysis||{}));set('photoAnalysisConfirmed',String(r.photoAnalysisConfirmed===true));for(const id of ${JSON.stringify(FEATURE_KEYS.filter((key)=>!['photoUrls','photoAnalysis','photoAnalysisConfirmed','deliveryRequired'].includes(key)))})set(id,r[id]??'');const d=document.getElementById('deliveryRequired');if(d)d.checked=r.deliveryRequired===true;const dv=document.getElementById('deliveryDestinationVisible');if(dv)dv.value=r.deliveryDestination||'Bayonne';const tv=document.getElementById('deliveryTripsVisible');if(tv)tv.value=String(r.deliveryTrips||1);d?.dispatchEvent(new Event('change',{bubbles:true}))};\n`; }
function installHttpPatch() {
  if(http.__mavikFeature028Patched)return;const originalCreateServer=http.createServer.bind(http);
  http.createServer=function createFeatureServer(listener){return originalCreateServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{
    if(req.method==='GET'&&url.pathname==='/assets/navigation-enhancer.js'){const original=fs.readFileSync(path.join(PUBLIC_DIR,'navigation-enhancer.js'),'utf8');const photos=fs.readFileSync(path.join(PUBLIC_DIR,'quote-photo-client.js'),'utf8');return js(res,`${original}\n${photos}\n${hydrateScript()}\n${quoteFetchAugmentScript()}\n${navigationFeatureScript()}`);}
    if(req.method==='GET'&&url.pathname.startsWith('/feature-assets/')){const file=path.basename(url.pathname);if(file!=='workshop-day-client.js')return json(res,404,{error:'FEATURE_ASSET_NOT_FOUND'});return js(res,fs.readFileSync(path.join(PUBLIC_DIR,file),'utf8'));}
    if(req.method==='GET'&&url.pathname==='/workshop-day'){const user=authUser(req);if(!user)return redirect(res,'/login?next=/workshop-day');return html(res,200,fs.readFileSync(path.join(PUBLIC_DIR,'workshop-day.html'),'utf8'));}
    if(req.method==='GET'&&url.pathname==='/planning'){const user=authUser(req);if(!user)return redirect(res,'/login?next=/planning');if(!direction(user))return redirect(res,'/workshop-day');}
    if(url.pathname.startsWith('/api/planning/')&&['/api/planning/overview','/api/planning/propose','/api/planning/schedule','/api/planning/blocks'].includes(url.pathname)){const user=requireUser(req);requireDirection(user);if(req.method==='POST'&&url.pathname==='/api/planning/schedule')return json(res,200,require('./planning-service').scheduleQuote(require('./local-store'),await readBody(req),user));}
    if(req.method==='POST'&&url.pathname==='/api/planning/reschedule-email')return json(res,200,rescheduleFromClientEmail(require('./local-store'),await readBody(req),requireUser(req)));
    if(req.method==='GET'&&url.pathname==='/api/workshop-day')return json(res,200,require('./workshop-day-plan').build(require('./local-store'),{date:url.searchParams.get('date'),employeeName:url.searchParams.get('employeeName')},requireUser(req)));
    if(req.method==='POST'&&url.pathname==='/api/quote-studio/photos/analyze'){const user=requireUser(req);require('./auth').requirePermission(user,'quotes.write');return json(res,200,require('./quote-photo-intake').analyze(require('./local-store'),await readBody(req),user));}
    if(req.method==='POST'&&url.pathname==='/api/sync/test'){const user=requireUser(req);require('./auth').requirePermission(user,'dashboard.read');const sync=require('./airtable-sync');const result=await sync.testConnection();return json(res,200,{...result,ok:result.ok===true,localConfiguration:{configured:sync.configured(),baseId:sync.status().baseId,explanation:sync.configured()?'Jeton local présent. Le résultat ci-dessus confirme ou refuse son accès réel.':'Le connecteur Airtable de ChatGPT fonctionne, mais MAVIK local ne possède pas AIRTABLE_TOKEN dans server/.env.'}});}
    return listener(req,res);
  }catch(error){return json(res,error.status||500,{error:error.message||'MAVIK_FEATURE_ERROR',missingFields:error.missingFields||undefined,conflicts:error.conflicts||undefined});}});};
  http.__mavikFeature028Patched=true;
}

installHttpPatch();
setImmediate(()=>{try{installQuotePatches();installPlanningPatch();}catch(error){console.error('[MAVIK 0.28 feature patch]',error);}});

module.exports={DELIVERY_RATE_HT,DELIVERY_START,DELIVERY_END,DELIVERY_ASSIGNEE,DELIVERY_RESOURCE,extraFields,preparedQuoteInput,dryIceGate,createDeliveryBlocks,rescheduleFromClientEmail,installQuotePatches,installPlanningPatch};
