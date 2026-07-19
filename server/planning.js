'use strict';

const crypto = require('node:crypto');

const WORKSHOP_CAPACITY = Math.max(1, Number(process.env.GCOS_WORKSHOP_CAPACITY || 1));
const INSPECTION_SLOTS = ['10:00', '15:00'];
const DAY_START = '08:30';
const DAY_END = '17:00';

function text(value) { return String(value || '').trim(); }
function isoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
function addDays(value, days) { const date = new Date(`${isoDate(value)}T12:00:00`); date.setDate(date.getDate() + Number(days || 0)); return date; }
function isWorkday(value) { const day = new Date(`${isoDate(value)}T12:00:00`).getDay(); return day !== 0 && day !== 6; }
function nextWorkday(value) { let cursor = addDays(value, 1); while (!isWorkday(cursor)) cursor = addDays(cursor, 1); return cursor; }
function workdayRange(start, durationDays) {
  const dates = [];
  let cursor = new Date(`${isoDate(start)}T12:00:00`);
  while (dates.length < Math.max(1, Number(durationDays || 1))) {
    if (isWorkday(cursor)) dates.push(isoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}
function dateRange(start, end) {
  const out = [];
  let cursor = new Date(`${isoDate(start)}T12:00:00`);
  const last = new Date(`${isoDate(end || start)}T12:00:00`);
  while (cursor <= last) { out.push(isoDate(cursor)); cursor = addDays(cursor, 1); }
  return out;
}
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function activeStatus(value) { return !/annul|archiv|refus/i.test(text(value)); }

function occupiedCounts(store, ignoreQuoteId = '') {
  const counts = new Map();
  const add = (date) => { if (date) counts.set(date, (counts.get(date) || 0) + 1); };
  for (const intervention of safeList(store, 'interventions')) {
    if (!activeStatus(intervention.status)) continue;
    const start = intervention.scheduledDate || intervention.estimatedStartDate;
    const end = intervention.estimatedEndDate || start;
    if (!start) continue;
    for (const date of dateRange(start, end)) if (isWorkday(date)) add(date);
  }
  for (const quote of safeList(store, 'quotes')) {
    if (quote.id === ignoreQuoteId || !activeStatus(quote.status)) continue;
    if (!/confirm|planifi|accept|acompte reçu|acompte recu/i.test(`${quote.planningStatus || ''} ${quote.workflowStatus || ''}`)) continue;
    const start = quote.estimatedStartDate;
    const end = quote.estimatedEndDate || start;
    if (!start) continue;
    for (const date of dateRange(start, end)) if (isWorkday(date)) add(date);
  }
  for (const block of safeList(store, 'planningBlocks')) {
    if (!activeStatus(block.status)) continue;
    for (const date of dateRange(block.startDate, block.endDate || block.startDate)) if (isWorkday(date)) add(date);
  }
  return counts;
}

function inspectionUsed(store, date, ignoreQuoteId = '') {
  return safeList(store, 'quotes')
    .filter((quote) => quote.id !== ignoreQuoteId && activeStatus(quote.status) && quote.inspectionDate === date)
    .map((quote) => quote.inspectionTime)
    .filter(Boolean);
}

function propose(store, input = {}) {
  if (input.expertRequired && !input.expertApproved) {
    return {
      blocked: true,
      reason: 'EXPERT_REVIEW_REQUIRED',
      status: 'Date à déterminer — nous recontactons le client après expertise.',
      inspection: null,
      intervention: null
    };
  }
  const durationDays = Math.max(1, Number(input.durationDays || 2));
  const ignoreQuoteId = text(input.quoteId);
  const earliest = isoDate(input.earliestDate || new Date());
  let inspectionDate = isWorkday(earliest) ? earliest : isoDate(nextWorkday(earliest));
  let inspectionTime = '';
  for (let attempt = 0; attempt < 90 && !inspectionTime; attempt += 1) {
    const used = inspectionUsed(store, inspectionDate, ignoreQuoteId);
    inspectionTime = INSPECTION_SLOTS.find((slot) => !used.includes(slot)) || '';
    if (!inspectionTime) inspectionDate = isoDate(nextWorkday(inspectionDate));
  }
  const occupied = occupiedCounts(store, ignoreQuoteId);
  let start = nextWorkday(inspectionDate);
  let dates = [];
  for (let attempt = 0; attempt < 240; attempt += 1) {
    dates = workdayRange(start, durationDays);
    if (dates.every((date) => (occupied.get(date) || 0) < WORKSHOP_CAPACITY)) break;
    start = nextWorkday(start);
    dates = [];
  }
  if (!dates.length) return { blocked: true, reason: 'NO_CAPACITY', status: 'Aucun créneau disponible dans la période calculée.' };
  const endDate = dates[dates.length - 1];
  const deliveryDate = isoDate(nextWorkday(endDate));
  return {
    blocked: false,
    capacity: WORKSHOP_CAPACITY,
    inspection: { date: inspectionDate, time: inspectionTime || INSPECTION_SLOTS[0], durationMinutes: 60, status: 'À confirmer' },
    intervention: {
      dropoffDate: isoDate(addDays(start, -1)),
      dropoffTime: '16:00',
      startDate: dates[0],
      startTime: DAY_START,
      endDate,
      endTime: DAY_END,
      deliveryDate,
      deliveryTime: '16:30',
      durationDays,
      status: 'Proposition — à valider'
    }
  };
}

function detectConflicts(store, schedule = {}, ignoreQuoteId = '') {
  const occupied = occupiedCounts(store, ignoreQuoteId);
  const dates = dateRange(schedule.startDate, schedule.endDate || schedule.startDate).filter(isWorkday);
  return dates.filter((date) => (occupied.get(date) || 0) >= WORKSHOP_CAPACITY);
}

function scheduleQuote(store, input = {}, user = {}) {
  const quote = safeList(store, 'quotes').find((item) => item.id === input.quoteId || item.number === input.quoteId);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  if ((quote.expertReviewRequired || quote.isHighValue || quote.isRareVehicle) && quote.expertReviewStatus !== 'Approuvée') {
    throw Object.assign(new Error('EXPERT_REVIEW_REQUIRED_BEFORE_SCHEDULING'), { status: 409 });
  }
  const startDate = isoDate(input.startDate);
  const endDate = isoDate(input.endDate || input.startDate);
  if (!startDate || !endDate) throw Object.assign(new Error('PLANNING_DATES_REQUIRED'), { status: 400 });
  const conflicts = detectConflicts(store, { startDate, endDate }, quote.id);
  if (conflicts.length && input.overrideConflict !== true) {
    const error = Object.assign(new Error('PLANNING_CONFLICT'), { status: 409 });
    error.conflicts = conflicts;
    throw error;
  }
  const patch = {
    inspectionDate: isoDate(input.inspectionDate || quote.inspectionDate),
    inspectionTime: text(input.inspectionTime || quote.inspectionTime || '10:00'),
    proposedDropoffDate: isoDate(input.dropoffDate || quote.proposedDropoffDate || addDays(startDate, -1)),
    proposedDropoffTime: text(input.dropoffTime || quote.proposedDropoffTime || '16:00'),
    estimatedStartDate: startDate,
    estimatedStartTime: text(input.startTime || quote.estimatedStartTime || DAY_START),
    estimatedEndDate: endDate,
    estimatedDeliveryDate: isoDate(input.deliveryDate || quote.estimatedDeliveryDate || nextWorkday(endDate)),
    estimatedDeliveryTime: text(input.deliveryTime || quote.estimatedDeliveryTime || '16:30'),
    planningStatus: input.confirmed === true ? 'Confirmé en interne' : 'Proposition enregistrée',
    planningValidatedBy: user.name || user.id || '',
    planningValidatedAt: new Date().toISOString(),
    planningConflictOverride: conflicts.length > 0,
    planningConflicts: conflicts
  };
  const updatedQuote = store.update('quotes', quote.id, patch);
  let intervention = quote.interventionId ? safeList(store, 'interventions').find((item) => item.id === quote.interventionId) : null;
  if (intervention) {
    intervention = store.update('interventions', intervention.id, {
      scheduledDate: startDate,
      estimatedStartDate: startDate,
      estimatedEndDate: endDate,
      estimatedDeliveryDate: patch.estimatedDeliveryDate,
      planningStatus: patch.planningStatus
    });
  }
  return { quote: updatedQuote, intervention, conflicts };
}

function createBlock(store, input = {}, user = {}) {
  const startDate = isoDate(input.startDate);
  const endDate = isoDate(input.endDate || input.startDate);
  if (!startDate || !endDate || !text(input.title)) throw Object.assign(new Error('PLANNING_BLOCK_FIELDS_REQUIRED'), { status: 400 });
  return store.create('planningBlocks', {
    title: text(input.title),
    type: text(input.type || 'Indisponibilité'),
    startDate,
    endDate,
    startTime: text(input.startTime || DAY_START),
    endTime: text(input.endTime || DAY_END),
    notes: text(input.notes),
    status: 'Active',
    createdBy: user.id || '',
    createdByName: user.name || ''
  });
}

function overview(store, input = {}) {
  const from = isoDate(input.from || new Date());
  const days = Math.max(7, Math.min(120, Number(input.days || 42)));
  const until = isoDate(addDays(from, days - 1));
  const events = [];
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const clientName = (id) => clients.find((item) => item.id === id)?.name || '';
  const vehicleLabel = (id) => {
    const vehicle = vehicles.find((item) => item.id === id) || {};
    return [vehicle.brand, vehicle.model, vehicle.registration].filter(Boolean).join(' · ');
  };
  const within = (date) => date && date >= from && date <= until;
  for (const quote of safeList(store, 'quotes')) {
    if (quote.inspectionDate && within(quote.inspectionDate)) events.push({ id: `inspection-${quote.id}`, date: quote.inspectionDate, time: quote.inspectionTime || '10:00', endTime: '', type: 'Inspection', status: quote.planningStatus || quote.status, title: `Inspection ${quote.number}`, client: clientName(quote.clientId), vehicle: vehicleLabel(quote.vehicleId), quoteId: quote.id, quoteNumber: quote.number });
    if (quote.estimatedStartDate && within(quote.estimatedStartDate)) events.push({ id: `quote-${quote.id}`, date: quote.estimatedStartDate, endDate: quote.estimatedEndDate, time: quote.estimatedStartTime || DAY_START, endTime: DAY_END, type: 'Intervention proposée', status: quote.planningStatus || quote.workflowStatus, title: quote.service || quote.number, client: clientName(quote.clientId), vehicle: vehicleLabel(quote.vehicleId), quoteId: quote.id, quoteNumber: quote.number });
    if (quote.estimatedDeliveryDate && within(quote.estimatedDeliveryDate)) events.push({ id: `delivery-${quote.id}`, date: quote.estimatedDeliveryDate, time: quote.estimatedDeliveryTime || '16:30', type: 'Livraison', status: quote.workflowStatus || quote.status, title: `Restitution ${quote.number}`, client: clientName(quote.clientId), vehicle: vehicleLabel(quote.vehicleId), quoteId: quote.id, quoteNumber: quote.number });
  }
  for (const intervention of safeList(store, 'interventions')) {
    const date = intervention.scheduledDate || intervention.estimatedStartDate;
    if (!within(date)) continue;
    events.push({ id: `intervention-${intervention.id}`, date, endDate: intervention.estimatedEndDate || date, time: intervention.arrivalTime || DAY_START, endTime: intervention.departureTime || DAY_END, type: 'Intervention', status: intervention.status, title: intervention.service || intervention.number, client: clientName(intervention.clientId), vehicle: vehicleLabel(intervention.vehicleId), interventionId: intervention.id, number: intervention.number });
  }
  for (const task of safeList(store, 'tasks')) if (within(task.dueDate) && task.status !== 'Terminée') events.push({ id: `task-${task.id}`, date: task.dueDate, time: '', type: 'Tâche', status: task.priority || task.status, title: task.title, assignee: task.assignee, taskId: task.id });
  for (const block of safeList(store, 'planningBlocks')) if (dateRange(block.startDate, block.endDate).some(within)) events.push({ id: `block-${block.id}`, date: block.startDate, endDate: block.endDate, time: block.startTime, endTime: block.endTime, type: block.type || 'Indisponibilité', status: block.status, title: block.title, notes: block.notes, blockId: block.id });
  events.sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  const unscheduledQuotes = safeList(store, 'quotes').filter((quote) => activeStatus(quote.status) && !quote.estimatedStartDate).map((quote) => ({ id: quote.id, number: quote.number, service: quote.service, client: clientName(quote.clientId), vehicle: vehicleLabel(quote.vehicleId), expertRequired: Boolean(quote.expertReviewRequired), expertReviewStatus: quote.expertReviewStatus || '' }));
  return { from, until, days, capacity: WORKSHOP_CAPACITY, businessHours: { morning: '08:30–12:00', afternoon: '13:30–17:00' }, events, unscheduledQuotes };
}

module.exports = { WORKSHOP_CAPACITY, INSPECTION_SLOTS, propose, overview, scheduleQuote, createBlock, detectConflicts, isoDate, nextWorkday, workdayRange };
