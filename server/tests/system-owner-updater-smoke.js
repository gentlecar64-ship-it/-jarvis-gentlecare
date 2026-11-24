'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../auth');
const updater = require('../updater');

const usersBackup = fs.existsSync(auth.USERS_FILE) ? fs.readFileSync(auth.USERS_FILE) : null;

try {
  fs.mkdirSync(path.dirname(auth.USERS_FILE), { recursive: true });
  fs.writeFileSync(auth.USERS_FILE, '[]', 'utf8');
  const david = auth.createInitialAdmin({ name: 'David Test', username: 'david-owner', email: 'david.owner@example.com', password: '1234' }, { id: 'owner-pc', type: 'pc', label: 'PC test' });
  assert.equal(david.systemOwner, true);
  const benedicte = auth.createUser(david, { name: 'Bénédicte Test', username: 'benedicte-owner', email: 'benedicte.owner@example.com', password: '5678', role: 'admin' });
  assert.equal(auth.ownerSettings(david).owner.id, david.id);
  assert.throws(() => auth.setSystemOwner(benedicte, benedicte.id), /SYSTEM_OWNER_REQUIRED/);
  const transferred = auth.setSystemOwner(david, benedicte.id);
  assert.equal(transferred.owner.id, benedicte.id);
  const currentBenedicte = auth.listUsers(benedicte).find((user) => user.id === benedicte.id);
  auth.updateMyProfile(currentBenedicte, { preferences: { updateWindowStart: '21:00', updateWindowEnd: '06:00', updateTimeZone: 'Europe/Paris', updateDays: [1, 2, 3, 4, 5], updateAutoInstall: true } });
  assert.throws(() => auth.updateMyProfile(david, { preferences: { updateWindowStart: '19:00' } }), /SYSTEM_OWNER_REQUIRED/);
  const schedule = updater.ownerSchedule();
  assert.equal(schedule.ownerId, benedicte.id);
  assert.equal(schedule.start, '21:00');
  assert.equal(schedule.timeZone, 'Europe/Paris');
  assert.equal(updater.updateWindowStatus(new Date('2026-07-20T20:30:00.000Z')).allowed, true);
  assert.equal(updater.updateWindowStatus(new Date('2026-07-20T12:00:00.000Z')).allowed, false);
  console.log('System owner and automatic update schedule smoke test passed.');
} finally {
  if (usersBackup) fs.writeFileSync(auth.USERS_FILE, usersBackup); else { try { fs.unlinkSync(auth.USERS_FILE); } catch {} }
}
