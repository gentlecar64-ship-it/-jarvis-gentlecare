'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const quoteStudio = require('../quote-studio-service');
const planning = require('../planning-service');

const db = { clients:[], vehicles:[], quotes:[], quoteRequests:[], interventions:[], tasks:[], communications:[], documents:[], photos:[], observations:[], stockItems:[], planningBlocks:[], workSessions:[], leaveRequests:[], externalCalendarEvents:[], events:[] };
let quoteNumber = 0;
let interventionNumber = 0;
const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) {
    db[collection] ||= [];
    const record = { id:crypto.randomUUID(), ...input, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    if (collection === 'quotes') record.number = `DEV-2026-${String(++quoteNumber).padStart(4,'0')}`;
    if (collection === 'interventions') record.number = `GC-2026-${String(++interventionNumber).padStart(4,'0')}`;
    db[collection].unshift(record);
    return record;
  },
  update(collection, id, input) {
    const index = db[collection].findIndex((item) => item.id === id);
    if (index < 0) throw new Error('NOT_FOUND');
    db[collection][index] = { ...db[collection][index], ...input, id, updatedAt:new Date().toISOString() };
    return db[collection][index];
  }
};
const user = { id:'admin', name:'David Bourasseau', role:'admin' };
const employee = { id:'employee', name:'Employé Test', role:'technician' };

const packages = quoteStudio.packages();
assert.ok(packages.some((item) => item.key === 'voiture-particulier-integral'));
assert.ok(packages.some((item) => item.key === 'voiture-professionnel-etude'));
assert.ok(packages.some((item) => item.key === 'moto-particulier'));
assert.ok(packages.some((item) => item.key === 'moto-professionnel'));
assert.ok(packages.some((item) => item.key === 'utilitaire-etude'));
assert.ok(packages.some((item) => item.key === 'camion-etude'));
assert.ok(packages.some((item) => item.key === 'avion-etude'));
assert.ok(packages.some((item) => item.key === 'helicoptere-etude'));
assert.ok(packages.some((item) => item.key === 'industriel-etude'));
assert.equal(packages.some((item) => /fondateur|pass/i.test(`${item.key} ${item.label}`)), false);

const missingCategory = quoteStudio.preview(store, { clientName:'Client Test', email:'test@example.com', brand:'Objet', model:'À qualifier', finalPrice:500 }, user);
assert.equal(missingCategory.canCreate, false);
assert.ok(missingCategory.data.missingFields.includes('nature de la demande'));
assert.match(missingCategory.data.warnings.join(' '), /De quoi s’agit-il/i);

const exact = quoteStudio.inferPackage(1500, 'voiture particulier pack integral');
assert.equal(exact.status, 'exact');
assert.equal(exact.selected.key, 'voiture-particulier-integral');
const approximate = quoteStudio.inferPackage(1480, 'voiture particulier');
assert.equal(approximate.status, 'approximate');
assert.equal(approximate.selected.key, 'voiture-particulier-integral');
const custom = quoteStudio.inferPackage(3800, 'prestation spéciale camion');
assert.equal(custom.status, 'custom');

const existingClient = store.create('clients', { name:'Jean Dupont', email:'jean@example.com', mobile:'0612345678' });
store.create('vehicles', { clientId:existingClient.id, requestCategory:'voiture', vehicleType:'voiture', brand:'Ford', model:'Mustang', registration:'AA-111-AA', year:2020, color:'Bleu' });
store.create('vehicles', { clientId:existingClient.id, requestCategory:'voiture', vehicleType:'voiture', brand:'Mazda', model:'MX-5', registration:'BB-222-BB', year:2018, color:'Rouge' });
assert.equal(quoteStudio.lookup(store,'Jean Dupont').records[0].vehicles.length,2);

const otherClient = store.create('clients', { name:'Marie Martin', email:'marie@example.com' });
store.create('vehicles', { clientId:otherClient.id, requestCategory:'voiture', vehicleType:'voiture', brand:'Audi', model:'S5', registration:'CC-333-CC' });
const conflictPreview = quoteStudio.preview(store, {
  clientId:existingClient.id, clientName:existingClient.name, email:existingClient.email,
  registration:'CC-333-CC', requestCategory:'voiture', vehicleType:'voiture', brand:'Audi', model:'S5', tariffKey:'voiture-particulier-integral'
}, user);
assert.equal(conflictPreview.data.ownerConflict,true);
assert.equal(conflictPreview.canCreate,false);

const countsBeforePreview = { clients:db.clients.length, vehicles:db.vehicles.length, quotes:db.quotes.length };
const highValuePreview = quoteStudio.preview(store, {
  clientName:'Paul Martin', email:'paul@example.com', requestCategory:'voiture', vehicleType:'voiture', customerType:'particulier',
  brand:'Porsche', model:'911 GT3 RS', registration:'DD-444-DD', year:2022, color:'Grise',
  tariffKey:'voiture-particulier-integral', currentConditionValue:180000, currentValueSource:'Saisie interne à confirmer', clientEstimatedValue:190000
}, user);
assert.deepEqual({ clients:db.clients.length, vehicles:db.vehicles.length, quotes:db.quotes.length },countsBeforePreview);
assert.equal(highValuePreview.data.valuation.isHighValue,true);
assert.equal(highValuePreview.data.valuation.isRareVehicle,true);
assert.equal(highValuePreview.data.schedule.blocked,true);
assert.match(highValuePreview.quoteText,/Date à déterminer/i);
assert.match(highValuePreview.quoteText,/Procédure atelier voiture/i);
assert.throws(() => quoteStudio.confirm(store,{ ...highValuePreview.data, humanConfirmed:false, priceConfirmed:true },user),/HUMAN_CONFIRMATION_REQUIRED/);

const created = quoteStudio.confirm(store, {
  clientName:'Paul Martin', email:'paul@example.com', requestCategory:'voiture', vehicleType:'voiture', customerType:'particulier',
  brand:'Porsche', model:'911 GT3 RS', registration:'DD-444-DD', year:2022, color:'Grise',
  tariffKey:'voiture-particulier-integral', currentConditionValue:180000, currentValueSource:'Saisie interne à confirmer', clientEstimatedValue:190000,
  humanConfirmed:true, priceConfirmed:true
}, user);
assert.equal(created.quote.totalTtc,1500);
assert.equal(created.quote.depositTtc,750);
assert.equal(created.quote.tariffKey,'voiture-particulier-integral');
assert.equal(created.quote.requestCategory,'voiture');
assert.equal(created.quote.expertReviewRequired,true);
assert.equal(created.quote.planningStatus,'Bloqué avant expertise');
assert.ok(created.quote.quoteText.includes('ÉVALUATIONS DU VÉHICULE'));
assert.ok(created.visualUrl.startsWith('/generated/quotes/'));
const visualPath = path.join(__dirname,'..','public',decodeURIComponent(created.visualUrl).replace(/^\//,''));
assert.ok(fs.existsSync(visualPath));
assert.match(fs.readFileSync(visualPath,'utf8'),/ESTIMATIONS DU VÉHICULE/);
assert.ok(db.tasks.some((task) => /expert/i.test(task.title)));
assert.ok(db.communications.some((communication) => communication.quoteId === created.quote.id && /Brouillon bloqué/i.test(communication.status)));

assert.throws(() => planning.scheduleQuote(store,{ quoteId:created.quote.id, startDate:'2026-09-07', endDate:'2026-09-08' },user),/EXPERT_REVIEW_REQUIRED/);
const approved = quoteStudio.approveExpert(store,created.quote.id,{ expertName:'Expert Test', expertCurrentValue:175000, expertPostTreatmentValue:182000 },user);
assert.equal(approved.quote.expertReviewStatus,'Approuvée');
assert.ok(approved.quote.estimatedStartDate);

const proposalOverview = planning.overview(store,{ from:approved.quote.inspectionDate, days:30 });
assert.ok(proposalOverview.unscheduledQuotes.some((quote) => quote.id === created.quote.id));
assert.equal(proposalOverview.weekendsHidden,true);
assert.equal(proposalOverview.workshopDates.every((date) => ![0,6].includes(new Date(`${date}T12:00:00`).getDay())),true);

const scheduled = planning.scheduleQuote(store,{ quoteId:created.quote.id, inspectionDate:approved.quote.inspectionDate, inspectionTime:approved.quote.inspectionTime, startDate:approved.quote.estimatedStartDate, endDate:approved.quote.estimatedEndDate, deliveryDate:approved.quote.estimatedDeliveryDate, confirmed:true },user);
assert.equal(scheduled.quote.planningStatus,'Confirmé en interne');

const block = planning.createBlock(store,{ title:'Maintenance compresseur', startDate:'2026-10-05', endDate:'2026-10-06' },user);
assert.equal(block.status,'Active');
const overview = planning.overview(store,{ from:'2026-09-01', days:60 });
assert.ok(overview.events.some((event) => event.blockId === block.id));
assert.equal(overview.capacity >= 1,true);

assert.throws(() => quoteStudio.applyReprice(store,created.quote.id,{ confirmed:true, finalPrice:1200, specialOfferEnabled:true },employee),/REPRICE_DIRECTION_REQUIRED/);
const reprice = quoteStudio.applyReprice(store,created.quote.id,{
  tariffKey:'voiture-particulier-integral', standardPriceTtc:1500, finalPrice:1200,
  specialOfferEnabled:true, specialOfferName:'Club partenaire choisi par la direction', directCostTtc:650, targetMarginPercent:30,
  confirmed:true, tariffReason:'Remise commerciale accordée par la direction'
},user);
assert.equal(reprice.quote.totalTtc,1200);
assert.equal(reprice.quote.depositTtc,600);
assert.equal(reprice.quote.tariffKey,'voiture-particulier-integral');
assert.equal(reprice.quote.specialOfferEnabled,true);
assert.equal(reprice.quote.discountAmountTtc,300);
assert.ok(reprice.quote.grossMarginPercent > 0);
assert.ok(Array.isArray(reprice.quote.auditTrail));

const motoPreview = quoteStudio.preview(store, {
  clientName:'Claire Moto', email:'claire@example.com', requestCategory:'moto', vehicleType:'moto', customerType:'particulier',
  brand:'Ducati', model:'Monster', registration:'EE-555-EE', tariffKey:'moto-particulier', finalPrice:900,
  service:'Cryonettoyage moto', humanConfirmed:false
}, user);
assert.equal(motoPreview.data.vehicle.vehicleType,'moto');
assert.match(motoPreview.quoteText,/Procédure atelier moto/i);
assert.doesNotMatch(motoPreview.quoteText,/quatre points de levage/i);

const aircraftPreview = quoteStudio.preview(store, {
  clientName:'Exploitant Test', email:'ops@example.com', requestCategory:'avion', vehicleType:'avion', customerType:'professionnel',
  brand:'Cessna', model:'172', registration:'F-TEST', tariffKey:'avion-etude', finalPrice:2500, service:'Étude de nettoyage aéronautique'
}, user);
assert.equal(aircraftPreview.data.requestCategory,'avion');
assert.match(aircraftPreview.quoteText,/autorisations aéronautiques/i);
assert.equal(aircraftPreview.requiresDirectionApproval,true);

console.log('Quote studio and planning smoke test passed.');
