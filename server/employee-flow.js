'use strict';

const TERMINAL = /termin|livr|annul|archiv|refus/i;
const ACTIVE = 'En cours';
const PAUSED = 'En attente';

function text(value) { return String(value || '').trim(); }
function normalize(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString(); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function userMatches(record, user) {
  const ids = [record.assigneeId, record.technicianId, record.activeByUserId, record.startedByUserId].filter(Boolean).map(String);
  if (ids.includes(String(user.id || ''))) return true;
  const names = [record.assignee, record.technician, record.activeByName, record.startedByName].filter(Boolean).map(normalize);
  return names.includes(normalize(user.name || user.username || ''));
}
function targetCollection(type) {
  if (type === 'intervention') return 'interventions';
  if (type === 'task') return 'tasks';
  throw Object.assign(new Error('WORK_ITEM_TYPE_INVALID'), { status: 400 });
}
function findTarget(store, type, id) {
  const collection = targetCollection(type);
  const record = safeList(store, collection).find((item) => item.id === id || item.number === id);
  if (!record) throw Object.assign(new Error('WORK_ITEM_NOT_FOUND'), { status: 404 });
  return { collection, record };
}
function label(record, type) { return type === 'intervention' ? (record.number || record.service || 'Intervention') : (record.title || 'Tâche'); }
function statusOf(record) { return text(record.workStatus || record.status || 'À faire'); }
function activeForUser(store, type, user) {
  const collection = targetCollection(type);
  return safeList(store, collection).filter((record) => userMatches(record, user) && statusOf(record) === ACTIVE && !TERMINAL.test(record.status || ''));
}
function createAudit(store, input, user) {
  return store.create('workSessions', {
    employeeId: user.id || '', employeeName: user.name || user.username || '',
    targetType: input.targetType, targetId: input.targetId, targetLabel: input.targetLabel,
    action: input.action, reason: text(input.reason), workstationReleased: input.workstationReleased !== false,
    happenedAt: now(), metadata: input.metadata || {}
  });
}
function pauseRecord(store, type, record, user, options = {}) {
  if (TERMINAL.test(record.status || '')) return record;
  const collection = targetCollection(type);
  const patch = {
    workStatus: PAUSED,
    status: type === 'intervention' ? 'En attente opérateur' : 'En attente',
    pausedAt: now(), pausedByUserId: user.id || '', pausedByName: user.name || '',
    pauseReason: text(options.reason || 'Changement de priorité'),
    workstationReleased: options.workstationReleased !== false,
    scheduleDatesPreserved: true,
    scheduleRisk: record.estimatedEndDate && record.estimatedEndDate <= today() ? 'À contrôler par le responsable' : ''
  };
  const updated = store.update(collection, record.id, patch);
  createAudit(store, { targetType: type, targetId: record.id, targetLabel: label(record, type), action: 'pause', reason: patch.pauseReason, workstationReleased: patch.workstationReleased, metadata: { plannedEndDate: record.estimatedEndDate || record.dueDate || '' } }, user);
  return updated;
}
function pauseCompanions(store, targetType, target, user, options = {}) {
  const paused = [];
  for (const type of ['intervention', 'task']) {
    for (const current of activeForUser(store, type, user)) {
      if (type === targetType && current.id === target.id) continue;
      paused.push(pauseRecord(store, type, current, user, options));
    }
  }
  return paused;
}
function workshopActiveInterventions(store, user, targetId) {
  return safeList(store, 'interventions').filter((record) => record.id !== targetId && statusOf(record) === ACTIVE && !TERMINAL.test(record.status || '') && record.workstationReleased !== true && !userMatches(record, user));
}
function startRecord(store, type, record, user, options = {}) {
  if (TERMINAL.test(record.status || '')) throw Object.assign(new Error('WORK_ITEM_ALREADY_CLOSED'), { status: 409 });
  if (type === 'intervention' && workshopActiveInterventions(store, user, record.id).length >= Math.max(1, Number(process.env.GCOS_WORKSHOP_CAPACITY || 1))) {
    throw Object.assign(new Error('WORKSHOP_CAPACITY_FULL'), { status: 409 });
  }
  const plannedDate = type === 'intervention' ? (record.scheduledDate || record.estimatedStartDate) : record.dueDate;
  const early = Boolean(plannedDate && plannedDate > today());
  const late = Boolean(plannedDate && plannedDate < today());
  const patch = {
    workStatus: ACTIVE,
    status: 'En cours',
    activeByUserId: user.id || '', activeByName: user.name || '',
    startedByUserId: record.startedByUserId || user.id || '', startedByName: record.startedByName || user.name || '',
    actualStartAt: record.actualStartAt || now(), resumedAt: record.actualStartAt ? now() : '',
    pausedAt: '', pauseReason: '', workstationReleased: false,
    startedAheadOfSchedule: early,
    startedLate: late,
    managerAttentionRequired: late,
    promisedDatesPreserved: true,
    progressNote: early ? 'Commencé en avance sans repousser les dates promises.' : (late ? 'Démarrage tardif signalé au responsable ; aucune date client modifiée.' : '')
  };
  const updated = store.update(targetCollection(type), record.id, patch);
  createAudit(store, { targetType: type, targetId: record.id, targetLabel: label(record, type), action: record.actualStartAt ? 'resume' : (early ? 'start-early' : 'start'), reason: text(options.reason), workstationReleased: false, metadata: { plannedDate: plannedDate || '', early, late } }, user);
  return updated;
}
function completeRecord(store, type, record, user, options = {}) {
  const patch = { workStatus: 'Terminée', status: 'Terminée', completedAt: now(), completedByUserId: user.id || '', completedByName: user.name || '', completionNote: text(options.reason), workstationReleased: true };
  const updated = store.update(targetCollection(type), record.id, patch);
  createAudit(store, { targetType: type, targetId: record.id, targetLabel: label(record, type), action: 'complete', reason: patch.completionNote, workstationReleased: true }, user);
  return updated;
}
function act(store, input = {}, user = {}) {
  const targetType = text(input.targetType);
  const action = text(input.action).toLowerCase();
  const { record } = findTarget(store, targetType, text(input.targetId));
  if (!userMatches(record, user) && !['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('WORK_ITEM_NOT_ASSIGNED_TO_USER'), { status: 403 });
  if (action === 'pause') return { item: pauseRecord(store, targetType, record, user, input), paused: [] };
  if (action === 'complete') return { item: completeRecord(store, targetType, record, user, input), paused: [] };
  if (!['start', 'resume', 'switch'].includes(action)) throw Object.assign(new Error('WORK_ACTION_INVALID'), { status: 400 });
  const paused = pauseCompanions(store, targetType, record, user, { reason: input.pauseCurrentReason || 'Passage à une autre priorité', workstationReleased: input.workstationReleased !== false });
  return { item: startRecord(store, targetType, record, user, input), paused };
}
function queue(store, user = {}) {
  const privileged = ['admin', 'associate'].includes(user.role);
  const visible = (record) => privileged || userMatches(record, user);
  const interventions = safeList(store, 'interventions')
    .filter((record) => visible(record) && !TERMINAL.test(record.status || ''))
    .map((record) => ({ ...record, targetType: 'intervention', displayLabel: label(record, 'intervention'), canStartEarly: Boolean((record.scheduledDate || record.estimatedStartDate) > today()), canDelay: false }));
  const tasks = safeList(store, 'tasks')
    .filter((record) => visible(record) && !TERMINAL.test(record.status || ''))
    .map((record) => ({ ...record, targetType: 'task', displayLabel: label(record, 'task'), canStartEarly: Boolean(record.dueDate > today()), canDelay: false }));
  const sessions = safeList(store, 'workSessions').filter((record) => record.employeeId === user.id).slice(0, 30);
  return {
    employee: { id: user.id || '', name: user.name || user.username || '' },
    policy: { earlyStartAllowed: true, employeeDelayAllowed: false, promisedDatesPreserved: true },
    activeInterventions: interventions.filter((item) => statusOf(item) === ACTIVE && userMatches(item, user)),
    activeTasks: tasks.filter((item) => statusOf(item) === ACTIVE && userMatches(item, user)),
    interventions,
    tasks,
    sessions
  };
}

module.exports = { act, queue, pauseRecord, startRecord, activeForUser, userMatches, ACTIVE, PAUSED };
