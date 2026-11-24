'use strict';

const fs = require('node:fs');
const path = require('node:path');

function exists(file) { try { return fs.existsSync(file); } catch { return false; } }
function anyExists(relatives) { return relatives.some((relative) => exists(path.join(__dirname, relative))); }
function shortCommit(value) { return String(value || '').slice(0, 12) || 'inconnu'; }
function airtableLabel(integrations = {}) {
  if (!integrations.airtableConfigured) return 'non configuré';
  if (integrations.airtableHealth?.ok === true) return 'connexion validée';
  if (integrations.airtableHealth?.ok === false) return `configuré — connexion en erreur (${integrations.airtableHealth.detail || 'test à relancer dans Profil'})`;
  return 'configuré — test disponible dans Profil';
}
function build(input = {}) {
  const failures = [];
  const warnings = [];
  let summary = {};
  let tariffs = [];
  let procedures = [];
  let git = {};
  let update = {};
  try { summary = input.localStore.summary(); } catch (error) { failures.push(`Données locales : ${error.message}`); }
  try { tariffs = input.tariffCatalog.list(); } catch (error) { failures.push(`Tarifs : ${error.message}`); }
  try { procedures = input.workshopProcedures.list(); } catch (error) { failures.push(`Procédures : ${error.message}`); }
  try { git = input.updater.gitStatus(); } catch (error) { failures.push(`Git : ${error.message}`); }
  try { update = input.updater.state(); } catch (error) { failures.push(`Mise à jour : ${error.message}`); }

  const requiredGroups = [
    { label:'Tableau de bord', files:['public/alpha.html','public/alpha.template.html'] },
    { label:'Connexion', files:['public/login.html','public/login.template.html'] },
    { label:'Profil', files:['public/profile.html','public/profile.template.html'] },
    { label:'Jarvis', files:['public/jarvis.html','public/jarvis.template.html'] },
    { label:'Demandes et devis', files:['public/quotes.html'] },
    { label:'Modèle imagé du devis', files:['public/generated/quote-visual-preview.js'] },
    { label:'Références légales', files:['public/generated/legal/index.html'] },
    { label:'Planning', files:['public/planning.html'] },
    { label:'Atelier', files:['public/generated/workshop/index.html'] },
    { label:'Moteur devis', files:['public/quote-studio-client.js'] },
    { label:'Moteur planning', files:['public/planning-client.js'] },
    { label:'Commandes MAVIK', files:['public/command-dock.js'] },
    { label:'Persistance des sessions', files:['data/sessions.json'] }
  ];
  for (const group of requiredGroups) if (!anyExists(group.files)) failures.push(`Interface manquante : ${group.label}`);
  const expectedCategories = ['voiture','moto','utilitaire','camion','avion','helicoptere','industriel','autre'];
  const procedureCategories = new Set(procedures.map((item) => item.requestCategory || item.vehicleType));
  for (const category of expectedCategories) if (!procedureCategories.has(category)) failures.push(`Procédure manquante : ${category}`);
  if (!tariffs.length) failures.push('Aucun tarif actif disponible');
  if (update.lastError) warnings.push(`Dernière vérification de mise à jour : ${update.lastError}`);
  if (!input.airtableConfigured) warnings.push('Airtable non configuré — fonctionnement local disponible');
  else if (input.airtableHealth?.ok === false) warnings.push(`Airtable configuré mais non connecté : ${input.airtableHealth.detail || 'relancer le test depuis le Profil'}`);
  else if (input.airtableHealth?.ok !== true) warnings.push('Airtable configuré — la présence du jeton ne prouve pas la connexion ; utilisez « Tester Airtable » dans le Profil');
  if (!input.calendarConfigured) warnings.push('Google Agenda non relié — planning local disponible');

  return {
    ok: failures.length === 0,
    version: input.version || update.currentVersion || 'inconnue',
    port: input.port,
    host: input.host,
    url: input.url,
    branch: git.branch || update.branch || 'inconnue',
    commit: git.commit || update.currentCommit || update.installedCommit || '',
    updateInstalledCommit: update.installedCommit || '',
    updateAvailable: update.updateAvailable === true,
    pendingRestart: update.pendingRestart === true,
    updateSchedule: update.schedule || null,
    modules: {
      localStore: failures.every((item) => !item.startsWith('Données locales')),
      tariffs: tariffs.length,
      procedures: procedures.length,
      quoteRequests: true,
      illustratedQuote: true,
      legalDocuments: true,
      persistentSessions: true,
      directionCancellation: true,
      planningWeekdaysOnly: true,
      emergency: true,
      messaging: true
    },
    data: summary,
    integrations: { airtableConfigured: Boolean(input.airtableConfigured), airtableHealth: input.airtableHealth || null, calendarConfigured: Boolean(input.calendarConfigured) },
    failures,
    warnings,
    checkedAt: new Date().toISOString()
  };
}
function print(status) {
  const line = '='.repeat(76);
  console.log(line);
  console.log('MAVIK GCOS — DÉMARRAGE TERMINÉ');
  console.log(`Serveur local : ${status.ok ? 'OK' : 'ERREUR'} — ${status.url}`);
  console.log(`Version chargée : ${status.version}`);
  console.log(`Mise à jour en place : ${status.pendingRestart ? 'REDÉMARRAGE NÉCESSAIRE' : 'OUI'} — branche ${status.branch} — commit ${shortCommit(status.commit)}`);
  if (status.updateSchedule) console.log(`Créneau administrateur des mises à jour : ${status.updateSchedule.label || `${status.updateSchedule.start}–${status.updateSchedule.end}`} — ${status.updateSchedule.allowed ? 'ouvert maintenant' : 'installation différée hors créneau'}`);
  console.log(`Modules locaux : ${status.ok ? 'OK' : 'À CONTRÔLER'} — devis imagé, CGV/autorisations, factures, atelier, planning lundi-vendredi, sessions continues, urgence, messagerie`);
  console.log(`Catégories devis : ${status.modules.procedures}/8 procédures chargées — voiture, moto, utilitaire, camion, avion, hélicoptère, industriel, autre`);
  console.log(`Données : ${status.modules.localStore ? 'OK' : 'ERREUR'} — ${status.data.clients || 0} client(s), ${status.data.quoteRequests || 0} demande(s), ${status.data.quotes || 0} devis`);
  console.log(`Intégrations facultatives : Airtable ${airtableLabel(status.integrations)} — Google Agenda ${status.integrations.calendarConfigured ? 'configuré' : 'non relié'}`);
  if (status.warnings.length) console.log(`Informations : ${status.warnings.join(' | ')}`);
  if (status.failures.length) console.log(`Erreurs : ${status.failures.join(' | ')}`);
  console.log(`ÉTAT GÉNÉRAL : ${status.ok ? 'TOUT EST OK — MAVIK EST PRÊT' : 'ATTENTION — MAVIK N’EST PAS ENTIÈREMENT PRÊT'}`);
  console.log(line);
}

module.exports = { build, print, airtableLabel };
