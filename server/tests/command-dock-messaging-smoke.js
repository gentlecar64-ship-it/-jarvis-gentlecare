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
    { id: 'u3', name: 'Ancien compte', username: 'old', email: 'old@example.com', role: 'trainee', active: false }
  ], null, 2));
  fs.writeFileSync(messaging.MESSAGE_FILE, '[]');

  const david = { id: 'u1', name: 'David Bourasseau' };
  const bene = { id: 'u2', name: 'Bénédicte Lopez' };
  const directory = messaging.directory(david);
  assert.equal(directory.length, 2);
  assert.equal(directory.find((item) => item.id === 'u1').isSelf, true);
  assert.equal(directory.some((item) => item.id === 'u3'), false);

  const sent = messaging.send(david, { toUserId: 'u2', subject: 'Test MAVIK', body: 'Le message interne fonctionne.' });
  assert.equal(sent.fromUserId, 'u1');
  assert.equal(sent.toUserId, 'u2');

  const beneInbox = messaging.list(bene);
  assert.equal(beneInbox.records.length, 1);
  assert.equal(beneInbox.unread, 1);

  messaging.markRead(bene, sent.id);
  assert.equal(messaging.list(bene).unread, 0);
  assert.equal(messaging.list(david).records.length, 1);

  assert.throws(() => messaging.send(david, { toUserId: 'unknown', body: 'Impossible' }), /MESSAGE_RECIPIENT_NOT_FOUND/);
  assert.throws(() => messaging.send(david, { toUserId: 'u2', body: '' }), /MESSAGE_BODY_REQUIRED/);

  console.log('Command dock internal messaging smoke test passed.');
} finally {
  if (usersBackup) fs.writeFileSync(auth.USERS_FILE, usersBackup); else { try { fs.unlinkSync(auth.USERS_FILE); } catch {} }
  if (messagesBackup) fs.writeFileSync(messaging.MESSAGE_FILE, messagesBackup); else { try { fs.unlinkSync(messaging.MESSAGE_FILE); } catch {} }
}
