'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

class MemoryStore {
  constructor(seed = {}) {
    this.db = {
      clients: [], vehicles: [], quotes: [], quoteRequests: [], interventions: [], communications: [], tasks: [], documents: [], photos: [], planningBlocks: [], stockItems: [], leaveRequests: [], externalCalendarEvents: [],
      ...seed
    };
  }
  list(collection) { return this.db[collection] || []; }
  create(collection, input) {
    const record = { id: crypto.randomUUID(), number: input.number || `${collection.toUpperCase()}-${this.list(collection).length + 1}`, ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (!this.db[collection]) this.db[collection] = [];
    this.db[collection].unshift(record);
    return record;
  }
  update(collection, id, patch) {
    const index = this.list(collection).findIndex((record) => record.id === id || record.number === id);
    if (index < 0) throw new Error(`NOT_FOUND_${collection}`);
    this.db[collection][index] = { ...this.db[collection][index], ...patch, updatedAt: new Date().toISOString() };
    return this.db[collection][index];
  }
}

const runtime = require('../feature-runtime-028');
const photoIntake = require('../quote-photo-intake');
const workshopDay = require('../workshop-day-plan');
const mode = process.argv[2] || 'all';
const run = (...names) => mode === 'all' || names.includes(mode);
const admin = { id: 'admin-1', name: 'David Test', role: 'admin' };

function addWorkdays(days) {
  const date = new Date();
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (![0, 6].includes(date.getDay())) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
function industrialAnalysis() {
  return photoIntake.analyze(new MemoryStore(), {
    requestCategory: 'industriel',
    photos: [
      { name: 'machine.png', dataUrl: png, role: 'Vue générale', detectedText: 'PRESSE INDUSTRIELLE' },
      { name: 'graisse.png', dataUrl: png, role: 'Zone sale' }
    ]
  }, admin);
}
function prepared() {
  return runtime.preparedQuoteInput({
    requestCategory: 'industriel', industrialMachineFunction: 'Presse hydraulique', finalPrice: 1000,
    deliveryRequired: true, deliveryTrips: 2, photoUrls: ['/a.png', '/b.png'], photoAnalysisConfirmed: true
  });
}

if (run('industrial', 'industrial-analyze')) {
  const result = industrialAnalysis();
  assert.equal(result.analysis.category, 'industriel');
  assert.equal(result.photos.length, 2);
}
if (run('industrial', 'industrial-questions')) {
  const result = industrialAnalysis();
  assert.ok(result.questions.some((item) => item.key === 'industrialConsignation'));
  assert.ok(result.questions.some((item) => item.key === 'industrialProductionConstraints'));
  assert.ok(!result.questions.some((item) => /immatriculation/i.test(item.label)));
  assert.match(result.analysis.limitations, /ne prétend pas reconnaître/i);
}
if (run('industrial', 'industrial-model')) assert.equal(prepared().model, 'Presse hydraulique');
if (run('industrial', 'industrial-rate')) {
  const result = prepared();
  assert.equal(result.deliveryRateHt, 85);
  assert.equal(result.deliveryAmountHt, 170);
}
if (run('industrial', 'industrial-total')) {
  const result = prepared();
  assert.ok(Math.abs(result.deliveryAmountTtc - 204) < 0.0001);
  assert.ok(Math.abs(result.finalPrice - 1204) < 0.0001);
  assert.equal(result.serviceBaseTtc, 1000);
}

if (run('vehicle-photo-preserve')) {
  runtime.installQuotePatches();
  const quoteRequests = require('../quote-requests');
  const originalPhotoUrls = ['/generated/photos/existing-general.jpg', '/generated/photos/existing-detail.jpg'];
  const originalAnalysis = { source: 'existing dossier', confirmed: true };
  const store = new MemoryStore({
    clients: [{ id: 'client-existing', name: 'Client existant', email: 'client@example.com' }],
    vehicles: [{
      id: 'vehicle-existing', clientId: 'client-existing', brand: 'Ford', model: 'Mustang', registration: 'AA-123-BB',
      photoUrl: originalPhotoUrls[0], photoUrls: [...originalPhotoUrls], photoAnalysis: { ...originalAnalysis }
    }]
  });
  quoteRequests.saveDraft(store, {
    clientId: 'client-existing', vehicleId: 'vehicle-existing', requestCategory: 'voiture',
    service: 'Mise à jour administrative du brouillon', clientName: 'Client existant'
  }, admin);
  const vehicle = store.list('vehicles').find((item) => item.id === 'vehicle-existing');
  assert.deepEqual(vehicle.photoUrls, originalPhotoUrls, 'an empty draft save must preserve existing photo URLs');
  assert.deepEqual(vehicle.photoAnalysis, originalAnalysis, 'an empty draft save must preserve existing photo analysis');
  assert.equal(vehicle.photoUrl, originalPhotoUrls[0]);
}

if (run('delivery')) {
  const store = new MemoryStore();
  const quote = store.create('quotes', {
    number: 'DEV-TEST', deliveryRequired: true, deliveryTrips: 2, deliveryDestination: 'Bayonne',
    proposedDropoffDate: addWorkdays(3), estimatedStartDate: addWorkdays(4), estimatedDeliveryDate: addWorkdays(6)
  });
  const blocks = runtime.createDeliveryBlocks(store, quote, admin);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((item) => item.assignedUserName === 'Séverine' && item.resource === 'Camion' && item.startTime === '08:30' && item.endTime === '09:30' && /En livraison/.test(item.title)));
}

if (run('stock')) {
  const quote = { id: 'q1', number: 'DEV-TEST', requestCategory: 'voiture', estimatedDryIceKg: 20 };
  const stocked = new MemoryStore({ quotes: [quote], stockItems: [{ id: 's', name: 'Glace carbonique', quantity: 50 }] });
  assert.equal(runtime.dryIceGate(stocked, quote, addWorkdays(4), admin).orderRequired, false);
  const lowStock = new MemoryStore({ quotes: [quote], stockItems: [{ id: 's', name: 'Glace carbonique', quantity: 0 }] });
  assert.equal(runtime.dryIceGate(lowStock, quote, addWorkdays(3), admin).orderRequired, true);
  assert.throws(() => runtime.dryIceGate(lowStock, quote, new Date().toISOString().slice(0, 10), admin), /DRY_ICE_STOCK_OR_ORDER_LEAD_REQUIRED/);
}

if (run('workshop')) {
  const today = new Date().toISOString().slice(0, 10);
  const store = new MemoryStore({
    planningBlocks: [{ id: 'd', title: 'Camion — En livraison', type: 'Livraison', startDate: today, endDate: today, startTime: '08:30', endTime: '09:30', status: 'Active', assignedUserName: 'Séverine', resource: 'Camion' }]
  });
  const plan = workshopDay.build(store, { employeeName: 'Séverine', date: today, now: `${today}T08:45:00` }, { id: 'a', name: 'Bénédicte', role: 'associate' });
  assert.equal(plan.summary.deliveries, 1);
  assert.equal(plan.current.phase, 'active');
  assert.match(plan.current.instruction, /livraison/i);
  assert.equal(plan.policy.workshopCalendarPriority, 'highest');
  assert.throws(() => workshopDay.build(store, { employeeName: 'Séverine' }, { id: 't', name: 'Autre', role: 'technician' }), /WORKSHOP_DAY_OTHER_EMPLOYEE_FORBIDDEN/);
}

console.log(`MAVIK 0.28 smoke mode ${mode} passed.`);
