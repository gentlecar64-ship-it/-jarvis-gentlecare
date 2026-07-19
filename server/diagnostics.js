'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backups');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REPORT_FILE = path.join(DATA_DIR, 'diagnostics-last.json');
const CRASH_FILE = path.join(DATA_DIR, 'mavik-crash.log');

let lastReport = null;
let running = false;

function safeMessage(error) {
  return String(error?.message || error || 'Erreur inconnue').replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

function readLastReport() {
  if (lastReport) return lastReport;
  try { lastReport = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); }
  catch { lastReport = null; }
  return lastReport;
}

function check(id, label, status, detail, options = {}) {
  return {
    id,
    label,
    status,
    ok: status === 'ok',
    detail,
    repairable: Boolean(options.repairable),
    critical: Boolean(options.critical),
    humanAction: options.humanAction || ''
  };
}

function writableProbe(dir, prefix) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.${prefix}-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(probe, 'ok', 'utf8');
  fs.unlinkSync(probe);
}

function cleanupStaleFiles(dir, maxAgeMs = 30 * 60 * 1000) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.tmp')) continue;
    const filePath = path.join(dir, name);
    try {
      if (Date.now() - fs.statSync(filePath).mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        removed += 1;
      }
    } catch {}
  }
  return removed;
}

function gitProbe() {
  const version = execFileSync('git', ['--version'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT_DIR, encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim();
  return { version, commit, branch, remote };
}

async function run(dependencies, options = {}) {
  if (running) return readLastReport() || { overall: 'checking', checks: [], checkedAt: new Date().toISOString() };
  running = true;
  const started = Date.now();
  const repair = Boolean(options.repair);
  const checks = [];
  const repairs = [];
  const { localStore, airtableSync, updater, backup } = dependencies;

  try {
    try {
      if (repair) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const removed = cleanupStaleFiles(DATA_DIR) + cleanupStaleFiles(path.join(DATA_DIR, 'updates'));
        if (removed) repairs.push(`${removed} fichier(s) temporaire(s) supprimé(s)`);
      }
      writableProbe(DATA_DIR, 'mavik-data');
      const summary = localStore.summary();
      checks.push(check('local-data', 'Données locales', 'ok', `${summary.clients} client(s), ${summary.vehicles} véhicule(s), ${summary.interventions} intervention(s)`));
    } catch (error) {
      checks.push(check('local-data', 'Données locales', 'error', safeMessage(error), {
        critical: true,
        repairable: true,
        humanAction: 'Fermez MAVIK, puis lancez REPARER-MAVIK.cmd depuis C:\\Mavik-GCOS.'
      }));
    }

    try {
      writableProbe(BACKUP_DIR, 'mavik-backup');
      if (repair) {
        const saved = backup.createBackup();
        if (saved) repairs.push('Sauvegarde locale vérifiée');
      }
      checks.push(check('backup', 'Sauvegardes', 'ok', 'Dossier accessible et écriture opérationnelle'));
    } catch (error) {
      checks.push(check('backup', 'Sauvegardes', 'error', safeMessage(error), {
        critical: true,
        repairable: true,
        humanAction: 'Vérifiez que le disque C: n’est pas plein, puis relancez REPARER-MAVIK.cmd.'
      }));
    }

    try {
      const alphaPath = path.join(PUBLIC_DIR, 'alpha.html');
      const loginPath = path.join(PUBLIC_DIR, 'login.html');
      if (!fs.existsSync(alphaPath) || !fs.existsSync(loginPath)) throw new Error('Fichiers d’interface manquants');
      const alpha = fs.readFileSync(alphaPath, 'utf8');
      const hasOfficialLogo = alpha.includes('data:image/png;base64,') && alpha.includes('gce-official-logo');
      checks.push(check('interface', 'Interface GCOS', hasOfficialLogo ? 'ok' : 'warning', hasOfficialLogo ? 'Interface et logo officiel chargés' : 'Interface présente, logo officiel non intégré', {
        repairable: true,
        humanAction: 'Lancez la mise à jour automatique depuis le panneau Diagnostic.'
      }));
    } catch (error) {
      checks.push(check('interface', 'Interface GCOS', 'error', safeMessage(error), {
        critical: true,
        repairable: true,
        humanAction: 'Lancez REPARER-MAVIK.cmd depuis C:\\Mavik-GCOS.'
      }));
    }

    try {
      const git = gitProbe();
      checks.push(check('git', 'Moteur de mise à jour', 'ok', `${git.version} · ${git.branch}@${git.commit}`));
    } catch (error) {
      checks.push(check('git', 'Moteur de mise à jour', 'error', safeMessage(error), {
        critical: false,
        humanAction: 'Installez ou réparez Git pour Windows, puis relancez MAVIK.'
      }));
    }

    try {
      const state = repair ? await updater.check() : updater.state();
      const failed = Boolean(state.lastError);
      const status = failed ? 'warning' : 'ok';
      const detail = failed
        ? `Dernière erreur : ${state.lastError}`
        : state.updateAvailable
          ? 'Une mise à jour est disponible et sera installée automatiquement'
          : `À jour · vérification ${state.lastCheckedAt ? 'effectuée' : 'programmée'}`;
      checks.push(check('updates', 'Mises à jour automatiques', status, detail, {
        repairable: true,
        humanAction: failed ? 'Cliquez sur « Réparer maintenant ». Si l’erreur persiste, lancez REPARER-MAVIK.cmd.' : ''
      }));
    } catch (error) {
      checks.push(check('updates', 'Mises à jour automatiques', 'warning', safeMessage(error), {
        repairable: true,
        humanAction: 'Vérifiez la connexion Internet puis cliquez sur « Réparer maintenant ».'
      }));
    }

    try {
      if (!airtableSync.configured()) {
        checks.push(check('airtable', 'Connexion Airtable', 'warning', 'Clé Airtable absente de server/.env', {
          humanAction: 'Ajoutez AIRTABLE_TOKEN dans C:\\Mavik-GCOS\\server\\.env, puis redémarrez MAVIK.'
        }));
      } else {
        const result = await airtableSync.testConnection();
        checks.push(check('airtable', 'Connexion Airtable', result.ok ? 'ok' : 'warning', result.detail || 'Connexion testée', {
          repairable: true,
          humanAction: result.ok ? '' : 'Vérifiez la clé Airtable et l’accès à la base, puis cliquez sur « Réparer maintenant ».'
        }));
      }
    } catch (error) {
      checks.push(check('airtable', 'Connexion Airtable', 'warning', safeMessage(error), {
        repairable: true,
        humanAction: 'Vérifiez Internet et AIRTABLE_TOKEN, puis relancez le diagnostic.'
      }));
    }

    const errors = checks.filter((item) => item.status === 'error');
    const warnings = checks.filter((item) => item.status === 'warning');
    const overall = errors.some((item) => item.critical) ? 'critical' : errors.length || warnings.length ? 'degraded' : 'healthy';
    const humanHelp = checks.filter((item) => item.status !== 'ok' && item.humanAction).map((item, index) => ({
      step: index + 1,
      title: item.label,
      instruction: item.humanAction
    }));

    lastReport = {
      service: 'MAVIK Autodiagnostic',
      overall,
      score: Math.round((checks.filter((item) => item.ok).length / Math.max(checks.length, 1)) * 100),
      checks,
      repairs,
      humanHelp,
      hotline: {
        active: false,
        label: 'Hotline MAVIK',
        message: 'Hotline prochainement disponible. Les instructions de dépannage restent affichées ici.'
      },
      automaticRepair: true,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started
    };
    writeJson(REPORT_FILE, lastReport);
    return lastReport;
  } finally {
    running = false;
  }
}

function recordCrash(error, type = 'CRASH') {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] ${type}: ${safeMessage(error)}\n${String(error?.stack || '')}\n\n`;
    fs.appendFileSync(CRASH_FILE, line, 'utf8');
  } catch {}
}

function startAutomaticChecks(dependencies) {
  const execute = () => run(dependencies, { repair: true }).then((report) => {
    if (report.overall !== 'healthy') {
      console.warn(`[MAVIK DIAGNOSTIC] ${report.overall} · score ${report.score}%`);
      for (const step of report.humanHelp) console.warn(`[MAVIK AIDE] ${step.title}: ${step.instruction}`);
    }
  }).catch((error) => {
    recordCrash(error, 'DIAGNOSTIC');
    console.error('[MAVIK DIAGNOSTIC]', error);
  });
  setTimeout(execute, 8000).unref();
  setInterval(execute, Math.max(2, Number(process.env.GCOS_DIAGNOSTIC_INTERVAL_MINUTES || 5)) * 60 * 1000).unref();
}

module.exports = { run, readLastReport, recordCrash, startAutomaticChecks, REPORT_FILE, CRASH_FILE };
