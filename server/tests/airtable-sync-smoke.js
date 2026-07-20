'use strict';

const assert = require('node:assert/strict');
const sync = require('../airtable-sync');
const publicSchema = require('../../data/airtable-schema.json');
const publicProcedures = require('../../data/workshop-procedures.json');
const procedures = require('../workshop-procedures');

function memoryStore(seed = {}) {
  const db = Object.fromEntries(sync.SYNC_ORDER.map((collection) => [collection, []]));
  Object.assign(db, seed);
  let id = 0;
  return {
    list(collection) { return db[collection] || (db[collection] = []); },
    create(collection, input) {
      const record = { id: `local-${++id}`, ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db[collection].unshift(record);
      return record;
    },
    update(collection, localId, patch) {
      const index = db[collection].findIndex((record) => record.id === localId);
      if (index < 0) throw new Error('NOT_FOUND');
      db[collection][index] = { ...db[collection][index], ...patch, updatedAt: new Date().toISOString() };
      return db[collection][index];
    }
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

(async () => {
  const previousToken = process.env.AIRTABLE_TOKEN;
  const previousBase = process.env.AIRTABLE_BASE_ID;
  const previousFetch = global.fetch;
  try {
    assert.deepEqual(publicSchema.syncOrder, [...sync.SYNC_ORDER], 'le cockpit public doit refléter l’ordre du connecteur');
    assert.equal(publicSchema.tables.length, Object.keys(sync.MAP).length, 'toutes les tables doivent être publiées dans le cockpit');
    assert.equal(publicProcedures.records.length, procedures.list().length, 'le référentiel public doit refléter toutes les procédures serveur');

    process.env.AIRTABLE_TOKEN = 'pat_VOTRE_JETON_AIRTABLE';
    assert.equal(sync.configured(), false, 'le jeton exemple ne doit jamais activer la synchronisation');

    process.env.AIRTABLE_TOKEN = 'patTestToken.123456789';
    process.env.AIRTABLE_BASE_ID = 'appTestGentleCarE';
    assert.equal(sync.configured(), true);

    const calls = [];
    global.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const table = decodeURIComponent(url.pathname.split('/').pop());
      calls.push({ method: options.method || 'GET', table, url: String(url), body: options.body ? JSON.parse(options.body) : null });
      if ((options.method || 'GET') === 'GET') {
        if (table === 'Clients') return response({ records: [{ id: 'rec-client-1', createdTime: '2026-07-20T10:00:00.000Z', fields: { 'Nom complet': 'Jean Dupont', Email: 'JEAN@EXEMPLE.FR', 'Téléphone': '0600000000' } }] });
        return response({ records: [] });
      }
      return response({ id: table === 'rec-client-1' ? table : 'rec-client-1', fields: options.body ? JSON.parse(options.body).fields : {} });
    };

    const store = memoryStore();
    const firstPull = await sync.pull('clients', store);
    assert.equal(firstPull.succeeded, 1);
    assert.equal(store.list('clients').length, 1);
    assert.equal(store.list('clients')[0].airtableId, 'rec-client-1');
    assert.equal(store.list('clients')[0].name, 'Jean Dupont');

    const secondPull = await sync.pull('clients', store);
    assert.equal(secondPull.results[0].action, 'updated', 'un second import doit mettre à jour, pas dupliquer');
    assert.equal(store.list('clients').length, 1);

    const pushed = await sync.push('clients', store.list('clients')[0], store);
    assert.equal(pushed.airtableId, 'rec-client-1');
    const patchCall = calls.find((call) => call.method === 'PATCH');
    assert.ok(patchCall, 'un enregistrement Airtable connu doit être mis à jour par PATCH');
    assert.equal(patchCall.body.fields['Nom complet'], 'Jean Dupont');

    const full = await sync.syncAll(store, ['clients']);
    assert.equal(full.ok, true);
    assert.equal(full.policy, 'AIRTABLE_WINS_THEN_PUSH_LOCAL');
    assert.equal(sync.status().direction, 'bidirectional');

    console.log('Airtable bidirectional synchronization smoke test passed.');
  } finally {
    if (previousToken === undefined) delete process.env.AIRTABLE_TOKEN; else process.env.AIRTABLE_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.AIRTABLE_BASE_ID; else process.env.AIRTABLE_BASE_ID = previousBase;
    global.fetch = previousFetch;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
