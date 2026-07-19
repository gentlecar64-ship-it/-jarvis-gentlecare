'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const workflow = require('../quote-workflow-reference');

const db = {
  clients: [], vehicles: [], quotes: [], interventions: [], tasks: [], communications: [], documents: [], photos: [], observations: [], stockItems: [], events: []
};
let quoteNumber = 0;
let interventionNumber = 0;

const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) {
    const record = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (collection === 'quotes') record.number = `DEV-2026-${String(++quoteNumber).padStart(4, '0')}`;
    if (collection === 'interventions') record.number = `GC-2026-${String(++interventionNumber).padStart(4, '0')}`;
    db[collection].unshift(record);
    return record;
  },
  update(collection, id, input) {
    const index = db[collection].findIndex((item) => item.id === id);
    if (index < 0) throw new Error('NOT_FOUND');
    db[collection][index] = { ...db[collection][index], ...input, id, updatedAt: new Date().toISOString() };
    return db[collection][index];
  }
};

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2RfkAAAAASUVORK5CYII=';
const user = { id: 'admin', name: 'David', role: 'admin' };

const created = workflow.startIntake(store, {
  user,
  text: 'Crée un devis pour client Jean Dupont, email jean.dupont@example.com, portable 06 12 34 56 78, Ford Mustang GT 2020 bleue immatriculation AB-123-CD, Pack Intégral Cryo Dinitrol.',
  photoDataUrl: pixel,
  photoName: 'mustang.png'
});

assert.equal(created.type, 'quote-workflow-created');
assert.equal(db.clients.length, 1);
assert.equal(db.vehicles.length, 1);
assert.equal(db.quotes.length, 1);
assert.equal(db.quotes[0].totalTtc, 1500);
assert.equal(db.quotes[0].depositTtc, 750);
assert.equal(db.quotes[0].depositRate, 50);
assert.equal(db.quotes[0].validationRequired, true);
assert.equal(db.quotes[0].externalSendAllowed, false);
assert.ok(db.quotes[0].visualUrl.startsWith('/generated/quotes/'));
assert.ok(created.links[0].url === db.quotes[0].visualUrl);
assert.ok(db.tasks.some((item) => item.quoteId === db.quotes[0].id));
assert.ok(db.communications.some((item) => item.quoteId === db.quotes[0].id));

const visualPath = path.join(__dirname, '..', 'public', decodeURIComponent(db.quotes[0].visualUrl));
assert.ok(fs.existsSync(visualPath));
assert.match(fs.readFileSync(visualPath, 'utf8'), /ACOMPTE 50 %|Acompte 50 %/i);

workflow.transition(store, db.quotes[0].number, 'accept', {}, user);
assert.equal(db.quotes[0].paymentStatus, 'Acompte en attente');

workflow.transition(store, db.quotes[0].number, 'deposit-received', {}, user);
assert.equal(db.interventions.length, 1);
assert.equal(db.quotes[0].workflowStatus, 'Intervention planifiée');

workflow.transition(store, db.quotes[0].number, 'start', {}, user);
assert.equal(db.interventions[0].status, 'En cours');

workflow.transition(store, db.quotes[0].number, 'delay', { extraDays: 1, reason: 'Le séchage demande un délai complémentaire.' }, user);
assert.equal(db.quotes[0].workflowStatus, 'Délai ajusté');
assert.ok(db.communications.some((item) => /immédiatement dès que le véhicule sera terminé/i.test(item.message)));

const completed = workflow.transition(store, db.quotes[0].number, 'complete', { report: { clientRequest: 'Nettoyage et protection du dessous.', plannedZones: ['dessous'], depositNature: 'Dépôts routiers', managerValidation: 'David' } }, user);
assert.ok(db.documents.some((item) => item.category === 'Rapport intervention'));
assert.ok(db.documents.some((item) => item.category === 'Facture'));
assert.equal(db.quotes[0].paymentStatus, 'Solde en attente');
assert.ok(db.quotes[0].reportUrl.startsWith('/generated/reports/'));
assert.equal(db.quotes[0].reportVersion, 1);
assert.equal(completed.data.report.schemaVersion, '1.0');
assert.equal(completed.data.report.identification.vehicle.registration, 'AB-123-CD');
assert.ok(completed.links.some((item) => /rapport/i.test(item.label)));
assert.ok(db.documents.some((item) => item.status === 'Remplacé par le rapport de référence versionné'));

workflow.transition(store, db.quotes[0].number, 'payment-received', {}, user);
assert.ok(db.tasks.some((item) => /transférer au showroom/i.test(item.title)));

workflow.transition(store, db.quotes[0].number, 'showroom-claim', { assignee: 'Séverine' }, user);
assert.equal(db.interventions[0].showroomAssignee, 'Séverine');

workflow.transition(store, db.quotes[0].number, 'showroom-ready', { cleaningMethod: 'Nettoyage doux adapté', coverInstalled: true }, user);
assert.equal(db.interventions[0].status, 'En attente client');
assert.equal(db.interventions[0].protectionCoverInstalled, true);

workflow.transition(store, db.quotes[0].number, 'close', {}, user);
assert.equal(db.quotes[0].workflowStatus, 'Dossier clôturé');

workflow.transition(store, db.quotes[0].number, 'archive', {}, user);
assert.equal(db.quotes[0].status, 'Archivé');
assert.equal(db.interventions[0].status, 'Archivée');

console.log('Voice quote workflow and reference report smoke test passed.');
