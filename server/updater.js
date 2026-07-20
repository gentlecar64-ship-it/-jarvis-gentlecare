'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const designInstaller = require('./design-installer');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPDATE_DIR = path.join(DATA_DIR, 'updates');
const STATE_FILE = path.join(UPDATE_DIR, 'state.json');
const PENDING_FILE = path.join(UPDATE_DIR, 'pending-update.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LOCAL_DATA_FILE = path.join(DATA_DIR, 'gcos-local.json');
const PACKAGE_FILE = path.join(__dirname, 'package.json');
const DEFAULT_REPOSITORY = 'gentlecar64-ship-it/-jarvis-gentlecare';
const DEFAULT_SCHEDULE = Object.freeze({ start: '18:00', end: '07:30', timeZone: 'Europe/Paris', days: [1,2,3,4,5,6,0], automaticInstall: true });

let automaticUpdateRunning = false;
let checkingNow = false;

try { designInstaller.install(); }
catch (error) { console.warn(`[MAVIK DESIGN] ${String(error.message || error)}`); }

function ensureDir() { fs.mkdirSync(UPDATE_DIR, { recursive: true }); }
function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { ensureDir(); const temp = `${file}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8'); fs.renameSync(temp, file); }
function currentVersion() { return readJson(PACKAGE_FILE, { version: '0.0.0' }).version || '0.0.0'; }
function parseVersion(input) { return String(input || '0.0.0').replace(/^v/i, '').split('-')[0].split('.').map((part) => Number(part) || 0); }
function compareVersions(a, b) { const left = parseVersion(a); const right = parseVersion(b); for (let i = 0; i < Math.max(left.length, right.length, 3); i += 1) { const difference = (left[i] || 0) - (right[i] || 0); if (difference) return difference; } return 0; }
function runGit(args, options = {}) { return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: Number(options.timeout || 30000), stdio: options.stdio || ['ignore', 'pipe', 'pipe'] }).trim(); }
function localCommit() { try { return runGit(['rev-parse', 'HEAD']); } catch { return ''; } }
function updateBranch() { if (process.env.GCOS_UPDATE_BRANCH) return process.env.GCOS_UPDATE_BRANCH; try { return runGit(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main'; } catch { return 'main'; } }
function gitStatus() { try { return { ok: true, version: runGit(['--version']), branch: updateBranch(), commit: localCommit(), remote: runGit(['remote', 'get-url', 'origin']) }; } catch (error) { return { ok: false, error: String(error.message || error), branch: updateBranch(), commit: localCommit() }; } }
function validTime(value, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback; }
function ownerSchedule() {
  const users = readJson(USERS_FILE, []);
  const activeAdmins = (Array.isArray(users) ? users : []).filter((user) => user?.role === 'admin' && user.active !== false);
  const owner = activeAdmins.find((user) => user.systemOwner === true) || activeAdmins[0] || {};
  const preferences = owner.preferences || {};
  const days = [...new Set((Array.isArray(preferences.updateDays) ? preferences.updateDays : DEFAULT_SCHEDULE.days).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return {
    start: validTime(preferences.updateWindowStart, DEFAULT_SCHEDULE.start),
    end: validTime(preferences.updateWindowEnd, DEFAULT_SCHEDULE.end),
    timeZone: ['Europe/Paris', 'UTC'].includes(preferences.updateTimeZone) ? preferences.updateTimeZone : DEFAULT_SCHEDULE.timeZone,
    days: days.length ? days : [...DEFAULT_SCHEDULE.days],
    automaticInstall: preferences.updateAutoInstall !== false,
    onlyWhenIdle: preferences.updateOnlyWhenIdle !== false,
    ownerId: owner.id || '', ownerName: owner.name || '',
    source: owner.id ? `propriétaire MAVIK — ${owner.name || owner.username || owner.id}` : 'valeurs par défaut'
  };
}
function adminSchedule() { return ownerSchedule(); }
function minutes(value) { const [hour, minute] = String(value).split(':').map(Number); return hour * 60 + minute; }
function workshopIdle() {
  const data = readJson(LOCAL_DATA_FILE, {});
  const activeIntervention = (Array.isArray(data.interventions) ? data.interventions : []).some((item) => /en cours/i.test(`${item.workStatus || ''} ${item.status || ''}`));
  const activeSession = (Array.isArray(data.workSessions) ? data.workSessions : []).some((item) => /active|en cours/i.test(`${item.status || ''}`) && !item.endedAt);
  return { idle: !activeIntervention && !activeSession, activeIntervention, activeSession };
}
function updateWindowStatus(at = new Date()) {
  const schedule = ownerSchedule();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[values.weekday];
  const previousDay = (day + 6) % 7;
  const nowMinutes = Number(values.hour) * 60 + Number(values.minute);
  const startMinutes = minutes(schedule.start);
  const endMinutes = minutes(schedule.end);
  let allowed;
  if (startMinutes === endMinutes) allowed = schedule.days.includes(day);
  else if (startMinutes < endMinutes) allowed = schedule.days.includes(day) && nowMinutes >= startMinutes && nowMinutes < endMinutes;
  else allowed = (schedule.days.includes(day) && nowMinutes >= startMinutes) || (schedule.days.includes(previousDay) && nowMinutes < endMinutes);
  return { ...schedule, allowed, checkedAt: at.toISOString(), localTime: `${values.weekday} ${values.hour}:${values.minute}`, label: `${schedule.start}–${schedule.end} (${schedule.timeZone})` };
}
function state() {
  const saved = readJson(STATE_FILE, {});
  return { ...saved, enabled: process.env.GCOS_AUTO_UPDATE !== 'false', automaticInstall: process.env.GCOS_AUTO_INSTALL !== 'false' && adminSchedule().automaticInstall, channel: process.env.GCOS_UPDATE_CHANNEL || 'development', branch: updateBranch(), currentVersion: currentVersion(), currentCommit: localCommit(), checking: checkingNow, installing: automaticUpdateRunning, updateAvailable: Boolean(saved.updateAvailable), pendingRestart: fs.existsSync(PENDING_FILE), schedule: updateWindowStatus(), git: gitStatus() };
}
function saveState(patch) { const current = readJson(STATE_FILE, {}); const next = { ...current, ...patch, updatedAt: new Date().toISOString() }; writeJson(STATE_FILE, next); return state(); }
function githubHeaders() { const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'GCOS-Updater', 'X-GitHub-Api-Version': '2022-11-28' }; if (process.env.GCOS_GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GCOS_GITHUB_TOKEN}`; return headers; }
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
async function branchMetadata() { const repository = process.env.GCOS_UPDATE_REPOSITORY || DEFAULT_REPOSITORY; const branch = updateBranch(); const response = await fetchWithTimeout(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`, { headers: githubHeaders() }); if (!response.ok) throw new Error(`UPDATE_METADATA_${response.status}`); const commit = await response.json(); return { version: commit.sha.slice(0, 12), commit: commit.sha, name: commit.commit?.message?.split('\n')[0] || `Mise à jour ${commit.sha.slice(0, 7)}`, notes: commit.commit?.message || '', publishedAt: commit.commit?.committer?.date || commit.commit?.author?.date, releaseUrl: commit.html_url, branch }; }
async function releaseMetadata() { const repository = process.env.GCOS_UPDATE_REPOSITORY || DEFAULT_REPOSITORY; const response = await fetchWithTimeout(`https://api.github.com/repos/${repository}/releases/latest`, { headers: githubHeaders() }); if (!response.ok) throw new Error(`UPDATE_METADATA_${response.status}`); const release = await response.json(); const asset = (release.assets || []).find((item) => /gcos.*\.zip$/i.test(item.name)) || (release.assets || [])[0]; if (!asset) throw new Error('UPDATE_ASSET_NOT_FOUND'); return { version: String(release.tag_name || release.name || '').replace(/^v/i, ''), name: release.name || release.tag_name, notes: release.body || '', publishedAt: release.published_at, downloadUrl: asset.url, fileName: asset.name, size: asset.size, releaseUrl: release.html_url }; }
async function check() {
  if (process.env.GCOS_AUTO_UPDATE === 'false') return saveState({ enabled: false, lastError: null });
  if (checkingNow) return state();
  checkingNow = true; saveState({ lastError: null });
  try { const channel = process.env.GCOS_UPDATE_CHANNEL || 'development'; const latest = channel === 'stable' ? await releaseMetadata() : await branchMetadata(); const available = channel === 'stable' ? compareVersions(latest.version, currentVersion()) > 0 : Boolean(latest.commit && latest.commit !== localCommit()); return saveState({ updateAvailable: available, latest, lastCheckedAt: new Date().toISOString(), lastError: null }); }
  catch (error) { return saveState({ lastError: String(error.message || error), lastCheckedAt: new Date().toISOString() }); }
  finally { checkingNow = false; }
}
async function sha256(filePath) { return new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(filePath); stream.on('error', reject); stream.on('data', (chunk) => hash.update(chunk)); stream.on('end', () => resolve(hash.digest('hex'))); }); }
async function download() {
  const checked = await check(); if (!checked.updateAvailable || !checked.latest) return checked;
  if ((process.env.GCOS_UPDATE_CHANNEL || 'development') !== 'stable') return installGitUpdate(checked.latest);
  const backupPath = require('./backup').createBackup();
  saveState({ preUpdateBackup: backupPath, preUpdateBackupAt: new Date().toISOString() });
  ensureDir(); const destination = path.join(UPDATE_DIR, checked.latest.fileName || `gcos-${checked.latest.version}.zip`);
  const response = await fetchWithTimeout(checked.latest.downloadUrl, { headers: { ...githubHeaders(), Accept: 'application/octet-stream' }, redirect: 'follow' }, 120000);
  if (!response.ok) throw Object.assign(new Error(`UPDATE_DOWNLOAD_${response.status}`), { status: 502 });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer())); const digest = await sha256(destination);
  const pending = { version: checked.latest.version, archive: destination, sha256: digest, rootDir: ROOT_DIR, createdAt: new Date().toISOString() };
  writeJson(PENDING_FILE, pending); return saveState({ updateAvailable: false, pendingRestart: true, downloaded: pending });
}
function restartServer() { const entry = path.join(__dirname, 'server.js'); const helper = path.join(__dirname, 'restart-helper.js'); const child = spawn(process.execPath, [helper, String(process.pid), entry, __dirname], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true, env: process.env }); child.unref(); setTimeout(() => process.exit(0), 400).unref(); }
function validateInstalledFiles() {
  const scripts = [
    'server.js','auth.js','jarvis.js','jarvis-extended.js','jarvis-knowledge.js','jarvis-intelligence.js','jarvis-morale.js','emergency-alert.js','employee-flow.js','leave-planning.js',
    'quote-workflow.js','quote-workflow-current.js','quote-workflow-reference.js','quote-studio.js','quote-studio-service.js','quote-requests.js','tariff-catalog.js','workshop-procedures.js','workshop-service.js',
    'planning.js','planning-service.js','calendar-bridge.js','startup-status.js','intervention-report.js','client-intake.js','reputation.js','internal-messaging.js',
    'public/jarvis-quote.js','public/jarvis-workshop-context.js','public/reputation-client.js','public/command-dock.js','public/navigation-enhancer.js','public/quote-studio-client.js','public/quote-visual-preview.js','public/planning-client.js','public/workshop-client.js','public/profile-owner.js','public/generated/workshop/workshop-client.js','public/morale-client.js','public/airtable-client.js','public/procedures-client.js',
    'airtable-sync.js','updater.js','diagnostics.js','design-installer.js','launcher-check.js','restart-helper.js'
  ];
  for (const file of scripts) execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { cwd: __dirname, windowsHide: true, stdio: 'pipe', timeout: 15000 });
  const required = [
    path.join(__dirname,'public','alpha.template.html'),path.join(__dirname,'public','login.template.html'),path.join(__dirname,'public','profile.template.html'),path.join(__dirname,'public','jarvis.template.html'),
    path.join(__dirname,'public','quotes.html'),path.join(__dirname,'public','planning.html'),path.join(__dirname,'public','jarvis-quote.js'),path.join(__dirname,'public','quote-studio-client.js'),path.join(__dirname,'public','quote-visual-preview.js'),
    path.join(__dirname,'public','planning-client.js'),path.join(__dirname,'public','navigation-enhancer.js'),path.join(__dirname,'public','morale-client.js'),path.join(__dirname,'public','procedures.html'),path.join(__dirname,'public','airtable.html'),path.join(__dirname,'public','brand-shell.css'),path.join(__dirname,'public','generated','legal','index.html'),path.join(ROOT_DIR,'assets','brand','gentlecare-logo.png'),path.join(ROOT_DIR,'assets','brand','gentlecare-banner.jpg'),path.join(__dirname,'assets','logo','01.txt')
  ];
  for (const file of required) if (!fs.existsSync(file)) throw new Error(`UPDATE_FILE_MISSING: ${path.relative(ROOT_DIR, file)}`);
}
async function installGitUpdate(latest) {
  if (automaticUpdateRunning) return state();
  automaticUpdateRunning = true; const before = localCommit(); const branch = latest?.branch || updateBranch();
  saveState({ lastError: null, previousCommit: before, targetCommit: latest?.commit || '', installStartedAt: new Date().toISOString() });
  try {
    const backupPath = require('./backup').createBackup();
    saveState({ preUpdateBackup: backupPath, preUpdateBackupAt: new Date().toISOString() });
    runGit(['fetch','--prune','origin',branch],{timeout:60000}); const target = runGit(['rev-parse',`origin/${branch}`]);
    if (!target || target === before) { automaticUpdateRunning = false; return saveState({ updateAvailable:false,currentCommit:before,lastError:null }); }
    runGit(['reset','--hard',target],{timeout:60000}); designInstaller.install(); validateInstalledFiles();
    saveState({ updateAvailable:false,pendingRestart:false,installedCommit:target,installedAt:new Date().toISOString(),lastError:null }); restartServer(); return state();
  } catch (error) {
    try { if (before) runGit(['reset','--hard',before],{timeout:60000}); } catch {}
    automaticUpdateRunning = false; return saveState({ updateAvailable:true,lastError:`UPDATE_ROLLBACK: ${String(error.message || error)}`,rolledBackAt:new Date().toISOString() });
  }
}
async function automaticCycle() {
  if (automaticUpdateRunning || process.env.GCOS_AUTO_UPDATE === 'false') return state();
  const checked = await check();
  const window = updateWindowStatus();
  if (checked.updateAvailable && process.env.GCOS_AUTO_INSTALL !== 'false' && window.automaticInstall) {
    if (!window.allowed) return saveState({ updateDeferred:true, deferredReason:`Hors créneau du propriétaire ${window.label}`, nextInstallWindow:window.label });
    const activity = workshopIdle();
    if (window.onlyWhenIdle && !activity.idle) return saveState({ updateDeferred:true, deferredReason:'Atelier actif : installation reportée jusqu’à la fin du travail en cours', workshopActivity:activity, nextInstallWindow:window.label });
    return download();
  }
  return saveState({ updateDeferred:false, deferredReason:null });
}
function clearPending() { if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE); return saveState({ pendingRestart:false,downloaded:null }); }
function startAutomaticChecks() {
  if (process.env.GCOS_AUTO_UPDATE === 'false') return;
  const intervalMinutes = Math.max(5, Number(process.env.GCOS_UPDATE_INTERVAL_MINUTES || 15));
  const execute = () => automaticCycle().then((result) => { if (result.lastError) console.warn(`[MAVIK UPDATE] ${result.lastError}`); else if (result.updateDeferred) console.log(`[MAVIK UPDATE] Mise à jour détectée, installation différée : ${result.deferredReason}`); }).catch((error) => saveState({ lastError:String(error.message || error) }));
  setTimeout(execute,20000).unref(); setInterval(execute,intervalMinutes*60*1000).unref();
}

module.exports = { state,check,download,installGitUpdate,automaticCycle,clearPending,startAutomaticChecks,currentVersion,gitStatus,adminSchedule,ownerSchedule,updateWindowStatus,workshopIdle };
