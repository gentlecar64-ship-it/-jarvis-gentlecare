'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const auth = require('../auth');
const reputation = require('../reputation');
const employeeFlow = require('../employee-flow');
const leavePlanning = require('../leave-planning');
const planning = require('../planning-service');
const morale = require('../jarvis-morale');
const jarvis = require('../jarvis-extended');

function backup(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
function restore(file, content) { if (content) fs.writeFileSync(file, content); else { try { fs.unlinkSync(file); } catch {} } }
function addDays(value, amount) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }

const usersBackup = backup(auth.USERS_FILE);
const reputationBackup = backup(reputation.FILE);
const moraleBackup = backup(morale.STATE_FILE);

const today = new Date().toISOString().slice(0, 10);
const firstDate = addDays(today, 10);
const secondDate = addDays(today, 20);
const leaveStart = addDays(today, 60);
const leaveEnd = addDays(today, 64);

const db = {
  clients: [], vehicles: [], quotes: [], interventions: [], tasks: [], communications: [], documents: [], photos: [], observations: [], stockItems: [], planningBlocks: [], workSessions: [], leaveRequests: [], events: []
};
let interventionSequence = 0;
let leaveSequence = 0;
const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) {
    const record = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (collection === 'interventions') record.number = `GC-2026-${String(++interventionSequence).padStart(4, '0')}`;
    if (collection === 'leaveRequests') record.number = `CONGE-2026-${String(++leaveSequence).padStart(4, '0')}`;
    (db[collection] ||= []).unshift(record);
    return record;
  },
  update(collection, id, patch) {
    const index = db[collection].findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`NOT_FOUND:${collection}:${id}`);
    db[collection][index] = { ...db[collection][index], ...patch, id, updatedAt: new Date().toISOString() };
    return db[collection][index];
  }
};

const technician = { id: 'tech-1', name: 'Théo Martin', username: 'theo', role: 'technician', preferences: {} };
const manager = { id: 'admin-1', name: 'David Bourasseau', username: 'david', role: 'admin', preferences: {} };
const associate = { id: 'assoc-1', name: 'Bénédicte Lopez', username: 'benedicte', role: 'associate', preferences: {} };

try {
  fs.mkdirSync(require('node:path').dirname(auth.USERS_FILE), { recursive: true });
  fs.writeFileSync(auth.USERS_FILE, JSON.stringify([
    { ...manager, active: true },
    { ...associate, active: true },
    { ...technician, active: true }
  ], null, 2));
  fs.writeFileSync(reputation.FILE, JSON.stringify({ users: {}, clientRequests: [] }, null, 2));
  try { fs.unlinkSync(morale.STATE_FILE); } catch {}

  const client = store.create('clients', { name: 'Client Test' });
  const vehicleOne = store.create('vehicles', { clientId: client.id, brand: 'Ford', model: 'Mustang', registration: 'AA-111-AA' });
  const vehicleTwo = store.create('vehicles', { clientId: client.id, brand: 'Mazda', model: 'MX-5', registration: 'BB-222-BB' });
  const first = store.create('interventions', { clientId: client.id, vehicleId: vehicleOne.id, service: 'Cryo Mustang', technicianId: technician.id, technician: technician.name, scheduledDate: firstDate, estimatedStartDate: firstDate, estimatedEndDate: addDays(firstDate, 1), status: 'Prévue' });
  const second = store.create('interventions', { clientId: client.id, vehicleId: vehicleTwo.id, service: 'Cryo Mazda', technicianId: technician.id, technician: technician.name, scheduledDate: secondDate, estimatedStartDate: secondDate, estimatedEndDate: addDays(secondDate, 1), status: 'Prévue' });
  const task = store.create('tasks', { title: 'Préparer la zone Dinitrol', assigneeId: technician.id, assignee: technician.name, dueDate: addDays(today, 25), status: 'À faire' });
  const foreignTask = store.create('tasks', { title: 'Tâche d’un autre salarié', assigneeId: 'other', assignee: 'Autre personne', dueDate: addDays(today, 25), status: 'À faire' });

  const initialQueue = employeeFlow.queue(store, technician);
  assert.equal(initialQueue.interventions.length, 2);
  assert.equal(initialQueue.tasks.length, 1);
  assert.equal(initialQueue.policy.earlyStartAllowed, true);
  assert.equal(initialQueue.policy.employeeDelayAllowed, false);

  const startedFirst = employeeFlow.act(store, { targetType: 'intervention', targetId: first.id, action: 'start' }, technician);
  assert.equal(startedFirst.item.workStatus, 'En cours');
  assert.equal(startedFirst.item.startedAheadOfSchedule, true);
  assert.equal(startedFirst.item.promisedDatesPreserved, true);

  const switchedVehicle = employeeFlow.act(store, { targetType: 'intervention', targetId: second.id, action: 'start' }, technician);
  assert.equal(switchedVehicle.item.workStatus, 'En cours');
  assert.equal(switchedVehicle.paused.length, 1);
  assert.equal(db.interventions.find((item) => item.id === first.id).workStatus, 'En attente');
  assert.equal(db.interventions.find((item) => item.id === first.id).workstationReleased, true);

  const switchedToTask = employeeFlow.act(store, { targetType: 'task', targetId: task.id, action: 'start' }, technician);
  assert.equal(switchedToTask.item.workStatus, 'En cours');
  assert.ok(switchedToTask.paused.some((item) => item.id === second.id));
  assert.equal(db.interventions.find((item) => item.id === second.id).workStatus, 'En attente');
  assert.equal(planning.detectConflicts(store, { startDate: secondDate, endDate: secondDate }).length, 0);

  const resumed = employeeFlow.act(store, { targetType: 'intervention', targetId: second.id, action: 'resume' }, technician);
  assert.equal(resumed.item.workStatus, 'En cours');
  assert.equal(db.tasks.find((item) => item.id === task.id).workStatus, 'En attente');
  assert.throws(() => employeeFlow.act(store, { targetType: 'task', targetId: foreignTask.id, action: 'start' }, technician), /WORK_ITEM_NOT_ASSIGNED_TO_USER/);
  assert.ok(db.workSessions.length >= 5);

  const advice = leavePlanning.advice(store, { startDate: leaveStart, endDate: leaveEnd }, technician);
  assert.match(advice.principleStatus, /Accord de principe/);
  assert.equal(advice.finalValidationRequired, true);
  assert.equal(advice.metrics.assignedInterventions, 0);

  const submitted = leavePlanning.submit(store, { startDate: leaveStart, endDate: leaveEnd, reason: 'Repos planifié' }, technician);
  assert.equal(submitted.request.status, 'En attente de validation');
  assert.throws(() => leavePlanning.decide(store, submitted.request.id, { approved: true }, technician), /LEAVE_MANAGER_VALIDATION_REQUIRED/);
  const approved = leavePlanning.decide(store, submitted.request.id, { approved: true, comment: 'Couverture atelier suffisante' }, manager);
  assert.equal(approved.request.status, 'Approuvé');
  assert.equal(approved.block.type, 'Congé');
  assert.equal(approved.block.blocksWorkshop, false);
  assert.throws(() => leavePlanning.decide(store, submitted.request.id, { approved: true }, manager), /LEAVE_REQUEST_ALREADY_DECIDED/);

  const leaveOverview = planning.overview(store, { from: leaveStart, days: 10 });
  const leaveEvents = leaveOverview.events.filter((event) => event.type === 'Congé');
  assert.equal(leaveEvents.length, 1);
  assert.equal(leaveEvents[0].assignee, technician.name);

  reputation.saveUserSettings(technician, { humourEnabled: true, encouragementEnabled: true, humourLevel: 'high', humourStyle: 'workshop' });
  const encouragement = morale.pick(technician, { force: true });
  assert.ok(encouragement?.message);
  assert.match(encouragement.message, /Théo/);
  assert.equal(morale.pick(technician, { force: true, sensitive: true }), null);

  const delayed = jarvis.execute(store, { text: 'Il y a du retard, prolonge le délai de 2 jours', user: technician });
  assert.equal(delayed.type, 'employee-delay-blocked');
  assert.match(delayed.answer, /David|Bénédicte|dates client/i);

  const leaveQuestion = jarvis.execute(store, { text: `Puis-je poser des congés du ${addDays(today, 70)} au ${addDays(today, 74)} ?`, user: technician });
  assert.equal(leaveQuestion.type, 'leave-principle-advice');
  assert.match(leaveQuestion.answer, /accord de principe/i);

  console.log('Employee flow, leave planning and Jarvis morale smoke test passed.');
} finally {
  restore(auth.USERS_FILE, usersBackup);
  restore(reputation.FILE, reputationBackup);
  restore(morale.STATE_FILE, moraleBackup);
}
