'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class MemoryStore {
  constructor(seed = {}) { this.db = { clients:[], vehicles:[], quotes:[], quoteRequests:[], interventions:[], communications:[], tasks:[], documents:[], planningBlocks:[], externalCalendarEvents:[], leaveRequests:[], ...seed }; }
  list(collection) { return this.db[collection] || []; }
  create(collection, input) { const record={id:crypto.randomUUID(),number:input.number||`${collection.toUpperCase()}-${this.list(collection).length+1}`,...input,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; if(!this.db[collection])this.db[collection]=[]; this.db[collection].unshift(record); return record; }
  update(collection,id,patch) { const index=this.list(collection).findIndex((record)=>record.id===id||record.number===id); if(index<0)throw new Error('NOT_FOUND'); this.db[collection][index]={...this.db[collection][index],...patch,updatedAt:new Date().toISOString()}; return this.db[collection][index]; }
}

const authPath=require.resolve('../auth');
let auth=require('../auth');
const dataDir=path.dirname(auth.USERS_FILE);
const usersBackup=fs.existsSync(auth.USERS_FILE)?fs.readFileSync(auth.USERS_FILE):null;
const sessionsBackup=fs.existsSync(auth.SESSIONS_FILE)?fs.readFileSync(auth.SESSIONS_FILE):null;
function request(token){return{url:'/api/auth/me',headers:{authorization:`Bearer ${token}`,'x-gcos-client':'pc','x-gcos-device-id':'test-pc',host:'localhost:4782','user-agent':'MAVIK smoke test'},socket:{remoteAddress:'127.0.0.1'}}}

try {
  fs.mkdirSync(dataDir,{recursive:true}); fs.writeFileSync(auth.USERS_FILE,'[]'); fs.writeFileSync(auth.SESSIONS_FILE,'[]'); delete require.cache[authPath]; auth=require('../auth');
  const context={id:'test-pc',type:'pc',label:'PC test'};
  auth.createInitialAdmin({name:'David Test',username:'david',email:'david.test@example.com',password:'1234'},context);
  const login=auth.login('david','1234',context);
  assert.equal(login.persistentAcrossUpdates,true);
  assert.equal(auth.authenticate(request(login.token)).username,'david');
  delete require.cache[authPath]; const reloadedAuth=require('../auth');
  assert.equal(reloadedAuth.authenticate(request(login.token)).username,'david','session must survive server module reload');
  reloadedAuth.logout(login.token); delete require.cache[authPath]; const loggedOutAuth=require('../auth');
  assert.equal(loggedOutAuth.authenticate(request(login.token)),null,'explicit end-of-day logout must invalidate the session');

  const quoteRequests=require('../quote-requests');
  const quoteStudio=require('../quote-studio-service');
  const planning=require('../planning-service');
  const quoteWorkflow=require('../quote-workflow');
  const store=new MemoryStore();
  const admin={id:'admin-1',name:'David Test',role:'admin'};
  const saved=quoteRequests.saveDraft(store,{requestCategory:'voiture',clientName:'Client Exemple',email:'client@example.com',brand:'Ford',model:'Mustang',registration:'AA-123-BB',service:'Pack automobile particulier',targetPrice:1500,finalPrice:1500,termsAccepted:true,termsAcceptedBy:'Client Exemple',technicalMediaAuthorized:true,expertTransmissionAuthorized:true,commercialMediaAuthorized:false,identifiableMediaAuthorized:false,emailAllowed:true,smsAllowed:false},admin);
  assert.equal(saved.request.termsAccepted,true);
  assert.equal(saved.request.technicalMediaAuthorized,true);
  assert.match(saved.request.termsUrl,/conditionsgenerales/);

  const proposal=quoteStudio.preview(store,{...saved.request,requestCategory:'voiture',vehicleType:'voiture',service:'Pack automobile particulier',targetPrice:1500,finalPrice:1500,termsAccepted:true,termsAcceptedBy:'Client Exemple',technicalMediaAuthorized:true,expertTransmissionAuthorized:true,emailAllowed:true},admin);
  assert.match(proposal.quoteText,/CONDITIONS ET AUTORISATIONS/);
  assert.match(proposal.quoteText,/CGV : acceptées/i);
  assert.equal(proposal.data.legal.termsAccepted,true);

  const removed=quoteRequests.markDecision(store,saved.request.id,{decision:'Supprimée',comment:'Doublon de test'},admin);
  assert.equal(removed.status,'Supprimée par la direction');
  assert.equal(quoteRequests.list(store,admin).length,0);

  const client=saved.client; const vehicle=saved.vehicle;
  const quote=store.create('quotes',{number:'DEV-2026-0001',clientId:client.id,vehicleId:vehicle.id,status:'Accepté',planningStatus:'Confirmé en interne',estimatedStartDate:'2026-07-20',estimatedEndDate:'2026-07-21',estimatedDeliveryDate:'2026-07-22'});
  const intervention=store.create('interventions',{number:'GC-2026-0001',clientId:client.id,vehicleId:vehicle.id,quoteId:quote.id,status:'Planifiée',workStatus:'À préparer',estimatedStartDate:'2026-07-20',estimatedEndDate:'2026-07-21'});
  store.update('quotes',quote.id,{interventionId:intervention.id});
  const cancelled=planning.scheduleQuote(store,{quoteId:quote.id,cancelReservation:true,cancelConfirmed:true,reason:'Test direction'},admin);
  assert.equal(cancelled.cancelled,true);
  assert.equal(cancelled.quote.status,'Annulé');
  assert.equal(cancelled.intervention.workstationReleased,true);
  assert.equal(store.list('communications').length,1);
  assert.throws(()=>planning.scheduleQuote(store,{quoteId:quote.id,cancelReservation:true,cancelConfirmed:true},{id:'employee',name:'Employé',role:'technician'}),/RESERVATION_CANCELLATION_DIRECTION_REQUIRED/);

  const invoiceQuote=store.create('quotes',{number:'DEV-2026-0002',clientId:client.id,vehicleId:vehicle.id,status:'Accepté',totalTtc:1500,balanceTtc:750,termsAccepted:true,termsAcceptedAt:new Date().toISOString(),termsAcceptedBy:'Client Exemple',technicalMediaAuthorized:true});
  const invoiceIntervention=store.create('interventions',{number:'GC-2026-0002',clientId:client.id,vehicleId:vehicle.id,quoteId:invoiceQuote.id,status:'En cours',workStatus:'En cours',checklist:{}});
  store.update('quotes',invoiceQuote.id,{interventionId:invoiceIntervention.id});
  const completed=quoteWorkflow.transition(store,invoiceQuote.id,'complete',{},admin);
  assert.ok(completed.data.invoice,'invoice legal hook must expose the updated invoice draft');
  assert.match(completed.data.invoice.content,/RCS Bayonne 105 817 647/);
  assert.match(completed.data.invoice.content,/Conditions générales/);
  assert.equal(completed.data.invoice.termsAccepted,true);

  console.log('Continuous session, legal quote, invoice and direction controls smoke test passed.');
} finally {
  fs.mkdirSync(dataDir,{recursive:true});
  if(usersBackup)fs.writeFileSync(auth.USERS_FILE,usersBackup);else{try{fs.unlinkSync(auth.USERS_FILE)}catch{}}
  if(sessionsBackup)fs.writeFileSync(auth.SESSIONS_FILE,sessionsBackup);else{try{fs.unlinkSync(auth.SESSIONS_FILE)}catch{}}
}
