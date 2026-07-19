'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(__dirname, 'data', 'emergency-alert.json');
const SERVICES = new Set(['112', '15', '18', 'alerte-interne']);

function empty() {
  return { active: false, id: '', service: '', message: '', activatedAt: '', activatedByUserId: '', activatedByName: '', acknowledgements: [], stoppedAt: '', stoppedByUserId: '', stoppedByName: '', history: [] };
}
function ensure() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(empty(), null, 2), 'utf8');
}
function read() {
  ensure();
  try { return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch { const state = empty(); write(state); return state; }
}
function write(state) {
  ensure();
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, FILE);
}
function publicState(state, user = {}) {
  const acknowledgements = Array.isArray(state.acknowledgements) ? state.acknowledgements : [];
  return {
    active: state.active === true,
    id: state.id || '',
    service: state.service || '',
    message: state.message || '',
    activatedAt: state.activatedAt || '',
    activatedByName: state.activatedByName || '',
    acknowledgementCount: acknowledgements.length,
    acknowledgedByMe: acknowledgements.some((entry) => entry.userId === user.id),
    canStop: state.active === true && (['admin', 'associate'].includes(user.role) || state.activatedByUserId === user.id),
    stoppedAt: state.stoppedAt || '',
    stoppedByName: state.stoppedByName || ''
  };
}
function status(user = {}) { return publicState(read(), user); }
function activate(input = {}, user = {}) {
  if (input.confirmed !== true) throw Object.assign(new Error('EMERGENCY_CONFIRMATION_REQUIRED'), { status: 409 });
  const service = String(input.service || 'alerte-interne').trim();
  if (!SERVICES.has(service)) throw Object.assign(new Error('EMERGENCY_SERVICE_INVALID'), { status: 400 });
  const current = read();
  if (current.active) return publicState(current, user);
  const now = new Date().toISOString();
  const next = {
    ...empty(),
    active: true,
    id: crypto.randomUUID(),
    service,
    message: String(input.message || 'Alerte d’urgence GentleCarE').trim().slice(0, 300),
    activatedAt: now,
    activatedByUserId: user.id || '',
    activatedByName: user.name || user.username || 'Utilisateur MAVIK',
    acknowledgements: [{ userId: user.id || '', name: user.name || user.username || '', at: now }],
    history: [{ action: 'activate', service, at: now, userId: user.id || '', userName: user.name || '' }, ...(current.history || [])].slice(0, 100)
  };
  write(next);
  return publicState(next, user);
}
function acknowledge(user = {}) {
  const state = read();
  if (!state.active) return publicState(state, user);
  const acknowledgements = Array.isArray(state.acknowledgements) ? state.acknowledgements : [];
  if (!acknowledgements.some((entry) => entry.userId === user.id)) acknowledgements.push({ userId: user.id || '', name: user.name || user.username || '', at: new Date().toISOString() });
  state.acknowledgements = acknowledgements;
  write(state);
  return publicState(state, user);
}
function stop(input = {}, user = {}) {
  const state = read();
  if (!state.active) return publicState(state, user);
  const allowed = ['admin', 'associate'].includes(user.role) || state.activatedByUserId === user.id;
  if (!allowed) throw Object.assign(new Error('EMERGENCY_STOP_NOT_ALLOWED'), { status: 403 });
  const confirmation = String(input.confirmText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  if (confirmation !== 'ARRET') throw Object.assign(new Error('EMERGENCY_STOP_CONFIRMATION_REQUIRED'), { status: 409 });
  const now = new Date().toISOString();
  state.active = false;
  state.stoppedAt = now;
  state.stoppedByUserId = user.id || '';
  state.stoppedByName = user.name || user.username || '';
  state.history = [{ action: 'stop', at: now, userId: user.id || '', userName: user.name || '' }, ...(state.history || [])].slice(0, 100);
  write(state);
  return publicState(state, user);
}

module.exports = { FILE, status, activate, acknowledge, stop };
