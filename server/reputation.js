'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'reputation.json');
const GOOGLE_REVIEW_URL = String(process.env.GOOGLE_REVIEW_URL || '').trim();

const DEFAULTS = Object.freeze({
  enabled: true,
  tone: 'warm',
  frequency: 'normal',
  nickname: '',
  neverAskAgain: false,
  promptCount: 0,
  lastPromptAt: '',
  lastVariant: -1,
  snoozedUntil: '',
  submittedAt: '',
  rating: 0,
  feedback: ''
});

const VARIANTS = {
  professional: [
    'Votre expérience avec MAVIK nous aide à améliorer les prochaines versions. Souhaitez-vous laisser une note ou signaler une amélioration ?',
    'Un retour rapide permet à l’équipe de mieux prioriser les évolutions de MAVIK. Comment se passe votre utilisation ?',
    'MAVIK évolue grâce aux utilisateurs de terrain. Une note et une remarque nous aideraient à améliorer votre quotidien.'
  ],
  warm: [
    'Nous travaillons ensemble depuis quelque temps. Un petit retour aiderait l’équipe à rendre MAVIK encore plus utile pour vous.',
    'Votre avis compte vraiment : qu’est-ce que MAVIK fait bien, et qu’est-ce qu’il devrait mieux faire ?',
    'On avance ensemble. Une note rapide permettrait aux créateurs de MAVIK de mieux comprendre vos besoins.'
  ],
  humorous: [
    'On forme une bonne équipe, {{name}}. Je mérite une petite évaluation, ou au moins la liste de mes défauts avant ma prochaine mise à jour ?',
    'Petit contrôle technique de MAVIK : quelques étoiles et une remarque, sans obligation de contre-visite.',
    'Je promets de ne pas bouder : une note honnête m’aidera à devenir moins pénible et encore plus utile.'
  ]
};

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ users: {}, clientRequests: [] }, null, 2), 'utf8');
}
function read() { ensure(); try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: {}, clientRequests: [] }; } }
function write(value) { ensure(); const tmp = `${FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8'); fs.renameSync(tmp, FILE); }
function nowIso() { return new Date().toISOString(); }
function addDays(date, days) { const out = new Date(date); out.setDate(out.getDate() + days); return out; }
function normalizeSettings(input = {}) {
  return {
    ...DEFAULTS,
    ...input,
    enabled: input.enabled !== false,
    tone: ['professional', 'warm', 'humorous'].includes(input.tone) ? input.tone : DEFAULTS.tone,
    frequency: ['moderate', 'normal', 'sustained'].includes(input.frequency) ? input.frequency : DEFAULTS.frequency,
    nickname: String(input.nickname || '').trim().slice(0, 40),
    neverAskAgain: input.neverAskAgain === true,
    promptCount: Math.max(0, Number(input.promptCount || 0)),
    rating: Math.min(5, Math.max(0, Number(input.rating || 0)))
  };
}
function getUserSettings(user) {
  const data = read();
  return normalizeSettings(data.users?.[user.id] || {});
}
function saveUserSettings(user, patch = {}) {
  const data = read();
  data.users ||= {};
  data.users[user.id] = normalizeSettings({ ...(data.users[user.id] || {}), ...patch });
  write(data);
  return data.users[user.id];
}
function cadenceDays(settings) {
  if (settings.promptCount >= 3) return 90;
  return settings.frequency === 'moderate' ? 90 : settings.frequency === 'sustained' ? 30 : 45;
}
function promptDue(user, force = false) {
  const settings = getUserSettings(user);
  if (force) return { due: true, settings };
  if (!settings.enabled || settings.neverAskAgain || settings.submittedAt) return { due: false, settings };
  const now = new Date();
  if (settings.snoozedUntil && new Date(settings.snoozedUntil) > now) return { due: false, settings };
  const anchor = settings.lastPromptAt || user.createdAt || nowIso();
  return { due: addDays(new Date(anchor), cadenceDays(settings)) <= now, settings };
}
function buildPrompt(user, options = {}) {
  const state = promptDue(user, options.force === true);
  if (!state.due) return { due: false, settings: state.settings };
  const settings = state.settings;
  const variants = VARIANTS[settings.tone] || VARIANTS.warm;
  let index = Math.floor(Math.random() * variants.length);
  if (variants.length > 1 && index === settings.lastVariant) index = (index + 1) % variants.length;
  const name = settings.nickname || String(user.name || '').split(/\s+/)[0] || 'vous';
  const message = variants[index].replaceAll('{{name}}', name);
  const updated = saveUserSettings(user, { lastPromptAt: nowIso(), lastVariant: index, promptCount: settings.promptCount + 1 });
  return { due: true, message, settings: updated, scale: { min: 1, max: 5, preselected: null }, actions: ['submit', 'later', 'never'] };
}
function respond(user, input = {}) {
  const action = String(input.action || '').trim();
  if (action === 'never') return { ok: true, settings: saveUserSettings(user, { neverAskAgain: true, enabled: false }) };
  if (action === 'later') return { ok: true, settings: saveUserSettings(user, { snoozedUntil: addDays(new Date(), 30).toISOString() }) };
  const rating = Number(input.rating || 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('RATING_REQUIRED'), { status: 400 });
  return { ok: true, settings: saveUserSettings(user, { rating, feedback: String(input.feedback || '').trim().slice(0, 2000), submittedAt: nowIso(), snoozedUntil: '' }) };
}

function scheduleClientReview(store, quote, user = {}) {
  const clients = store.list('clients') || [];
  const vehicles = store.list('vehicles') || [];
  const client = clients.find((item) => item.id === quote.clientId) || {};
  const vehicle = vehicles.find((item) => item.id === quote.vehicleId) || {};
  const vehicleLabel = vehicle.label || [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'votre véhicule';
  const channel = client.preferredChannel || (client.mobile ? 'SMS' : 'E-mail');
  const link = GOOGLE_REVIEW_URL || '[LIEN_GOOGLE_A_CONFIGURER]';
  const base = new Date();
  const drafts = [
    { day: 1, subject: `Votre expérience GentleCarE — ${vehicleLabel}`, message: `Bonjour ${client.name || ''},\n\nMerci de nous avoir confié ${vehicleLabel}. Votre retour, positif comme critique, nous aide à progresser. Vous pouvez partager votre expérience en quelques secondes sur Google : ${link}\n\nVous pouvez également nous répondre directement pour un retour privé.\n\nBien cordialement,\nGentleCarE` },
    { day: 5, subject: `Un retour rapide sur GentleCarE`, message: `Bonjour ${client.name || ''},\n\nNous espérons que vous profitez pleinement de ${vehicleLabel}. Si vous avez une minute, votre avis honnête nous aiderait beaucoup : ${link}\n\nMerci encore pour votre confiance.\nGentleCarE` },
    { day: 14, subject: `Dernier rappel — votre avis nous aide`, message: `Bonjour ${client.name || ''},\n\nDernier petit rappel concernant votre expérience GentleCarE. Votre avis reste entièrement libre et nous aide à améliorer nos services : ${link}\n\nBien cordialement,\nGentleCarE` }
  ].map((item) => store.create('communications', {
    clientId: quote.clientId,
    vehicleId: quote.vehicleId,
    quoteId: quote.id,
    channel,
    status: 'Programmé — validation requise',
    scheduledAt: addDays(base, item.day).toISOString(),
    subject: item.subject,
    message: item.message,
    reputationRequest: true,
    googleReviewConfigured: Boolean(GOOGLE_REVIEW_URL),
    createdBy: user.id || '',
    createdByName: user.name || ''
  }));
  const data = read();
  data.clientRequests ||= [];
  data.clientRequests.push({ id: crypto.randomUUID(), quoteId: quote.id, clientId: quote.clientId, vehicleId: quote.vehicleId, createdAt: nowIso(), communicationIds: drafts.map((item) => item.id) });
  write(data);
  return { drafts, googleReviewConfigured: Boolean(GOOGLE_REVIEW_URL) };
}

module.exports = { FILE, DEFAULTS, getUserSettings, saveUserSettings, buildPrompt, respond, scheduleClientReview };
