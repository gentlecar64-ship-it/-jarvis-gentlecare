'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const jarvis = require('../jarvis-extended');
const intelligence = require('../jarvis-intelligence');

try { fs.unlinkSync(intelligence.MEMORY_FILE); } catch {}

const db = {
  clients: [{ id: 'c1', name: 'Jean Dupont', email: 'jean@example.com', mobile: '0612345678', preferredChannel: 'SMS', smsAllowed: true, emailAllowed: true }],
  vehicles: [{ id: 'v1', clientId: 'c1', brand: 'Ford', model: 'Mustang GT', label: 'Ford Mustang GT', registration: 'AB-123-CD', year: '2020', mileage: 120000, color: 'Rouge', engine: 'V8', gearbox: 'Manuelle' }],
  quotes: [], interventions: [], tasks: [], communications: [], documents: [], photos: [], observations: [], stockItems: [], planningBlocks: []
};
let quoteSequence = 0;
let interventionSequence = 0;
const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) {
    const record = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (collection === 'quotes') record.number = `DEV-2026-${String(++quoteSequence).padStart(4, '0')}`;
    if (collection === 'interventions') record.number = `GC-2026-${String(++interventionSequence).padStart(4, '0')}`;
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

const user = { id: 'u1', name: 'David Bourasseau', role: 'admin', preferences: { confirmBeforeWrite: true } };

const opened = jarvis.execute(store, { text: 'Ouvre la fiche de Jean Dupont', user });
assert.equal(opened.data.client.id, 'c1');
assert.equal(opened.intelligence.enabled, true);
assert.equal(intelligence.getState(user).clientId, 'c1');
assert.equal(intelligence.getState(user).vehicleId, 'v1');

const proposal = jarvis.execute(store, { text: 'Son kilométrage est 125000 km, elle est bleue et sa valeur est estimée à 60000 euros', user });
assert.equal(proposal.type, 'intelligence-confirmation');
assert.equal(proposal.intelligence.pendingConfirmation, true);
assert.match(proposal.answer, /kilométrage|couleur|estimation/i);

const confirmed = jarvis.execute(store, { text: 'Oui confirme', user });
assert.equal(confirmed.type, 'intelligence-update');
assert.equal(db.vehicles[0].mileage, 125000);
assert.equal(db.vehicles[0].color, 'Bleu');
assert.equal(db.vehicles[0].clientEstimatedValue, 60000);

const summary = jarvis.execute(store, { text: 'Résume le dossier courant', user });
assert.equal(summary.type, 'intelligence-summary');
assert.match(summary.answer, /Jean Dupont/);
assert.ok(summary.intelligence.alerts.some((item) => item.code === 'HIGH_VALUE'));

const missing = jarvis.execute(store, { text: "Qu'est-ce qu'il manque dans le dossier courant ?", user });
assert.equal(missing.type, 'intelligence-missing-fields');
assert.ok(Array.isArray(missing.data.questions));
assert.ok(missing.actions.some((item) => /devis/i.test(item.label)));

const quote = jarvis.execute(store, { text: 'Prépare le devis avec le dossier courant, Pack Intégral Cryo plus Dinitrol', user });
assert.equal(quote.type, 'quote-studio-voice-preview');
assert.equal(db.quotes.length, 0);
assert.ok(quote.links.some((item) => item.url === '/quotes'));
assert.match(quote.answer, /sans créer|avant validation/i);

try { fs.unlinkSync(intelligence.MEMORY_FILE); } catch {}
console.log('Jarvis contextual intelligence smoke test passed.');
