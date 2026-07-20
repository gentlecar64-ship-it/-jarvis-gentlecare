import { WorkshopOrchestrator, WORKSHOP_OPERATORS, TASK_STATUS, RESOURCE_STATUS } from '../../core/application/workshop-orchestrator.js';

const orchestrator = new WorkshopOrchestrator();
if (!orchestrator.state.interventions.length) orchestrator.reset({ withDemo: true });

const $ = (id) => document.getElementById(id);
const labels = { WAITING: 'EN ATTENTE', READY: 'PRÊTE', RUNNING: 'EN COURS', BLOCKED: 'BLOQUÉE', DONE: 'TERMINÉE', CANCELLED: 'ANNULÉE' };
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function notify(message, error = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.borderColor = error ? 'var(--red)' : 'var(--cyan)';
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function taskButtons(intervention, task) {
  const attrs = `data-intervention="${intervention.id}" data-task="${task.id}"`;
  if (task.status === TASK_STATUS.READY) return `<button class="button small primary" data-action="start" ${attrs}>Démarrer</button><button class="button small" data-action="block" ${attrs}>Bloquer</button>`;
  if (task.status === TASK_STATUS.RUNNING) return `<button class="button small primary" data-action="complete" ${attrs}>Terminer</button><button class="button small" data-action="block" ${attrs}>Bloquer</button>`;
  if (task.status === TASK_STATUS.BLOCKED && task.manualBlock) return `<button class="button small" data-action="unblock" ${attrs}>Débloquer</button>`;
  return '';
}

function render() {
  const dashboard = orchestrator.getDashboard();
  orchestrator.save();
  $('operatorSelect').innerHTML = WORKSHOP_OPERATORS.map((operator) => `<option value="${operator.id}" ${operator.id === dashboard.operator.id ? 'selected' : ''}>${escapeHtml(operator.name)} — ${escapeHtml(operator.role)}</option>`).join('');
  $('humidity').value = dashboard.environment.humidity;
  $('humidityValue').textContent = `${dashboard.environment.humidity} %`;

  const metrics = [['Interventions', dashboard.counts.interventions], ['Tâches prêtes', dashboard.counts.ready], ['En cours', dashboard.counts.running], ['Bloquées', dashboard.counts.blocked], ['Terminées', dashboard.counts.completed]];
  $('stats').innerHTML = metrics.map(([name, value]) => `<div class="stat"><span>${name}</span><strong>${value}</strong></div>`).join('');

  const decision = dashboard.nextDecision;
  if (decision) {
    $('recommendationTitle').textContent = `${decision.taskName} — ${decision.vehicle?.name || 'Véhicule'}`;
    $('recommendationReason').textContent = `${decision.client?.name || 'Client'} · ${decision.reasons.join(' · ')}`;
  } else {
    $('recommendationTitle').textContent = dashboard.interventions.length ? 'Aucune tâche démarrable' : 'Créer la première intervention';
    $('recommendationReason').textContent = dashboard.interventions.length ? 'Consultez les blocages et ressources ci-dessous.' : 'Le poste atelier est prêt.';
  }

  $('interventions').innerHTML = dashboard.interventions.map((intervention) => {
    const done = intervention.tasks.filter((task) => task.status === TASK_STATUS.DONE).length;
    const progress = Math.round(done / intervention.tasks.length * 100);
    const blocked = intervention.tasks.filter((task) => task.status === TASK_STATUS.BLOCKED).length;
    return `<article class="intervention ${intervention.id === dashboard.selectedInterventionId ? 'selected' : ''}" data-select="${intervention.id}"><h3>${escapeHtml(intervention.vehicle.name)}</h3><div class="meta">${escapeHtml(intervention.client.name)} · ${escapeHtml(intervention.vehicle.registration || 'Sans immatriculation')}</div><div class="progress"><span style="width:${progress}%"></span></div><span class="badge">${progress} %${blocked ? ` · ${blocked} blocage(s)` : ''}</span></article>`;
  }).join('') || '<div class="empty">Aucune intervention.</div>';

  const intervention = dashboard.interventions.find((item) => item.id === dashboard.selectedInterventionId);
  $('deleteIntervention').disabled = !intervention;
  if (!intervention) {
    $('workflowTitle').textContent = 'Sélectionnez une intervention';
    $('workflowContext').textContent = '';
    $('taskBoard').innerHTML = '<div class="empty">Créez ou sélectionnez un dossier.</div>';
  } else {
    $('workflowTitle').textContent = intervention.vehicle.name;
    $('workflowContext').textContent = `${intervention.client.name} · ${intervention.vehicle.registration || 'Sans immatriculation'} · ${intervention.tasks.length} tâches · opérateur actif : ${dashboard.operator.name}`;
    $('taskBoard').innerHTML = intervention.tasks.map((task, index) => {
      const dependencies = task.dependencies.length ? `Après : ${task.dependencies.join(', ')}` : 'Point de départ';
      const resources = task.resources.length ? `Ressources : ${task.resources.join(', ')}` : '';
      const blocks = task.blockReasons?.map((reason) => reason.message).join(' · ') || '';
      return `<article class="task ${task.status}"><div class="task-top"><h3>${index + 1}. ${escapeHtml(task.name)}</h3><span class="task-status">${labels[task.status] || task.status}</span></div><div class="task-details">${escapeHtml(dependencies)}${resources ? `<br>${escapeHtml(resources)}` : ''}${task.assignees?.length ? `<br>Opérateur : ${escapeHtml(task.assignees.join(', '))}` : ''}${blocks ? `<br><span class="block-reason">${escapeHtml(blocks)}</span>` : ''}</div><div class="task-actions">${taskButtons(intervention, task)}</div></article>`;
    }).join('');
  }

  $('resourceList').innerHTML = dashboard.resources.map((resource) => {
    const available = ![RESOURCE_STATUS.UNAVAILABLE, RESOURCE_STATUS.MAINTENANCE, RESOURCE_STATUS.IN_USE].includes(resource.status);
    const value = resource.quantity === null ? resource.status : `${resource.quantity} ${resource.unit}`;
    const stockActions = resource.quantity !== null ? `<button class="button small" data-restock="${resource.id}" data-quantity="${resource.id === 'dry-ice' ? 50 : 5}">+ stock</button>` : '';
    const statusAction = resource.quantity === null ? `<button class="button small" data-resource="${resource.id}" data-status="${available ? RESOURCE_STATUS.UNAVAILABLE : RESOURCE_STATUS.AVAILABLE}">${available ? 'Indisponible' : 'Rendre disponible'}</button>` : '';
    return `<div class="resource"><div class="resource-head"><strong><span class="status-dot ${available ? '' : 'bad'}"></span>${escapeHtml(resource.name)}</strong><span class="resource-value">${escapeHtml(value)}</span></div><div class="resource-actions">${stockActions}${statusAction}</div></div>`;
  }).join('');

  $('journal').innerHTML = dashboard.audit.slice(0, 60).map((event) => `<div class="journal-entry"><time>${new Date(event.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>${escapeHtml(event.type)}${event.interventionId ? ` · ${escapeHtml(event.interventionId.slice(-8))}` : ''}</div>`).join('') || '<div class="empty">Aucune action enregistrée.</div>';
}

function run(action) {
  try { action(); render(); }
  catch (error) { notify(error.message || String(error), true); }
}

$('operatorSelect').addEventListener('change', (event) => run(() => orchestrator.setActiveOperator(event.target.value)));
$('humidity').addEventListener('input', (event) => { $('humidityValue').textContent = `${event.target.value} %`; });
$('humidity').addEventListener('change', (event) => run(() => orchestrator.setHumidity(event.target.value)));
$('toggleCreate').addEventListener('click', () => { $('createForm').hidden = !$('createForm').hidden; });
$('createForm').addEventListener('submit', (event) => {
  event.preventDefault();
  run(() => {
    orchestrator.createIntervention({ clientName: $('clientName').value, vehicleName: $('vehicleName').value, registration: $('registration').value, priority: $('priority').value, deadline: $('deadline').value || null });
    event.target.reset(); event.target.hidden = true; notify('Intervention créée');
  });
});
$('interventions').addEventListener('click', (event) => {
  const card = event.target.closest('[data-select]');
  if (card) run(() => orchestrator.selectIntervention(card.dataset.select));
});
$('taskBoard').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, intervention, task } = button.dataset;
  run(() => {
    if (action === 'start') orchestrator.startTask(intervention, task);
    if (action === 'complete') orchestrator.completeTask(intervention, task, { note: '' });
    if (action === 'block') { const reason = prompt('Motif du blocage :', 'En attente d’un élément'); if (reason) orchestrator.blockTask(intervention, task, reason); }
    if (action === 'unblock') orchestrator.unblockTask(intervention, task);
  });
});
$('resourceList').addEventListener('click', (event) => {
  const status = event.target.closest('[data-resource]');
  const restock = event.target.closest('[data-restock]');
  if (status) run(() => orchestrator.setResourceStatus(status.dataset.resource, status.dataset.status));
  if (restock) run(() => orchestrator.restock(restock.dataset.restock, restock.dataset.quantity));
});
$('deleteIntervention').addEventListener('click', () => {
  const id = orchestrator.state.selectedInterventionId;
  if (id && confirm('Supprimer cette intervention de test ?')) run(() => orchestrator.deleteIntervention(id));
});
$('exportData').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(orchestrator.snapshot(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `mavik-atelier-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
});
$('importData').addEventListener('change', async (event) => {
  try { const snapshot = JSON.parse(await event.target.files[0].text()); orchestrator.importSnapshot(snapshot); render(); notify('Données importées'); }
  catch (error) { notify(error.message || 'Import impossible', true); }
  event.target.value = '';
});
$('resetDemo').addEventListener('click', () => { if (confirm('Effacer les essais de cet appareil et remettre la démonstration ?')) run(() => orchestrator.reset({ withDemo: true })); });

render();
