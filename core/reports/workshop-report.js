import { TASK_STATUS } from '../workflow/graph-workflow-engine.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;

export function reportReadiness(intervention) {
  const procedureSteps = intervention.procedureSteps || [];
  const missingProcedureSteps = procedureSteps.filter((step) => step.status !== 'Terminée').map((step) => `${step.id} — ${step.label}`);
  const missingEvidence = procedureSteps.filter((step) => step.evidenceRequired && step.status === 'Terminée' && !(step.evidence || []).length && !text(step.note)).map((step) => `${step.id} — preuve ou note requise`);
  const reportTask = (intervention.tasks || []).find((task) => task.id === 'report');
  const missingIdentity = [];
  if (!text(intervention.client?.name)) missingIdentity.push('nom du client');
  if (!text(intervention.vehicle?.name)) missingIdentity.push('véhicule');
  if (!text(intervention.vehicle?.registration)) missingIdentity.push('immatriculation');
  const workflowReady = [TASK_STATUS.READY, TASK_STATUS.RUNNING, TASK_STATUS.DONE].includes(reportTask?.status);
  const complete = workflowReady && !missingProcedureSteps.length && !missingEvidence.length && !missingIdentity.length;
  return { complete, workflowReady, missingProcedureSteps, missingEvidence, missingIdentity, reportTaskStatus: reportTask?.status || 'WAITING' };
}

export function buildWorkshopReport(intervention, operator, generatedAt = new Date().toISOString()) {
  const readiness = reportReadiness(intervention);
  const version = (intervention.reports || []).length + 1;
  const completedTasks = (intervention.tasks || []).filter((task) => task.status === TASK_STATUS.DONE);
  return {
    schemaVersion: '1.0', number: `RAP-${intervention.id.slice(-8).toUpperCase()}`, version, generatedAt,
    generatedBy: { id: operator.id, name: operator.name }, status: 'Brouillon test local — validation de direction requise',
    client: clone(intervention.client), vehicle: clone(intervention.vehicle), service: text(intervention.service, 'Cryonettoyage et protection GentleCarE'),
    request: text(intervention.clientRequest, 'Demande enregistrée dans le dossier atelier.'),
    procedure: { key: intervention.procedureKey, label: intervention.procedure?.label, version: intervention.procedure?.version, steps: clone(intervention.procedureSteps || []) },
    workflow: { template: intervention.templateId, completedTasks: completedTasks.map((task) => ({ id: task.id, name: task.name, completedAt: task.completedAt, completedBy: task.completedBy?.name || '' })), qualityChecks: clone(intervention.qualityChecks || []), consumptions: clone(intervention.consumptions || []) },
    evidence: (intervention.procedureSteps || []).flatMap((step) => (step.evidence || []).map((item) => ({ ...clone(item), stepId: step.id, stepLabel: step.label }))),
    notes: clone(intervention.notes || []), readiness
  };
}

function list(items, empty = 'Aucun élément enregistré.') {
  return items?.length ? `<ul>${items.map((item) => `<li>${esc(typeof item === 'string' ? item : item.label || item.name || JSON.stringify(item))}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`;
}

export function renderWorkshopReport(report, { logoUrl = '../../assets/brand/gentlecare-logo.png' } = {}) {
  const finished = report.procedure.steps.filter((step) => step.status === 'Terminée').length;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(report.number)} — GentleCarE</title><style>
  :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#10212a;background:#eaf1f4}*{box-sizing:border-box}body{margin:0;padding:24px}.report{max-width:1040px;margin:auto;background:#fff;box-shadow:0 24px 70px rgba(4,19,28,.18)}header{padding:32px 38px;background:linear-gradient(135deg,#061824,#0b4b78 62%,#67a817);color:#fff;display:flex;justify-content:space-between;gap:20px}header img{width:220px;height:120px;object-fit:contain;background:#fff;border-radius:12px}h1{margin:7px 0}.eyebrow{text-transform:uppercase;letter-spacing:.18em;color:#c9f39b;font-size:11px}.status{display:inline-block;padding:7px 10px;border-radius:999px;background:#8a6429}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:20px 38px;background:#f5f8f9}.summary div,section{border:1px solid #dce7eb;border-radius:12px;padding:14px}.summary small{display:block;color:#627b86;text-transform:uppercase;font-size:10px}.summary strong{display:block;margin-top:5px}.content{display:grid;gap:14px;padding:24px 38px 38px}section h2{margin:0 0 10px;font-size:19px}.step{display:grid;grid-template-columns:90px 1fr auto;gap:10px;padding:9px 0;border-top:1px solid #e4ecef}.step:first-of-type{border-top:0}.done{color:#28753a}.muted{color:#70858e}.evidence{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.evidence img{width:100%;height:150px;object-fit:cover;border-radius:9px}footer{padding:20px 38px;background:#07141c;color:#b9cbd2;font-size:12px}@media(max-width:700px){body{padding:0}header{display:block}.summary{grid-template-columns:1fr 1fr}.summary,.content,footer{padding-left:18px;padding-right:18px}.evidence{grid-template-columns:1fr}}@media print{body{padding:0;background:#fff}.report{box-shadow:none}section{break-inside:avoid}}
  </style></head><body><article class="report"><header><div><div class="eyebrow">Rapport d’intervention MAVIK</div><h1>${esc(report.number)}</h1><p>Version ${report.version}.0 · ${esc(new Date(report.generatedAt).toLocaleString('fr-FR'))}</p><span class="status">${esc(report.status)}</span></div><img src="${esc(logoUrl)}" alt="GentleCarE"></header><div class="summary"><div><small>Client</small><strong>${esc(report.client.name)}</strong></div><div><small>Véhicule</small><strong>${esc(report.vehicle.name)}</strong></div><div><small>Immatriculation</small><strong>${esc(report.vehicle.registration)}</strong></div><div><small>Procédure</small><strong>${finished}/${report.procedure.steps.length}</strong></div></div><main class="content"><section><h2>Mission et périmètre</h2><p><strong>${esc(report.service)}</strong></p><p>${esc(report.request)}</p><p>Procédure : ${esc(report.procedure.label || report.procedure.key)} · v${esc(report.procedure.version || '1.0')}</p></section><section><h2>Exécution de la procédure</h2>${report.procedure.steps.map((step) => `<div class="step ${step.status === 'Terminée' ? 'done' : ''}"><strong>${esc(step.id)}</strong><span>${esc(step.label)}${step.note ? `<br><small>${esc(step.note)}</small>` : ''}</span><span>${step.status === 'Terminée' ? '✓ Terminé' : '○ À faire'}</span></div>`).join('')}</section><section><h2>Contrôles qualité</h2>${list(report.workflow.qualityChecks, 'Aucun contrôle qualité enregistré.')}</section><section><h2>Consommations tracées</h2>${list(report.workflow.consumptions.map((item) => `${item.quantity} ${item.unit} · ${item.resourceId}`), 'Aucune consommation enregistrée.')}</section><section><h2>Preuves photographiques</h2><div class="evidence">${report.evidence.map((item) => `<figure>${item.dataUrl ? `<img src="${esc(item.dataUrl)}" alt="${esc(item.title)}">` : ''}<figcaption>${esc(item.stepId)} · ${esc(item.title)}</figcaption></figure>`).join('') || '<p class="muted">Aucune photographie jointe.</p>'}</div></section></main><footer>GentleCarE · Rapport de test généré localement par MAVIK · Validation humaine obligatoire avant toute remise au client.</footer></article></body></html>`;
}
