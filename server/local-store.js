'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gcos-local.json');

const EMPTY_DB = {
  clients: [],
  vehicles: [],
  interventions: [],
  events: []
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...EMPTY_DB, ...parsed };
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

function list(collection) {
  const db = readStore();
  if (!Array.isArray(db[collection])) throw Object.assign(new Error('GCOS_COLLECTION_NOT_FOUND'), { status: 404 });
  return db[collection];
}

function create(collection, input) {
  const db = readStore();
  if (!Array.isArray(db[collection])) throw Object.assign(new Error('GCOS_COLLECTION_NOT_FOUND'), { status: 404 });
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now
  };
  db[collection].unshift(record);
  db.events.unshift({
    id: crypto.randomUUID(),
    type: `${collection}.created`,
    recordId: record.id,
    createdAt: now
  });
  writeStore(db);
  return record;
}

function update(collection, id, input) {
  const db = readStore();
  if (!Array.isArray(db[collection])) throw Object.assign(new Error('GCOS_COLLECTION_NOT_FOUND'), { status: 404 });
  const index = db[collection].findIndex((item) => item.id === id);
  if (index < 0) throw Object.assign(new Error('GCOS_RECORD_NOT_FOUND'), { status: 404 });
  const now = new Date().toISOString();
  db[collection][index] = { ...db[collection][index], ...input, id, updatedAt: now };
  db.events.unshift({
    id: crypto.randomUUID(),
    type: `${collection}.updated`,
    recordId: id,
    createdAt: now
  });
  writeStore(db);
  return db[collection][index];
}

function summary() {
  const db = readStore();
  return {
    clients: db.clients.length,
    vehicles: db.vehicles.length,
    interventions: db.interventions.length,
    openInterventions: db.interventions.filter((item) => !['Terminée', 'Annulée'].includes(item.status)).length,
    recentEvents: db.events.slice(0, 10)
  };
}

module.exports = { list, create, update, summary, DATA_FILE };
