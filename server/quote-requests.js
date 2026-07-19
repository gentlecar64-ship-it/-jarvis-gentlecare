'use strict';

const crypto = require('node:crypto');
const quoteStudio = require('./quote-studio-service');
const procedures = require('./workshop-procedures');

function text(value) { return String(value || '').trim(); }
function digits(value) { return text(value).replace(/\D/g, ''); }
function registration(value) { return text(value).toUpperCase().replace(/\s+/g, '-'); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function meaningful(input = {}) {
  return ['clientName', 'email', 'mobile', 'brand', 'model', 'registration', 'service', 'targetPrice', 'vehicleNotes', 'voiceText'].some((key) => text(input[key]));
}
function sanitize(input = {}) {
  const vehicleType = procedures.normalizeType(input.vehicleType);
  return {
    clientId: text(input.clientId), vehicleId: text(input.vehicleId),
    clientName: text(input.clientName || input.name), email: text(input.email).toLowerCase(), mobile: text(input.mobile || input.phone), address: text(input.address), preferredChannel: text(input.preferredChannel || 'E-mail'),
    vehicleType, brand: text(input.brand), model: text(input.model), trim: text(input.trim), registration: registration(input.registration), year: text(input.year), color: text(input.color), mileage: Number(input.mileage || 0) || 0, vin: text(input.vin).toUpperCase(), photoUrl: text(input.photoUrl), vehicleNotes: text(input.vehicleNotes),
    customerType: text(input.customerType || 'particulier').toLowerCase() === 'professionnel' ? 'professionnel' : 'particulier',
    packageKey: text(input.packageKey), targetPrice: Number(input.targetPrice || 0) || 0, finalPrice: Number(input.finalPrice || 0) || 0, durationDays: Math.max(1, Number(input.durationDays || 1) || 1), service: text(input.service), tariffReason: text(input.tariffReason),
    specialOfferEnabled: input.specialOfferEnabled === true, specialOfferName: text(input.specialOfferName), standardPriceTtc: Number(input.standardPriceTtc || 0) || 0, discountPercent: Number(input.discountPercent || 0) || 0, discountAmountTtc: Number(input.discountAmountTtc || 0) || 0, directCostTtc: Number(input.directCostTtc || 0) || 0, targetMarginPercent: Number(input.targetMarginPercent || 0) || 0,
    marketValueAverage: Number(input.marketValueAverage || 0) || 0, marketValueSource: text(input.marketValueSource), currentConditionValue: Number(input.currentConditionValue || 0) || 0, currentValueSource: text(input.currentValueSource), postTreatmentValue: Number(input.postTreatmentValue || 0) || 0, postTreatmentValueSource: text(input.postTreatmentValueSource), clientEstimatedValue: Number(input.clientEstimatedValue || 0) || 0, expertCurrentValue: Number(input.expertCurrentValue || 0) || 0, expertPostTreatmentValue: Number(input.expertPostTreatmentValue || 0) || 0, expertName: text(input.expertName), expertReference: text(input.expertReference), preWorkConditionNotes: text(input.preWorkConditionNotes), expertReviewStatus: text(input.expertReviewStatus), earliestDate: text(input.earliestDate),
    voiceText: text(input.voiceText || input.text), source: text(input.source || 'Atelier Devis'), requestNotes: text(input.requestNotes),
    workshopProcedureKey: procedures.get(vehicleType).key,
    workshopProcedure: procedures.snapshot(vehicleType)
  };
}
function findClient(store, data) {
  const clients = safeList(store, 'clients');
  if (data.clientId) return clients.find((item) => item.id === data.clientId) || null;
  if (data.email) {
    const exact = clients.find((item) => text(item.email).toLowerCase() === data.email);
    if (exact) return exact;
  }
  const phone = digits(data.mobile);
  if (phone.length >= 6) {
    const exact = clients.find((item) => digits(item.mobile || item.phone) === phone);
    if (exact) return exact;
  }
  if (data.clientName) return clients.find((item) => text(item.name).toLowerCase() === data.clientName.toLowerCase()) || null;
  return null;
}
function findVehicle(store, data, clientId = '') {
  const vehicles = safeList(store, 'vehicles');
  if (data.vehicleId) return vehicles.find((item) => item.id === data.vehicleId) || null;
  if (data.registration) return vehicles.find((item) => registration(item.registration) === data.registration) || null;
  return vehicles.find((item) => item.clientId === clientId && data.brand && data.model && text(item.brand).toLowerCase() === data.brand.toLowerCase() && text(item.model).toLowerCase() === data.model.toLowerCase()) || null;
}
function syncDossier(store, data, user = {}) {
  let client = findClient(store, data);
  const hasClientData = Boolean(data.clientName || data.email || data.mobile || data.address);
  if (client && hasClientData) client = store.update('clients', client.id, { name: data.clientName || client.name, email: data.email || client.email, mobile: data.mobile || client.mobile || client.phone, address: data.address || client.address, preferredChannel: data.preferredChannel || client.preferredChannel, updatedBy: user.id || '', updatedByName: user.name || '' });
  else if (!client && hasClientData) client = store.create('clients', { name: data.clientName || 'Client à compléter', email: data.email, mobile: data.mobile, address: data.address, preferredChannel: data.preferredChannel, source: 'Demande de devis enregistrée', createdBy: user.id || '', createdByName: user.name || '' });
  let vehicle = findVehicle(store, data, client?.id || '');
  const hasVehicleData = Boolean(data.brand || data.model || data.registration || data.vin || data.vehicleNotes);
  if (vehicle && client && vehicle.clientId !== client.id) throw Object.assign(new Error('REGISTRATION_ALREADY_ATTACHED_TO_ANOTHER_CLIENT'), { status: 409 });
  if (vehicle && hasVehicleData) vehicle = store.update('vehicles', vehicle.id, { clientId: client?.id || vehicle.clientId, vehicleType: data.vehicleType, brand: data.brand || vehicle.brand, model: data.model || vehicle.model, trim: data.trim || vehicle.trim, registration: data.registration || vehicle.registration, year: data.year || vehicle.year, color: data.color || vehicle.color, mileage: data.mileage || vehicle.mileage, vin: data.vin || vehicle.vin, photoUrl: data.photoUrl || vehicle.photoUrl, notes: data.vehicleNotes || vehicle.notes, workshopProcedureKey: data.workshopProcedureKey });
  else if (!vehicle && client && hasVehicleData) vehicle = store.create('vehicles', { clientId: client.id, vehicleType: data.vehicleType, brand: data.brand, model: data.model, trim: data.trim, registration: data.registration, year: data.year, color: data.color, mileage: data.mileage, vin: data.vin, photoUrl: data.photoUrl, notes: data.vehicleNotes, workshopProcedureKey: data.workshopProcedureKey });
  return { client, vehicle };
}
function resolve(store, id) { return safeList(store, 'quoteRequests').find((item) => item.id === id || item.number === id) || null; }
function saveDraft(store, input = {}, user = {}) {
  const data = sanitize(input);
  if (!meaningful(data)) throw Object.assign(new Error('QUOTE_REQUEST_EMPTY'), { status: 400 });
  const dossier = syncDossier(store, data, user);
  const patch = { ...data, clientId: dossier.client?.id || data.clientId, vehicleId: dossier.vehicle?.id || data.vehicleId, status: input.status || 'Brouillon enregistré', requestedByUserId: user.id || '', requestedByName: user.name || user.username || '', requestedByRole: user.role || '', lastSavedAt: new Date().toISOString() };
  let request = input.requestId ? resolve(store, input.requestId) : null;
  if (request && request.requestedByUserId !== user.id && !['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('QUOTE_REQUEST_FORBIDDEN'), { status: 403 });
  request = request ? store.update('quoteRequests', request.id, patch) : store.create('quoteRequests', { ...patch, requestToken: crypto.randomUUID() });
  return { request, client: dossier.client, vehicle: dossier.vehicle };
}
function submit(store, input = {}, user = {}) {
  const saved = saveDraft(store, { ...input, status: 'Analyse Jarvis en cours' }, user);
  const proposal = quoteStudio.preview(store, { ...saved.request, text: saved.request.voiceText, source: 'Demande de devis employé' }, user);
  const updated = store.update('quoteRequests', saved.request.id, { status: 'Proposition Jarvis à valider par la direction', submittedAt: new Date().toISOString(), jarvisProposal: proposal, jarvisQuoteText: proposal.quoteText, validationRequired: true, directionDecision: 'En attente' });
  store.create('tasks', { title: `Valider la demande de devis ${updated.number || updated.id}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', quoteRequestId: updated.id, clientId: updated.clientId, vehicleId: updated.vehicleId, instructions: 'Contrôler le véhicule, la procédure automobile ou moto, le tarif, la marge, l’offre spéciale éventuelle, puis créer ou refuser le devis.' });
  return { request: updated, proposal, client: saved.client, vehicle: saved.vehicle };
}
function list(store, user = {}) {
  const records = safeList(store, 'quoteRequests').sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  return ['admin', 'associate'].includes(user.role) ? records : records.filter((item) => item.requestedByUserId === user.id);
}
function markDecision(store, id, input = {}, user = {}) {
  if (!['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('QUOTE_REQUEST_DIRECTION_REQUIRED'), { status: 403 });
  const request = resolve(store, id);
  if (!request) throw Object.assign(new Error('QUOTE_REQUEST_NOT_FOUND'), { status: 404 });
  const decision = text(input.decision || 'À revoir');
  return store.update('quoteRequests', request.id, { directionDecision: decision, directionComment: text(input.comment), directionDecidedAt: new Date().toISOString(), directionDecidedBy: user.name || user.id || '', status: decision === 'Refusée' ? 'Refusée par la direction' : 'Validée pour création du devis' });
}

module.exports = { sanitize, saveDraft, submit, list, resolve, markDecision, syncDossier };
