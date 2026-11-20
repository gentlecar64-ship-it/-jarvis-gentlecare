'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const auth = require('./auth');

const DATA_DIR = path.join(__dirname, 'data');
const MESSAGE_FILE = path.join(DATA_DIR, 'internal-messages.json');
const MAX_MESSAGES = 2000;

function ensureFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MESSAGE_FILE)) fs.writeFileSync(MESSAGE_FILE, '[]', 'utf8');
}
function readMessages() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(MESSAGE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const backup = `${MESSAGE_FILE}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(MESSAGE_FILE, backup); } catch {}
    fs.writeFileSync(MESSAGE_FILE, '[]', 'utf8');
    throw Object.assign(new Error('INTERNAL_MESSAGES_CORRUPT'), { status: 500, cause: error });
  }
}
function writeMessages(messages) {
  ensureFile();
  const temp = `${MESSAGE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(messages.slice(0, MAX_MESSAGES), null, 2), 'utf8');
  fs.renameSync(temp, MESSAGE_FILE);
}
function readDirectory() {
  try {
    const users = JSON.parse(fs.readFileSync(auth.USERS_FILE, 'utf8'));
    return (Array.isArray(users) ? users : [])
      .filter((user) => user && user.active !== false)
      .map((user) => ({ id: String(user.id || ''), name: String(user.name || user.username || 'Utilisateur MAVIK'), username: String(user.username || ''), role: String(user.role || 'utilisateur'), email: String(user.email || '').toLowerCase() }))
      .filter((user) => user.id);
  } catch { return []; }
}
function directory(actor) { return readDirectory().map((user) => ({ ...user, isSelf: user.id === actor.id })); }
function recipientIds(message) {
  if (Array.isArray(message.toUserIds)) return message.toUserIds.map(String);
  if (message.toUserId === '*') return ['*'];
  return message.toUserId ? [String(message.toUserId)] : [];
}
function visibleTo(actor, message) {
  const recipients = recipientIds(message);
  return message.fromUserId === actor.id || recipients.includes(actor.id) || recipients.includes('*');
}
function list(actor, options = {}) {
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const visible = readMessages().filter((message) => visibleTo(actor, message)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const unread = visible.filter((message) => message.fromUserId !== actor.id && !message.readBy?.includes(actor.id)).length;
  return { records: visible.slice(0, limit), unread };
}
function normalizeRecipients(input = {}, users = [], actor = {}) {
  const requested = Array.isArray(input.toUserIds) ? input.toUserIds.map(String) : (input.toUserId ? [String(input.toUserId)] : []);
  if (requested.includes('*')) return users.filter((user) => user.id !== actor.id).map((user) => user.id);
  const unique = [...new Set(requested.filter(Boolean))];
  if (!unique.length) throw Object.assign(new Error('MESSAGE_RECIPIENT_REQUIRED'), { status: 400 });
  const unknown = unique.filter((id) => !users.some((user) => user.id === id));
  if (unknown.length) throw Object.assign(new Error('MESSAGE_RECIPIENT_NOT_FOUND'), { status: 404 });
  return unique;
}
function send(actor, input = {}) {
  const body = String(input.body || input.message || '').trim();
  const subject = String(input.subject || '').trim().slice(0, 120);
  if (!body) throw Object.assign(new Error('MESSAGE_BODY_REQUIRED'), { status: 400 });
  const users = readDirectory();
  const toUserIds = normalizeRecipients(input, users, actor);
  const recipients = users.filter((user) => toUserIds.includes(user.id));
  if (!recipients.length) throw Object.assign(new Error('MESSAGE_RECIPIENT_REQUIRED'), { status: 400 });
  const now = new Date().toISOString();
  const message = {
    id: crypto.randomUUID(),
    fromUserId: actor.id,
    fromName: actor.name || actor.username || 'Utilisateur MAVIK',
    toUserId: toUserIds.length === users.filter((user) => user.id !== actor.id).length ? '*' : (toUserIds[0] || ''),
    toUserIds,
    toName: recipients.length === 1 ? recipients[0].name : recipients.map((user) => user.name).join(', '),
    toNames: recipients.map((user) => user.name),
    subject,
    body: body.slice(0, 5000),
    priority: input.priority === 'urgent' ? 'urgent' : 'normal',
    readBy: [actor.id],
    createdAt: now,
    updatedAt: now
  };
  const messages = readMessages();
  messages.unshift(message);
  writeMessages(messages);
  return message;
}
function markRead(actor, id) {
  const messages = readMessages();
  const index = messages.findIndex((message) => message.id === id && visibleTo(actor, message));
  if (index < 0) throw Object.assign(new Error('MESSAGE_NOT_FOUND'), { status: 404 });
  const readBy = new Set(Array.isArray(messages[index].readBy) ? messages[index].readBy : []);
  readBy.add(actor.id);
  messages[index] = { ...messages[index], readBy: [...readBy], updatedAt: new Date().toISOString() };
  writeMessages(messages);
  return messages[index];
}

module.exports = { MESSAGE_FILE, directory, list, send, markRead, visibleTo };
