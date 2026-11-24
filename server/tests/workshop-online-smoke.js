'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const workshop = require('../workshop-service');
const procedures = require('../workshop-procedures');

function memoryStore(seed = {}) {
  const db = { clients: [], vehicles: [], quotes: [], interventions: [], tasks: [], photos: [], workSessions: [], ...seed };
  return {
    list(collection) { if (!db[collection]) db[collection] = []; return db[collection]; },
    create(collection, input) {
      if (!db[collection]) db[collection] = [];
      const record = { id: crypto.randomUUID(), number: input.number || (collection === 'interventions' ? `GC-2026-${String(db[collection].length + 1).padStart(4, '0')}` : ''), ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db[collection].unshift(record);
      return record;
    },
    update(collection, id, patch) {
      const index = db[collection].findIndex((item) => item.id === id);
      if (index < 0) throw new Error('NOT_FOUND');
      db[collection][index] = { ...db[collection][index], ...patch, updatedAt: new Date().toISOString() };
      return db[collection][index];
    }
  };
}

const admin = { id: 'admin-1', name: 'David Bourasseau', role: 'admin' };
const employee = { id: 'emp-1', name: 'Technicien Atelier', role: 'employee' };
const client = { id: 'c1', name: 'Client Moto' };
const vehicle = { id: 'v1', clientId: 'c1', brand: 'Ducati', model: 'Monster', vehicleType: 'moto', requestCategory: 'moto', registration: 'AA-123-BB' };
const procedure = procedures.snapshot('moto');
const quote = {
  id: 'q1', number: 'DEV-2026-0001', clientId: 'c1', vehicleId: 'v1', status: 'Accepté', workflowStatus: 'Acompte 50 % en attente', paymentStatus: 'Acompte en attente',
  service: 'Cryonettoyage moto', requestCategory: 'moto', workshopProcedure: procedure, workshopProcedureKey: procedure.key,
  estimatedStartDate: '2026-07-20', estimatedEndDate: '2026-07-20', estimatedDeliveryDate: '2026-07-21'
};
const store = memoryStore({ clients: [client], vehicles: [vehicle], quotes: [quote] });

const prepared = workshop.prepareAcceptedQuote(store, quote, admin);
assert.equal(prepared.intervention.workshopLocked, true);
assert.equal(prepared.intervention.workshopProcedureKey, 'moto-standard-v1');
assert.ok(prepared.intervention.procedureSteps.length >= 10);
assert.match(prepared.intervention.procedureSteps[3].label, /moto|plateforme|béquille|lève-moto/i);

const unlocked = workshop.unlockAfterDeposit(store, store.list('quotes')[0], admin);
assert.equal(unlocked.intervention.workshopLocked, false);
assert.equal(unlocked.intervention.status, 'Planifiée');

workshop.assign(store, unlocked.intervention.id, { technician: employee.name, technicianId: employee.id }, admin);
assert.throws(() => workshop.validateStart(store, unlocked.intervention.id, employee), /WORKSHOP_RECEPTION_INCOMPLETE/);

let current = workshop.detail(store, unlocked.intervention.id, employee);
for (const step of current.procedureSteps.slice(0, 3)) workshop.updateStep(store, current.id, step.id, { complete: true, note: 'Contrôlé' }, employee);
assert.equal(workshop.validateStart(store, current.id, employee).canStart, true);

const started = workshop.workAction(store, current.id, { action: 'start' }, employee);
assert.equal(started.item.status, 'En cours');

current = workshop.detail(store, current.id, employee);
for (const step of current.procedureSteps.filter((item) => item.status !== 'Terminée')) workshop.updateStep(store, current.id, step.id, { complete: true, note: 'Étape réalisée' }, employee);
const requested = workshop.requestFinalValidation(store, current.id, { finalNotes: 'Procédure complète.' }, employee);
assert.equal(requested.procedureStatus, 'Contrôle final à valider');
assert.throws(() => workshop.assertCompletable(store, current.id, employee), /WORKSHOP_DIRECTION_VALIDATION_REQUIRED/);

const approved = workshop.approveFinal(store, current.id, { note: 'Contrôle direction conforme.' }, admin);
assert.equal(approved.procedureStatus, 'Validée par la direction');
assert.equal(workshop.assertCompletable(store, current.id, admin).id, current.id);

const overview = workshop.overview(store, admin);
assert.equal(overview.records.length, 1);
assert.equal(overview.records[0].progress.percent, 100);
console.log('Workshop online procedure smoke test passed.');
