import { WorkshopOrchestrator, WORKSHOP_OPERATORS, TASK_STATUS } from '../../core/application/workshop-orchestrator.js';

const procedurePayload = await fetch('../../data/workshop-procedures.json')
  .then((response) => response.ok ? response.json() : { records: [] })
  .catch(() => ({ records: [] }));

const orchestrator = new WorkshopOrchestrator({ procedures: procedurePayload.records || [] });
orchestrator.setProcedures(procedurePayload.records || []);

const $ = (id) => document.getElementById(id);
const labels = { WAITING: 'EN ATTENTE', READY: 'PRÊTE', RUNNING: 'EN COURS', BLOCKED: 'BLOQUÉE', DONE: 'TERMINÉE', CANCELLED: 'ANNULÉE' };
const SERVICE_PACKAGES = [
  { id: 'integral-public', label: 'Pack Intégral Cryo + Dinitrol — tarif public', price: 1500, category: 'voiture' },
  { id: 'integral-club', label: 'Pack Intégral Cryo + Dinitrol — tarif Club', price: 1200, category: 'voiture' },
  { id: 'integral-founder', label: 'Pack Intégral Cryo + Dinitrol — Pass Fondateur', price: 1050, category: 'voiture' },
  { id: 'underbody-engine', label: 'Cryonettoyage dessous + moteur', price: '', category: 'voiture' },
  { id: 'underbody', label: 'Cryonettoyage dessous', price: '', category: 'voiture' },
  { id: 'engine', label: 'Cryonettoyage moteur', price: '', category: 'voiture' },
  { id: 'moto', label: 'Cryonettoyage moto — sur mesure', price: '', category: 'moto' },
  { id: 'industrial', label: 'Intervention industrielle — sur devis', price: '', category: 'industriel' },
  { id: 'custom', label: 'Prestation sur mesure', price: '', category: 'voiture' }
];
const DISPLAY_ORDER = ['request', 'inspection', 'before-photos', 'quote', 'client-validation', 'planning', 'reception', 'wheel-removal', 'protection', 'cryo', 'quality-control-1', 'dinitrol', 'drying', 'quality-control-2', 'final-photos', 'report', 'billing', 'delivery', 'follow-up'];
const TASK_NAMES = {
  request: 'Demande client', inspection: 'Inspection initiale', 'before-photos': 'Prise de photos', quote: 'Envoi du devis',
  'client-validation': 'Validation du devis', planning: 'Planification du rendez-vous', reception: 'Prise en charge du véhicule',
  'wheel-removal': 'Mise sur fosse et dépose des roues', protection: 'Protection des éléments sensibles', cryo: 'Cryonettoyage',
  'quality-control-1': 'Contrôle après cryo', dinitrol: 'Traitement DINITROL', drying: 'Séchage',
  'quality-control-2': 'Contrôle final', 'final-photos': 'Photos finales', report: 'Rapport d’intervention',
  billing: 'Facturation', delivery: 'Restitution / rapatriement', 'follow-up': 'Suivi client'
};
const REQUIRED_FIELDS = [
  ['clientName', 'nom du client'], ['clientPhone', 'téléphone'], ['clientEmail', 'e-mail'], ['vehicleName', 'véhicule'],
  ['registration', 'immatriculation'], ['servicePackage', 'forfait'], ['priceTtc', 'tarif TTC'], ['clientRequest', 'demande du client']
];

let toastTimer;
let recognition;
let selectedId = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function notify(message, error = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.borderColor = error ? 'var(--red)' : 'var(--cyan)';
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}
function taskBy(intervention, id) { return intervention?.tasks?.find((task) => task.id === id); }
function isDone(intervention, id) { return taskBy(intervention, id)?.status === TASK_STATUS.DONE; }
function packageById(id) { return SERVICE_PACKAGES.find((item) => item.id === id) || SERVICE_PACKAGES[0]; }
function currentIntervention() { return orchestrator.state.interventions.find((item) => item.id === selectedId) || null; }
function formatDateTime(value) { return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseigné'; }
function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
function normalizeGraph(intervention) {
  if (!intervention?.tasks) return;
  const beforePhotos = taskBy(intervention, 'before-photos');
  const quote = taskBy(intervention, 'quote');
  const validation = taskBy(intervention, 'client-validation');
  const planning = taskBy(intervention, 'planning');
  const reception = taskBy(intervention, 'reception');
  const wheelRemoval = taskBy(intervention, 'wheel-removal');
  if (beforePhotos) beforePhotos.dependencies = ['inspection'];
  if (quote) quote.dependencies = ['before-photos'];
  if (validation) validation.dependencies = ['quote'];
  if (planning) planning.dependencies = ['client-validation'];
  if (reception) reception.dependencies = ['planning'];
  if (wheelRemoval) {
    wheelRemoval.dependencies = ['reception'];
    wheelRemoval.resources = ['lift'];
  }
  intervention.client = intervention.client || {};
  intervention.vehicle = intervention.vehicle || {};
  intervention.logistics = intervention.logistics || { intakeMode: 'client-dropoff', returnMode: 'client-collection', intakeAt: '', interventionAt: '', address: '', transportPrice: '', nazaStatus: 'Demande de prix en cours' };
  intervention.quote = intervention.quote || { number: `GC-${String(Date.now()).slice(-8)}`, status: 'À préparer', draft: '', preparedAt: '', sentAt: '', validatedAt: '' };
  intervention.intakePhotos = intervention.intakePhotos || [];
  if (!intervention.servicePackageId) {
    const match = SERVICE_PACKAGES.find((item) => intervention.service?.toLowerCase().includes(item.label.split('—')[0].trim().toLowerCase()));
    intervention.servicePackageId = match?.id || 'custom';
  }
  const resource = orchestrator.state.resources?.find((item) => item.id === 'lift');
  if (resource) resource.name = 'Fosse atelier';
}
function initializeState() {
  orchestrator.state.interventions.forEach(normalizeGraph);
  orchestrator.recalculateAll();
  orchestrator.save();
  const queryId = new URLSearchParams(location.search).get('intervention');
  if (queryId && orchestrator.state.interventions.some((item) => item.id === queryId)) selectedId = queryId;
  else selectedId = orchestrator.state.selectedInterventionId || null;
}
function fillPackageOptions() {
  const options = SERVICE_PACKAGES.map((item) => `<option value="${item.id}">${escapeHtml(item.label)}</option>`).join('');
  $('servicePackage').innerHTML = options;
  $('newServicePackage').innerHTML = options;
}
function missingFields(intervention) {
  if (!intervention) return REQUIRED_FIELDS.map(([, label]) => label);
  const values = {
    clientName: intervention.client?.name,
    clientPhone: intervention.client?.phone,
    clientEmail: intervention.client?.email,
    vehicleName: intervention.vehicle?.name,
    registration: intervention.vehicle?.registration,
    servicePackage: intervention.servicePackageId,
    priceTtc: Number(intervention.priceTtc) > 0 ? intervention.priceTtc : '',
    clientRequest: intervention.clientRequest
  };
  return REQUIRED_FIELDS.filter(([key]) => !String(values[key] ?? '').trim()).map(([, label]) => label);
}
function quoteBlockingReasons(intervention) {
  const reasons = missingFields(intervention);
  if (!isDone(intervention, 'inspection')) reasons.push('inspection initiale terminée');
  if (!isDone(intervention, 'before-photos') || !(intervention.intakePhotos || []).length) reasons.push('photos initiales enregistrées');
  const usesNaza = intervention.logistics?.intakeMode === 'naza-pickup' || intervention.logistics?.returnMode === 'naza-return';
  if (usesNaza && !(Number(intervention.logistics?.transportPrice) > 0)) reasons.push('prix du transport Naza confirmé');
  return reasons;
}
function quoteText(intervention) {
  const definitive = isDone(intervention, 'inspection') && isDone(intervention, 'before-photos');
  const title = definitive ? 'DEVIS DÉFINITIF' : 'ESTIMATION AVANT INSPECTION';
  const logistics = [];
  if (intervention.logistics?.intakeMode === 'naza-pickup') logistics.push('Enlèvement du véhicule par Naza');
  if (intervention.logistics?.returnMode === 'naza-return') logistics.push('Rapatriement du véhicule par Naza');
  return `${title} — ${intervention.quote.number}\n\nClient : ${intervention.client.name}\nTéléphone : ${intervention.client.phone}\nE-mail : ${intervention.client.email}\nVéhicule : ${intervention.vehicle.name}\nImmatriculation : ${intervention.vehicle.registration}\nKilométrage : ${intervention.vehicle.mileage || 'Non communiqué'} km\n\nPrestation : ${packageById(intervention.servicePackageId).label}\nDemande : ${intervention.clientRequest}\nMontant : ${Number(intervention.priceTtc || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} TTC${Number(intervention.logistics?.transportPrice) > 0 ? `\nTransport : ${Number(intervention.logistics.transportPrice).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} TTC` : ''}${logistics.length ? `\nMobilité : ${logistics.join(' + ')}` : ''}\n\nConditions GentleCarE :\n- Le devis définitif est établi après inspection du véhicule. Tout tarif communiqué avant inspection est une estimation sous réserve de l’état réel du véhicule.\n- Particuliers : acompte de 50 % à l’acceptation, puis solde avant restitution.\n- Le rendez-vous n’est confirmé qu’après réception de l’acompte.\n- Paiement par virement, carte ou espèces. Les chèques ne sont pas acceptés.\n- Toute annulation ou demande de report doit intervenir au moins 72 heures avant le rendez-vous.\n\nGentleCarE`;
}
function saveSelectedFromForm({ renderAfter = true } = {}) {
  const intervention = currentIntervention();
  if (!intervention) return;
  intervention.client.name = $('clientName').value.trim();
  intervention.client.phone = $('clientPhone').value.trim();
  intervention.client.email = $('clientEmail').value.trim();
  intervention.vehicle.name = $('vehicleName').value.trim();
  intervention.vehicle.registration = $('registration').value.trim().toUpperCase();
  intervention.vehicle.vin = $('vin').value.trim();
  intervention.vehicle.mileage = Number($('mileage').value) || 0;
  intervention.servicePackageId = $('servicePackage').value;
  intervention.service = packageById(intervention.servicePackageId).label;
  intervention.priceTtc = Number($('priceTtc').value) || 0;
  intervention.clientRequest = $('clientRequest').value.trim();
  intervention.internalNotes = $('internalNotes').value.trim();
  intervention.logistics.intakeMode = $('intakeMode').value;
  intervention.logistics.returnMode = $('returnMode').value;
  intervention.logistics.intakeAt = $('intakeAt').value ? new Date($('intakeAt').value).toISOString() : '';
  intervention.logistics.interventionAt = $('interventionAt').value ? new Date($('interventionAt').value).toISOString() : '';
  intervention.logistics.address = $('transportAddress').value.trim();
  intervention.logistics.transportPrice = Number($('transportPrice').value) || 0;
  intervention.updatedAt = new Date().toISOString();
  orchestrator.save();
  updateMissingState(intervention);
  if (renderAfter) render();
}
function updateMissingState(intervention) {
  const missingKeys = new Set();
  const values = {
    clientName: intervention?.client?.name, clientPhone: intervention?.client?.phone, clientEmail: intervention?.client?.email,
    vehicleName: intervention?.vehicle?.name, registration: intervention?.vehicle?.registration, servicePackage: intervention?.servicePackageId,
    priceTtc: Number(intervention?.priceTtc) > 0 ? intervention.priceTtc : '', clientRequest: intervention?.clientRequest
  };
  REQUIRED_FIELDS.forEach(([key]) => { if (!String(values[key] ?? '').trim()) missingKeys.add(key); });
  REQUIRED_FIELDS.forEach(([key]) => $(key)?.classList.toggle('required-missing', missingKeys.has(key)));
  const missing = missingFields(intervention);
  const panel = $('missingPanel');
  panel.classList.toggle('show', missing.length > 0);
  panel.innerHTML = missing.length ? `<strong>Jarvis attend encore :</strong> ${escapeHtml(missing.join(', '))}.` : '<strong>Dossier minimum complet.</strong> Jarvis peut préparer le devis.';
}
function fillForm(intervention) {
  $('clientName').value = intervention.client?.name || '';
  $('clientPhone').value = intervention.client?.phone || '';
  $('clientEmail').value = intervention.client?.email || '';
  $('vehicleName').value = intervention.vehicle?.name || '';
  $('registration').value = intervention.vehicle?.registration || '';
  $('vin').value = intervention.vehicle?.vin || '';
  $('mileage').value = intervention.vehicle?.mileage || '';
  $('servicePackage').value = intervention.servicePackageId || 'custom';
  $('priceTtc').value = intervention.priceTtc || packageById(intervention.servicePackageId).price || '';
  $('clientRequest').value = intervention.clientRequest || '';
  $('internalNotes').value = intervention.internalNotes || '';
  $('intakeMode').value = intervention.logistics?.intakeMode || 'client-dropoff';
  $('returnMode').value = intervention.logistics?.returnMode || 'client-collection';
  $('intakeAt').value = toLocalInput(intervention.logistics?.intakeAt);
  $('interventionAt').value = toLocalInput(intervention.logistics?.interventionAt);
  $('transportAddress').value = intervention.logistics?.address || '';
  $('transportPrice').value = intervention.logistics?.transportPrice || '';
  updateMissingState(intervention);
  updateNazaBox(intervention);
}
function updateNazaBox(intervention) {
  const usesNaza = intervention.logistics?.intakeMode === 'naza-pickup' || intervention.logistics?.returnMode === 'naza-return';
  $('nazaStatus').textContent = usesNaza ? (Number(intervention.logistics.transportPrice) > 0 ? 'Prix transport renseigné' : 'Demande de prix en cours') : 'Aucun transport demandé';
  $('prepareNaza').disabled = !usesNaza;
}
function prepareQuote(intervention) {
  const missing = missingFields(intervention);
  if (missing.length) throw new Error(`Informations manquantes : ${missing.join(', ')}`);
  intervention.quote.draft = quoteText(intervention);
  intervention.quote.preparedAt = new Date().toISOString();
  intervention.quote.status = quoteBlockingReasons(intervention).length ? 'Brouillon à compléter' : 'Prêt à envoyer';
  orchestrator.save();
}
function sendQuote(intervention) {
  const reasons = quoteBlockingReasons(intervention);
  if (reasons.length) throw new Error(`Envoi bloqué : ${reasons.join(', ')}`);
  if (!intervention.quote.draft) prepareQuote(intervention);
  const task = taskBy(intervention, 'quote');
  if (task.status === TASK_STATUS.READY) orchestrator.startTask(intervention.id, 'quote');
  if ([TASK_STATUS.RUNNING, TASK_STATUS.READY].includes(taskBy(intervention, 'quote').status)) orchestrator.completeTask(intervention.id, 'quote');
  intervention.quote.status = 'Envoyé';
  intervention.quote.sentAt = new Date().toISOString();
  const outbox = JSON.parse(localStorage.getItem('gcos-outbox') || '[]');
  outbox.push({ type: 'quote', interventionId: intervention.id, to: intervention.client.email, subject: `Devis GentleCarE ${intervention.quote.number}`, body: intervention.quote.draft, createdAt: intervention.quote.sentAt, status: 'À envoyer par la messagerie' });
  localStorage.setItem('gcos-outbox', JSON.stringify(outbox.slice(-100)));
  orchestrator.save();
  const mailto = `mailto:${encodeURIComponent(intervention.client.email)}?subject=${encodeURIComponent(`Devis GentleCarE ${intervention.quote.number}`)}&body=${encodeURIComponent(intervention.quote.draft)}`;
  location.href = mailto;
}
function completeTaskSafely(intervention, taskId, payload = {}) {
  const task = taskBy(intervention, taskId);
  if (!task) return;
  if (task.status === TASK_STATUS.READY) orchestrator.startTask(intervention.id, taskId);
  const active = taskBy(intervention, taskId);
  if (active.status === TASK_STATUS.RUNNING) orchestrator.completeTask(intervention.id, taskId, payload);
}
function ensureRequestCompleted(intervention) {
  if (!missingFields(intervention).length && !isDone(intervention, 'request')) completeTaskSafely(intervention, 'request');
}
function renderStats(dashboard) {
  const selected = currentIntervention();
  const values = [
    ['Dossiers', dashboard.counts.interventions], ['À compléter', dashboard.interventions.filter((item) => missingFields(item).length).length],
    ['Devis prêts', dashboard.interventions.filter((item) => !quoteBlockingReasons(item).length && !isDone(item, 'quote')).length],
    ['Véhicule ouvert', selected?.vehicle?.name || 'Aucun']
  ];
  $('stats').innerHTML = values.map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}
function renderVehicles(dashboard) {
  const query = $('vehicleSearch').value.trim().toLowerCase();
  const items = dashboard.interventions.filter((intervention) => [intervention.client?.name, intervention.vehicle?.name, intervention.vehicle?.registration].join(' ').toLowerCase().includes(query));
  $('interventions').innerHTML = items.map((intervention) => {
    const done = intervention.tasks.filter((task) => task.status === TASK_STATUS.DONE).length;
    const progress = intervention.tasks.length ? Math.round(done / intervention.tasks.length * 100) : 0;
    const missing = missingFields(intervention).length;
    return `<button class="intervention ${intervention.id === selectedId ? 'selected' : ''}" data-select="${intervention.id}"><h3>${escapeHtml(intervention.vehicle.name || 'Véhicule à renseigner')}</h3><div class="meta">${escapeHtml(intervention.client.name || 'Client à renseigner')} · ${escapeHtml(intervention.vehicle.registration || 'Sans immatriculation')}</div><div class="meta">${escapeHtml(packageById(intervention.servicePackageId).label)}</div><div class="progress"><span style="width:${progress}%"></span></div><span class="badge">${progress} %${missing ? ` · ${missing} info(s) manquante(s)` : ''}</span></button>`;
  }).join('') || '<div class="empty">Aucun véhicule. Créez le premier dossier.</div>';
}
function taskDisplayName(task) { return TASK_NAMES[task.id] || task.name; }
function taskButtons(intervention, task) {
  const attrs = `data-intervention="${intervention.id}" data-task="${task.id}"`;
  if (task.id === 'quote') {
    const reasons = quoteBlockingReasons(intervention);
    if (task.status === TASK_STATUS.DONE) return `<span class="badge">Envoyé ${intervention.quote.sentAt ? formatDateTime(intervention.quote.sentAt) : ''}</span>`;
    return `<button class="button small primary" data-action="send-quote" ${attrs} ${reasons.length ? 'disabled' : ''}>Envoyer le devis</button>`;
  }
  if (task.id === 'client-validation') {
    if (task.status === TASK_STATUS.DONE) return `<span class="badge">Validé ${intervention.quote.validatedAt ? formatDateTime(intervention.quote.validatedAt) : ''}</span>`;
    return `<button class="button small primary" data-action="check-mail" ${attrs} ${task.status === TASK_STATUS.WAITING ? 'disabled' : ''}>Vérifier l’e-mail</button><button class="button small" data-action="manual-validation" ${attrs} ${task.status === TASK_STATUS.WAITING ? 'disabled' : ''}>Valider manuellement</button>`;
  }
  if (task.id === 'planning') return `<button class="button small primary" data-action="open-planning" ${attrs} ${task.status === TASK_STATUS.WAITING ? 'disabled' : ''}>Planifier</button>`;
  if (task.id === 'before-photos') {
    if (task.status === TASK_STATUS.DONE) return `<span class="badge">${(intervention.intakePhotos || []).length} photo(s)</span>`;
    return `<button class="button small primary" data-action="add-photos" ${attrs} ${task.status === TASK_STATUS.WAITING ? 'disabled' : ''}>Ajouter les photos</button>`;
  }
  if (task.id === 'reception') {
    const ready = Boolean(intervention.logistics?.intakeAt && intervention.logistics?.interventionAt);
    if (task.status === TASK_STATUS.DONE) return '<span class="badge">Pris en charge</span>';
    return `<button class="button small primary" data-action="complete-reception" ${attrs} ${!ready || task.status === TASK_STATUS.WAITING ? 'disabled' : ''}>Véhicule pris en charge</button>`;
  }
  if (task.status === TASK_STATUS.READY) return `<button class="button small primary" data-action="start" ${attrs}>Démarrer</button><button class="button small" data-action="block" ${attrs}>Bloquer</button>`;
  if (task.status === TASK_STATUS.RUNNING) return `<button class="button small primary" data-action="complete" ${attrs}>Terminer</button><button class="button small" data-action="block" ${attrs}>Bloquer</button>`;
  if (task.status === TASK_STATUS.BLOCKED && task.manualBlock) return `<button class="button small" data-action="unblock" ${attrs}>Débloquer</button>`;
  return '';
}
function renderWorkflow(intervention, dashboard) {
  const tasks = [...intervention.tasks].sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));
  $('workflowTitle').textContent = `Parcours — ${intervention.vehicle.name}`;
  $('workflowContext').textContent = `${intervention.client.name || 'Client à renseigner'} · opérateur actif : ${dashboard.operator.name} · Fosse atelier utilisée pour la préparation sous véhicule.`;
  $('taskBoard').innerHTML = tasks.map((task, index) => {
    const blocks = task.blockReasons?.map((reason) => reason.message).join(' · ') || '';
    const detail = task.id === 'quote' ? (quoteBlockingReasons(intervention).length ? `Conditions manquantes : ${quoteBlockingReasons(intervention).join(', ')}` : 'Devis final prêt à être envoyé')
      : task.id === 'planning' ? `Intervention : ${formatDateTime(intervention.logistics?.interventionAt)} · prise en charge : ${formatDateTime(intervention.logistics?.intakeAt)}`
      : task.id === 'reception' ? `${intervention.logistics?.intakeMode === 'naza-pickup' ? 'Enlèvement Naza' : 'Dépôt client'} · ${formatDateTime(intervention.logistics?.intakeAt)}`
      : task.id === 'before-photos' ? `${(intervention.intakePhotos || []).length} photo(s) enregistrée(s)`
      : task.id === 'wheel-removal' ? 'Positionnement sur la fosse et dépose des roues si prévue au devis'
      : task.dependencies?.length ? `Après : ${task.dependencies.map((id) => TASK_NAMES[id] || id).join(', ')}` : 'Point de départ';
    return `<article class="task ${task.status}"><div class="task-top"><h3>${index + 1}. ${escapeHtml(taskDisplayName(task))}</h3><span class="task-status">${labels[task.status] || task.status}</span></div><div class="task-details">${escapeHtml(detail)}${blocks ? `<br><span class="block-reason">${escapeHtml(blocks)}</span>` : ''}</div><div class="task-actions">${taskButtons(intervention, task)}</div></article>`;
  }).join('');
}
function proofLabel(proof) { return `${proof.title || 'Preuve'} · ${new Date(proof.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; }
function renderProcedure(intervention) {
  const steps = intervention.procedureSteps || [];
  const done = steps.filter((step) => step.status === 'Terminée').length;
  const percent = steps.length ? Math.round(done * 100 / steps.length) : 0;
  $('procedureProgress').textContent = `${percent} %`;
  $('procedureContext').textContent = `Version ${intervention.procedure?.version || '1.0'} · ${done}/${steps.length} étapes. Les preuves et notes restent attachées au dossier.`;
  $('procedureBoard').innerHTML = steps.map((step) => `<article class="procedure-step ${step.status === 'Terminée' ? 'done' : ''}" data-procedure-step="${step.id}"><input type="checkbox" ${step.status === 'Terminée' ? 'checked' : ''}><div class="procedure-copy"><strong>${escapeHtml(step.id)}</strong> — ${escapeHtml(String(step.label).replace(/dispositif de levage adapté/gi, 'fosse atelier'))}<small>${step.evidenceRequired ? 'Preuve ou note obligatoire' : 'Validation opérateur'}</small><div class="proof-list">${(step.evidence || []).map((proof) => `<span class="proof">📷 ${escapeHtml(proofLabel(proof))}</span>`).join('')}</div><div class="procedure-tools"><input value="${escapeHtml(step.note || '')}" placeholder="Note technique"><button class="button small" data-save-procedure>Enregistrer</button><button class="button small" data-add-proof>Photo</button><input data-proof-file type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div><button class="button small" data-toggle-procedure>${step.status === 'Terminée' ? 'Rouvrir' : 'Valider'}</button></article>`).join('');
}
function renderQuote(intervention) {
  const missing = missingFields(intervention);
  const blocking = quoteBlockingReasons(intervention);
  const draft = intervention.quote?.draft || '';
  $('quotePanel').innerHTML = `<div class="quote-status"><div><p class="card-label">DEVIS</p><h3>${escapeHtml(intervention.quote?.status || 'À préparer')}</h3><p class="context-line">${blocking.length ? `Envoi bloqué : ${escapeHtml(blocking.join(', '))}.` : 'Toutes les conditions sont réunies pour l’envoi.'}</p></div><div class="button-row"><button class="button" id="prepareQuote" ${missing.length ? 'disabled' : ''}>Préparer avec Jarvis</button><button class="button primary" id="sendQuote" ${blocking.length ? 'disabled' : ''}>Envoyer le devis</button></div></div>${draft ? `<div class="quote-preview">${escapeHtml(draft)}</div>` : ''}`;
  $('prepareQuote')?.addEventListener('click', () => {
    try { saveSelectedFromForm({ renderAfter: false }); prepareQuote(intervention); render(); notify('Jarvis a préparé le devis.'); }
    catch (error) { notify(error.message, true); }
  });
  $('sendQuote')?.addEventListener('click', () => {
    try { saveSelectedFromForm({ renderAfter: false }); sendQuote(intervention); render(); notify('Le devis est prêt dans la messagerie.'); }
    catch (error) { notify(error.message, true); }
  });
}
function renderWorkspace(dashboard) {
  const intervention = currentIntervention();
  $('interventionWorkspace').hidden = !intervention;
  $('vehicleListCard').hidden = Boolean(intervention);
  if (!intervention) return;
  $('dossierTitle').textContent = intervention.vehicle.name || 'Véhicule à renseigner';
  $('dossierContext').textContent = `${intervention.client.name || 'Client à renseigner'} · ${intervention.vehicle.registration || 'Sans immatriculation'} · dernière mise à jour ${formatDateTime(intervention.updatedAt || intervention.createdAt)}`;
  fillForm(intervention);
  renderQuote(intervention);
  renderWorkflow(intervention, dashboard);
  renderProcedure(intervention);
}
function render() {
  const dashboard = orchestrator.getDashboard();
  orchestrator.save();
  $('operatorSelect').innerHTML = WORKSHOP_OPERATORS.map((operator) => `<option value="${operator.id}" ${operator.id === dashboard.operator.id ? 'selected' : ''}>${escapeHtml(operator.name)} — ${escapeHtml(operator.role)}</option>`).join('');
  renderStats(dashboard);
  renderVehicles(dashboard);
  renderWorkspace(dashboard);
}
function openIntervention(id) {
  selectedId = id;
  orchestrator.selectIntervention(id);
  history.replaceState(null, '', `?intervention=${encodeURIComponent(id)}`);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeWorkspace() {
  selectedId = null;
  history.replaceState(null, '', location.pathname);
  render();
}
function openModal() { $('createModal').classList.add('open'); $('createModal').setAttribute('aria-hidden', 'false'); $('newClientName').focus(); }
function closeModal() { $('createModal').classList.remove('open'); $('createModal').setAttribute('aria-hidden', 'true'); }
function createIntervention(event) {
  event.preventDefault();
  try {
    const pack = packageById($('newServicePackage').value);
    const created = orchestrator.createIntervention({
      clientName: $('newClientName').value,
      vehicleName: $('newVehicleName').value,
      registration: $('newRegistration').value,
      requestCategory: pack.category,
      service: pack.label,
      clientRequest: $('newClientRequest').value,
      priority: 0
    });
    const intervention = orchestrator.getIntervention(created.id);
    normalizeGraph(intervention);
    intervention.client.phone = $('newClientPhone').value.trim();
    intervention.client.email = $('newClientEmail').value.trim();
    intervention.servicePackageId = pack.id;
    intervention.priceTtc = pack.price || 0;
    ensureRequestCompleted(intervention);
    orchestrator.recalculateAll();
    orchestrator.save();
    event.target.reset();
    closeModal();
    openIntervention(intervention.id);
    notify('Dossier créé et ouvert.');
  } catch (error) { notify(error.message || String(error), true); }
}
function mapVoiceToPackage(text) {
  const value = text.toLowerCase();
  if (value.includes('pass fondateur')) return 'integral-founder';
  if (value.includes('tarif club') || value.includes('forfait club')) return 'integral-club';
  if (value.includes('intégral') || value.includes('integral') || value.includes('dinitrol')) return 'integral-public';
  if (value.includes('dessous') && value.includes('moteur')) return 'underbody-engine';
  if (value.includes('dessous')) return 'underbody';
  if (value.includes('moteur')) return 'engine';
  if (value.includes('moto')) return 'moto';
  if (value.includes('industri')) return 'industrial';
  return '';
}
function applyVoiceTranscript(text) {
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName) && active.id && !['vehicleSearch', 'priceTtc', 'transportPrice', 'mileage'].includes(active.id)) {
    active.value = text;
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const match = (regex) => text.match(regex)?.[1]?.trim() || '';
  const values = {
    clientName: match(/(?:client|nom)\s+(?:est\s+)?([^,;.]+)/i),
    clientPhone: match(/(?:téléphone|telephone|tel)\s+([+\d][\d .-]{7,})/i),
    clientEmail: match(/(?:mail|email|e-mail|courriel)\s+([^\s,;]+@[^\s,;]+)/i),
    vehicleName: match(/(?:véhicule|vehicule|voiture|moto)\s+([^,;.]+)/i),
    registration: match(/(?:immatriculation|plaque)\s+([a-z0-9 -]+)/i),
    mileage: match(/(?:kilométrage|kilometrage|compteur)\s+([\d ]+)/i),
    clientRequest: match(/(?:demande|souhaite|prestation)\s+([^;.]+)/i),
    priceTtc: match(/(?:prix|tarif|montant)\s+([\d ]+(?:[,.]\d+)?)/i)
  };
  Object.entries(values).forEach(([id, value]) => { if (value && $(id)) $(id).value = value.replace(',', '.'); });
  const packageId = mapVoiceToPackage(text);
  if (packageId) {
    $('servicePackage').value = packageId;
    const pack = packageById(packageId);
    if (pack.price) $('priceTtc').value = pack.price;
  }
  const lower = text.toLowerCase();
  if (lower.includes('enlèvement') || lower.includes('enlevement')) $('intakeMode').value = 'naza-pickup';
  if (lower.includes('rapatriement')) $('returnMode').value = 'naza-return';
  if (lower.includes('dépose le véhicule') || lower.includes('depose le vehicule') || lower.includes('déposé par le client')) $('intakeMode').value = 'client-dropoff';
  if (!Object.values(values).some(Boolean) && !packageId) $('internalNotes').value = `${$('internalNotes').value}\n${text}`.trim();
  saveSelectedFromForm({ renderAfter: false });
  render();
}
function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return notify('La dictée vocale n’est pas disponible dans ce navigateur.', true);
  recognition?.abort();
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.continuous = false;
  $('voiceFill').textContent = '● Jarvis écoute…';
  recognition.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join(' ');
    $('voiceTranscript').hidden = false;
    $('voiceTranscript').textContent = `Jarvis a compris : « ${text} »`;
    applyVoiceTranscript(text);
    notify('Le dossier a été complété par la dictée.');
  };
  recognition.onerror = () => notify('La dictée n’a pas pu être comprise.', true);
  recognition.onend = () => { $('voiceFill').textContent = '🎙 Dicter à Jarvis'; };
  recognition.start();
}
function prepareNazaRequest(intervention) {
  saveSelectedFromForm({ renderAfter: false });
  const logistics = intervention.logistics;
  const body = `Bonjour,\n\nMerci de nous communiquer votre tarif pour le transport du véhicule suivant :\n- Client : ${intervention.client.name}\n- Téléphone : ${intervention.client.phone}\n- Véhicule : ${intervention.vehicle.name}\n- Immatriculation : ${intervention.vehicle.registration}\n- Adresse : ${logistics.address || 'à confirmer'}\n- Enlèvement : ${logistics.intakeMode === 'naza-pickup' ? formatDateTime(logistics.intakeAt) : 'non demandé'}\n- Rapatriement : ${logistics.returnMode === 'naza-return' ? 'demandé après intervention' : 'non demandé'}\n\nCordialement,\nGentleCarE`;
  const requests = JSON.parse(localStorage.getItem('gcos-naza-requests') || '[]');
  requests.push({ interventionId: intervention.id, body, createdAt: new Date().toISOString(), status: 'Demande de prix en cours' });
  localStorage.setItem('gcos-naza-requests', JSON.stringify(requests.slice(-100)));
  logistics.nazaStatus = 'Demande de prix en cours';
  orchestrator.save();
  location.href = `mailto:pec@naza.fr?subject=${encodeURIComponent(`Demande de prix transport — ${intervention.vehicle.name}`)}&body=${encodeURIComponent(body)}`;
}
function findValidationEmail(intervention) {
  const events = JSON.parse(localStorage.getItem('mavik-mail-events') || '[]');
  return events.find((event) => {
    const content = `${event.subject || ''} ${event.body || ''}`.toLowerCase();
    const sameEmail = !event.from || String(event.from).toLowerCase().includes(String(intervention.client.email || '').toLowerCase());
    const quoteReference = content.includes(String(intervention.quote.number || '').toLowerCase()) || content.includes('devis');
    const validation = /bon pour accord|j'accepte|je valide|devis accepté|devis accepte|accord pour le devis/.test(content);
    return sameEmail && quoteReference && validation;
  });
}
function validateFromEmail(intervention, event = null) {
  const task = taskBy(intervention, 'client-validation');
  if (task.status === TASK_STATUS.WAITING) throw new Error('Le devis doit d’abord être envoyé.');
  completeTaskSafely(intervention, 'client-validation', { note: event ? `Validation détectée dans l’e-mail du ${formatDateTime(event.at)}` : 'Validation manuelle' });
  intervention.quote.validatedAt = event?.at || new Date().toISOString();
  intervention.quote.validationSource = event ? 'E-mail détecté par Jarvis' : 'Validation manuelle';
  orchestrator.save();
}
function checkMailValidation({ automatic = false } = {}) {
  for (const intervention of orchestrator.state.interventions) {
    if (isDone(intervention, 'quote') && !isDone(intervention, 'client-validation')) {
      const event = findValidationEmail(intervention);
      if (event) {
        validateFromEmail(intervention, event);
        render();
        notify(`Validation du devis détectée pour ${intervention.vehicle.name}. Ouverture de la planification.`);
        if (!automatic || selectedId === intervention.id) setTimeout(() => { location.href = `../../planning.html?intervention=${encodeURIComponent(intervention.id)}&action=planifier`; }, 900);
        return true;
      }
    }
  }
  if (!automatic) notify('Aucun e-mail de validation détecté pour le moment.', true);
  return false;
}

fillPackageOptions();
initializeState();
render();

$('newIntervention').addEventListener('click', openModal);
$('createForm').addEventListener('submit', createIntervention);
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
$('createModal').addEventListener('click', (event) => { if (event.target === $('createModal')) closeModal(); });
$('vehicleSearch').addEventListener('input', render);
$('interventions').addEventListener('click', (event) => { const card = event.target.closest('[data-select]'); if (card) openIntervention(card.dataset.select); });
$('backToVehicles').addEventListener('click', closeWorkspace);
$('saveDossier').addEventListener('click', () => {
  const intervention = currentIntervention();
  if (!intervention) return;
  saveSelectedFromForm({ renderAfter: false });
  ensureRequestCompleted(intervention);
  orchestrator.recalculateAll();
  orchestrator.save();
  render();
  notify('Fiche d’intervention enregistrée.');
});
$('voiceFill').addEventListener('click', startVoice);
$('servicePackage').addEventListener('change', () => {
  const pack = packageById($('servicePackage').value);
  if (pack.price) $('priceTtc').value = pack.price;
  saveSelectedFromForm({ renderAfter: false });
  renderQuote(currentIntervention());
  updateMissingState(currentIntervention());
});
['clientName', 'clientPhone', 'clientEmail', 'vehicleName', 'registration', 'vin', 'mileage', 'priceTtc', 'clientRequest', 'internalNotes', 'intakeMode', 'returnMode', 'intakeAt', 'interventionAt', 'transportAddress', 'transportPrice'].forEach((id) => {
  $(id).addEventListener('change', () => saveSelectedFromForm({ renderAfter: false }));
  $(id).addEventListener('input', () => updateMissingState(currentIntervention()));
});
$('intakeMode').addEventListener('change', () => updateNazaBox(currentIntervention()));
$('returnMode').addEventListener('change', () => updateNazaBox(currentIntervention()));
$('prepareNaza').addEventListener('click', () => {
  try { prepareNazaRequest(currentIntervention()); }
  catch (error) { notify(error.message || String(error), true); }
});
$('operatorSelect').addEventListener('change', (event) => { orchestrator.setActiveOperator(event.target.value); render(); });
$('taskBoard').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const intervention = orchestrator.getIntervention(button.dataset.intervention);
  try {
    const action = button.dataset.action;
    const task = button.dataset.task;
    if (action === 'start') orchestrator.startTask(intervention.id, task);
    if (action === 'complete') orchestrator.completeTask(intervention.id, task, { note: '' });
    if (action === 'block') { const reason = prompt('Motif du blocage :', 'En attente d’un élément'); if (reason) orchestrator.blockTask(intervention.id, task, reason); }
    if (action === 'unblock') orchestrator.unblockTask(intervention.id, task);
    if (action === 'send-quote') sendQuote(intervention);
    if (action === 'check-mail') checkMailValidation();
    if (action === 'manual-validation') { validateFromEmail(intervention); location.href = `../../planning.html?intervention=${encodeURIComponent(intervention.id)}&action=planifier`; }
    if (action === 'open-planning') location.href = `../../planning.html?intervention=${encodeURIComponent(intervention.id)}&action=planifier`;
    if (action === 'add-photos') { $('beforePhotosInput').dataset.intervention = intervention.id; $('beforePhotosInput').click(); }
    if (action === 'complete-reception') completeTaskSafely(intervention, 'reception', { note: `${intervention.logistics.intakeMode} · ${intervention.logistics.intakeAt}` });
    orchestrator.recalculateAll();
    orchestrator.save();
    render();
  } catch (error) { notify(error.message || String(error), true); }
});
$('beforePhotosInput').addEventListener('change', async (event) => {
  const intervention = orchestrator.getIntervention(event.target.dataset.intervention);
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    for (const file of files) {
      if (file.size > 1_500_000) throw new Error(`${file.name} dépasse 1,5 Mo.`);
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      intervention.intakePhotos.push({ title: file.name, dataUrl, createdAt: new Date().toISOString() });
    }
    completeTaskSafely(intervention, 'before-photos', { note: `${files.length} photo(s) ajoutée(s)` });
    orchestrator.recalculateAll();
    orchestrator.save();
    render();
    notify('Photos initiales ajoutées au dossier.');
  } catch (error) { notify(error.message || String(error), true); }
  event.target.value = '';
});
$('procedureBoard').addEventListener('click', (event) => {
  const row = event.target.closest('[data-procedure-step]');
  if (!row) return;
  const stepId = row.dataset.procedureStep;
  const note = row.querySelector('.procedure-tools input:not([type=file])').value;
  const complete = row.querySelector('input[type=checkbox]').checked;
  try {
    if (event.target.closest('[data-toggle-procedure]')) orchestrator.updateProcedureStep(selectedId, stepId, { complete: !complete, note });
    if (event.target.closest('[data-save-procedure]')) orchestrator.updateProcedureStep(selectedId, stepId, { complete, note });
    if (event.target.closest('[data-add-proof]')) row.querySelector('[data-proof-file]').click();
    render();
  } catch (error) { notify(error.message || String(error), true); }
});
$('procedureBoard').addEventListener('change', async (event) => {
  const fileInput = event.target.closest('[data-proof-file]');
  const row = event.target.closest('[data-procedure-step]');
  if (!fileInput || !row || !fileInput.files?.[0]) return;
  const file = fileInput.files[0];
  try {
    if (file.size > 1_500_000) throw new Error('Photo trop lourde pour la version en ligne (maximum 1,5 Mo).');
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    orchestrator.addProcedureEvidence(selectedId, row.dataset.procedureStep, { title: file.name, dataUrl, note: row.querySelector('.procedure-tools input:not([type=file])').value });
    render();
    notify('Preuve ajoutée au dossier.');
  } catch (error) { notify(error.message || String(error), true); }
});

if (new URLSearchParams(location.search).get('new') === '1') openModal();
setInterval(() => checkMailValidation({ automatic: true }), 15000);
