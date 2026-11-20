'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const clientIntake = require('./client-intake');
const quoteWorkflow = require('./quote-workflow');

const DATA_DIR = path.join(__dirname, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'jarvis-intelligence.json');
const MEMORY_MAX_TURNS = 24;
const YES_RE = /^(?:oui|ok|d'accord|daccord|confirme|confirmé|confirme-le|vas-y|va y|c'est bon|exact|tout à fait|parfait)\b/i;
const NO_RE = /^(?:non|annule|annuler|stop|laisse tomber|pas maintenant|ne fais pas)\b/i;

function normalize(value) {
  return String(value || '').trim();
}
function fold(value) {
  return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function digits(value) { return normalize(value).replace(/\D/g, ''); }
function nowIso() { return new Date().toISOString(); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }

function ensureFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, JSON.stringify({ users: {} }, null, 2), 'utf8');
}
function readMemory() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { users: {} };
    parsed.users ||= {};
    return parsed;
  } catch { return { users: {} }; }
}
function writeMemory(data) {
  ensureFile();
  const tmp = `${MEMORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, MEMORY_FILE);
}
function userKey(user = {}) { return user.id || user.username || fold(user.name) || 'default'; }
function defaultState() {
  return {
    clientId: '', vehicleId: '', quoteId: '', interventionId: '',
    pendingAction: null, lastIntent: '', lastAnswerType: '',
    turns: [], updatedAt: nowIso()
  };
}
function getState(user = {}) {
  const data = readMemory();
  return { ...defaultState(), ...(data.users[userKey(user)] || {}) };
}
function saveState(user = {}, patch = {}, turn = null) {
  const data = readMemory();
  const key = userKey(user);
  const current = { ...defaultState(), ...(data.users[key] || {}) };
  const turns = Array.isArray(current.turns) ? current.turns.slice(-MEMORY_MAX_TURNS + 1) : [];
  if (turn) turns.push({ at: nowIso(), ...turn });
  data.users[key] = { ...current, ...patch, turns, updatedAt: nowIso() };
  writeMemory(data);
  return data.users[key];
}
function clearPending(user = {}) { return saveState(user, { pendingAction: null }); }

function similarity(a, b) {
  const x = fold(a); const y = fold(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length) * 0.92;
  const ax = new Set(x.split(/\s+/).filter(Boolean));
  const by = new Set(y.split(/\s+/).filter(Boolean));
  const intersection = [...ax].filter((item) => by.has(item)).length;
  return intersection / Math.max(1, new Set([...ax, ...by]).size);
}

function extractReference(text) {
  const value = normalize(text);
  const email = (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0].toLowerCase();
  const phone = (value.match(/(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/) || [''])[0];
  const registration = ((value.toUpperCase().match(/\b[A-Z]{2}[ -]?\d{3}[ -]?[A-Z]{2}\b/) || [''])[0]).replace(/\s/g, '-');
  const quoteNumber = ((value.toUpperCase().match(/\b(?:DEV|DV)-\d{4}-\d{4}\b/) || [''])[0]).replace(/^DV-/, 'DEV-');
  return { email, phone, registration, quoteNumber };
}

function rankClient(store, text) {
  const reference = extractReference(text);
  const candidates = safeList(store, 'clients').map((client) => {
    let score = 0;
    if (reference.email && fold(client.email) === fold(reference.email)) score += 120;
    if (reference.phone && digits(client.mobile || client.phone) === digits(reference.phone)) score += 120;
    score += similarity(client.name, text) * 70;
    if (client.email && fold(text).includes(fold(client.email))) score += 70;
    return { record: client, score };
  }).filter((item) => item.score > 15).sort((a, b) => b.score - a.score);
  return candidates;
}
function rankVehicle(store, text, clientId = '') {
  const reference = extractReference(text);
  const candidates = safeList(store, 'vehicles').filter((vehicle) => !clientId || vehicle.clientId === clientId).map((vehicle) => {
    let score = 0;
    if (reference.registration && fold(vehicle.registration) === fold(reference.registration)) score += 150;
    score += similarity([vehicle.brand, vehicle.model, vehicle.label, vehicle.registration].filter(Boolean).join(' '), text) * 90;
    return { record: vehicle, score };
  }).filter((item) => item.score > 15).sort((a, b) => b.score - a.score);
  return candidates;
}

function linkedContext(store, user = {}) {
  const state = getState(user);
  const client = safeList(store, 'clients').find((item) => item.id === state.clientId) || null;
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === state.vehicleId) || null;
  const quote = safeList(store, 'quotes').find((item) => item.id === state.quoteId) || null;
  const intervention = safeList(store, 'interventions').find((item) => item.id === state.interventionId) || null;
  return { state, client, vehicle, quote, intervention };
}

function extractFacts(text) {
  const value = normalize(text);
  const facts = { client: {}, vehicle: {} };
  const email = (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
  const phone = (value.match(/(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/) || [''])[0];
  const registration = ((value.toUpperCase().match(/\b[A-Z]{2}[ -]?\d{3}[ -]?[A-Z]{2}\b/) || [''])[0]).replace(/\s/g, '-');
  const mileage = value.match(/\b(\d{1,3}(?:[ .]\d{3})+|\d{4,6})\s*(?:km|kilom[eè]tres?)\b/i);
  const year = value.match(/\b(?:19|20)\d{2}\b/);
  const amount = value.match(/(?:vaut|valeur|estim(?:e|é|ée)|cote|cot[eé])[^\d]{0,18}(\d{1,3}(?:[ .]\d{3})+|\d{4,6})\s*(?:€|euros?)?/i);
  const colors = ['blanc','blanche','noir','noire','bleu','bleue','rouge','gris','grise','vert','verte','jaune','orange','beige','marron','argent','violet','violette'];
  const color = colors.find((item) => fold(value).includes(item));
  if (email) facts.client.email = email.toLowerCase();
  if (phone) facts.client.mobile = digits(phone).replace(/^0033/, '0').replace(/^33/, '0');
  if (/préfère.*sms|prefere.*sms|par sms/i.test(value)) facts.client.preferredChannel = 'SMS';
  if (/préfère.*mail|prefere.*mail|par e-?mail/i.test(value)) facts.client.preferredChannel = 'E-mail';
  if (/préfère.*téléphone|prefere.*telephone|par téléphone|par telephone/i.test(value)) facts.client.preferredChannel = 'Téléphone';
  if (/autorise.*sms|accord.*sms/i.test(value)) facts.client.smsAllowed = true;
  if (/autorise.*mail|accord.*mail/i.test(value)) facts.client.emailAllowed = true;
  if (registration) facts.vehicle.registration = registration;
  if (mileage) facts.vehicle.mileage = Number(mileage[1].replace(/\D/g, ''));
  if (year) facts.vehicle.year = year[0];
  if (color) facts.vehicle.color = color.charAt(0).toUpperCase() + color.slice(1);
  if (/bo[iî]te\s+(?:est\s+)?manuelle|transmission manuelle/i.test(value)) facts.vehicle.gearbox = 'Manuelle';
  if (/bo[iî]te\s+(?:est\s+)?automatique|transmission automatique/i.test(value)) facts.vehicle.gearbox = 'Automatique';
  const engine = value.match(/\b(V\s?\d{1,2}|\d(?:[.,]\d)?\s?(?:TDI|TSI|HDI|dCi|essence|diesel|hybride|électrique|electrique))\b/i);
  if (engine) facts.vehicle.engine = engine[1].replace(/\s+/g, ' ').trim();
  if (amount) facts.vehicle.clientEstimatedValue = Number(amount[1].replace(/\D/g, ''));
  const condition = value.match(/(?:état|etat|corrosion|rouille|sale|encrassé|encrasse|abîmé|abime|propre)[^.;]{0,180}/i);
  if (condition) facts.vehicle.conditionNotes = condition[0].trim();
  return facts;
}
function hasFacts(facts) { return Object.keys(facts.client).length > 0 || Object.keys(facts.vehicle).length > 0; }

function describePatch(target, patch) {
  const labels = {
    email: 'e-mail', mobile: 'portable', preferredChannel: 'canal préféré', smsAllowed: 'autorisation SMS', emailAllowed: 'autorisation e-mail',
    registration: 'immatriculation', mileage: 'kilométrage', year: 'année', color: 'couleur', gearbox: 'boîte', engine: 'motorisation', clientEstimatedValue: 'estimation du client', conditionNotes: 'état avant travaux'
  };
  return Object.entries(patch).map(([key, value]) => `${labels[key] || key} : ${typeof value === 'boolean' ? (value ? 'oui' : 'non') : value}`).join(', ');
}

function applyPending(store, user, pending) {
  if (!pending) return null;
  if (pending.kind === 'update-client') {
    const client = store.update('clients', pending.id, pending.patch);
    clearPending(user);
    return { type: 'intelligence-update', answer: `C’est enregistré dans la fiche de ${client.name || 'ce client'} : ${describePatch('client', pending.patch)}.`, data: { client }, intelligence: { applied: true } };
  }
  if (pending.kind === 'update-vehicle') {
    const vehicle = store.update('vehicles', pending.id, pending.patch);
    clearPending(user);
    return { type: 'intelligence-update', answer: `C’est enregistré dans la fiche du véhicule : ${describePatch('vehicle', pending.patch)}.`, data: { vehicle }, intelligence: { applied: true } };
  }
  if (pending.kind === 'update-both') {
    const client = pending.clientPatch && Object.keys(pending.clientPatch).length ? store.update('clients', pending.clientId, pending.clientPatch) : null;
    const vehicle = pending.vehiclePatch && Object.keys(pending.vehiclePatch).length ? store.update('vehicles', pending.vehicleId, pending.vehiclePatch) : null;
    clearPending(user);
    return { type: 'intelligence-update', answer: `C’est enregistré${client ? ` dans la fiche de ${client.name}` : ''}${vehicle ? ' et dans la fiche véhicule' : ''}.`, data: { client, vehicle }, intelligence: { applied: true } };
  }
  return null;
}

function missingResult(store, user) {
  const context = linkedContext(store, user);
  if (!context.client) return { type: 'intelligence-question', answer: 'Aucun client n’est sélectionné. Donnez-moi son nom, son e-mail, son portable ou une immatriculation.', data: { context } };
  const clientGaps = clientIntake.clientMissing(context.client);
  const vehicleGaps = context.vehicle ? clientIntake.vehicleMissing(context.vehicle) : [];
  const questions = [...clientGaps, ...vehicleGaps].map((item) => item.question);
  return {
    type: 'intelligence-missing-fields',
    answer: questions.length ? `Voici les questions utiles à poser maintenant : ${questions.join(' ')}` : 'La fiche est suffisamment complète pour poursuivre le devis.',
    data: { context, missing: { client: clientGaps, vehicle: vehicleGaps }, questions },
    actions: context.vehicle ? [{ label: 'Préparer le devis', command: 'Prépare le devis avec le dossier courant' }] : [{ label: 'Ajouter un véhicule', command: 'Ajoute un véhicule à ce client' }]
  };
}

function summaryResult(store, user) {
  const { client, vehicle, quote, intervention } = linkedContext(store, user);
  if (!client) return { type: 'intelligence-summary', answer: 'Aucun dossier client n’est ouvert pour le moment.' };
  const vehicles = safeList(store, 'vehicles').filter((item) => item.clientId === client.id);
  const lines = [
    `Client : ${client.name || 'à compléter'}${client.mobile ? `, ${client.mobile}` : ''}${client.email ? `, ${client.email}` : ''}.`,
    `${vehicles.length} véhicule(s) enregistré(s).`,
    vehicle ? `Véhicule courant : ${[vehicle.brand, vehicle.model, vehicle.year, vehicle.color, vehicle.registration].filter(Boolean).join(' · ')}.` : 'Aucun véhicule courant sélectionné.',
    quote ? `Devis courant : ${quote.number || quote.id}, statut ${quote.workflowStatus || quote.status || 'inconnu'}.` : 'Aucun devis courant.',
    intervention ? `Intervention : ${intervention.number || intervention.id}, statut ${intervention.workflowStatus || intervention.status || 'inconnu'}.` : ''
  ].filter(Boolean);
  return { type: 'intelligence-summary', answer: lines.join('\n'), data: { client, vehicles, vehicle, quote, intervention } };
}

function quoteFromContext(store, user, input) {
  const { client, vehicle } = linkedContext(store, user);
  if (!client) return { type: 'intelligence-question', answer: 'Je dois d’abord savoir pour quel client préparer le devis.' };
  if (!vehicle) return { type: 'intelligence-question', answer: `${client.name} est sélectionné, mais aucun véhicule ne l’est. Choisissez un véhicule existant ou dites-moi d’en ajouter un.` };
  const serviceText = normalize(input.text || input.command || '');
  const enrichedText = `${serviceText} pour ${client.name}, ${vehicle.brand || ''} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.color || ''}, immatriculation ${vehicle.registration || ''}, ${vehicle.mileage ? `${vehicle.mileage} km` : ''}.`;
  return quoteWorkflow.startIntake(store, {
    ...input,
    text: enrichedText,
    clientName: client.name,
    email: client.email,
    mobile: client.mobile || client.phone,
    brand: vehicle.brand,
    model: vehicle.model,
    registration: vehicle.registration,
    color: vehicle.color,
    year: vehicle.year,
    mileage: vehicle.mileage,
    photoUrl: vehicle.photoUrl,
    notes: vehicle.conditionNotes || vehicle.notes,
    user
  });
}

function proactiveAlerts(context) {
  const alerts = [];
  const vehicle = context.vehicle;
  if (!vehicle) return alerts;
  const values = [vehicle.marketValueAverage, vehicle.currentConditionValue, vehicle.postTreatmentValue, vehicle.clientEstimatedValue, vehicle.expertCurrentValue, vehicle.expertPostTreatmentValue].map(Number).filter(Number.isFinite);
  if (values.some((value) => value > 50000)) alerts.push({ level: 'high', code: 'HIGH_VALUE', message: 'Valeur supérieure à 50 000 € : validation humaine et expertise à envisager avant de confirmer une date.' });
  const rareText = fold([vehicle.brand, vehicle.model, vehicle.version, vehicle.notes].filter(Boolean).join(' '));
  if (/(ferrari|lamborghini|mclaren|aston martin|rolls royce|bentley|bugatti|porsche.*(?:gt|rs|turbo)|shelby|bullitt|mach 1|serie limitee|collection|rare|classique|vintage)/.test(rareText)) alerts.push({ level: 'high', code: 'RARE_VEHICLE', message: 'Rareté potentielle détectée : l’humain décide si un expert doit intervenir.' });
  return alerts;
}

function rememberResult(store, user, input, result) {
  const data = result?.data || {};
  const client = data.client || data?.context?.client || data?.quote?.client || null;
  const vehicle = data.vehicle || data.selectedVehicle || data?.context?.vehicle || null;
  const quote = data.quote || null;
  const intervention = data.intervention || null;
  const patch = {
    clientId: client?.id || getState(user).clientId,
    vehicleId: vehicle?.id || getState(user).vehicleId,
    quoteId: quote?.id || getState(user).quoteId,
    interventionId: intervention?.id || getState(user).interventionId,
    lastIntent: result?.type || '',
    lastAnswerType: result?.type || ''
  };
  saveState(user, patch, { userText: normalize(input.text || input.command), answerType: result?.type || '' });
  return linkedContext(store, user);
}

function enrich(store, input, result) {
  if (!result) return result;
  const user = input.user || {};
  const context = rememberResult(store, user, input, result);
  const alerts = proactiveAlerts(context);
  const actions = Array.isArray(result.actions) ? result.actions.slice() : [];
  if (context.client && !actions.some((item) => item.command === 'Quels champs manquent ?')) actions.push({ label: 'Champs manquants', command: 'Quels champs manquent dans le dossier courant ?' });
  if (context.client && !actions.some((item) => item.command === 'Résume le dossier courant')) actions.push({ label: 'Résumer le dossier', command: 'Résume le dossier courant' });
  if (context.vehicle && !context.quote && !actions.some((item) => /Prépare le devis/i.test(item.command || ''))) actions.push({ label: 'Préparer le devis', command: 'Prépare le devis avec le dossier courant' });
  const answer = alerts.length && !alerts.some((alert) => normalize(result.answer).includes(normalize(alert.message)))
    ? `${result.answer}\n\nAlerte Jarvis : ${alerts.map((item) => item.message).join(' ')}`
    : result.answer;
  return {
    ...result,
    answer,
    actions: actions.slice(0, 4),
    intelligence: {
      enabled: true,
      persistentContext: true,
      context: { clientId: context.client?.id || '', vehicleId: context.vehicle?.id || '', quoteId: context.quote?.id || '', interventionId: context.intervention?.id || '' },
      alerts,
      pendingConfirmation: Boolean(getState(user).pendingAction)
    }
  };
}

function handle(store, input = {}) {
  const text = normalize(input.text || input.command);
  const normalized = fold(text);
  const user = input.user || {};
  const state = getState(user);
  if (!text) return null;

  if (state.pendingAction && YES_RE.test(text)) return applyPending(store, user, state.pendingAction);
  if (state.pendingAction && NO_RE.test(text)) {
    clearPending(user);
    return { type: 'intelligence-cancelled', answer: 'D’accord, je n’ai rien modifié.' };
  }

  if (/^(?:qu(?:e|’)est-ce qu(?:i|’il) manque|quels? champs? manque|que dois-je demander|questions? a poser|compl[eé]ter le dossier)/i.test(normalized)) return missingResult(store, user);
  if (/(?:r[eé]sume|resume|synth[eè]se|montre).*dossier courant|dossier courant.*(?:r[eé]sume|resume)|o[uù] en est.*dossier/i.test(normalized)) return summaryResult(store, user);
  if (/(?:pr[eé]pare|prepare|fais|lance|cr[eé]e).*(?:devis).*(?:dossier courant|pour lui|pour elle|pour ce client|pour cette voiture)|^(?:fais|pr[eé]pare|prepare) le devis$/i.test(normalized)) return quoteFromContext(store, user, input);

  const context = linkedContext(store, user);
  const facts = extractFacts(text);
  if (hasFacts(facts) && (context.client || context.vehicle)) {
    const clientPatch = context.client ? facts.client : {};
    const vehiclePatch = context.vehicle ? facts.vehicle : {};
    if (Object.keys(clientPatch).length || Object.keys(vehiclePatch).length) {
      const pending = Object.keys(clientPatch).length && Object.keys(vehiclePatch).length
        ? { kind: 'update-both', clientId: context.client.id, vehicleId: context.vehicle.id, clientPatch, vehiclePatch }
        : Object.keys(clientPatch).length
          ? { kind: 'update-client', id: context.client.id, patch: clientPatch }
          : { kind: 'update-vehicle', id: context.vehicle.id, patch: vehiclePatch };
      const confirmationRequired = user.preferences?.confirmBeforeWrite !== false;
      if (!confirmationRequired) return applyPending(store, user, pending);
      saveState(user, { pendingAction: pending, lastIntent: 'confirm-context-update' });
      const details = [Object.keys(clientPatch).length ? `client : ${describePatch('client', clientPatch)}` : '', Object.keys(vehiclePatch).length ? `véhicule : ${describePatch('vehicle', vehiclePatch)}` : ''].filter(Boolean).join(' ; ');
      return { type: 'intelligence-confirmation', answer: `J’ai compris la mise à jour suivante — ${details}. Dois-je l’enregistrer ?`, data: { pending }, actions: [{ label: 'Oui, enregistrer', command: 'Oui, confirme' }, { label: 'Non', command: 'Non, annule' }] };
    }
  }

  if (/^(?:ouvre|retrouve|cherche|affiche)\b/i.test(normalized)) {
    const clients = rankClient(store, text);
    const directVehicle = rankVehicle(store, text);
    if (directVehicle[0]?.score >= 70) {
      const vehicle = directVehicle[0].record;
      const client = safeList(store, 'clients').find((item) => item.id === vehicle.clientId) || null;
      saveState(user, { clientId: client?.id || '', vehicleId: vehicle.id, quoteId: '', interventionId: '', lastIntent: 'smart-open-vehicle' });
      return { type: 'intelligence-dossier', answer: `J’ai ouvert ${client?.name || 'le client'} et sélectionné ${[vehicle.brand, vehicle.model, vehicle.registration].filter(Boolean).join(' ')}.`, data: { client, vehicle, vehicles: client ? safeList(store, 'vehicles').filter((item) => item.clientId === client.id) : [vehicle] } };
    }
    if (clients[0]?.score >= 45) {
      if (clients[1] && clients[0].score - clients[1].score < 8) {
        return { type: 'intelligence-clarification', answer: `J’ai trouvé plusieurs clients proches. Lequel souhaitez-vous ouvrir ?`, data: { candidates: clients.slice(0, 4).map((item) => item.record) }, actions: clients.slice(0, 4).map((item) => ({ label: item.record.name, command: `Ouvre la fiche de ${item.record.name}` })) };
      }
      const client = clients[0].record;
      const vehicles = safeList(store, 'vehicles').filter((item) => item.clientId === client.id);
      const vehicle = vehicles.length === 1 ? vehicles[0] : null;
      saveState(user, { clientId: client.id, vehicleId: vehicle?.id || '', quoteId: '', interventionId: '', lastIntent: 'smart-open-client' });
      return { type: 'intelligence-dossier', answer: `Dossier ouvert : ${client.name}. ${vehicles.length} véhicule(s) rattaché(s)${vehicle ? `, ${vehicle.brand || ''} ${vehicle.model || ''} sélectionné automatiquement` : ''}.`, data: { client, vehicle, vehicles }, actions: [{ label: 'Champs manquants', command: 'Quels champs manquent dans le dossier courant ?' }, { label: 'Ajouter un véhicule', command: 'Ajoute un véhicule à ce client' }] };
    }
  }

  return null;
}

module.exports = {
  MEMORY_FILE,
  getState,
  saveState,
  linkedContext,
  extractFacts,
  handle,
  enrich,
  proactiveAlerts,
  rankClient,
  rankVehicle
};
