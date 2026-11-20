'use strict';

const workshopService = require('./workshop-service');
const PHASES = Object.freeze({ wash: 'Lavage extérieur', presentation: 'Mise en valeur' });
const now = () => new Date().toISOString();
const invalid = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const dateOk = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(String(value) + 'T12:00:00Z'));
const hourOk = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
function find(store, reference, user) { return workshopService.detail(store, reference, user); }
function mark(store, reference, input = {}, user = {}) {
  const intervention = find(store, reference, user);
  const phase = String(input.phase || '');
  if (!Object.hasOwn(PHASES, phase)) invalid('FINISH_PHASE_INVALID', 400);
  if (intervention.procedureStatus !== 'Validée par la direction') invalid('WORKSHOP_FINAL_CONTROL_REQUIRED');
  if (intervention.showroomAt) invalid('VEHICLE_ALREADY_IN_SHOWROOM');
  const patch = { completionChecks: { ...(intervention.completionChecks || {}), [phase]: { completedAt: now(), completedBy: user.name || user.username || user.id || '', notes: String(input.notes || '').slice(0, 1000) } } };
  const updated = store.update('interventions', intervention.id, patch);
  return { intervention: updated, checks: updated.completionChecks };
}
function schedule(store, reference, input = {}, user = {}) {
  const intervention = find(store, reference, user);
  const type = String(input.type || '');
  if (!['wash','presentation','pickup'].includes(type)) invalid('FINISH_PLANNING_TYPE_INVALID', 400);
  const date = String(input.date || '');
  const time = String(input.time || '');
  if (!dateOk(date) || !hourOk(time)) invalid('FINISH_PLANNING_DATE_TIME_REQUIRED', 400);
  if (type === 'pickup' && !intervention.showroomAt) invalid('SHOWROOM_REQUIRED_BEFORE_PICKUP');
  if (type !== 'pickup' && intervention.showroomAt) invalid('VEHICLE_ALREADY_IN_SHOWROOM');
  const title = type === 'pickup' ? 'Rendez-vous restitution client' : PHASES[type];
  const blocks = store.list('planningBlocks');
  const existing = blocks.find(b => b.interventionId === intervention.id && b.finishStage === type && b.status !== 'Annulée');
  const record = { title: title + ' — ' + (intervention.number || intervention.id), type: title, finishStage: type, interventionId: intervention.id, clientId: intervention.clientId, vehicleId: intervention.vehicleId, startDate: date, endDate: date, startTime: time, endTime: time, status: 'Active', blocksWorkshop: type !== 'pickup', notes: String(input.notes || '').slice(0, 1000), createdBy: user.id || '', createdByName: user.name || '' };
  const block = existing ? store.update('planningBlocks', existing.id, record) : store.create('planningBlocks', record);
  store.update('interventions', intervention.id, type === 'pickup' ? { pickupDate: date, pickupTime: time, pickupScheduledAt: now() } : { [type + 'PlannedDate']: date, [type + 'PlannedTime']: time });
  return { block, interventionId: intervention.id };
}
function showroom(store, reference, user = {}) {
  const intervention = find(store, reference, user);
  if (intervention.procedureStatus !== 'Validée par la direction') invalid('WORKSHOP_FINAL_CONTROL_REQUIRED');
  if (!intervention.completionChecks?.wash?.completedAt) invalid('EXTERIOR_WASH_REQUIRED');
  if (!intervention.completionChecks?.presentation?.completedAt) invalid('PRESENTATION_REQUIRED');
  if (intervention.showroomAt) return { intervention, alreadyDone: true };
  const updated = store.update('interventions', intervention.id, { showroomAt: now(), showroomBy: user.name || user.username || '', status: 'En showroom — attente restitution', workStatus: 'Terminée', workstationReleased: true });
  return { intervention: updated, alreadyDone: false };
}
module.exports = { mark, schedule, showroom };
