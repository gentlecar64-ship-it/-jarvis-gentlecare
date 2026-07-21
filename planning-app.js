import { WorkshopOrchestrator, WORKSHOP_OPERATORS, TASK_STATUS } from './core/application/workshop-orchestrator.js';

const payload = await fetch('./data/workshop-procedures.json').then((r) => r.ok ? r.json() : { records: [] }).catch(() => ({ records: [] }));
const orchestrator = new WorkshopOrchestrator({ procedures: payload.records || [] });
orchestrator.setProcedures(payload.records || []);
const $ = (id) => document.getElementById(id);
let selectedId = new URLSearchParams(location.search).get('intervention') || orchestrator.state.selectedInterventionId || '';
let toastTimer;

function esc(value) { return String(value ?? '').replace(/[&<>'\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[c])); }
function notify(message, error = false) { const t = $('toast'); t.textContent = message; t.style.borderColor = error ? 'var(--red)' : 'var(--cyan)'; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }
function localValue(value) { if (!value) return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function dateKey(value) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function task(intervention, id) { return intervention.tasks?.find((item) => item.id === id); }
function completePlanning(intervention) {
  const item = task(intervention, 'planning');
  if (!item || item.status === TASK_STATUS.DONE || item.status === TASK_STATUS.WAITING) return;
  if (item.status === TASK_STATUS.READY) orchestrator.startTask(intervention.id, 'planning');
  if (task(intervention, 'planning').status === TASK_STATUS.RUNNING) orchestrator.completeTask(intervention.id, 'planning', { note: `Intervention planifiée le ${intervention.logistics.interventionAt}` });
}
function ensureData(intervention) {
  intervention.logistics = intervention.logistics || { intakeMode: 'client-dropoff', returnMode: 'client-collection', intakeAt: '', interventionAt: '', address: '', transportPrice: '', nazaStatus: 'Demande de prix en cours' };
  intervention.schedule = intervention.schedule || { operatorId: 'david', durationHours: 4 };
}
orchestrator.state.interventions.forEach(ensureData);
orchestrator.save();

const today = new Date().toISOString().slice(0, 10);
$('planningDate').value = new URLSearchParams(location.search).get('date') || today;
$('actionOperator').innerHTML = WORKSHOP_OPERATORS.map((operator) => `<option value="${operator.id}">${esc(operator.name)} — ${esc(operator.role)}</option>`).join('');

function jobsForDate(date) { return orchestrator.state.interventions.filter((item) => dateKey(item.logistics?.interventionAt) === date); }
function renderTimeline() {
  const date = $('planningDate').value;
  const jobs = jobsForDate(date);
  $('lanes').innerHTML = WORKSHOP_OPERATORS.map((operator) => {
    const operatorJobs = jobs.filter((item) => (item.schedule?.operatorId || 'david') === operator.id);
    const cells = Array.from({ length: 10 }, (_, index) => `<div class="slot" style="grid-column:${index + 2}"></div>`).join('');
    const blocks = operatorJobs.map((item) => {
      const start = new Date(item.logistics.interventionAt).getHours();
      const column = Math.max(2, Math.min(11, start - 8 + 2));
      const span = Math.max(1, Math.min(Number(item.schedule?.durationHours || 4), 12 - column));
      return `<button class="job" data-job="${item.id}" style="grid-column:${column}/span ${span};grid-row:1"><strong>${esc(item.vehicle?.name || 'Véhicule')}</strong><span>${esc(item.client?.name || 'Client')} · ${new Date(item.logistics.interventionAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span><span class="badge">${esc(item.logistics.intakeMode === 'naza-pickup' ? 'Enlèvement Naza' : 'Dépôt client')}</span></button>`;
    }).join('');
    return `<div class="lane"><div class="person">${esc(operator.name)}</div>${cells}${blocks}</div>`;
  }).join('');
}
function renderLists() {
  const date = $('planningDate').value;
  const jobs = jobsForDate(date);
  $('dayItems').innerHTML = jobs.length ? jobs.map((item) => `<div class="item"><div class="row"><div><strong>${esc(item.vehicle?.name)}</strong><div class="muted">${esc(item.client?.name)} · prise en charge ${item.logistics?.intakeAt ? new Date(item.logistics.intakeAt).toLocaleString('fr-FR') : 'à définir'}</div></div><button class="btn" data-edit="${item.id}">Action</button></div></div>`).join('') : '<div class="muted">Aucune intervention prévue ce jour.</div>';
  const unscheduled = orchestrator.state.interventions.filter((item) => !item.logistics?.interventionAt);
  $('unscheduled').innerHTML = unscheduled.length ? unscheduled.map((item) => `<div class="item"><strong>${esc(item.vehicle?.name || 'Véhicule')}</strong><div class="muted">${esc(item.client?.name || 'Client')} · ${task(item, 'client-validation')?.status === TASK_STATUS.DONE ? 'devis validé' : 'validation du devis en attente'}</div><button class="btn primary" data-edit="${item.id}" style="margin-top:8px">Planifier</button></div>`).join('') : '<div class="muted">Tous les dossiers ont une date d’intervention.</div>';
}
function render() { renderTimeline(); renderLists(); }
function fillVehicleOptions() {
  $('actionVehicle').innerHTML = orchestrator.state.interventions.map((item) => `<option value="${item.id}">${esc(item.vehicle?.name || 'Véhicule')} — ${esc(item.client?.name || 'Client')}</option>`).join('');
}
function openAction(id = selectedId) {
  fillVehicleOptions();
  selectedId = id && orchestrator.state.interventions.some((item) => item.id === id) ? id : orchestrator.state.interventions[0]?.id || '';
  if (!selectedId) { notify('Créez d’abord un dossier dans le Poste atelier.', true); return; }
  $('actionVehicle').value = selectedId;
  fillActionForm();
  $('actionModal').classList.add('open');
}
function fillActionForm() {
  const intervention = orchestrator.state.interventions.find((item) => item.id === $('actionVehicle').value);
  if (!intervention) return;
  selectedId = intervention.id;
  ensureData(intervention);
  $('actionOperator').value = intervention.schedule.operatorId || 'david';
  $('actionDuration').value = intervention.schedule.durationHours || 4;
  $('actionIntakeAt').value = localValue(intervention.logistics.intakeAt);
  $('actionInterventionAt').value = localValue(intervention.logistics.interventionAt);
  $('actionIntakeMode').value = intervention.logistics.intakeMode || 'client-dropoff';
  $('actionReturnMode').value = intervention.logistics.returnMode || 'client-collection';
  $('actionAddress').value = intervention.logistics.address || '';
  updateNazaNotice();
}
function updateNazaNotice() { $('nazaNotice').hidden = !($('actionIntakeMode').value === 'naza-pickup' || $('actionReturnMode').value === 'naza-return'); }
function closeAction() { $('actionModal').classList.remove('open'); }
function saveAction(event) {
  event.preventDefault();
  const intervention = orchestrator.state.interventions.find((item) => item.id === $('actionVehicle').value);
  if (!intervention) return;
  ensureData(intervention);
  intervention.schedule.operatorId = $('actionOperator').value;
  intervention.schedule.durationHours = Number($('actionDuration').value) || 4;
  intervention.logistics.intakeAt = $('actionIntakeAt').value ? new Date($('actionIntakeAt').value).toISOString() : '';
  intervention.logistics.interventionAt = $('actionInterventionAt').value ? new Date($('actionInterventionAt').value).toISOString() : '';
  intervention.logistics.intakeMode = $('actionIntakeMode').value;
  intervention.logistics.returnMode = $('actionReturnMode').value;
  intervention.logistics.address = $('actionAddress').value.trim();
  const usesNaza = intervention.logistics.intakeMode === 'naza-pickup' || intervention.logistics.returnMode === 'naza-return';
  if (usesNaza) intervention.logistics.nazaStatus = Number(intervention.logistics.transportPrice) > 0 ? 'Prix confirmé' : 'Demande de prix en cours';
  if (!intervention.logistics.interventionAt) { notify('La date d’intervention est obligatoire.', true); return; }
  if (!intervention.logistics.intakeAt) { notify('La date de prise en charge est obligatoire.', true); return; }
  completePlanning(intervention);
  orchestrator.recalculateAll();
  orchestrator.save();
  $('planningDate').value = dateKey(intervention.logistics.interventionAt);
  closeAction();
  render();
  notify(usesNaza ? 'Planning enregistré. La demande de prix Naza reste à confirmer.' : 'Planning enregistré.');
}

$('actionButton').addEventListener('click', () => openAction());
$('heroAction').addEventListener('click', () => openAction());
$('mobileAction').addEventListener('click', () => openAction());
$('todayButton').addEventListener('click', () => { $('planningDate').value = today; render(); });
$('planningDate').addEventListener('change', render);
$('lanes').addEventListener('click', (event) => { const job = event.target.closest('[data-job]'); if (job) openAction(job.dataset.job); });
$('dayItems').addEventListener('click', (event) => { const button = event.target.closest('[data-edit]'); if (button) openAction(button.dataset.edit); });
$('unscheduled').addEventListener('click', (event) => { const button = event.target.closest('[data-edit]'); if (button) openAction(button.dataset.edit); });
$('actionVehicle').addEventListener('change', fillActionForm);
$('actionIntakeMode').addEventListener('change', updateNazaNotice);
$('actionReturnMode').addEventListener('change', updateNazaNotice);
$('actionForm').addEventListener('submit', saveAction);
$('openDossier').addEventListener('click', () => { location.href = `alpha/workshop/?intervention=${encodeURIComponent($('actionVehicle').value)}`; });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeAction));
$('actionModal').addEventListener('click', (event) => { if (event.target === $('actionModal')) closeAction(); });
render();
if (new URLSearchParams(location.search).get('action') === 'planifier') setTimeout(() => openAction(selectedId), 150);
