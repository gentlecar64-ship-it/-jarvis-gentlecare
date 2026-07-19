'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const procedures = require('./workshop-procedures');
const employeeFlow = require('./employee-flow');

const PUBLIC_DIR = path.join(__dirname, 'public');
const EVIDENCE_DIR = path.join(PUBLIC_DIR, 'generated', 'workshop');
const DIRECTION_ROLES = new Set(['admin', 'associate']);

function now() { return new Date().toISOString(); }
function text(value) { return String(value || '').trim(); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function direction(user = {}) { return DIRECTION_ROLES.has(user.role); }
function resolve(store, collection, reference) {
  return safeList(store, collection).find((item) => item.id === reference || item.number === reference) || null;
}
function stageFor(label, index, total) {
  const value = text(label).toLowerCase();
  if (/identifier|photograph.*réception|reception|réserves|client.*zones/.test(value)) return '1. Réception et état d’entrée';
  if (/sécuriser|stabiliser|déposer|retirer|protéger|consignation|autorisation|accès|balisage/.test(value)) return '2. Préparation et sécurité';
  if (/essai|traiter|cryo|pression|buse|glace|compatibilité/.test(value)) return '3. Traitement cryogénique';
  if (/dinitrol|anticorrosion|masquer|corps creux|produits|lots|séchage|protection compatible/.test(value)) return '4. Protection et traçabilité';
  if (/remonter|serrer/.test(value)) return '5. Remontage et contrôle mécanique';
  if (/contrôle final|rapport|avant\/après|avant après|traçabilité spécifique/.test(value) || index === total - 1) return '6. Contrôle final et rapport';
  return index < Math.ceil(total * .3) ? '2. Préparation et sécurité' : index < Math.ceil(total * .72) ? '3. Traitement cryogénique' : '4. Protection et traçabilité';
}
function stepId(index) { return `ETAPE-${String(index + 1).padStart(2, '0')}`; }
function buildSteps(procedure) {
  const checklist = Array.isArray(procedure?.checklist) ? procedure.checklist : [];
  return checklist.map((label, index) => ({
    id: stepId(index), order: index + 1, stage: stageFor(label, index, checklist.length), label,
    status: 'À faire', mandatory: true,
    evidenceRequired: /photo|photograph|document|tracer|rapport|consigner|autorisation/i.test(label),
    evidence: [], note: '', startedAt: '', completedAt: '', completedByUserId: '', completedByName: ''
  }));
}
function procedureFor(quote = {}, vehicle = {}, intervention = {}) {
  return intervention.workshopProcedure || quote.workshopProcedure || procedures.snapshot(intervention.requestCategory || quote.requestCategory || quote.vehicleType || vehicle.requestCategory || vehicle.vehicleType || 'autre');
}
function progress(steps = []) {
  const total = steps.length;
  const completed = steps.filter((step) => step.status === 'Terminée').length;
  return { total, completed, percent: total ? Math.round(completed * 100 / total) : 0, remaining: Math.max(0, total - completed) };
}
function enrich(store, intervention) {
  const quote = resolve(store, 'quotes', intervention.quoteId) || {};
  const vehicle = resolve(store, 'vehicles', intervention.vehicleId) || {};
  const client = resolve(store, 'clients', intervention.clientId) || {};
  const steps = Array.isArray(intervention.procedureSteps) ? intervention.procedureSteps : [];
  return { ...intervention, quote, vehicle, client, progress: progress(steps), canStart: intervention.workshopLocked !== true && steps.slice(0, 3).every((step) => step.status === 'Terminée'), canComplete: steps.length > 0 && steps.every((step) => !step.mandatory || step.status === 'Terminée') };
}
function ensureProcedure(store, intervention, quote = {}, vehicle = {}, user = {}) {
  const procedure = procedureFor(quote, vehicle, intervention);
  if (!procedure) throw Object.assign(new Error('WORKSHOP_PROCEDURE_NOT_FOUND'), { status: 409 });
  const patch = {};
  if (!intervention.workshopProcedureKey) patch.workshopProcedureKey = procedure.key;
  if (!intervention.workshopProcedure) patch.workshopProcedure = procedure;
  if (!Array.isArray(intervention.procedureSteps) || !intervention.procedureSteps.length) patch.procedureSteps = buildSteps(procedure);
  if (!intervention.requestCategory) patch.requestCategory = procedure.requestCategory || quote.requestCategory || vehicle.requestCategory || 'autre';
  if (!intervention.procedureVersion) patch.procedureVersion = procedure.version || '1.0';
  if (!intervention.procedurePreparedAt) patch.procedurePreparedAt = now();
  if (!intervention.procedurePreparedByName) patch.procedurePreparedByName = user.name || 'MAVIK';
  return Object.keys(patch).length ? store.update('interventions', intervention.id, patch) : intervention;
}
function prepareAcceptedQuote(store, quoteReference, user = {}) {
  let quote = typeof quoteReference === 'object' ? quoteReference : resolve(store, 'quotes', quoteReference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const vehicle = resolve(store, 'vehicles', quote.vehicleId) || {};
  const client = resolve(store, 'clients', quote.clientId) || {};
  const procedure = procedureFor(quote, vehicle, {});
  if (!procedure) throw Object.assign(new Error('WORKSHOP_PROCEDURE_NOT_FOUND'), { status: 409 });
  let intervention = quote.interventionId ? resolve(store, 'interventions', quote.interventionId) : safeList(store, 'interventions').find((item) => item.quoteId === quote.id);
  const depositReceived = Boolean(quote.depositReceivedAt || quote.paymentStatus === 'Acompte reçu' || quote.workflowStatus === 'Acompte reçu' || quote.workflowStatus === 'Intervention planifiée');
  if (!intervention) {
    intervention = store.create('interventions', {
      vehicleId: quote.vehicleId, clientId: quote.clientId, quoteId: quote.id,
      service: quote.service, status: depositReceived ? 'Planifiée' : 'Préparation atelier — acompte en attente',
      workStatus: 'À préparer', workflowStatus: depositReceived ? 'Intervention planifiée' : 'Devis accepté — préparation atelier',
      scheduledDate: quote.estimatedStartDate || '', estimatedStartDate: quote.estimatedStartDate || '', estimatedEndDate: quote.estimatedEndDate || '', estimatedDeliveryDate: quote.estimatedDeliveryDate || '',
      requestCategory: quote.requestCategory || vehicle.requestCategory || procedure.requestCategory,
      workshopProcedureKey: procedure.key, workshopProcedure: procedure, procedureVersion: procedure.version,
      procedureSteps: buildSteps(procedure), procedurePreparedAt: now(), procedurePreparedByName: user.name || 'MAVIK',
      workshopLocked: !depositReceived, startAllowed: depositReceived, depositReceived,
      technician: quote.technician || '', createdBy: user.id || '', createdByName: user.name || 'MAVIK'
    });
    quote = store.update('quotes', quote.id, { interventionId: intervention.id, workshopStatus: intervention.status, workshopProcedureKey: procedure.key });
  } else {
    intervention = ensureProcedure(store, intervention, quote, vehicle, user);
    const patch = {};
    if (depositReceived && intervention.workshopLocked !== false) Object.assign(patch, { workshopLocked: false, startAllowed: true, depositReceived: true, status: intervention.status === 'Préparation atelier — acompte en attente' ? 'Planifiée' : intervention.status, workflowStatus: 'Intervention planifiée' });
    if (Object.keys(patch).length) intervention = store.update('interventions', intervention.id, patch);
    if (quote.interventionId !== intervention.id) quote = store.update('quotes', quote.id, { interventionId: intervention.id });
  }
  return { quote, intervention: enrich(store, intervention), client, vehicle, procedure };
}
function unlockAfterDeposit(store, quoteReference, user = {}) {
  const prepared = prepareAcceptedQuote(store, quoteReference, user);
  let intervention = store.update('interventions', prepared.intervention.id, {
    workshopLocked: false, startAllowed: true, depositReceived: true, depositReceivedAt: now(),
    status: 'Planifiée', workStatus: 'À préparer', workflowStatus: 'Intervention planifiée',
    scheduledDate: prepared.quote.estimatedStartDate || prepared.intervention.scheduledDate,
    estimatedStartDate: prepared.quote.estimatedStartDate || prepared.intervention.estimatedStartDate,
    estimatedEndDate: prepared.quote.estimatedEndDate || prepared.intervention.estimatedEndDate,
    estimatedDeliveryDate: prepared.quote.estimatedDeliveryDate || prepared.intervention.estimatedDeliveryDate
  });
  return { ...prepared, intervention: enrich(store, intervention) };
}
function restoreAcceptedQuotes(store, user = {}) {
  const candidates = safeList(store, 'quotes').filter((quote) => /accept|acompte reçu|intervention planifiée/i.test(`${quote.status} ${quote.workflowStatus}`));
  const restored = [];
  for (const quote of candidates) {
    try { restored.push(prepareAcceptedQuote(store, quote, user).intervention); }
    catch (error) { restored.push({ quoteId: quote.id, error: error.message }); }
  }
  return { total: candidates.length, restored };
}
function overview(store, user = {}) {
  const records = safeList(store, 'interventions')
    .filter((item) => !/archiv|clôtur|annul/i.test(`${item.status} ${item.workflowStatus}`))
    .map((item) => enrich(store, item))
    .filter((item) => direction(user) || employeeFlow.userMatches(item, user) || !item.technician)
    .sort((a, b) => String(a.estimatedStartDate || a.scheduledDate || '9999').localeCompare(String(b.estimatedStartDate || b.scheduledDate || '9999')));
  return {
    records,
    summary: {
      total: records.length,
      waitingDeposit: records.filter((item) => item.workshopLocked).length,
      ready: records.filter((item) => !item.workshopLocked && item.workStatus !== 'En cours').length,
      active: records.filter((item) => item.workStatus === 'En cours' || item.status === 'En cours').length,
      finalValidation: records.filter((item) => item.procedureStatus === 'Contrôle final à valider').length
    },
    policy: { acceptedQuoteCreatesWorkshopFile: true, depositRequiredToStart: true, sequentialReceptionGate: true, directionFinalValidation: true }
  };
}
function detail(store, reference, user = {}) {
  const intervention = resolve(store, 'interventions', reference);
  if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_FOUND'), { status: 404 });
  if (!direction(user) && intervention.technician && !employeeFlow.userMatches(intervention, user)) throw Object.assign(new Error('INTERVENTION_FORBIDDEN'), { status: 403 });
  return enrich(store, ensureProcedure(store, intervention, resolve(store, 'quotes', intervention.quoteId) || {}, resolve(store, 'vehicles', intervention.vehicleId) || {}, user));
}
function assign(store, reference, input = {}, user = {}) {
  const intervention = detail(store, reference, user);
  const technician = text(input.technician || user.name || user.username);
  if (!technician) throw Object.assign(new Error('TECHNICIAN_REQUIRED'), { status: 400 });
  if (!direction(user) && technician !== text(user.name || user.username)) throw Object.assign(new Error('ASSIGNMENT_DIRECTION_REQUIRED'), { status: 403 });
  return enrich(store, store.update('interventions', intervention.id, { technician, technicianId: input.technicianId || user.id || '', assignedAt: now(), assignedByName: user.name || '' }));
}
function reception(store, reference, input = {}, user = {}) {
  let intervention = detail(store, reference, user);
  const mileage = Number(input.mileage || intervention.mileage || 0);
  const notes = text(input.notes || input.entryNotes);
  intervention = store.update('interventions', intervention.id, {
    receivedAt: intervention.receivedAt || now(), receivedByUserId: user.id || '', receivedByName: user.name || '',
    mileage, entryNotes: notes, clientReservations: text(input.clientReservations), keysReceived: input.keysReceived !== false,
    status: intervention.workshopLocked ? 'Réceptionné — acompte en attente' : 'Réceptionné — préparation', workStatus: 'À préparer'
  });
  return enrich(store, intervention);
}
function updateStep(store, reference, stepReference, input = {}, user = {}) {
  let intervention = detail(store, reference, user);
  const steps = [...(intervention.procedureSteps || [])];
  const index = steps.findIndex((step) => step.id === stepReference || String(step.order) === String(stepReference));
  if (index < 0) throw Object.assign(new Error('WORKSHOP_STEP_NOT_FOUND'), { status: 404 });
  const complete = input.complete !== false && input.status !== 'À faire';
  if (complete && intervention.workshopLocked) throw Object.assign(new Error('WORKSHOP_DEPOSIT_REQUIRED'), { status: 409 });
  const current = steps[index];
  steps[index] = {
    ...current,
    status: complete ? 'Terminée' : 'À faire',
    note: text(input.note !== undefined ? input.note : current.note),
    startedAt: current.startedAt || (complete ? now() : ''),
    completedAt: complete ? now() : '',
    completedByUserId: complete ? (user.id || '') : '', completedByName: complete ? (user.name || user.username || '') : ''
  };
  intervention = store.update('interventions', intervention.id, { procedureSteps: steps, procedureProgress: progress(steps), lastProcedureActionAt: now(), lastProcedureActionByName: user.name || '' });
  return enrich(store, intervention);
}
function saveEvidence(store, reference, stepReference, input = {}, user = {}) {
  let intervention = detail(store, reference, user);
  const dataUrl = String(input.dataUrl || '');
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw Object.assign(new Error('WORKSHOP_EVIDENCE_FORMAT_INVALID'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8_000_000) throw Object.assign(new Error('WORKSHOP_EVIDENCE_TOO_LARGE'), { status: 413 });
  const steps = [...(intervention.procedureSteps || [])];
  const index = steps.findIndex((step) => step.id === stepReference || String(step.order) === String(stepReference));
  if (index < 0) throw Object.assign(new Error('WORKSHOP_STEP_NOT_FOUND'), { status: 404 });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const filename = `${intervention.number || intervention.id}-${steps[index].id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`.replace(/[^A-Za-z0-9_.-]/g, '-');
  fs.writeFileSync(path.join(EVIDENCE_DIR, filename), buffer);
  const url = `/generated/workshop/${filename}`;
  const evidence = { id: crypto.randomUUID(), url, title: text(input.title || input.fileName || 'Photo atelier'), note: text(input.note), createdAt: now(), createdByUserId: user.id || '', createdByName: user.name || '' };
  steps[index] = { ...steps[index], evidence: [...(steps[index].evidence || []), evidence] };
  store.create('photos', { title: `${intervention.number} — ${steps[index].id}`, url, category: 'Preuve atelier', interventionId: intervention.id, vehicleId: intervention.vehicleId, quoteId: intervention.quoteId, stepId: steps[index].id, createdBy: user.id || '', createdByName: user.name || '' });
  intervention = store.update('interventions', intervention.id, { procedureSteps: steps, lastProcedureActionAt: now(), lastProcedureActionByName: user.name || '' });
  return { intervention: enrich(store, intervention), evidence };
}
function validateStart(store, reference, user = {}) {
  const intervention = detail(store, reference, user);
  if (intervention.workshopLocked) throw Object.assign(new Error('WORKSHOP_DEPOSIT_REQUIRED'), { status: 409 });
  const receptionSteps = (intervention.procedureSteps || []).slice(0, 3);
  const missing = receptionSteps.filter((step) => step.status !== 'Terminée').map((step) => step.label);
  if (missing.length) throw Object.assign(new Error('WORKSHOP_RECEPTION_INCOMPLETE'), { status: 409, missingFields: missing });
  return intervention;
}
function workAction(store, reference, input = {}, user = {}) {
  const action = text(input.action).toLowerCase();
  if (['start', 'resume', 'switch'].includes(action)) validateStart(store, reference, user);
  return employeeFlow.act(store, { ...input, targetType: 'intervention', targetId: reference }, user);
}
function requestFinalValidation(store, reference, input = {}, user = {}) {
  let intervention = detail(store, reference, user);
  const missing = (intervention.procedureSteps || []).filter((step) => step.mandatory && step.status !== 'Terminée');
  if (missing.length) throw Object.assign(new Error('WORKSHOP_PROCEDURE_INCOMPLETE'), { status: 409, missingFields: missing.map((step) => `${step.id} — ${step.label}`) });
  intervention = store.update('interventions', intervention.id, {
    procedureStatus: 'Contrôle final à valider', finalValidationRequestedAt: now(), finalValidationRequestedByUserId: user.id || '', finalValidationRequestedByName: user.name || '',
    finalNotes: text(input.finalNotes), workStatus: 'En attente', status: 'Contrôle final à valider', workstationReleased: true
  });
  const existing = safeList(store, 'tasks').find((task) => task.interventionId === intervention.id && /contrôle final atelier/i.test(task.title || '') && task.status !== 'Terminée');
  if (!existing) store.create('tasks', { title: `Valider le contrôle final atelier — ${intervention.number}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', interventionId: intervention.id, quoteId: intervention.quoteId, clientId: intervention.clientId, vehicleId: intervention.vehicleId, instructions: 'Contrôler la procédure, les preuves, les réserves et autoriser la génération du rapport.' });
  return enrich(store, intervention);
}
function approveFinal(store, reference, input = {}, user = {}) {
  if (!direction(user)) throw Object.assign(new Error('WORKSHOP_DIRECTION_VALIDATION_REQUIRED'), { status: 403 });
  let intervention = detail(store, reference, user);
  if (intervention.procedureStatus !== 'Contrôle final à valider') throw Object.assign(new Error('WORKSHOP_FINAL_VALIDATION_NOT_REQUESTED'), { status: 409 });
  intervention = store.update('interventions', intervention.id, {
    procedureStatus: 'Validée par la direction', finalApprovedAt: now(), finalApprovedByUserId: user.id || '', finalApprovedByName: user.name || user.username || '', finalApprovalNote: text(input.note)
  });
  for (const task of safeList(store, 'tasks').filter((item) => item.interventionId === intervention.id && /contrôle final atelier/i.test(item.title || '') && item.status !== 'Terminée')) store.update('tasks', task.id, { status: 'Terminée', completedAt: now(), result: `Validé par ${user.name || user.username || 'Direction'}.` });
  return enrich(store, intervention);
}
function assertCompletable(store, reference, user = {}) {
  const intervention = detail(store, reference, user);
  const missing = (intervention.procedureSteps || []).filter((step) => step.mandatory && step.status !== 'Terminée');
  if (missing.length) throw Object.assign(new Error('WORKSHOP_PROCEDURE_INCOMPLETE'), { status: 409, missingFields: missing.map((step) => step.label) });
  if (intervention.procedureStatus !== 'Validée par la direction') throw Object.assign(new Error('WORKSHOP_DIRECTION_VALIDATION_REQUIRED'), { status: 409 });
  return intervention;
}

module.exports = {
  buildSteps, progress, prepareAcceptedQuote, unlockAfterDeposit, restoreAcceptedQuotes, overview, detail, assign, reception, updateStep, saveEvidence,
  validateStart, workAction, requestFinalValidation, approveFinal, assertCompletable
};
