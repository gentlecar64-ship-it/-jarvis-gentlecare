'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;
const DESIGN_LOCK = 'gentlecare-pc-validated-v1';
const sessions = new Map();
const recoveryAttempts = new Map();

const ROLE_PERMISSIONS = {
  admin: ['*'],
  associate: ['dashboard.read','clients.read','clients.write','vehicles.read','vehicles.write','interventions.read','interventions.write','observations.read','observations.write','communications.read','communications.write','tasks.read','tasks.write','stocks.read','stocks.write','quotes.read','quotes.write','documents.read','documents.write','photos.read','photos.write','jarvis.use'],
  technician: ['dashboard.read','clients.read','vehicles.read','interventions.read','interventions.write','observations.read','observations.write','tasks.read','tasks.write','documents.read','documents.write','photos.read','photos.write','jarvis.use'],
  commercial: ['dashboard.read','clients.read','clients.write','vehicles.read','vehicles.write','interventions.read','communications.read','communications.write','tasks.read','tasks.write','quotes.read','quotes.write','documents.read','documents.write','jarvis.use'],
  trainee: ['dashboard.read','vehicles.read','interventions.read','tasks.read','photos.read','photos.write','jarvis.use']
};

const DEFAULT_PREFERENCES = Object.freeze({
  assistantName: 'MAVIK',
  answerStyle: 'direct',
  voiceEnabled: true,
  voiceLanguage: 'fr-FR',
  notifications: true,
  proactiveAlerts: true,
  confirmBeforeWrite: true,
  preferredHome: 'dashboard'
});

function ensureUsersFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

function writeUsers(users) {
  ensureUsersFile();
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }
function validPin(pin) { return /^\d{4}$/.test(String(pin || '')); }
function normalizeDevice(value) {
  const input = String(value || '').toLowerCase();
  return /(iphone|ipad|ipod|ios|mobile-safari)/.test(input) ? 'iphone' : 'pc';
}
function sanitizeDeviceId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 96);
}
function deviceContextFromRequest(req) {
  const type = normalizeDevice(req?.headers?.['x-gcos-client'] || req?.headers?.['user-agent'] || 'pc');
  const supplied = sanitizeDeviceId(req?.headers?.['x-gcos-device-id']);
  const fallbackSource = `${type}|${req?.headers?.['user-agent'] || ''}|${req?.socket?.remoteAddress || ''}`;
  const fallback = `legacy-${type}-${crypto.createHash('sha256').update(fallbackSource).digest('hex').slice(0, 16)}`;
  return { id: supplied || fallback, type, label: type === 'iphone' ? 'iPhone' : 'PC' };
}
function deviceFromRequest(req) { return deviceContextFromRequest(req).type; }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function normalizePreferences(input = {}) {
  const answerStyle = ['direct', 'balanced', 'detailed'].includes(input.answerStyle) ? input.answerStyle : DEFAULT_PREFERENCES.answerStyle;
  const preferredHome = ['dashboard', 'jarvis'].includes(input.preferredHome) ? input.preferredHome : DEFAULT_PREFERENCES.preferredHome;
  return {
    assistantName: String(input.assistantName || DEFAULT_PREFERENCES.assistantName).trim().slice(0, 30) || DEFAULT_PREFERENCES.assistantName,
    answerStyle,
    voiceEnabled: input.voiceEnabled !== false,
    voiceLanguage: 'fr-FR',
    notifications: input.notifications !== false,
    proactiveAlerts: input.proactiveAlerts !== false,
    confirmBeforeWrite: input.confirmBeforeWrite !== false,
    preferredHome
  };
}

function normalizeStoredUser(user = {}) {
  const deviceHashes = user && typeof user.devicePinHashes === 'object' && user.devicePinHashes ? user.devicePinHashes : {};
  const canonicalHash = user.passwordHash || deviceHashes.pc || deviceHashes.iphone || '';
  const trustedDevices = Array.isArray(user.trustedDevices) ? user.trustedDevices.slice(0, 20) : [];
  const { devicePinHashes, ...rest } = user;
  return { ...rest, passwordHash: canonicalHash, preferences: normalizePreferences(user.preferences || {}), trustedDevices, designLock: DESIGN_LOCK };
}

function readUsers() {
  ensureUsersFile();
  const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const raw = Array.isArray(parsed) ? parsed : [];
  const normalized = raw.map(normalizeStoredUser);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) writeUsers(normalized);
  return normalized;
}

function publicUser(user, context = null) {
  if (!user) return null;
  const { passwordHash, ...safe } = normalizeStoredUser(user);
  return {
    ...safe,
    currentDevice: context ? { id: context.id, type: context.type, label: context.label } : undefined,
    pinScope: 'all-devices',
    designLocked: true,
    designVersion: DESIGN_LOCK
  };
}

function setupRequired() { return readUsers().length === 0; }

function registerTrustedDevice(user, context) {
  const now = new Date().toISOString();
  const current = Array.isArray(user.trustedDevices) ? user.trustedDevices.find((item) => item.id === context.id) : null;
  const devices = Array.isArray(user.trustedDevices) ? user.trustedDevices.filter((item) => item.id !== context.id) : [];
  devices.unshift({ id: context.id, type: context.type, label: context.label || (context.type === 'iphone' ? 'iPhone' : 'PC'), trustedAt: current?.trustedAt || now, lastSeenAt: now });
  return { ...user, trustedDevices: devices.slice(0, 20), updatedAt: now };
}

function createInitialAdmin(input = {}, context = {}) {
  if (!setupRequired()) throw Object.assign(new Error('GCOS_SETUP_ALREADY_COMPLETED'), { status: 409 });
  const name = String(input.name || 'David').trim();
  const username = String(input.username || 'david').trim().toLowerCase();
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  if (!name || !username) throw Object.assign(new Error('USER_NAME_REQUIRED'), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error('INVALID_EMAIL'), { status: 400 });
  if (!validPin(password)) throw Object.assign(new Error('PIN_MUST_BE_4_DIGITS'), { status: 400 });
  const now = new Date().toISOString();
  const ctx = context.id ? context : { id: 'setup-pc', type: normalizeDevice(context.device), label: normalizeDevice(context.device) === 'iphone' ? 'iPhone' : 'PC' };
  const user = registerTrustedDevice(normalizeStoredUser({ id: crypto.randomUUID(), name, username, email, role: 'admin', active: true, passwordHash: hashPassword(password), preferences: DEFAULT_PREFERENCES, trustedDevices: [], createdAt: now, updatedAt: now }), ctx);
  writeUsers([user]);
  return publicUser(user, ctx);
}

function createUser(actor, input = {}) {
  requirePermission(actor, 'users.manage');
  const users = readUsers();
  const username = String(input.username || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const role = String(input.role || 'trainee');
  if (!username || !name) throw Object.assign(new Error('USER_NAME_REQUIRED'), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error('INVALID_EMAIL'), { status: 400 });
  if (!validPin(password)) throw Object.assign(new Error('PIN_MUST_BE_4_DIGITS'), { status: 400 });
  if (!ROLE_PERMISSIONS[role]) throw Object.assign(new Error('INVALID_ROLE'), { status: 400 });
  if (users.some((user) => user.username === username)) throw Object.assign(new Error('USERNAME_ALREADY_EXISTS'), { status: 409 });
  if (users.some((user) => normalizeEmail(user.email) === email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), { status: 409 });
  const now = new Date().toISOString();
  const user = normalizeStoredUser({ id: crypto.randomUUID(), name, username, email, role, active: true, passwordHash: hashPassword(password), preferences: DEFAULT_PREFERENCES, trustedDevices: [], createdAt: now, updatedAt: now });
  users.push(user);
  writeUsers(users);
  return publicUser(user);
}

function listUsers(actor) {
  requirePermission(actor, 'users.manage');
  return readUsers().map((user) => publicUser(user));
}

function recoveryKey(input = {}) { return `${String(input.username || '').trim().toLowerCase()}|${normalizeEmail(input.email)}`; }
function enforceRecoveryRateLimit(key) {
  const now = Date.now();
  const entry = recoveryAttempts.get(key);
  if (!entry || now - entry.startedAt > RECOVERY_WINDOW_MS) { recoveryAttempts.set(key, { count: 1, startedAt: now }); return; }
  if (entry.count >= MAX_RECOVERY_ATTEMPTS) throw Object.assign(new Error('RECOVERY_RATE_LIMITED'), { status: 429 });
  entry.count += 1;
}

function resetPassword(input = {}, context = {}) {
  const username = String(input.username || '').trim().toLowerCase();
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const key = recoveryKey(input);
  enforceRecoveryRateLimit(key);
  if (!username) throw Object.assign(new Error('USERNAME_REQUIRED'), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error('INVALID_EMAIL'), { status: 400 });
  if (!validPin(password)) throw Object.assign(new Error('PIN_MUST_BE_4_DIGITS'), { status: 400 });
  const users = readUsers();
  const index = users.findIndex((item) => item.username === username && item.active !== false);
  if (index < 0 || normalizeEmail(users[index].email) !== email) throw Object.assign(new Error('RECOVERY_IDENTITY_MISMATCH'), { status: 401 });
  users[index] = normalizeStoredUser({ ...users[index], email, passwordHash: hashPassword(password), updatedAt: new Date().toISOString(), passwordResetAt: new Date().toISOString() });
  writeUsers(users);
  for (const [token, session] of sessions.entries()) if (session.userId === users[index].id) sessions.delete(token);
  recoveryAttempts.delete(key);
  return publicUser(users[index], context);
}

function issueSession(user, context) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, deviceId: context.id, deviceType: context.type, expiresAt: Date.now() + SESSION_TTL_MS });
  return { token, user: publicUser(user, context), device: context.type, expiresInSeconds: SESSION_TTL_MS / 1000 };
}

function login(username, password, context = {}) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const ctx = context.id ? context : { id: `legacy-${normalizeDevice(context.device)}`, type: normalizeDevice(context.device), label: normalizeDevice(context.device) === 'iphone' ? 'iPhone' : 'PC' };
  if (normalizedUsername === '__recover__') {
    let payload;
    try { payload = JSON.parse(String(password || '')); }
    catch { throw Object.assign(new Error('RECOVERY_INVALID_REQUEST'), { status: 400 }); }
    resetPassword(payload, ctx);
    const users = readUsers();
    const index = users.findIndex((item) => item.username === String(payload.username || '').trim().toLowerCase() && item.active !== false);
    if (index < 0) throw Object.assign(new Error('RECOVERY_IDENTITY_MISMATCH'), { status: 401 });
    users[index] = registerTrustedDevice(users[index], ctx);
    writeUsers(users);
    return issueSession(users[index], ctx);
  }
  const users = readUsers();
  const index = users.findIndex((item) => item.username === normalizedUsername && item.active !== false);
  if (index < 0 || !verifyPassword(password, users[index].passwordHash)) throw Object.assign(new Error('INVALID_CREDENTIALS'), { status: 401 });
  users[index] = registerTrustedDevice(users[index], ctx);
  writeUsers(users);
  return issueSession(users[index], ctx);
}

function updateMyProfile(actor, input = {}, context = {}) {
  if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const users = readUsers();
  const index = users.findIndex((item) => item.id === actor.id && item.active !== false);
  if (index < 0) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const name = input.name === undefined ? users[index].name : String(input.name || '').trim();
  const email = input.email === undefined ? users[index].email : normalizeEmail(input.email);
  if (!name) throw Object.assign(new Error('USER_NAME_REQUIRED'), { status: 400 });
  if (!validEmail(email)) throw Object.assign(new Error('INVALID_EMAIL'), { status: 400 });
  if (users.some((item, itemIndex) => itemIndex !== index && normalizeEmail(item.email) === email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), { status: 409 });
  const preferences = normalizePreferences({ ...users[index].preferences, ...(input.preferences || {}) });
  users[index] = normalizeStoredUser({ ...users[index], name, email, preferences, updatedAt: new Date().toISOString() });
  if (context.id) users[index] = registerTrustedDevice(users[index], context);
  writeUsers(users);
  return publicUser(users[index], context);
}

function changeMyPin(actor, input = {}) {
  if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const currentPin = String(input.currentPin || '');
  const newPin = String(input.newPin || input.password || '');
  if (!validPin(newPin)) throw Object.assign(new Error('PIN_MUST_BE_4_DIGITS'), { status: 400 });
  const users = readUsers();
  const index = users.findIndex((item) => item.id === actor.id && item.active !== false);
  if (index < 0) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  if (!verifyPassword(currentPin, users[index].passwordHash)) throw Object.assign(new Error('CURRENT_PIN_INVALID'), { status: 401 });
  users[index] = normalizeStoredUser({ ...users[index], passwordHash: hashPassword(newPin), updatedAt: new Date().toISOString(), pinUpdatedAt: new Date().toISOString() });
  writeUsers(users);
  for (const [token, session] of sessions.entries()) if (session.userId === users[index].id) sessions.delete(token);
  return { ok: true, pinScope: 'all-devices' };
}
function setCurrentDevicePin(actor, input = {}) { return changeMyPin(actor, { currentPin: input.currentPin, newPin: input.newPin || input.password || input.pin }); }

function revokeTrustedDevice(actor, deviceId, context = null) {
  if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const id = sanitizeDeviceId(deviceId);
  if (!id) throw Object.assign(new Error('DEVICE_ID_REQUIRED'), { status: 400 });
  const users = readUsers();
  const index = users.findIndex((item) => item.id === actor.id && item.active !== false);
  if (index < 0) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  users[index] = { ...users[index], trustedDevices: (users[index].trustedDevices || []).filter((item) => item.id !== id), updatedAt: new Date().toISOString() };
  writeUsers(users);
  for (const [token, session] of sessions.entries()) if (session.userId === actor.id && session.deviceId === id) sessions.delete(token);
  return publicUser(users[index], context);
}

function logout(token) { if (token) sessions.delete(token); }
function cookieToken(req) {
  const cookie = String(req?.headers?.cookie || '');
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'gcos_session') return decodeURIComponent(value.join('=') || '');
  }
  return '';
}
function tokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  const headerToken = String(req.headers['x-gcos-session'] || '').trim();
  if (headerToken) return headerToken;
  const cookie = cookieToken(req);
  if (cookie) return cookie;
  try {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    return String(url.searchParams.get('session') || '').trim();
  } catch { return ''; }
}

function authenticate(req) {
  const token = tokenFromRequest(req);
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  const users = readUsers();
  const index = users.findIndex((item) => item.id === session.userId && item.active !== false);
  if (index < 0) return null;
  const context = deviceContextFromRequest(req);
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  session.deviceId = context.id;
  session.deviceType = context.type;
  return publicUser(users[index], context);
}

function can(user, permission) {
  if (!user) return false;
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes('*') || permissions.includes(permission) || (permission === 'users.manage' && user.role === 'admin');
}
function requirePermission(user, permission) {
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  if (!can(user, permission)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return true;
}
function collectionPermission(collection, method) { return `${collection}.${method === 'GET' ? 'read' : 'write'}`; }

module.exports = {
  USERS_FILE, ROLE_PERMISSIONS, DEFAULT_PREFERENCES, DESIGN_LOCK, SESSION_TTL_MS,
  setupRequired, createInitialAdmin, createUser, listUsers, login, resetPassword,
  updateMyProfile, changeMyPin, setCurrentDevicePin, revokeTrustedDevice, logout,
  tokenFromRequest, authenticate, deviceContextFromRequest, deviceFromRequest,
  normalizeDevice, can, requirePermission, collectionPermission
};
