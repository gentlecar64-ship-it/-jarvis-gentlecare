'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const reputation = require('../reputation');
const clientIntake = require('../client-intake');

try { fs.unlinkSync(reputation.FILE); } catch {}

const db = {
  clients: [{ id: 'c1', name: 'Jean Dupont', email: 'jean@example.com', mobile: '0612345678', preferredChannel: 'SMS', smsAllowed: true }],
  vehicles: [{ id: 'v1', clientId: 'c1', brand: 'Ford', model: 'Mustang GT', registration: 'AB-123-CD', year: '2020', mileage: 120000, color: 'Bleu', engine: 'V8', gearbox: 'Manuelle' }],
  communications: []
};
let sequence = 0;
const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) { const record = { id: `x${++sequence}`, ...input }; (db[collection] ||= []).push(record); return record; }
};

const dossier = clientIntake.lookup(store, 'Ouvre la fiche de Jean Dupont');
assert.equal(dossier.found, true);
assert.equal(dossier.client.id, 'c1');
assert.equal(dossier.vehicles.length, 1);
assert.ok(dossier.questions.some((item) => /état actuel/i.test(item)));
assert.ok(dossier.questions.some((item) => /valeur actuelle/i.test(item)));

const user = { id: 'u1', name: 'David Bourasseau', createdAt: '2026-01-01T00:00:00.000Z' };
reputation.saveUserSettings(user, { tone: 'humorous', frequency: 'sustained', nickname: 'David', enabled: true });
const prompt = reputation.buildPrompt(user, { force: true });
assert.equal(prompt.due, true);
assert.equal(prompt.scale.preselected, null);
assert.equal(prompt.settings.tone, 'humorous');
assert.ok(prompt.message.length > 30);

const response = reputation.respond(user, { action: 'submit', rating: 5, feedback: 'Très pratique.' });
assert.equal(response.settings.rating, 5);
assert.ok(response.settings.submittedAt);

const quote = { id: 'q1', clientId: 'c1', vehicleId: 'v1' };
const scheduled = reputation.scheduleClientReview(store, quote, user);
assert.equal(scheduled.drafts.length, 3);
assert.ok(scheduled.drafts.every((item) => item.status === 'Programmé — validation requise'));
assert.ok(scheduled.drafts.every((item) => /positif comme critique|avis honnête|entièrement libre/i.test(item.message)));
assert.ok(scheduled.drafts.every((item) => !/5 étoiles|bonne note|récompense/i.test(item.message)));

console.log('Reputation and client intake smoke test passed.');
