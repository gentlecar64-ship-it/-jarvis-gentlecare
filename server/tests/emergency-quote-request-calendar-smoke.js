'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const emergency = require('../emergency-alert');
const quoteRequests = require('../quote-requests');
const tariffs = require('../tariff-catalog');
const procedures = require('../workshop-procedures');
const calendar = require('../calendar-bridge');
const startupStatus = require('../startup-status');
const knowledge = require('../jarvis-knowledge').knowledge;

const emergencyBackup = fs.existsSync(emergency.FILE) ? fs.readFileSync(emergency.FILE) : null;
const db = { clients:[], vehicles:[], quotes:[], quoteRequests:[], interventions:[], tasks:[], communications:[], documents:[], photos:[], observations:[], stockItems:[], planningBlocks:[], workSessions:[], leaveRequests:[], externalCalendarEvents:[], events:[] };
let requestNumber = 0;
const store = {
  list(collection) { return db[collection] || []; },
  create(collection,input) { db[collection] ||= []; const record={ id:crypto.randomUUID(), ...input, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }; if(collection==='quoteRequests') record.number=`DD-2026-${String(++requestNumber).padStart(4,'0')}`; db[collection].unshift(record); return record; },
  update(collection,id,input) { const index=db[collection].findIndex((item)=>item.id===id); if(index<0) throw new Error('NOT_FOUND'); db[collection][index]={ ...db[collection][index], ...input, id, updatedAt:new Date().toISOString() }; return db[collection][index]; },
  summary() { return { clients:db.clients.length, vehicles:db.vehicles.length, interventions:db.interventions.length, quoteRequests:db.quoteRequests.length, quotes:db.quotes.length }; }
};

try {
  fs.mkdirSync(require('node:path').dirname(emergency.FILE),{recursive:true});
  fs.writeFileSync(emergency.FILE,JSON.stringify({active:false,history:[]},null,2));
  const david={id:'david',name:'David Bourasseau',role:'admin'};
  const bene={id:'bene',name:'Bénédicte Lopez',role:'associate'};
  const technician={id:'tech',name:'Technicien Test',role:'technician'};

  assert.throws(()=>emergency.activate({service:'112'},technician),/EMERGENCY_CONFIRMATION_REQUIRED/);
  const active=emergency.activate({service:'112',confirmed:true,message:'Test alerte'},technician);
  assert.equal(active.active,true);
  assert.equal(active.service,'112');
  assert.equal(emergency.status(david).canStop,true);
  assert.equal(emergency.status(bene).canStop,true);
  assert.equal(emergency.acknowledge(david).acknowledgementCount,2);
  assert.throws(()=>emergency.stop({confirmText:'non'},david),/EMERGENCY_STOP_CONFIRMATION_REQUIRED/);
  const stopped=emergency.stop({confirmText:'ARRET'},david);
  assert.equal(stopped.active,false);
  assert.ok(stopped.stoppedAt);

  const expectedCategories=['voiture','moto','utilitaire','camion','avion','helicoptere','industriel','autre'];
  assert.deepEqual(procedures.categories().map((item)=>item.key),expectedCategories);
  const carProcedure=procedures.get('automobile');
  const motoProcedure=procedures.get('moto');
  const truckProcedure=procedures.get('camion');
  const aircraftProcedure=procedures.get('avion');
  const industrialProcedure=procedures.get('devis industriel');
  assert.match(carProcedure.label,/voiture/i);
  assert.match(carProcedure.checklist.join(' '),/quatre points de levage/i);
  assert.match(motoProcedure.label,/moto/i);
  assert.match(motoProcedure.checklist.join(' '),/chaîne|transmission/i);
  assert.doesNotMatch(motoProcedure.checklist.join(' '),/quatre points de levage/i);
  assert.match(truckProcedure.label,/poids lourd/i);
  assert.match(aircraftProcedure.label,/autorisations aéronautiques/i);
  assert.match(industrialProcedure.label,/industriel/i);

  const catalog=tariffs.list();
  for(const category of expectedCategories) assert.ok(catalog.some((item)=>item.vehicleType===category),`Tarif ou étude manquant pour ${category}`);
  assert.equal(catalog.some((item)=>/fondateur|pass/i.test(`${item.key} ${item.label}`)),false);
  assert.equal(JSON.stringify(knowledge).match(/integralClub|integralFounder|Pass Fondateur|tarif Club/gi),null);
  const margin=tariffs.margin({standardPriceTtc:1500,finalPriceTtc:1200,directCostTtc:650,targetMarginPercent:30});
  assert.equal(margin.discountAmountTtc,300);
  assert.equal(Math.round(margin.discountPercent),20);
  assert.equal(margin.warnings.length,0);
  assert.ok(tariffs.margin({standardPriceTtc:1000,finalPriceTtc:500,directCostTtc:700,targetMarginPercent:30}).warnings.length>=1);

  const incomplete=quoteRequests.saveDraft(store,{clientName:'Client sans catégorie',email:'vide@example.com'},technician);
  assert.equal(incomplete.request.requestCategory,'');
  assert.throws(()=>quoteRequests.submit(store,{...incomplete.request,requestId:incomplete.request.id},technician),/QUOTE_CATEGORY_REQUIRED/);

  const draft=quoteRequests.saveDraft(store,{
    clientName:'Client Moto',email:'moto@example.com',mobile:'0611223344',requestCategory:'moto',vehicleType:'moto',customerType:'particulier',brand:'Ducati',model:'Monster',registration:'MO-123-TO',year:2021,
    tariffKey:'moto-particulier',finalPrice:900,service:'Cryonettoyage moto',voiceText:'Il s’agit d’une moto Ducati Monster 2021'
  },technician);
  assert.ok(draft.request.number.startsWith('DD-2026-'));
  assert.ok(draft.client.id);
  assert.equal(draft.vehicle.requestCategory,'moto');
  assert.equal(draft.request.workshopProcedureKey,'moto-standard-v1');

  const submitted=quoteRequests.submit(store,{...draft.request,requestId:draft.request.id},technician);
  assert.equal(submitted.request.status,'Proposition Jarvis à valider par la direction');
  assert.equal(submitted.request.validationRequired,true);
  assert.match(submitted.proposal.quoteText,/Nature de la demande : Moto/i);
  assert.match(submitted.proposal.quoteText,/Procédure atelier moto/i);
  assert.ok(db.tasks.some((task)=>task.quoteRequestId===submitted.request.id && /David \/ Bénédicte/.test(task.assignee)));
  assert.equal(quoteRequests.list(store,technician).length,2);
  assert.equal(quoteRequests.list(store,david).length,2);
  const decision=quoteRequests.markDecision(store,submitted.request.id,{decision:'Validée',comment:'À transformer en devis après contrôle.'},david);
  assert.equal(decision.status,'Validée pour création du devis');

  const parsed=calendar.parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test-1\r\nDTSTART;VALUE=DATE:20260907\r\nDTEND;VALUE=DATE:20260908\r\nSUMMARY:Rendez-vous banque\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].title,'Rendez-vous banque');
  store.create('interventions',{number:'GC-2026-0001',service:'Cryonettoyage voiture',scheduledDate:'2026-09-07',estimatedEndDate:'2026-09-08',status:'Prévue'});
  const ics=calendar.buildIcs(store);
  assert.match(ics,/BEGIN:VCALENDAR/);
  assert.match(ics,/Cryonettoyage voiture/);
  assert.equal(calendar.tokenValid('mauvais-token'),false);

  const readiness=startupStatus.build({
    localStore:store,
    tariffCatalog:tariffs,
    workshopProcedures:procedures,
    updater:{ currentVersion:()=> '0.25.0-alpha.1', gitStatus:()=>({branch:'main',commit:'1234567890abcdef'}), state:()=>({currentVersion:'0.25.0-alpha.1',currentCommit:'1234567890abcdef',branch:'main',updateAvailable:false,pendingRestart:false}) },
    airtableConfigured:false,
    calendarConfigured:false,
    version:'0.25.0-alpha.1',port:4782,host:'0.0.0.0',url:'http://localhost:4782'
  });
  assert.equal(readiness.ok,true);
  assert.equal(readiness.modules.procedures,8);
  assert.equal(readiness.version,'0.25.0-alpha.1');

  console.log('Emergency, category-first quote requests, tariffs, procedures, calendar and startup status smoke test passed.');
} finally {
  if(emergencyBackup) fs.writeFileSync(emergency.FILE,emergencyBackup); else { try{fs.unlinkSync(emergency.FILE);}catch{} }
}
