'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gcos-local.json');
const EMPTY_DB = {
  clients: [], vehicles: [], interventions: [], observations: [], communications: [],
  tasks: [], stockItems: [], quotes: [], documents: [], photos: [], planningBlocks: [],
  workSessions: [], leaveRequests: [], events: []
};
const DEFAULT_CHECKLIST = {
  receptionPhotos: false, mileageRecorded: false, clientApproval: false,
  beforePhotos: false, afterPhotos: false, finalControl: false,
  reportGenerated: false, clientSignature: false
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Object.fromEntries(Object.entries(EMPTY_DB).map(([key, value]) => [key, Array.isArray(parsed[key]) ? parsed[key] : value]));
  } catch (error) {
    const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
    fs.copyFileSync(DATA_FILE, backup);
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
    throw Object.assign(new Error('GCOS_LOCAL_STORE_CORRUPT'), { cause: error, status: 500 });
  }
}

function writeStore(db) {
  ensureStore();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

function assertCollection(db, collection) {
  if (!Array.isArray(db[collection])) throw Object.assign(new Error('GCOS_COLLECTION_NOT_FOUND'), { status: 404 });
}

function nextNumber(items, prefix, width = 4) {
  const highest = items.reduce((max, item) => {
    if (!String(item.number || '').startsWith(prefix)) return max;
    const value = Number(String(item.number).slice(prefix.length));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

function normalize(collection, input = {}, current = {}) {
  const clean = { ...input };
  if (collection === 'clients') {
    clean.name = String(input.name ?? current.name ?? '').trim();
    clean.mobile = String(input.mobile ?? input.phone ?? current.mobile ?? '').trim();
    clean.phone = clean.mobile;
    clean.email = String(input.email ?? current.email ?? '').trim().toLowerCase();
    clean.address = String(input.address ?? current.address ?? '').trim();
    clean.preferredChannel = input.preferredChannel ?? current.preferredChannel ?? 'SMS';
    clean.smsAllowed = input.smsAllowed === undefined ? Boolean(current.smsAllowed) : input.smsAllowed === true || input.smsAllowed === 'on';
    clean.emailAllowed = input.emailAllowed === undefined ? Boolean(current.emailAllowed) : input.emailAllowed === true || input.emailAllowed === 'on';
  }
  if (collection === 'vehicles') {
    if (!(input.clientId ?? current.clientId)) throw Object.assign(new Error('CLIENT_REQUIRED'), { status: 400 });
    clean.registration = String(input.registration ?? current.registration ?? '').trim().toUpperCase();
    clean.vin = String(input.vin ?? current.vin ?? '').trim().toUpperCase();
    clean.mileage = Number(input.mileage ?? current.mileage ?? 0) || 0;
  }
  if (collection === 'interventions') {
    if (!(input.vehicleId ?? current.vehicleId)) throw Object.assign(new Error('VEHICLE_REQUIRED'), { status: 400 });
    clean.status = input.status ?? current.status ?? 'Prévue';
    clean.workStatus = input.workStatus ?? current.workStatus ?? '';
    clean.technician = String(input.technician ?? current.technician ?? '').trim();
    clean.arrivalTime = String(input.arrivalTime ?? current.arrivalTime ?? '').trim();
    clean.departureTime = String(input.departureTime ?? current.departureTime ?? '').trim();
    clean.mileage = Number(input.mileage ?? current.mileage ?? 0) || 0;
    clean.checklist = { ...DEFAULT_CHECKLIST, ...(current.checklist || {}), ...(input.checklist || {}) };
    clean.workstationReleased = input.workstationReleased === undefined ? Boolean(current.workstationReleased) : input.workstationReleased === true || input.workstationReleased === 'on';
  }
  if (collection === 'observations') {
    if (!(input.interventionId ?? current.interventionId)) throw Object.assign(new Error('INTERVENTION_REQUIRED'), { status: 400 });
    clean.severity = input.severity ?? current.severity ?? 'À surveiller';
    clean.clientNotified = input.clientNotified === true || input.clientNotified === 'on';
    clean.decision = input.decision ?? current.decision ?? 'En attente';
    clean.photoUrl = String(input.photoUrl ?? current.photoUrl ?? '').trim();
  }
  if (collection === 'communications') {
    if (!(input.clientId ?? current.clientId)) throw Object.assign(new Error('CLIENT_REQUIRED'), { status: 400 });
    clean.channel = input.channel ?? current.channel ?? 'SMS';
    clean.status = input.status ?? current.status ?? 'Brouillon';
    clean.message = String(input.message ?? current.message ?? '').trim();
    clean.attachmentUrl = String(input.attachmentUrl ?? current.attachmentUrl ?? '').trim();
  }
  if (collection === 'tasks') {
    clean.title = String(input.title ?? current.title ?? '').trim();
    clean.status = input.status ?? current.status ?? 'À faire';
    clean.workStatus = input.workStatus ?? current.workStatus ?? '';
    clean.priority = input.priority ?? current.priority ?? 'Normale';
    clean.dueDate = String(input.dueDate ?? current.dueDate ?? '').trim();
    clean.assignee = String(input.assignee ?? current.assignee ?? '').trim();
    clean.workstationReleased = input.workstationReleased === undefined ? Boolean(current.workstationReleased) : input.workstationReleased === true || input.workstationReleased === 'on';
  }
  if (collection === 'stockItems') {
    clean.name = String(input.name ?? current.name ?? '').trim();
    clean.quantity = Number(input.quantity ?? current.quantity ?? 0) || 0;
    clean.capacity = Number(input.capacity ?? current.capacity ?? 0) || 0;
    clean.alertThreshold = Number(input.alertThreshold ?? current.alertThreshold ?? 0) || 0;
    clean.unit = String(input.unit ?? current.unit ?? '').trim();
  }
  if (collection === 'quotes') {
    if (!(input.clientId ?? current.clientId)) throw Object.assign(new Error('CLIENT_REQUIRED'), { status: 400 });
    clean.status = input.status ?? current.status ?? 'Brouillon';
    clean.totalTtc = Number(input.totalTtc ?? current.totalTtc ?? 0) || 0;
    clean.validUntil = String(input.validUntil ?? current.validUntil ?? '').trim();
  }
  if (collection === 'documents' || collection === 'photos') {
    clean.title = String(input.title ?? current.title ?? '').trim();
    clean.url = String(input.url ?? current.url ?? '').trim();
    clean.category = String(input.category ?? current.category ?? '').trim();
  }
  if (collection === 'planningBlocks') {
    clean.title = String(input.title ?? current.title ?? '').trim();
    clean.type = String(input.type ?? current.type ?? 'Indisponibilité').trim();
    clean.startDate = String(input.startDate ?? current.startDate ?? '').trim();
    clean.endDate = String(input.endDate ?? current.endDate ?? clean.startDate).trim();
    clean.startTime = String(input.startTime ?? current.startTime ?? '08:30').trim();
    clean.endTime = String(input.endTime ?? current.endTime ?? '17:00').trim();
    clean.status = String(input.status ?? current.status ?? 'Active').trim();
    clean.blocksWorkshop = input.blocksWorkshop === undefined ? Boolean(current.blocksWorkshop) : input.blocksWorkshop === true || input.blocksWorkshop === 'on';
  }
  if (collection === 'workSessions') {
    clean.employeeId = String(input.employeeId ?? current.employeeId ?? '').trim();
    clean.employeeName = String(input.employeeName ?? current.employeeName ?? '').trim();
    clean.targetType = String(input.targetType ?? current.targetType ?? '').trim();
    clean.targetId = String(input.targetId ?? current.targetId ?? '').trim();
    clean.targetLabel = String(input.targetLabel ?? current.targetLabel ?? '').trim();
    clean.action = String(input.action ?? current.action ?? '').trim();
    clean.reason = String(input.reason ?? current.reason ?? '').trim();
    clean.happenedAt = String(input.happenedAt ?? current.happenedAt ?? new Date().toISOString()).trim();
    clean.workstationReleased = input.workstationReleased === undefined ? Boolean(current.workstationReleased) : input.workstationReleased === true || input.workstationReleased === 'on';
  }
  if (collection === 'leaveRequests') {
    clean.employeeId = String(input.employeeId ?? current.employeeId ?? '').trim();
    clean.employeeName = String(input.employeeName ?? current.employeeName ?? '').trim();
    clean.startDate = String(input.startDate ?? current.startDate ?? '').trim();
    clean.endDate = String(input.endDate ?? current.endDate ?? clean.startDate).trim();
    clean.status = String(input.status ?? current.status ?? 'En attente de validation').trim();
    clean.principleStatus = String(input.principleStatus ?? current.principleStatus ?? '').trim();
    clean.principleScore = Number(input.principleScore ?? current.principleScore ?? 0) || 0;
    clean.workdays = Number(input.workdays ?? current.workdays ?? 0) || 0;
  }
  return clean;
}

function list(collection) {
  const db = readStore();
  assertCollection(db, collection);
  return db[collection];
}

function create(collection, input) {
  const db = readStore();
  assertCollection(db, collection);
  const now = new Date().toISOString();
  const normalized = normalize(collection, input);
  const year = new Date().getFullYear();
  if (collection === 'interventions') normalized.number = nextNumber(db.interventions, `GC-${year}-`);
  if (collection === 'quotes') normalized.number = nextNumber(db.quotes, `DEV-${year}-`);
  if (collection === 'leaveRequests') normalized.number = nextNumber(db.leaveRequests, `CONGE-${year}-`);
  const record = { id: crypto.randomUUID(), ...normalized, createdAt: now, updatedAt: now };
  db[collection].unshift(record);
  db.events.unshift({ id: crypto.randomUUID(), type: `${collection}.created`, recordId: record.id, interventionId: collection === 'interventions' ? record.id : record.interventionId || '', createdAt: now });
  writeStore(db);
  return record;
}

function update(collection, id, input) {
  const db = readStore();
  assertCollection(db, collection);
  const index = db[collection].findIndex((item) => item.id === id);
  if (index < 0) throw Object.assign(new Error('GCOS_RECORD_NOT_FOUND'), { status: 404 });
  const now = new Date().toISOString();
  const current = db[collection][index];
  db[collection][index] = { ...current, ...normalize(collection, input, current), id, updatedAt: now };
  db.events.unshift({ id: crypto.randomUUID(), type: `${collection}.updated`, recordId: id, interventionId: collection === 'interventions' ? id : db[collection][index].interventionId || '', createdAt: now });
  writeStore(db);
  return db[collection][index];
}

function remove(collection, id) {
  const db = readStore();
  assertCollection(db, collection);
  const index = db[collection].findIndex((item) => item.id === id);
  if (index < 0) throw Object.assign(new Error('GCOS_RECORD_NOT_FOUND'), { status: 404 });
  const [record] = db[collection].splice(index, 1);
  db.events.unshift({ id: crypto.randomUUID(), type: `${collection}.deleted`, recordId: id, createdAt: new Date().toISOString() });
  writeStore(db);
  return record;
}

function summary() {
  const db = readStore();
  const today = new Date().toISOString().slice(0, 10);
  return {
    clients: db.clients.length, vehicles: db.vehicles.length, interventions: db.interventions.length,
    observations: db.observations.length, communications: db.communications.length,
    tasks: db.tasks.length, quotes: db.quotes.length, documents: db.documents.length,
    planningBlocks: db.planningBlocks.length, workSessions: db.workSessions.length,
    pendingLeaveRequests: db.leaveRequests.filter((item) => item.status === 'En attente de validation').length,
    openInterventions: db.interventions.filter((item) => !['Terminée', 'Livrée', 'Annulée'].includes(item.status)).length,
    pausedInterventions: db.interventions.filter((item) => item.workStatus === 'En attente').length,
    todayInterventions: db.interventions.filter((item) => item.scheduledDate === today).length,
    pendingTasks: db.tasks.filter((item) => item.status !== 'Terminée').length,
    pendingQuotes: db.quotes.filter((item) => ['Brouillon', 'Envoyé', 'À relancer', 'À valider', 'Expertise à décider'].includes(item.status)).length,
    lowStock: db.stockItems.filter((item) => item.alertThreshold > 0 && item.quantity <= item.alertThreshold),
    pendingObservations: db.observations.filter((item) => item.decision === 'En attente').length,
    recentEvents: db.events.slice(0, 30)
  };
}

module.exports = { list, create, update, remove, summary, DATA_FILE };
