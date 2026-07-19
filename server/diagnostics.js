'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const designInstaller = require('./design-installer');
const startupStatus = require('./startup-status');
const tariffCatalog = require('./tariff-catalog');
const workshopProcedures = require('./workshop-procedures');
const calendarBridge = require('./calendar-bridge');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backups');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REPORT_FILE = path.join(DATA_DIR, 'diagnostics-last.json');
const CRASH_FILE = path.join(DATA_DIR, 'mavik-crash.log');
let lastReport = null;
let startupReadiness = null;
let running = false;

function safeMessage(error) { return String(error?.message || error || 'Erreur inconnue').replace(/[\r\n]+/g, ' ').slice(0, 500); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8'); fs.renameSync(temp, file); }
function readLastReport() { if (lastReport) return lastReport; try { lastReport = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch { lastReport = null; } return lastReport; }
function readStartupStatus() { return startupReadiness; }
function item(id, label, status, detail, options = {}) { return { id, label, status, ok: status === 'ok', detail, critical: Boolean(options.critical), repairable: Boolean(options.repairable), humanAction: options.humanAction || '' }; }
function writable(dir, name) { fs.mkdirSync(dir, { recursive: true }); const probe = path.join(dir, `.${name}-${process.pid}-${Date.now()}.tmp`); fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe); }
function cleanup(dir) { if (!fs.existsSync(dir)) return 0; let count = 0; for (const name of fs.readdirSync(dir)) { if (!name.endsWith('.tmp')) continue; const file = path.join(dir, name); try { if (Date.now() - fs.statSync(file).mtimeMs > 1800000) { fs.unlinkSync(file); count += 1; } } catch {} } return count; }
function gitProbe() { return { version: execFileSync('git', ['--version'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim(), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim(), branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim() }; }

function validateGeneratedPage(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`INTERFACE_MISSING: ${path.basename(filePath)}`);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('data:image/png;base64,') || !content.includes('mavik-design-lock')) throw new Error(`DESIGN_LOCK_MISSING: ${path.basename(filePath)}`);
  return content.length;
}
function installDesign() {
  const result = designInstaller.install();
  const pages = [result.target, result.loginTarget, result.profileTarget, result.jarvisTarget];
  const size = pages.reduce((sum, file) => sum + validateGeneratedPage(file), 0);
  return { ...result, validatedPages: pages.length, validatedSize: size };
}
try { installDesign(); } catch (error) { console.error('[MAVIK DESIGN]', safeMessage(error)); }

function buildAndPrintStartup(dependencies) {
  const host = process.env.GCOS_HOST || '0.0.0.0';
  const port = Number(process.env.GCOS_PORT || 4782);
  const publicHost = host === '0.0.0.0' ? 'localhost' : host;
  let calendarConfigured = false;
  try { calendarConfigured = calendarBridge.settings('').configured; } catch {}
  startupReadiness = startupStatus.build({
    localStore: dependencies.localStore,
    tariffCatalog,
    workshopProcedures,
    updater: dependencies.updater,
    airtableConfigured: dependencies.airtableSync.configured(),
    calendarConfigured,
    version: dependencies.updater.currentVersion(),
    port,
    host,
    url: `http://${publicHost}:${port}`
  });
  startupStatus.print(startupReadiness);
  return startupReadiness;
}

async function run(dependencies, options = {}) {
  if (running) return readLastReport() || { overall:'checking', score:0, checks:[], checkedAt:new Date().toISOString() };
  running = true;
  const started = Date.now();
  const repair = Boolean(options.repair);
  const checks = [];
  const repairs = [];
  const { localStore, airtableSync, updater, backup } = dependencies;
  try {
    try {
      if (repair) { const removed = cleanup(DATA_DIR) + cleanup(path.join(DATA_DIR, 'updates')); if (removed) repairs.push(`${removed} fichier(s) temporaire(s) supprimé(s)`); }
      writable(DATA_DIR, 'data');
      const summary = localStore.summary();
      checks.push(item('local-data','Données locales','ok',`${summary.clients} client(s), ${summary.vehicles} dossier(s), ${summary.interventions} intervention(s)`));
    } catch (error) { checks.push(item('local-data','Données locales','error',safeMessage(error),{ critical:true, repairable:true, humanAction:'Fermez MAVIK puis double-cliquez sur C:\\Mavik-GCOS\\REPARER-MAVIK.cmd.' })); }

    try {
      writable(BACKUP_DIR, 'backup');
      if (repair) { const saved = backup.createBackup(); if (saved) repairs.push('Sauvegarde locale vérifiée'); }
      checks.push(item('backup','Sauvegardes','ok','Dossier accessible et écriture opérationnelle'));
    } catch (error) { checks.push(item('backup','Sauvegardes','error',safeMessage(error),{ critical:true, repairable:true, humanAction:'Vérifiez que le disque C: n’est pas plein puis lancez REPARER-MAVIK.cmd.' })); }

    try {
      if (repair) { const installed = installDesign(); repairs.push(`Design GentleCarE verrouillé réinstallé sur ${installed.validatedPages} interfaces`); }
      ['alpha.html','login.html','profile.html','jarvis.html'].forEach((name) => validateGeneratedPage(path.join(PUBLIC_DIR,name)));
      checks.push(item('interface','Design GentleCarE verrouillé','ok','Tableau de bord, iPhone, connexion, profil et Jarvis utilisent la présentation validée'));
    } catch (error) { checks.push(item('interface','Design GentleCarE verrouillé','error',safeMessage(error),{ critical:true, repairable:true, humanAction:'Double-cliquez sur C:\\Mavik-GCOS\\REPARER-MAVIK.cmd.' })); }

    try { const git = gitProbe(); checks.push(item('git','Moteur de mise à jour','ok',`${git.version} · ${git.branch}@${git.commit}`)); }
    catch (error) { checks.push(item('git','Moteur de mise à jour','error',safeMessage(error),{ humanAction:'Réparez Git pour Windows puis relancez MAVIK.' })); }

    try {
      const state = repair ? await updater.check() : updater.state();
      const failed = Boolean(state.lastError);
      checks.push(item('updates','Mises à jour automatiques',failed ? 'warning' : 'ok',failed ? `Dernière erreur : ${state.lastError}` : state.pendingRestart ? 'Mise à jour installée — redémarrage requis' : state.updateAvailable ? 'Mise à jour disponible, installation automatique programmée' : 'Version chargée et vérification automatique programmée',{ repairable:true, humanAction:failed ? 'Vérifiez Internet puis cliquez sur Réparer maintenant. Si cela persiste, lancez REPARER-MAVIK.cmd.' : '' }));
    } catch (error) { checks.push(item('updates','Mises à jour automatiques','warning',safeMessage(error),{ repairable:true, humanAction:'Vérifiez Internet puis relancez le diagnostic.' })); }

    try {
      if (!airtableSync.configured()) checks.push(item('airtable','Connexion Airtable','warning','Clé Airtable absente de server/.env — le mode local reste opérationnel',{ humanAction:'Ajoutez AIRTABLE_TOKEN dans C:\\Mavik-GCOS\\server\\.env pour activer la synchronisation.' }));
      else { const result = await airtableSync.testConnection(); checks.push(item('airtable','Connexion Airtable',result.ok ? 'ok' : 'warning',result.detail || 'Connexion testée',{ repairable:true, humanAction:result.ok ? '' : 'Vérifiez Internet et la clé Airtable.' })); }
    } catch (error) { checks.push(item('airtable','Connexion Airtable','warning',safeMessage(error),{ repairable:true, humanAction:'Vérifiez Internet et AIRTABLE_TOKEN.' })); }

    const errors = checks.filter((check) => check.status === 'error');
    const warnings = checks.filter((check) => check.status === 'warning');
    const overall = errors.some((check) => check.critical) ? 'critical' : errors.length || warnings.length ? 'degraded' : 'healthy';
    const humanHelp = checks.filter((check) => check.status !== 'ok' && check.humanAction).map((check,index) => ({ step:index+1, title:check.label, instruction:check.humanAction }));
    lastReport = { service:'MAVIK Autodiagnostic', overall, score:Math.round(checks.filter((check) => check.ok).length / Math.max(checks.length,1) * 100), checks, repairs, humanHelp, automaticRepair:true, hotline:{ active:false, label:'Hotline MAVIK', message:'Hotline prochainement disponible. Les étapes de dépannage sont affichées dans MAVIK.' }, checkedAt:new Date().toISOString(), durationMs:Date.now()-started };
    writeJson(REPORT_FILE,lastReport);
    return lastReport;
  } finally { running = false; }
}

function recordCrash(error,type='CRASH') { try { fs.mkdirSync(DATA_DIR,{recursive:true}); fs.appendFileSync(CRASH_FILE,`[${new Date().toISOString()}] ${type}: ${safeMessage(error)}\n${String(error?.stack || '')}\n\n`,'utf8'); } catch {} }
function startAutomaticChecks(dependencies) {
  const execute = () => run(dependencies,{repair:true}).then((report) => {
    if (report.overall !== 'healthy') { console.warn(`[MAVIK DIAGNOSTIC] ${report.overall} · score ${report.score}%`); report.humanHelp.forEach((step) => console.warn(`[MAVIK AIDE] ${step.title}: ${step.instruction}`)); }
    buildAndPrintStartup(dependencies);
  }).catch((error) => { recordCrash(error,'DIAGNOSTIC'); console.error('[MAVIK DIAGNOSTIC]',error); try { buildAndPrintStartup(dependencies); } catch {} });
  setTimeout(() => { try { buildAndPrintStartup(dependencies); } catch (error) { console.error('[MAVIK DÉMARRAGE]',safeMessage(error)); } },1500).unref();
  setTimeout(execute,8000).unref();
  setInterval(execute,Math.max(2,Number(process.env.GCOS_DIAGNOSTIC_INTERVAL_MINUTES || 5))*60000).unref();
}

module.exports = { run, readLastReport, readStartupStatus, recordCrash, startAutomaticChecks, buildAndPrintStartup, REPORT_FILE, CRASH_FILE };
