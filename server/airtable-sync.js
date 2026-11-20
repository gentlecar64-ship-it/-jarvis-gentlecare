'use strict';

const { URL } = require('node:url');

const API_ROOT = 'https://api.airtable.com/v0';
const META_ROOT = 'https://api.airtable.com/v0/meta';
const SYNC_ORDER = Object.freeze(['clients', 'vehicles', 'quotes', 'interventions', 'tasks', 'stockItems', 'documents']);

function baseId() { return process.env.AIRTABLE_BASE_ID || 'app6i45G4WG2nmQff'; }
function token() { return String(process.env.AIRTABLE_TOKEN || '').trim(); }
function configured() {
  const value = token();
  return /^pat[A-Za-z0-9._-]+$/.test(value) && !/VOTRE|EXEMPLE|CHANGEME/i.test(value);
}

const MAP = Object.freeze({
  clients: {
    table: 'Clients',
    fields: { name: 'Nom complet', email: 'Email', phone: 'Téléphone', notes: 'Notes client', status: 'Statut client', source: 'Origine du contact', clientType: 'Type de client' },
    naturalKeys: [['email'], ['phone'], ['name']]
  },
  vehicles: {
    table: 'Véhicules',
    fields: { label: 'Véhicule', brand: 'Marque', model: 'Modèle', year: 'Année', mileage: 'Kilométrage', registration: 'Immatriculation', vin: 'VIN', history: 'Historique / état' },
    links: { clientId: 'Client' },
    naturalKeys: [['vin'], ['registration'], ['label']]
  },
  quotes: {
    table: 'Dossiers et devis',
    fields: { number: 'Dossier', status: 'Statut', totalTtc: 'Montant TTC', requestDate: 'Date de demande', quoteDate: 'Date du devis', nextAction: 'Prochaine action', followUpDate: 'Échéance de suivi', notes: 'Notes' },
    links: { clientId: 'Client', vehicleId: 'Véhicule' },
    naturalKeys: [['number']]
  },
  interventions: {
    table: 'Interventions',
    fields: { number: 'Intervention', scheduledDate: 'Date prévue', status: 'Statut', technician: 'Technicien', report: 'Compte rendu', dryIceKg: 'Glace réelle utilisée kg', dinitrolLiters: 'Dinitrol utilisé L' },
    links: { clientId: 'Client', vehicleId: 'Véhicule', quoteId: 'Dossier / devis' },
    naturalKeys: [['number']]
  },
  tasks: {
    table: 'Tâches Jarvis',
    fields: { title: 'Tâche', status: 'Statut', priority: 'Priorité', assignee: 'Responsable', dueDate: 'Échéance', instructions: 'Instructions', result: 'Résultat / suivi' },
    naturalKeys: [['title', 'dueDate'], ['title']]
  },
  stockItems: {
    table: 'Stocks et consommables',
    fields: { name: 'Article', category: 'Catégorie', reference: 'Référence', quantity: 'Quantité en stock', unit: 'Unité', alertThreshold: 'Seuil d’alerte', unitPriceHt: 'Prix unitaire HT', location: 'Emplacement', notes: 'Notes' },
    naturalKeys: [['reference'], ['name']]
  },
  documents: {
    table: 'Centre documentaire',
    fields: { title: 'Document', category: 'Catégorie', subcategory: 'Sous-catégorie', summary: 'Résumé Jarvis', addedDate: 'Date d’ajout' },
    naturalKeys: [['title', 'addedDate'], ['title']]
  }
});

let lastHealth = { checkedAt: null, ok: null, detail: 'Connexion non testée', latencyMs: null };
let lastRun = { startedAt: null, completedAt: null, mode: null, ok: null, pulled: 0, pushed: 0, failed: 0 };

function assertConfigured() {
  if (!configured()) throw Object.assign(new Error('AIRTABLE_NOT_CONFIGURED'), { status: 503 });
}

async function fetchJson(url, options = {}) {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || `AIRTABLE_${response.status}`), { status: response.status });
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function request(table, options = {}) {
  const suffix = options.recordId ? `/${encodeURIComponent(options.recordId)}` : '';
  const url = new URL(`${API_ROOT}/${baseId()}/${encodeURIComponent(table)}${suffix}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return fetchJson(url, options);
}

async function requestSchema() {
  return fetchJson(new URL(`${META_ROOT}/bases/${baseId()}/tables`), { timeoutMs: 10000 });
}

async function testConnection() {
  const checkedAt = new Date().toISOString();
  if (!configured()) {
    lastHealth = { checkedAt, ok: false, detail: 'AIRTABLE_TOKEN réel absent', latencyMs: null, code: 'AIRTABLE_NOT_CONFIGURED' };
    return lastHealth;
  }
  const started = Date.now();
  try {
    const payload = await request(MAP.clients.table, { query: { maxRecords: 1 }, timeoutMs: 10000 });
    lastHealth = {
      checkedAt,
      ok: true,
      detail: `Base ${baseId()} accessible · table ${MAP.clients.table}`,
      latencyMs: Date.now() - started,
      sampleRecords: Array.isArray(payload.records) ? payload.records.length : 0
    };
  } catch (error) {
    lastHealth = { checkedAt, ok: false, detail: String(error.message || error), latencyMs: Date.now() - started, status: error.status || null };
  }
  return lastHealth;
}

async function schemaStatus() {
  const expected = Object.values(MAP).map((config) => ({ table: config.table, fields: [...Object.values(config.fields || {}), ...Object.values(config.links || {})] }));
  if (!configured()) return { ok: false, configured: false, detail: 'Jeton Airtable non installé', expected };
  try {
    const payload = await requestSchema();
    const actual = Array.isArray(payload.tables) ? payload.tables : [];
    const tables = expected.map((item) => {
      const table = actual.find((candidate) => candidate.name === item.table);
      const actualFields = new Set((table?.fields || []).map((field) => field.name));
      const missingFields = item.fields.filter((field) => !actualFields.has(field));
      return { table: item.table, exists: Boolean(table), missingFields, ok: Boolean(table) && !missingFields.length };
    });
    return { ok: tables.every((item) => item.ok), configured: true, baseId: baseId(), tables, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, configured: true, baseId: baseId(), detail: String(error.message || error), status: error.status || null, expected };
  }
}

function findLinkedAirtableId(store, localId) {
  if (!localId) return null;
  for (const collection of ['clients', 'vehicles', 'quotes', 'interventions']) {
    const match = store.list(collection).find((item) => item.id === localId);
    if (match?.airtableId) return match.airtableId;
  }
  return null;
}

function findLinkedLocalId(store, airtableId) {
  if (!airtableId) return null;
  for (const collection of ['clients', 'vehicles', 'quotes', 'interventions']) {
    const match = store.list(collection).find((item) => item.airtableId === airtableId);
    if (match?.id) return match.id;
  }
  return null;
}

function buildFields(collection, record, store) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const fields = {};
  for (const [localName, airtableName] of Object.entries(config.fields || {})) {
    const value = record[localName];
    if (value !== undefined && value !== null && value !== '') fields[airtableName] = value;
  }
  if (collection === 'vehicles' && !fields.Véhicule) fields.Véhicule = [record.brand, record.model, record.registration].filter(Boolean).join(' ') || 'Véhicule';
  for (const [localName, airtableName] of Object.entries(config.links || {})) {
    const linkedId = findLinkedAirtableId(store, record[localName]);
    if (linkedId) fields[airtableName] = [linkedId];
  }
  return fields;
}

function parseRecord(collection, airtableRecord, store) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const source = airtableRecord.fields || {};
  const record = {
    airtableId: airtableRecord.id,
    airtableCreatedAt: airtableRecord.createdTime || '',
    airtablePulledAt: new Date().toISOString(),
    airtableSyncError: ''
  };
  for (const [localName, airtableName] of Object.entries(config.fields || {})) {
    if (source[airtableName] !== undefined) record[localName] = source[airtableName];
  }
  for (const [localName, airtableName] of Object.entries(config.links || {})) {
    const linkedAirtableId = Array.isArray(source[airtableName]) ? source[airtableName][0] : source[airtableName];
    const linkedLocalId = findLinkedLocalId(store, linkedAirtableId);
    if (linkedLocalId) record[localName] = linkedLocalId;
  }
  return record;
}

function comparable(value) {
  return String(value ?? '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
}

function findLocalMatch(collection, remote, store) {
  const records = store.list(collection);
  const byId = records.find((item) => item.airtableId === remote.airtableId);
  if (byId) return byId;
  for (const keys of MAP[collection].naturalKeys || []) {
    if (!keys.every((key) => comparable(remote[key]))) continue;
    const matches = records.filter((item) => keys.every((key) => comparable(item[key]) === comparable(remote[key])));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

async function listRemote(collection) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const records = [];
  let offset = '';
  do {
    const payload = await request(config.table, { query: { pageSize: 100, offset: offset || undefined } });
    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = payload.offset || '';
  } while (offset);
  return records;
}

async function push(collection, record, store) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const fields = buildFields(collection, record, store);
  const payload = record.airtableId
    ? await request(config.table, { method: 'PATCH', recordId: record.airtableId, body: { fields, typecast: true } })
    : await request(config.table, { method: 'POST', body: { fields, typecast: true } });
  const syncedAt = new Date().toISOString();
  if (record.id) store.update(collection, record.id, { airtableId: payload.id, airtableSyncedAt: syncedAt, airtableSyncError: '' });
  return { collection, localId: record.id, airtableId: payload.id, syncedAt, fields: payload.fields || fields };
}

async function pull(collection, store) {
  const remoteRecords = await listRemote(collection);
  const results = [];
  for (const airtableRecord of remoteRecords) {
    try {
      const parsed = parseRecord(collection, airtableRecord, store);
      const existing = findLocalMatch(collection, parsed, store);
      let local = existing ? store.update(collection, existing.id, parsed) : store.create(collection, parsed);
      if (!existing && parsed.number && local.number !== parsed.number) local = store.update(collection, local.id, { number: parsed.number });
      results.push({ ok: true, collection, action: existing ? 'updated' : 'created', localId: local.id, airtableId: airtableRecord.id });
    } catch (error) {
      results.push({ ok: false, collection, airtableId: airtableRecord.id, error: String(error.message || error) });
    }
  }
  return { collection, total: results.length, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
}

async function pushAll(store, collections = SYNC_ORDER) {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const collection of collections) {
    if (!MAP[collection]) continue;
    for (const record of store.list(collection)) {
      try { results.push({ ok: true, ...(await push(collection, record, store)) }); }
      catch (error) {
        if (record.id) store.update(collection, record.id, { airtableSyncError: error.message });
        results.push({ ok: false, collection, localId: record.id, error: error.message });
      }
    }
  }
  const summary = { configured: configured(), total: results.length, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
  lastRun = { startedAt, completedAt: new Date().toISOString(), mode: 'push', ok: summary.failed === 0, pulled: 0, pushed: summary.succeeded, failed: summary.failed };
  return summary;
}

async function pullAll(store, collections = SYNC_ORDER) {
  const startedAt = new Date().toISOString();
  const batches = [];
  for (const collection of collections) if (MAP[collection]) batches.push(await pull(collection, store));
  const summary = {
    configured: configured(),
    total: batches.reduce((sum, item) => sum + item.total, 0),
    succeeded: batches.reduce((sum, item) => sum + item.succeeded, 0),
    failed: batches.reduce((sum, item) => sum + item.failed, 0),
    collections: batches
  };
  lastRun = { startedAt, completedAt: new Date().toISOString(), mode: 'pull', ok: summary.failed === 0, pulled: summary.succeeded, pushed: 0, failed: summary.failed };
  return summary;
}

async function syncAll(store, collections = SYNC_ORDER) {
  const startedAt = new Date().toISOString();
  const pulled = await pullAll(store, collections);
  if (pulled.failed) {
    lastRun = { startedAt, completedAt: new Date().toISOString(), mode: 'full', ok: false, pulled: pulled.succeeded, pushed: 0, failed: pulled.failed, pushSkipped: true };
    return { ok: false, policy: 'AIRTABLE_WINS_THEN_PUSH_LOCAL', pulled, pushed: null, pushSkipped: true };
  }
  const pushed = await pushAll(store, collections);
  lastRun = { startedAt, completedAt: new Date().toISOString(), mode: 'full', ok: pushed.failed === 0, pulled: pulled.succeeded, pushed: pushed.succeeded, failed: pushed.failed };
  return { ok: pushed.failed === 0, policy: 'AIRTABLE_WINS_THEN_PUSH_LOCAL', pulled, pushed, pushSkipped: false };
}

function status() {
  return {
    configured: configured(),
    baseId: baseId(),
    direction: 'bidirectional',
    conflictPolicy: 'AIRTABLE_WINS_THEN_PUSH_LOCAL',
    syncOrder: [...SYNC_ORDER],
    supportedCollections: Object.keys(MAP),
    tables: Object.entries(MAP).map(([collection, config]) => ({ collection, table: config.table, fields: Object.values(config.fields || {}), links: Object.values(config.links || {}) })),
    health: lastHealth,
    lastRun
  };
}

module.exports = { MAP, SYNC_ORDER, configured, status, request, requestSchema, testConnection, schemaStatus, buildFields, parseRecord, push, pull, pushAll, pullAll, syncAll };
