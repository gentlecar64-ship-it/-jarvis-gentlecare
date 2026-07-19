'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../auth');
const messaging = require('../internal-messaging');

const usersBackup = fs.existsSync(auth.USERS_FILE) ? fs.readFileSync(auth.USERS_FILE) : null;
const messagesBackup = fs.existsSync(messaging.MESSAGE_FILE) ? fs.readFileSync(messaging.MESSAGE_FILE) : null;

try {
  fs.mkdirSync(path.dirname(auth.USERS_FILE), { recursive: true });
  fs.writeFileSync(auth.USERS_FILE, JSON.stringify([
    { id: 'u1', name: 'David Bourasseau', username: 'david', email: 'david@example.com', role: 'admin', active: true },
    { id: 'u2', name: 'Bénédicte Lopez', username: 'benedicte', email: 'bene@example.com', role: 'associate', active: true },
    { id: 'u4', name: 'Technicien Atelier', username: 'atelier', email: 'atelier@example.com', role: 'technician', active: true },
    { id: 'u3', name: 'Ancien compte', username: 'old', email: 'old@example.com', role: 'trainee', active: false }
  ], null, 2));
  fs.writeFileSync(messaging.MESSAGE_FILE, '[]');

  const david = { id: 'u1', name: 'David Bourasseau' };
  const bene = { id: 'u2', name: 'Bénédicte Lopez' };
  const technician = { id: 'u4', name: 'Technicien Atelier' };
  const directory = messaging.directory(david);
  assert.equal(directory.length, 3);
  assert.equal(directory.find((item) => item.id === 'u1').isSelf, true);
  assert.equal(directory.some((item) => item.id === 'u3'), false);

  const sent = messaging.send(david, { toUserId: 'u2', subject: 'Test MAVIK', body: 'Le message interne fonctionne.' });
  assert.equal(sent.fromUserId, 'u1');
  assert.equal(sent.toUserId, 'u2');
  assert.deepEqual(sent.toUserIds, ['u2']);

  const multi = messaging.send(david, { toUserIds: ['u2', 'u4'], subject: 'Message groupé', body: 'Ce message est adressé à plusieurs employés.' });
  assert.deepEqual(new Set(multi.toUserIds), new Set(['u2', 'u4']));
  assert.equal(messaging.list(bene).records.some((item) => item.id === multi.id), true);
  assert.equal(messaging.list(technician).records.some((item) => item.id === multi.id), true);

  const beneInbox = messaging.list(bene);
  assert.equal(beneInbox.records.length, 2);
  assert.equal(beneInbox.unread, 2);

  messaging.markRead(bene, sent.id);
  messaging.markRead(bene, multi.id);
  assert.equal(messaging.list(bene).unread, 0);
  assert.equal(messaging.list(david).records.length, 2);

  assert.throws(() => messaging.send(david, { toUserIds: ['u2', 'unknown'], body: 'Impossible' }), /MESSAGE_RECIPIENT_NOT_FOUND/);
  assert.throws(() => messaging.send(david, { toUserId: 'u2', body: '' }), /MESSAGE_BODY_REQUIRED/);
  assert.throws(() => messaging.send(david, { toUserIds: [], body: 'Sans destinataire' }), /MESSAGE_RECIPIENT_REQUIRED/);

  console.log('Command dock internal messaging smoke test passed.');
} finally {
  if (usersBackup) fs.writeFileSync(auth.USERS_FILE, usersBackup); else { try { fs.unlinkSync(auth.USERS_FILE); } catch {} }
  if (messagesBackup) fs.writeFileSync(messaging.MESSAGE_FILE, messagesBackup); else { try { fs.unlinkSync(messaging.MESSAGE_FILE); } catch {} }
}
