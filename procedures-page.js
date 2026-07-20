'use strict';

const state = { records: [], query: '', risk: 'all', category: 'all' };
const icons = { voiture: '🚘', moto: '🏍', utilitaire: '🚐', camion: '🚛', avion: '✈', helicoptere: '🚁', industriel: '🏭', autre: '◎' };

function riskOf(record) {
  return /étude|préalable obligatoire|autorisation/i.test(`${record.label} ${(record.checklist || []).join(' ')}`) && !['voiture', 'moto', 'utilitaire'].includes(record.requestCategory) ? 'etude' : 'atelier';
}

function matches(record) {
  if (state.category !== 'all' && record.requestCategory !== state.category) return false;
  if (state.risk !== 'all' && riskOf(record) !== state.risk) return false;
  const haystack = `${record.label} ${record.requestCategory} ${(record.checklist || []).join(' ')}`.toLocaleLowerCase('fr-FR');
  return !state.query || haystack.includes(state.query);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChips() {
  const root = document.getElementById('procedureChips');
  root.replaceChildren();
  const options = [{ key: 'all', label: 'Toutes' }, ...state.records.map((record) => ({ key: record.requestCategory, label: `${icons[record.requestCategory] || '◎'} ${record.categoryLabel || record.requestCategory}` }))];
  for (const option of options) {
    const button = make('button', `chip${state.category === option.key ? ' active' : ''}`, option.label);
    button.type = 'button';
    button.addEventListener('click', () => { state.category = option.key; render(); });
    root.appendChild(button);
  }
}

function procedureCard(record) {
  const article = make('article', 'card procedure-card');
  article.id = `procedure-${record.requestCategory}`;
  article.dataset.risk = riskOf(record);
  const head = make('div', 'procedure-head');
  const titleGroup = make('div');
  titleGroup.append(make('div', 'card-label', `${icons[record.requestCategory] || '◎'} ${record.categoryLabel || record.requestCategory}`));
  titleGroup.append(make('h2', '', record.label));
  head.append(titleGroup, make('span', 'badge', riskOf(record) === 'etude' ? 'VALIDATION DIRECTION' : 'ATELIER V1'));
  article.appendChild(head);
  const meta = make('div', 'procedure-meta');
  meta.append(make('span', '', `Version ${record.version}`), make('span', '', `${record.defaultDurationDays} jour${record.defaultDurationDays > 1 ? 's' : ''} indicatif${record.defaultDurationDays > 1 ? 's' : ''}`), make('span', '', `${record.checklist.length} étapes`));
  article.appendChild(meta);
  if (riskOf(record) === 'etude') article.appendChild(make('div', 'notice', 'Aucune intervention automatique : étude, autorisations et validation de la direction obligatoires.'));
  const list = make('ol', 'steps');
  for (const label of record.checklist) list.appendChild(make('li', '', label));
  article.appendChild(list);
  return article;
}

function render() {
  renderChips();
  const grid = document.getElementById('procedureGrid');
  const records = state.records.filter(matches);
  grid.replaceChildren(...records.map(procedureCard));
  if (!records.length) grid.appendChild(make('article', 'card notice', 'Aucune procédure ne correspond à cette recherche.'));
}

async function boot() {
  try {
    const response = await fetch('./data/workshop-procedures.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`CATALOG_${response.status}`);
    const catalog = await response.json();
    state.records = catalog.records || [];
    document.getElementById('procedureCount').textContent = state.records.length;
    document.getElementById('stepCount').textContent = state.records.reduce((sum, record) => sum + (record.checklist || []).length, 0);
    document.getElementById('catalogVersion').textContent = `v${catalog.version || '1.0'}`;
    render();
  } catch (error) {
    document.getElementById('procedureGrid').appendChild(make('article', 'card notice', `Référentiel indisponible : ${error.message}`));
  }
}

document.getElementById('procedureSearch').addEventListener('input', (event) => { state.query = event.target.value.trim().toLocaleLowerCase('fr-FR'); render(); });
document.getElementById('riskFilter').addEventListener('change', (event) => { state.risk = event.target.value; render(); });
document.getElementById('printButton').addEventListener('click', () => window.print());
boot();
