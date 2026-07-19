'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPDATE_DIR = path.join(DATA_DIR, 'updates');
const STATE_FILE = path.join(UPDATE_DIR, 'state.json');
const PENDING_FILE = path.join(UPDATE_DIR, 'pending-update.json');
const PACKAGE_FILE = path.join(__dirname, 'package.json');
const DEFAULT_REPOSITORY = 'gentlecar64-ship-it/-jarvis-gentlecare';

let automaticUpdateRunning = false;

function ensureDir() { fs.mkdirSync(UPDATE_DIR, { recursive: true }); }
function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  ensureDir();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
function currentVersion() { return readJson(PACKAGE_FILE, { version: '0.0.0' }).version || '0.0.0'; }
function parseVersion(input) { return String(input || '0.0.0').replace(/^v/i, '').split('-')[0].split('.').map((part) => Number(part) || 0); }
function compareVersions(a, b) {
  const left = parseVersion(a); const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.length, right.length, 3); i += 1) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}
function runGit(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, stdio: options.stdio || ['ignore', 'pipe', 'pipe'] }).trim();
}
function localCommit() { try { return runGit(['rev-parse', 'HEAD']); } catch { return ''; } }
function updateBranch() {
  if (process.env.GCOS_UPDATE_BRANCH) return process.env.GCOS_UPDATE_BRANCH;
  try { return runGit(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main'; } catch { return 'main'; }
}
function state() {
  const saved = readJson(STATE_FILE, {});
  return {
    enabled: process.env.GCOS_AUTO_UPDATE !== 'false',
    automaticInstall: process.env.GCOS_AUTO_INSTALL !== 'false',
    channel: process.env.GCOS_UPDATE_CHANNEL || 'development',
    branch: updateBranch(),
    currentVersion: currentVersion(),
    currentCommit: localCommit(),
    checking: false,
    installing: false,
    updateAvailable: false,
    pendingRestart: fs.existsSync(PENDING_FILE),
    ...saved
  };
}
function saveState(patch) {
  const next = { ...state(), ...patch, updatedAt: new Date().toISOString() };
  writeJson(STATE_FILE, next);
  return next;
}
function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'GCOS-Updater', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GCOS_GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GCOS_GITHUB_TOKEN}`;
  return headers;
}
async function branchMetadata() {
  const repository = process.env.GCOS_UPDATE_REPOSITORY || DEFAULT_REPOSITORY;
  const branch = updateBranch();
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`UPDATE_METADATA_${response.status}`);
  const commit = await response.json();
  return {
    version: commit.sha.slice(0, 12),
    commit: commit.sha,
    name: commit.commit?.message?.split('\n')[0] || `Mise à jour ${commit.sha.slice(0, 7)}`,
    notes: commit.commit?.message || '',
    publishedAt: commit.commit?.committer?.date || commit.commit?.author?.date,
    releaseUrl: commit.html_url,
    branch
  };
}
async function releaseMetadata() {
  const repository = process.env.GCOS_UPDATE_REPOSITORY || DEFAULT_REPOSITORY;
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`UPDATE_METADATA_${response.status}`);
  const release = await response.json();
  const asset = (release.assets || []).find((item) => /gcos.*\.zip$/i.test(item.name)) || (release.assets || [])[0];
  if (!asset) throw new Error('UPDATE_ASSET_NOT_FOUND');
  return { version: String(release.tag_name || release.name || '').replace(/^v/i, ''), name: release.name || release.tag_name, notes: release.body || '', publishedAt: release.published_at, downloadUrl: asset.url, fileName: asset.name, size: asset.size, releaseUrl: release.html_url };
}
async function check() {
  if (process.env.GCOS_AUTO_UPDATE === 'false') return saveState({ enabled: false, checking: false });
  saveState({ enabled: true, checking: true, lastError: null });
  try {
    const channel = process.env.GCOS_UPDATE_CHANNEL || 'development';
    const latest = channel === 'stable' ? await releaseMetadata() : await branchMetadata();
    const available = channel === 'stable' ? compareVersions(latest.version, currentVersion()) > 0 : Boolean(latest.commit && latest.commit !== localCommit());
    return saveState({ checking: false, updateAvailable: available, latest, lastCheckedAt: new Date().toISOString() });
  } catch (error) {
    return saveState({ checking: false, lastError: error.message, lastCheckedAt: new Date().toISOString() });
  }
}
async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(filePath);
    stream.on('error', reject); stream.on('data', (chunk) => hash.update(chunk)); stream.on('end', () => resolve(hash.digest('hex')));
  });
}
async function download() {
  const checked = await check();
  if (!checked.updateAvailable || !checked.latest) return checked;
  if ((process.env.GCOS_UPDATE_CHANNEL || 'development') !== 'stable') return installGitUpdate(checked.latest);
  ensureDir();
  const destination = path.join(UPDATE_DIR, checked.latest.fileName || `gcos-${checked.latest.version}.zip`);
  const response = await fetch(checked.latest.downloadUrl, { headers: { ...githubHeaders(), Accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!response.ok) throw Object.assign(new Error(`UPDATE_DOWNLOAD_${response.status}`), { status: 502 });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  const digest = await sha256(destination);
  const pending = { version: checked.latest.version, archive: destination, sha256: digest, rootDir: ROOT_DIR, createdAt: new Date().toISOString() };
  writeJson(PENDING_FILE, pending);
  return saveState({ updateAvailable: false, pendingRestart: true, downloaded: pending });
}
function restartServer() {
  const entry = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [entry], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
  child.unref();
  setTimeout(() => process.exit(0), 750).unref();
}
async function installGitUpdate(latest) {
  if (automaticUpdateRunning) return state();
  automaticUpdateRunning = true;
  const before = localCommit();
  const branch = latest?.branch || updateBranch();
  saveState({ installing: true, lastError: null, previousCommit: before, targetCommit: latest?.commit || '' });
  try {
    runGit(['fetch', '--prune', 'origin', branch]);
    const target = runGit(['rev-parse', `origin/${branch}`]);
    if (!target || target === before) return saveState({ installing: false, updateAvailable: false, currentCommit: before });
    runGit(['reset', '--hard', target]);
    execFileSync(process.execPath, ['--check', path.join(__dirname, 'server.js')], { cwd: __dirname, windowsHide: true, stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', path.join(__dirname, 'jarvis.js')], { cwd: __dirname, windowsHide: true, stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', path.join(__dirname, 'updater.js')], { cwd: __dirname, windowsHide: true, stdio: 'pipe' });
    saveState({ installing: false, updateAvailable: false, pendingRestart: false, installedCommit: target, installedAt: new Date().toISOString(), lastError: null });
    restartServer();
    return state();
  } catch (error) {
    try { if (before) runGit(['reset', '--hard', before]); } catch {}
    automaticUpdateRunning = false;
    return saveState({ installing: false, updateAvailable: true, lastError: `UPDATE_ROLLBACK: ${error.message}`, rolledBackAt: new Date().toISOString() });
  }
}
async function automaticCycle() {
  if (automaticUpdateRunning || process.env.GCOS_AUTO_UPDATE === 'false') return state();
  const checked = await check();
  if (checked.updateAvailable && process.env.GCOS_AUTO_INSTALL !== 'false') return download();
  return checked;
}
function clearPending() { if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE); return saveState({ pendingRestart: false, downloaded: null }); }
function startAutomaticChecks() {
  if (process.env.GCOS_AUTO_UPDATE === 'false') return;
  const intervalMinutes = Math.max(5, Number(process.env.GCOS_UPDATE_INTERVAL_MINUTES || 15));
  setTimeout(() => automaticCycle().catch((error) => saveState({ lastError: error.message })), 20_000).unref();
  setInterval(() => automaticCycle().catch((error) => saveState({ lastError: error.message })), intervalMinutes * 60 * 1000).unref();
}

module.exports = { state, check, download, installGitUpdate, automaticCycle, clearPending, startAutomaticChecks, currentVersion };
