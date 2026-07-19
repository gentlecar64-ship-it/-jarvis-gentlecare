'use strict';

const fs = require('node:fs');
const path = require('node:path');
const reputation = require('./reputation');

const STATE_FILE = path.join(__dirname, 'data', 'jarvis-morale-state.json');
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

const PROFESSIONAL = [
  '{name}, le planning est propre. On garde ce rythme et on évite de transformer une avance en réunion de crise.',
  'Bon travail, {name}. Une étape claire, une validation, puis la suivante : c’est moins spectaculaire qu’un film, mais nettement plus rentable.',
  '{name}, vous avancez bien. Gardez les preuves, les photos et les cases cochées : la mémoire humaine a parfois le sens de l’improvisation.'
];
const WARM = [
  'Bien joué, {name}. Le dossier avance, l’atelier respire, et même Jarvis a presque envie de sourire.',
  '{name}, on garde le cap. Une voiture après l’autre, sinon les boulons vont finir par demander un chef de projet.',
  'Courage, {name}. Le plus gros morceau est souvent celui qu’on regarde depuis dix minutes sans le commencer.',
  '{name}, petite victoire enregistrée. Elles finissent par faire de gros résultats, comme les petites vis qui empêchent tout de tomber.'
];
const WORKSHOP = [
  '{name}, ça avance. Pas besoin de courir partout : même une Formule 1 s’arrête pour changer ses pneus.',
  'Allez {name}, on fait propre, on fait simple, et on laisse les complications aux gens qui aiment les réunions de trois heures.',
  '{name}, aujourd’hui on vise l’efficacité : moins de cinéma, plus de cases vertes. Le public applaudira à la restitution.',
  'Ça roule, {name}. Enfin, façon de parler : pour l’instant le véhicule est sur le pont et c’est très bien comme ça.',
  '{name}, une tâche terminée vaut mieux que douze tâches qui se regardent en chiens de faïence.',
  'Bon, {name}, le planning ne va pas se faire tout seul. Il a essayé, mais il manque encore un permis de conduire aux tableaux.',
  '{name}, si tout se passe bien, on dira que c’était prévu. Si ça se passe très bien, on dira que Jarvis avait tout calculé.',
  'Allez {name}, on garde la bonne humeur. Les mauvaises surprises, elles, sont déjà suffisamment motivées toutes seules.'
];

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function writeState(value) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, STATE_FILE);
}
function firstName(user = {}) { return String(user.name || user.username || 'collègue').trim().split(/\s+/)[0] || 'collègue'; }
function preferences(user = {}) {
  const saved = reputation.getUserSettings(user);
  return {
    enabled: saved.humourEnabled !== false,
    encouragementEnabled: saved.encouragementEnabled !== false,
    level: ['light', 'normal', 'high'].includes(saved.humourLevel) ? saved.humourLevel : 'normal',
    style: ['professional', 'warm', 'workshop'].includes(saved.humourStyle) ? saved.humourStyle : 'workshop'
  };
}
function pool(style) { return style === 'professional' ? PROFESSIONAL : style === 'warm' ? WARM : WORKSHOP; }
function probability(level) { return level === 'light' ? 0.08 : level === 'high' ? 0.32 : 0.17; }
function sensitive(result = {}, input = {}) {
  const value = `${result.type || ''} ${result.answer || ''} ${input.text || input.command || ''}`.toLowerCase();
  return /urgence|accident|bless|incend|erreur critique|refus|litige|expertise requise|paiement refus|donnée corrompue/.test(value);
}
function pick(user, options = {}) {
  const prefs = preferences(user);
  if (!prefs.enabled || !prefs.encouragementEnabled) return null;
  if (options.sensitive) return null;
  const state = readState();
  const key = String(user.id || user.username || 'anonymous');
  const previous = state[key] || {};
  const elapsed = Date.now() - Number(previous.lastAt || 0);
  if (!options.force && elapsed < COOLDOWN_MS) return null;
  if (!options.force && Math.random() > probability(prefs.level)) return null;
  const values = pool(prefs.style);
  let index = Math.floor(Math.random() * values.length);
  if (values.length > 1 && index === previous.lastIndex) index = (index + 1) % values.length;
  const message = values[index].replaceAll('{name}', firstName(user));
  state[key] = { lastAt: Date.now(), lastIndex: index, style: prefs.style, level: prefs.level };
  writeState(state);
  return { message, style: prefs.style, level: prefs.level, generatedAt: new Date().toISOString() };
}
function decorate(user, result = {}, input = {}) {
  const morale = pick(user, { sensitive: sensitive(result, input), force: input.forceMorale === true });
  if (!morale) return result;
  return { ...result, morale, answer: result.answer ? `${result.answer}\n\n${morale.message}` : morale.message };
}

module.exports = { STATE_FILE, pick, decorate, preferences, sensitive, COOLDOWN_MS };
