'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const reportModule = require('../intervention-report');

const db = {
  clients: [{ id: 'c1', name: 'Jean Dupont', email: 'jean@example.com', mobile: '0612345678', address: 'Bayonne' }],
  vehicles: [{ id: 'v1', clientId: 'c1', brand: 'Ford', model: 'Mustang GT V8', registration: 'AB-123-CD', vin: '1FA6P8CF0L5000001', mileage: 72000, year: '2020', color: 'Bleu Velocity', engine: 'V8', expertCurrentValue: 62000, isRareVehicle: true }],
  quotes: [{ id: 'q1', number: 'DEV-2026-0001', clientId: 'c1', vehicleId: 'v1', service: 'Pack Intégral Cryo + Dinitrol', status: 'Accepté', acceptedAt: '2026-07-01T10:00:00.000Z', visualUrl: '/generated/quotes/demo.svg' }],
  interventions: [{ id: 'i1', number: 'GC-2026-0001', quoteId: 'q1', clientId: 'c1', vehicleId: 'v1', service: 'Pack Intégral Cryo + Dinitrol', startedAt: '2026-07-10T08:30:00.000Z', completedAt: '2026-07-12T16:30:00.000Z', mileage: 72000, technician: 'David Bourasseau', clientRequest: 'Nettoyage détaillé du dessous et protection anticorrosion.', plannedZones: ['dessous de caisse', 'passages de roues'], entryObservedAt: '2026-07-10T08:15:00.000Z', depositNature: 'Graisses, terre sèche et anciennes projections routières.', supportCompatibility: ['métal peint compatible après essai'], testsPerformed: ['essai discret à basse pression'], identifiedRisks: ['ancienne protection fragile sur une zone'], diagnosticLimits: ['zones non visibles sans démontage'], cryoMachine: 'IBL2500', cryoNozzles: ['buse droite'], pressureMinBar: 6, pressureMaxBar: 10, cryoZonesTreated: ['dessous de caisse', 'passages de roues'], cryoDurationMinutes: 480, dryIceKg: 180, dinitrolProducts: [{ name: 'Dinitrol ML', batch: 'LOT-ML-01', quantity: 2, unit: 'L' }], maskedZones: ['freins', 'échappement'], cavities: ['bas de caisse'], dinitrolZones: ['longerons', 'passages de roues'], dinitrolTotalQuantity: '5 L', applicationConditions: 'Atelier sec, supports propres et stabilisés.', dryingTime: '24 heures', comparisons: [{ zone: 'passage de roue avant gauche', beforePhotoUrl: '/generated/photos/before.jpg', afterPhotoUrl: '/generated/photos/after.jpg', technicalComment: 'Dépôts retirés, support visible.', remainingVisible: 'Marque ancienne sans évolution.' }], quoteCompliance: 'Conforme au devis accepté.', finalCleaning: 'Nettoyage de restitution réalisé.', managerValidation: 'David Bourasseau', recommendations: ['contrôle visuel annuel'], nextControlDate: '2027-07-12', warrantyLimits: ['corrosion interne non visible sans démontage'], checklist: { finalControl: true, reportGenerated: true } }],
  observations: [{ id: 'o1', interventionId: 'i1', category: 'Corrosion', severity: 'Haute', description: 'Corrosion localisée sur une fixation.', zone: 'arrière gauche', clientNotified: true, decision: 'Avis d’un spécialiste recommandé.', specialistRecommended: true }],
  photos: [{ id: 'p1', interventionId: 'i1', category: 'Avant', title: 'État entrée', zone: 'dessous', url: '/generated/photos/entry.jpg', createdAt: '2026-07-10T08:20:00.000Z' }, { id: 'p2', interventionId: 'i1', category: 'Après', title: 'Contrôle final', zone: 'dessous', url: '/generated/photos/final.jpg', createdAt: '2026-07-12T15:00:00.000Z' }],
  documents: [{ id: 'd1', interventionId: 'i1', category: 'Fiche produit', title: 'Fiche Dinitrol ML', url: '/docs/dinitrol-ml.pdf' }],
  tasks: [], communications: [], stockItems: [], events: []
};

const store = {
  list(collection) { return db[collection] || []; },
  create(collection, input) { const record = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; (db[collection] ||= []).unshift(record); return record; },
  update(collection, id, patch) { const index = db[collection].findIndex((item) => item.id === id); if (index < 0) throw new Error(`NOT_FOUND:${collection}:${id}`); db[collection][index] = { ...db[collection][index], ...patch, id, updatedAt: new Date().toISOString() }; return db[collection][index]; }
};

const createdFiles = [];
try {
  const generated = reportModule.generate(store, 'i1', {}, { id: 'u1', name: 'David Bourasseau' });
  assert.equal(generated.report.schemaVersion, '1.0');
  assert.equal(generated.report.version, 1);
  assert.equal(generated.report.identification.vehicle.registration, 'AB-123-CD');
  assert.equal(generated.report.cryogenicProtocol.dryIceKg, 180);
  assert.equal(generated.report.dinitrolProtection.products[0].batch, 'LOT-ML-01');
  assert.equal(generated.report.anomalies.length, 1);
  assert.equal(generated.report.complementaryVisa.recommended, true);
  assert.match(generated.report.complementaryVisa.reason, /50 000|rareté|constats/i);
  assert.equal(generated.report.completeness.complete, true);
  assert.ok(generated.report.contentHash.length === 64);
  assert.match(generated.htmlUrl, /\/generated\/reports\/.+\.html$/);
  assert.match(generated.jsonUrl, /\/generated\/reports\/.+\.json$/);
  const htmlPath = path.join(__dirname, '..', 'public', decodeURIComponent(generated.htmlUrl));
  const jsonPath = path.join(__dirname, '..', 'public', decodeURIComponent(generated.jsonUrl));
  createdFiles.push(htmlPath, jsonPath);
  assert.ok(fs.existsSync(htmlPath));
  assert.ok(fs.existsSync(jsonPath));
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const title of ['Identification','Mission et périmètre','État d’entrée','Diagnostic préalable','Protocole cryogénique','Protection Dinitrol','Avant / après','Anomalies révélées','Contrôle final','Conseils et suivi','Pièces et preuves','Visa complémentaire']) assert.match(html, new RegExp(title));

  const validated = reportModule.validate(store, 'i1', { managerValidation: 'Bénédicte Lopez' }, { id: 'u2', name: 'Bénédicte Lopez' });
  assert.equal(validated.report.version, 2);
  assert.equal(validated.report.status, 'Validé en interne — prêt à remettre');
  assert.equal(validated.report.finalControl.managerValidation, 'Bénédicte Lopez');
  assert.equal(db.interventions[0].reportVersion, 2);
  createdFiles.push(path.join(__dirname, '..', 'public', decodeURIComponent(validated.htmlUrl)), path.join(__dirname, '..', 'public', decodeURIComponent(validated.jsonUrl)));

  console.log('Intervention reference report smoke test passed.');
} finally {
  for (const file of createdFiles) { try { fs.unlinkSync(file); } catch {} }
}
