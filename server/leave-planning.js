'use strict';

const fs = require('node:fs');
const auth = require('./auth');

function text(value) { return String(value || '').trim(); }
function isoDate(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function addDays(value, amount) { const normalized = isoDate(value); if (!normalized) return ''; const date = new Date(`${normalized}T12:00:00`); date.setDate(date.getDate() + Number(amount || 0)); return isoDate(date); }
function eachDate(start, end) { const first = isoDate(start); const last = isoDate(end); if (!first || !last) return []; const out = []; for (let cursor = first; cursor && cursor <= last; cursor = addDays(cursor, 1)) out.push(cursor); return out; }
function workdays(start, end) { return eachDate(start, end).filter((value) => ![0, 6].includes(new Date(`${value}T12:00:00`).getDay())); }
function overlaps(aStart, aEnd, bStart, bEnd) { const a1 = isoDate(aStart); const a2 = isoDate(aEnd || aStart); const b1 = isoDate(bStart); const b2 = isoDate(bEnd || bStart); return Boolean(a1 && a2 && b1 && b2 && a1 <= b2 && b1 <= a2); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function readUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(auth.USERS_FILE, 'utf8'));
    return (Array.isArray(parsed) ? parsed : []).filter((user) => user && user.active !== false).map((user) => ({ id: String(user.id || ''), name: String(user.name || user.username || ''), role: String(user.role || 'trainee') })).filter((user) => user.id);
  } catch { return []; }
}
function assignedTo(record, user) {
  const idMatch = [record.assigneeId, record.technicianId, record.activeByUserId].filter(Boolean).map(String).includes(String(user.id || ''));
  const name = text(user.name || user.username).toLowerCase();
  const nameMatch = [record.assignee, record.technician, record.activeByName].filter(Boolean).map((value) => text(value).toLowerCase()).includes(name);
  return idMatch || nameMatch;
}
function statusActive(value) { return !/annul|archiv|refus|termin|livr/i.test(text(value)); }
function canValidate(user) { return ['admin', 'associate'].includes(user.role); }

function advice(store, input = {}, user = {}) {
  const startDate = isoDate(input.startDate);
  const endDate = isoDate(input.endDate || input.startDate);
  if (!startDate || !endDate || endDate < startDate) throw Object.assign(new Error('LEAVE_DATES_INVALID'), { status: 400 });
  const dates = workdays(startDate, endDate);
  if (!dates.length) return { decision: 'favorable', principleStatus: 'Accord de principe favorable', score: 100, startDate, endDate, workdays: 0, reasons: ['La période ne contient aucun jour ouvré.'], warnings: [], finalValidationRequired: true };

  const interventions = safeList(store, 'interventions').filter((item) => statusActive(item.status) && assignedTo(item, user) && overlaps(item.scheduledDate || item.estimatedStartDate, item.estimatedEndDate || item.scheduledDate || item.estimatedStartDate, startDate, endDate));
  const tasks = safeList(store, 'tasks').filter((item) => statusActive(item.status) && assignedTo(item, user) && item.dueDate && item.dueDate >= startDate && item.dueDate <= endDate);
  const requests = safeList(store, 'leaveRequests').filter((request) => request.employeeId !== user.id && !/refus|annul/i.test(request.status || '') && overlaps(request.startDate, request.endDate, startDate, endDate));
  const users = readUsers();
  const operational = users.filter((item) => ['admin', 'associate', 'technician', 'trainee'].includes(item.role));
  const approvedAbsentIds = new Set(requests.filter((request) => /approuv|valid/i.test(request.status || '')).map((request) => request.employeeId));
  const remainingCoverage = operational.filter((item) => item.id !== user.id && !approvedAbsentIds.has(item.id));
  const workshopEvents = safeList(store, 'interventions').filter((item) => statusActive(item.status) && overlaps(item.scheduledDate || item.estimatedStartDate, item.estimatedEndDate || item.scheduledDate || item.estimatedStartDate, startDate, endDate));
  const loadRatio = Math.min(1, workshopEvents.length / Math.max(1, dates.length));

  let score = 100;
  const reasons = [];
  const warnings = [];
  if (interventions.length) { score -= Math.min(55, 25 + interventions.length * 10); warnings.push(`${interventions.length} intervention(s) vous sont affectée(s) pendant la période.`); }
  if (tasks.length) { score -= Math.min(30, 10 + tasks.length * 5); warnings.push(`${tasks.length} tâche(s) arrivent à échéance pendant la période.`); }
  if (requests.length) { score -= Math.min(35, 15 + requests.length * 10); warnings.push(`${requests.length} autre demande ou congé chevauche cette période.`); }
  if (remainingCoverage.length === 0 && operational.length > 1) { score -= 60; warnings.push('Aucune couverture opérationnelle suffisante ne resterait sur la période.'); }
  else if (remainingCoverage.length === 1 && operational.length >= 3) { score -= 20; warnings.push('La couverture de l’atelier serait réduite à une seule personne opérationnelle.'); }
  if (loadRatio >= 0.8) { score -= 25; warnings.push('La charge atelier est élevée sur cette période.'); }
  else if (loadRatio <= 0.25) reasons.push('La charge atelier paraît faible sur cette période.');
  if (!interventions.length && !tasks.length) reasons.push('Aucune intervention ni tâche personnelle bloquante n’est détectée.');
  if (!requests.length) reasons.push('Aucun autre congé chevauchant n’est enregistré.');
  score = Math.max(0, Math.min(100, score));
  const decision = score >= 75 ? 'favorable' : score >= 45 ? 'reserve' : 'defavorable';
  const principleStatus = decision === 'favorable' ? 'Accord de principe favorable' : decision === 'reserve' ? 'Accord de principe réservé' : 'Accord de principe défavorable';
  return { decision, principleStatus, score, startDate, endDate, workdays: dates.length, reasons, warnings, finalValidationRequired: true, metrics: { assignedInterventions: interventions.length, assignedTasks: tasks.length, overlappingLeaves: requests.length, remainingOperationalCoverage: remainingCoverage.length, workshopLoadRatio: loadRatio } };
}

function submit(store, input = {}, user = {}) {
  const result = advice(store, input, user);
  const duplicate = safeList(store, 'leaveRequests').find((request) => request.employeeId === user.id && !/refus|annul/i.test(request.status || '') && request.startDate === result.startDate && request.endDate === result.endDate);
  if (duplicate) throw Object.assign(new Error('LEAVE_REQUEST_ALREADY_EXISTS'), { status: 409 });
  const request = store.create('leaveRequests', {
    employeeId: user.id || '', employeeName: user.name || user.username || '', employeeRole: user.role || '',
    startDate: result.startDate, endDate: result.endDate, workdays: result.workdays,
    reason: text(input.reason), principleStatus: result.principleStatus, principleScore: result.score,
    principleDecision: result.decision, adviceSnapshot: result,
    status: 'En attente de validation', requestedAt: new Date().toISOString(),
    validatedBy: '', validatedAt: '', managerComment: ''
  });
  return { request, advice: result };
}

function decide(store, id, input = {}, user = {}) {
  if (!canValidate(user)) throw Object.assign(new Error('LEAVE_MANAGER_VALIDATION_REQUIRED'), { status: 403 });
  const request = safeList(store, 'leaveRequests').find((item) => item.id === id);
  if (!request) throw Object.assign(new Error('LEAVE_REQUEST_NOT_FOUND'), { status: 404 });
  if (request.status !== 'En attente de validation') throw Object.assign(new Error('LEAVE_REQUEST_ALREADY_DECIDED'), { status: 409 });
  const approved = input.approved === true || /approve|approuv|valid/i.test(text(input.decision));
  const status = approved ? 'Approuvé' : 'Refusé';
  const updated = store.update('leaveRequests', request.id, { status, validatedBy: user.name || user.id || '', validatedByUserId: user.id || '', validatedAt: new Date().toISOString(), managerComment: text(input.comment) });
  let block = null;
  if (approved) {
    const existing = safeList(store, 'planningBlocks').find((item) => item.leaveRequestId === request.id);
    if (!existing) block = store.create('planningBlocks', {
      title: `Congé — ${request.employeeName}`,
      type: 'Congé', startDate: request.startDate, endDate: request.endDate,
      startTime: '08:30', endTime: '17:00', status: 'Active',
      assignedUserId: request.employeeId, assignedUserName: request.employeeName,
      leaveRequestId: request.id, notes: text(input.comment), blocksWorkshop: false,
      createdBy: user.id || '', createdByName: user.name || ''
    });
  }
  return { request: updated, block };
}

function overview(store, user = {}) {
  const all = safeList(store, 'leaveRequests').sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  return {
    canValidate: canValidate(user),
    mine: all.filter((request) => request.employeeId === user.id),
    pending: canValidate(user) ? all.filter((request) => request.status === 'En attente de validation') : [],
    approved: all.filter((request) => request.status === 'Approuvé')
  };
}

function parseFrenchDate(value, fallbackYear = new Date().getFullYear()) {
  const raw = text(value);
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const fr = raw.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/);
  if (fr) return `${fr[3] || fallbackYear}-${String(fr[2]).padStart(2, '0')}-${String(fr[1]).padStart(2, '0')}`;
  return '';
}
function parsePeriod(textValue) {
  const matches = [...String(textValue || '').matchAll(/\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}(?:[\/-]20\d{2})?)\b/g)].map((match) => parseFrenchDate(match[0])).filter(Boolean);
  return { startDate: matches[0] || '', endDate: matches[1] || matches[0] || '' };
}

module.exports = { advice, submit, decide, overview, canValidate, parsePeriod, workdays, overlaps };
