'use strict';

const staticMode = location.hostname.endsWith('github.io') || location.protocol === 'file:';
const elements = {
  header: document.getElementById('headerState'),
  state: document.getElementById('syncState'),
  title: document.getElementById('stateTitle'),
  message: document.getElementById('stateMessage'),
  detail: document.getElementById('stateDetail'),
  last: document.getElementById('lastOperation')
};
let schema;

function setState(type, title, message, detail = '') {
  elements.state.className = `sync-state ${type || ''}`.trim();
  elements.title.textContent = title;
  elements.message.textContent = message;
  elements.detail.textContent = detail;
  elements.header.className = `status-pill ${type === 'ok' ? '' : 'warning'}`.trim();
  elements.header.textContent = type === 'ok' ? 'AIRTABLE CONNECTÉ' : 'CONFIGURATION REQUISE';
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSchema(catalog) {
  const tables = catalog.tables || [];
  document.getElementById('tableCount').textContent = tables.length;
  document.getElementById('fieldCount').textContent = tables.reduce((sum, table) => sum + table.fields.length + table.links.length, 0);
  const root = document.getElementById('schemaTables');
  root.replaceChildren();
  for (const table of tables) {
    const section = make('section', 'table-wrap');
    const heading = make('h3', '', `${table.table} · ${table.collection}`);
    const grid = document.createElement('table');
    grid.innerHTML = '<thead><tr><th>MAVIK</th><th>Airtable</th><th>Nature</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const field of [...table.fields, ...table.links]) {
      const row = document.createElement('tr');
      for (const value of [field.local, field.remote, field.type === 'link' ? 'Relation' : 'Champ']) row.appendChild(make('td', '', value));
      body.appendChild(row);
    }
    grid.appendChild(body);
    section.append(heading, grid);
    root.appendChild(section);
  }
  const order = document.getElementById('syncOrder');
  order.replaceChildren(...(catalog.syncOrder || []).map((collection) => make('li', '', collection)));
}

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
  return payload;
}

async function loadStatus() {
  if (staticMode) {
    setState('warning', 'Passerelle prête, jeton non installé', 'La démonstration publique ne contient volontairement aucun secret.', 'Ouvrez ce cockpit depuis le serveur MAVIK après avoir installé AIRTABLE_TOKEN dans server/.env.');
    for (const id of ['testConnection', 'checkSchema', 'runSync']) document.getElementById(id).disabled = true;
    return;
  }
  try {
    const status = await api('/api/sync/status');
    if (status.configured) setState('ok', 'Passerelle configurée', 'Un jeton privé est installé sur le serveur.', `Base ${status.baseId} · synchronisation ${status.direction || 'contrôlée'}`);
    else setState('warning', 'Jeton Airtable manquant', 'Le serveur fonctionne en mode local.', 'Installez un jeton personnel Airtable dans server/.env puis redémarrez MAVIK.');
    if (status.lastRun?.completedAt) elements.last.textContent = `${status.lastRun.mode} · ${status.lastRun.completedAt} · ${status.lastRun.failed || 0} erreur(s)`;
  } catch (error) {
    setState('bad', 'Serveur MAVIK indisponible', 'Impossible de lire le statut de la passerelle.', error.message);
  }
}

async function run(label, path, options = {}) {
  elements.last.textContent = `${label} en cours…`;
  try {
    const result = await api(path, options);
    elements.last.textContent = `${label} terminé · ${new Date().toLocaleString('fr-FR')} · ${result.detail || (result.ok === false ? 'contrôle à corriger' : 'succès')}`;
    await loadStatus();
  } catch (error) {
    elements.last.textContent = `${label} impossible · ${error.message}`;
    setState('bad', 'Action Airtable impossible', label, error.message);
  }
}

async function boot() {
  try {
    const response = await fetch('./data/airtable-schema.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`SCHEMA_${response.status}`);
    schema = await response.json();
    renderSchema(schema);
  } catch (error) {
    document.getElementById('schemaTables').appendChild(make('div', 'notice', `Spécification indisponible : ${error.message}`));
  }
  await loadStatus();
}

document.getElementById('testConnection').addEventListener('click', () => run('Test de connexion', '/api/sync/test', { method: 'POST', body: '{}' }));
document.getElementById('checkSchema').addEventListener('click', () => run('Contrôle du schéma', '/api/sync/schema'));
document.getElementById('runSync').addEventListener('click', () => {
  if (!confirm('Lancer la synchronisation complète ? Airtable sera importé avant toute publication locale.')) return;
  run('Synchronisation complète', '/api/sync/run', { method: 'POST', body: '{}' });
});
boot();
