'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

class MemoryStore {
  constructor(seed = {}) { this.db = { clients:[], vehicles:[], quotes:[], quoteRequests:[], interventions:[], communications:[], tasks:[], documents:[], photos:[], planningBlocks:[], stockItems:[], leaveRequests:[], externalCalendarEvents:[], ...seed }; }
  list(collection) { return this.db[collection] || []; }
  create(collection, input) { const record={id:crypto.randomUUID(),number:input.number||`${collection.toUpperCase()}-${this.list(collection).length+1}`,...input,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; if(!this.db[collection])this.db[collection]=[]; this.db[collection].unshift(record); return record; }
  update(collection,id,patch) { const index=this.list(collection).findIndex((record)=>record.id===id||record.number===id); if(index<0)throw new Error(`NOT_FOUND_${collection}`); this.db[collection][index]={...this.db[collection][index],...patch,updatedAt:new Date().toISOString()}; return this.db[collection][index]; }
}

const runtime = require('../feature-runtime-028');
const photoIntake = require('../quote-photo-intake');
const workshopDay = require('../workshop-day-plan');
const mode = process.argv[2] || 'all';
const run = (name) => mode === 'all' || mode === name;
function addWorkdays(days) { const date=new Date(); let left=days; while(left>0){date.setDate(date.getDate()+1);if(![0,6].includes(date.getDay()))left-=1}return date.toISOString().slice(0,10); }
const onePixelPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const admin = { id:'admin-1', name:'David Test', role:'admin' };

if (run('industrial')) {
  const store=new MemoryStore();
  const industrial=photoIntake.analyze(store,{requestCategory:'industriel',clientName:'Usine Test',photos:[{name:'machine-presse-zone-generale.png',dataUrl:onePixelPng,role:'Vue générale',detectedText:'PRESSE INDUSTRIELLE REF 4587'},{name:'graisse-zone-moteur.png',dataUrl:onePixelPng,role:'Zone sale'}]},admin);
  assert.equal(industrial.analysis.category,'industriel');
  assert.equal(industrial.photos.length,2);
  assert.ok(industrial.questions.some((item)=>item.key==='industrialConsignation'));
  assert.ok(industrial.questions.some((item)=>item.key==='industrialProductionConstraints'));
  assert.ok(!industrial.questions.some((item)=>/immatriculation/i.test(item.label)));
  assert.match(industrial.analysis.limitations,/ne prétend pas reconnaître/i);
  const prepared=runtime.preparedQuoteInput({requestCategory:'industriel',industrialMachineFunction:'Presse hydraulique',finalPrice:1000,deliveryRequired:true,deliveryTrips:2,photoUrls:industrial.photos.map((item)=>item.url),photoAnalysisConfirmed:true});
  assert.equal(prepared.model,'Presse hydraulique');
  assert.equal(prepared.deliveryRateHt,85);
  assert.equal(prepared.deliveryAmountHt,170);
  assert.equal(prepared.deliveryAmountTtc,204);
  assert.equal(prepared.finalPrice,1204);
  console.log('Industrial photo intake passed.');
}

if (run('delivery')) {
  const store=new MemoryStore();
  const quote=store.create('quotes',{number:'DEV-2026-TEST',requestCategory:'voiture',clientId:'client-1',vehicleId:'vehicle-1',deliveryRequired:true,deliveryTrips:2,deliveryDestination:'Bayonne',estimatedDryIceKg:20,proposedDropoffDate:addWorkdays(3),estimatedStartDate:addWorkdays(4),estimatedEndDate:addWorkdays(5),estimatedDeliveryDate:addWorkdays(6),status:'À valider'});
  const blocks=runtime.createDeliveryBlocks(store,quote,admin);
  assert.equal(blocks.length,2);
  assert.ok(blocks.every((item)=>item.assignedUserName==='Séverine'));
  assert.ok(blocks.every((item)=>item.resource==='Camion'));
  assert.ok(blocks.every((item)=>item.startTime==='08:30'&&item.endTime==='09:30'));
  assert.ok(blocks.every((item)=>/En livraison/.test(item.title)));
  console.log('Delivery blocks passed.');
}

if (run('stock')) {
  const quote={id:'quote-1',number:'DEV-2026-TEST',requestCategory:'voiture',clientId:'client-1',vehicleId:'vehicle-1',estimatedDryIceKg:20};
  const store=new MemoryStore({quotes:[quote],stockItems:[{id:'stock-ok',name:'Glace carbonique pellets',quantity:50,unit:'kg'}]});
  const stock=runtime.dryIceGate(store,quote,addWorkdays(4),admin);
  assert.equal(stock.ok,true);
  assert.equal(stock.orderRequired,false);
  const lowStockStore=new MemoryStore({quotes:[quote],stockItems:[{id:'stock-1',name:'Glace carbonique',quantity:0}],tasks:[]});
  const futureGate=runtime.dryIceGate(lowStockStore,quote,addWorkdays(3),admin);
  assert.equal(futureGate.orderRequired,true);
  assert.ok(lowStockStore.list('tasks').some((item)=>/Commander la glace carbonique/.test(item.title)));
  assert.throws(()=>runtime.dryIceGate(lowStockStore,quote,new Date().toISOString().slice(0,10),admin),/DRY_ICE_STOCK_OR_ORDER_LEAD_REQUIRED/);
  console.log('Dry-ice stock gate passed.');
}

if (run('workshop')) {
  const today=new Date().toISOString().slice(0,10);
  const dayStore=new MemoryStore({planningBlocks:[{id:'delivery-1',title:'Camion — En livraison — DEV-1',type:'Livraison',startDate:today,endDate:today,startTime:'08:30',endTime:'09:30',status:'Active',assignedUserName:'Séverine',assignee:'Séverine',resource:'Camion'}]});
  const plan=workshopDay.build(dayStore,{employeeName:'Séverine',date:today,now:`${today}T08:45:00`},{id:'associate-1',name:'Bénédicte',role:'associate'});
  assert.equal(plan.dayStart,'08:30');
  assert.equal(plan.dayEnd,'17:00');
  assert.equal(plan.summary.deliveries,1);
  assert.equal(plan.current.phase,'active');
  assert.match(plan.current.instruction,/livraison/i);
  assert.equal(plan.policy.workshopCalendarPriority,'highest');
  assert.throws(()=>workshopDay.build(dayStore,{employeeName:'Séverine'},{id:'tech-1',name:'Autre Employé',role:'technician'}),/WORKSHOP_DAY_OTHER_EMPLOYEE_FORBIDDEN/);
  console.log('Dynamic workshop day passed.');
}

console.log(`MAVIK 0.28 smoke mode ${mode} passed.`);
