'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = path.join(__dirname, 'data', 'gcos-local.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const EXTRA_FILES = ['incoming-parts.json', 'outgoing-mail-log.json', 'internal-messages.json', 'parts-airtable-sync.json'];

function backupName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `gcos-${stamp}.json`;
}

function cleanup(maxBackups = 30) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const prefix of ['gcos-', 'parts-', 'mail-', 'messages-', 'parts-sync-']) {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
      .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const file of files.slice(Math.max(1, maxBackups))) fs.unlinkSync(path.join(BACKUP_DIR, file.name));
  }
}
function createBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let mainTarget = null;
  if (fs.existsSync(DATA_FILE)) {
    mainTarget = path.join(BACKUP_DIR, 'gcos-' + stamp + '.json');
    fs.copyFileSync(DATA_FILE, mainTarget);
  }
  for (const [index, name] of EXTRA_FILES.entries()) {
    const source = path.join(__dirname, 'data', name);
    if (!fs.existsSync(source)) continue;
    const target = path.join(BACKUP_DIR, (['parts-', 'mail-', 'messages-', 'parts-sync-'][index]) + stamp + '.json');
    fs.copyFileSync(source, target);
    if (!mainTarget) mainTarget = target;
  }
  cleanup(Number(process.env.GCOS_BACKUP_RETENTION || 30));
  return mainTarget;
}

function startAutomaticBackups() {
  const intervalMinutes = Number(process.env.GCOS_BACKUP_INTERVAL_MINUTES || 360);
  const interval = Math.max(15, intervalMinutes) * 60 * 1000;
  createBackup();
  const timer = setInterval(() => {
    try { createBackup(); }
    catch (error) { console.error('[GCOS BACKUP]', error); }
  }, interval);
  timer.unref();
  return timer;
}

module.exports = { createBackup, startAutomaticBackups, BACKUP_DIR };
