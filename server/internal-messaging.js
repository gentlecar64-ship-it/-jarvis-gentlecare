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
      .map((user) => ({
        id: String(user.id || ''),
        name: String(user.name || user.username || 'Utilisateur MAVIK'),
        username: String(user.username || ''),
        role: String(user.role || 'utilisateur'),
        email: String(user.email || '').toLowerCase()
      }))
      .filter((user) => user.id);
  } catch { return []; }
}

function directory(actor) {
  const users = readDirectory();
  return users.map((user) => ({ ...user, isSelf: user.id === actor.id }));
}

function visibleTo(actor, message) {
  return message.fromUserId === actor.id || message.toUserId === actor.id || message.toUserId === '*';
}

function list(actor, options = {}) {
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const visible = readMessages()
    .filter((message) => visibleTo(actor, message))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const unread = visible.filter((message) => message.fromUserId !== actor.id && !message.readBy?.includes(actor.id)).length;
  return { records: visible.slice(0, limit), unread };
}

function send(actor, input = {}) {
  const body = String(input.body || input.message || '').trim();
  const subject = String(input.subject || '').trim().slice(0, 120);
  const toUserId = String(input.toUserId || '').trim();
  if (!body) throw Object.assign(new Error('MESSAGE_BODY_REQUIRED'), { status: 400 });
  const users = readDirectory();
  if (toUserId !== '*' && !users.some((user) => user.id === toUserId)) throw Object.assign(new Error('MESSAGE_RECIPIENT_NOT_FOUND'), { status: 404 });
  const recipient = toUserId === '*' ? { name: 'Toute l’équipe' } : users.find((user) => user.id === toUserId);
  const now = new Date().toISOString();
  const message = {
    id: crypto.randomUUID(),
    fromUserId: actor.id,
    fromName: actor.name || actor.username || 'Utilisateur MAVIK',
    toUserId,
    toName: recipient?.name || 'Utilisateur MAVIK',
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

module.exports = { MESSAGE_FILE, directory, list, send, markRead };
