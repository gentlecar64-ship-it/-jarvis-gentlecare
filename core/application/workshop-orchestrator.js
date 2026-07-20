import { EventBus } from '../events/event-bus.js';
import { GraphWorkflowEngine, TASK_STATUS } from '../workflow/graph-workflow-engine.js';
import { InterventionEngine } from '../interventions/intervention-engine.js';
import { ResourceManager, RESOURCE_STATUS } from '../resources/resource-manager.js';
import { DecisionEngine } from '../decision/decision-engine.js';
import { buildWorkshopReport, renderWorkshopReport, reportReadiness } from '../reports/workshop-report.js';

const DEFAULT_STORAGE_KEY = 'mavik.workshop.orchestrator.v1';

export const WORKSHOP_OPERATORS = Object.freeze([
  { id: 'david', name: 'David', role: 'Direction', skills: ['inspection', 'cryo', 'dinitrol', 'quality', 'billing'] },
  { id: 'benedicte', name: 'Bénédicte', role: 'Direction / Commercial', skills: ['inspection', 'planning', 'quality', 'billing'] },
  { id: 'severine', name: 'Séverine', role: 'Opérations', skills: ['preparation', 'delivery', 'photos'] },
  { id: 'technician', name: 'Technicien', role: 'Atelier', skills: ['preparation', 'cryo', 'dinitrol', 'quality'] }
]);

export const GENTLECARE_GRAPH_TEMPLATE = Object.freeze({
  id: 'gentlecare-integral-v1',
  version: 1,
  tasks: [
    { id: 'request', name: 'Demande client', skills: ['planning'], estimatedDurationMinutes: 10 },
    { id: 'inspection', name: 'Inspection', dependencies: ['request'], skills: ['inspection'], estimatedDurationMinutes: 45 },
    { id: 'quote', name: 'Devis', dependencies: ['inspection'], skills: ['billing'], estimatedDurationMinutes: 30 },
    { id: 'client-validation', name: 'Validation client', dependencies: ['quote'], skills: ['planning'], estimatedDurationMinutes: 10 },
    { id: 'planning', name: 'Planification', dependencies: ['client-validation'], skills: ['planning'], estimatedDurationMinutes: 20 },
    { id: 'reception', name: 'Prise en charge', dependencies: ['planning'], skills: ['inspection'], estimatedDurationMinutes: 30 },
    { id: 'wheel-removal', name: 'Dépose des roues', dependencies: ['reception'], resources: ['lift'], skills: ['preparation'], estimatedDurationMinutes: 35 },
    { id: 'protection', name: 'Protection des éléments sensibles', dependencies: ['reception'], skills: ['preparation'], estimatedDurationMinutes: 25 },
    { id: 'before-photos', name: 'Photos avant intervention', dependencies: ['reception'], skills: ['photos'], estimatedDurationMinutes: 15 },
    { id: 'cryo', name: 'Cryonettoyage', dependencies: ['wheel-removal', 'protection', 'before-photos'], resources: ['cryo-machine', 'compressor', 'dry-ice'], skills: ['cryo'], estimatedDurationMinutes: 300 },
    { id: 'quality-control-1', name: 'Contrôle après cryo', dependencies: ['cryo'], skills: ['quality'], estimatedDurationMinutes: 30 },
    { id: 'dinitrol', name: 'Traitement DINITROL', dependencies: ['quality-control-1'], resources: ['dinitrol-zone', 'dinitrol-stock'], skills: ['dinitrol'], estimatedDurationMinutes: 180 },
    { id: 'drying', name: 'Séchage', dependencies: ['dinitrol'], resources: ['drying-zone'], estimatedDurationMinutes: 720 },
    { id: 'quality-control-2', name: 'Contrôle final', dependencies: ['drying'], skills: ['quality'], estimatedDurationMinutes: 45 },
    { id: 'final-photos', name: 'Photos finales', dependencies: ['quality-control-2'], skills: ['photos'], estimatedDurationMinutes: 20 },
    { id: 'report', name: 'Rapport d’intervention', dependencies: ['final-photos'], skills: ['quality'], estimatedDurationMinutes: 25 },
    { id: 'billing', name: 'Facturation', dependencies: ['quality-control-2'], skills: ['billing'], estimatedDurationMinutes: 20 },
    { id: 'delivery', name: 'Restitution', dependencies: ['report', 'billing'], resources: ['delivery-zone'], skills: ['delivery'], estimatedDurationMinutes: 30 },
    { id: 'follow-up', name: 'Suivi client', dependencies: ['delivery'], skills: ['planning'], estimatedDurationMinutes: 15 }
  ]
});

const RESOURCE_SEED = Object.freeze([
  { id: 'cryo-machine', name: 'Machine cryogénique', type: 'equipment' },
  { id: 'compressor', name: 'Compresseur', type: 'equipment' },
  { id: 'lift', name: 'Pont élévateur', type: 'equipment' },
  { id: 'dinitrol-zone', name: 'Zone DINITROL', type: 'area' },
  { id: 'drying-zone', name: 'Zone de séchage', type: 'area', capacity: 2 },
  { id: 'delivery-zone', name: 'Zone de restitution', type: 'area' },
  { id: 'dry-ice', name: 'Glace carbonique', type: 'consumable', quantity: 240, unit: 'kg' },
  { id: 'dinitrol-stock', name: 'DINITROL', type: 'consumable', quantity: 18, unit: 'L' }
]);

const FALLBACK_PROCEDURE = Object.freeze({
  key: 'voiture-standard-v1', requestCategory: 'voiture', label: 'Procédure atelier voiture — Cryo + protection', version: '1.0',
  checklist: [
    'Identifier le véhicule, contrôler l’immatriculation, le VIN communiqué et le kilométrage.',
    'Effectuer les photographies horodatées de réception et relever les réserves visibles.',
    'Valider avec le client les zones traitées, exclusions et démontages autorisés.',
    'Sécuriser le véhicule sur le dispositif de levage adapté.',
    'Protéger les éléments sensibles et surfaces incompatibles.',
    'Réaliser un essai cryogénique sur une zone discrète.',
    'Traiter méthodiquement les zones détaillées au devis.',
    'Documenter la pression, les buses, le temps, la consommation et les anomalies.',
    'Préparer les supports et masquer les zones exclues avant DINITROL.',
    'Tracer les produits, lots, quantités, zones et temps de séchage.',
    'Remonter et contrôler les éléments déposés.',
    'Réaliser les photographies comparables avant/après.',
    'Effectuer le contrôle final et préparer le rapport GentleCarE.'
  ]
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

export class WorkshopOrchestrator {
  constructor({ storage = globalThis.localStorage || createMemoryStorage(), storageKey = DEFAULT_STORAGE_KEY, clock = () => new Date(), procedures = [] } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.clock = clock;
    this.eventBus = new EventBus({ clock, maxHistory: 500 });
    this.resourceManager = new ResourceManager({ eventBus: this.eventBus, clock });
    this.ruleAdapter = { evaluateTask: ({ task, context }) => this.evaluateTask(task, context) };
    this.workflowEngine = new GraphWorkflowEngine({ eventBus: this.eventBus, ruleEngine: this.ruleAdapter, clock });
    this.interventionEngine = new InterventionEngine({ workflowEngine: this.workflowEngine, eventBus: this.eventBus, clock });
    this.decisionEngine = new DecisionEngine({ workflowEngine: this.workflowEngine, resourceManager: this.resourceManager, clock });
    this.procedures = procedures.length ? clone(procedures) : [clone(FALLBACK_PROCEDURE)];
    this.state = this.migrate(this.load() || this.seedState());
    this.hydrateResources(this.state.resources);
    this.eventBus.history = clone(this.state.audit || []);
  }

  seedState() {
    return {
      version: 2,
      selectedInterventionId: null,
      activeOperatorId: 'david',
      environment: { humidity: 55 },
      interventions: [],
      resources: clone(RESOURCE_SEED),
      audit: [],
      updatedAt: this.clock().toISOString()
    };
  }

  migrate(state) {
    const next = { ...state, version: 2 };
    next.interventions = (state.interventions || []).map((intervention) => {
      const procedure = intervention.procedure || this.procedureFor(intervention.requestCategory || 'voiture');
      const tasks = [...(intervention.tasks || [])];
      if (!tasks.some((task) => task.id === 'report')) {
        const templateTask = GENTLECARE_GRAPH_TEMPLATE.tasks.find((task) => task.id === 'report');
        const delivery = tasks.find((task) => task.id === 'delivery');
        if (delivery) delivery.dependencies = ['report', 'billing'];
        const index = Math.max(0, tasks.findIndex((task) => task.id === 'billing'));
        tasks.splice(index, 0, { ...clone(templateTask), status: TASK_STATUS.WAITING, actualDurationMinutes: 0, startedAt: null, completedAt: null, assignees: [], history: [], notes: [], photos: [], blockReasons: [] });
      }
      return { ...intervention, tasks, requestCategory: intervention.requestCategory || procedure.requestCategory, procedureKey: intervention.procedureKey || procedure.key, procedure, procedureSteps: intervention.procedureSteps?.length ? intervention.procedureSteps : this.buildProcedureSteps(procedure), reports: intervention.reports || [] };
    });
    return next;
  }

  setProcedures(records = []) {
    if (records.length) this.procedures = clone(records);
    return clone(this.procedures);
  }

  procedureFor(reference = 'voiture') {
    const value = String(reference || '').toLowerCase();
    return clone(this.procedures.find((item) => item.key === reference || item.requestCategory === value || item.vehicleType === value || (item.aliases || []).some((alias) => String(alias).toLowerCase() === value)) || this.procedures[0] || FALLBACK_PROCEDURE);
  }

  buildProcedureSteps(procedure) {
    return (procedure.checklist || []).map((label, index) => ({
      id: `PROC-${String(index + 1).padStart(2, '0')}`, order: index + 1, label, status: 'À faire', note: '',
      evidenceRequired: /photo|photograph|document|tracer|rapport|consigner|autorisation/i.test(label), evidence: [], completedAt: '', completedBy: null
    }));
  }

  hydrateResources(resources = RESOURCE_SEED) {
    this.resourceManager.resources.clear();
    for (const resource of resources) this.resourceManager.register(resource);
  }

  load() {
    try {
      const raw = this.storage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save() {
    this.state.resources = this.resourceManager.list().map(clone);
    this.state.audit = this.eventBus.getHistory({ limit: 500 });
    this.state.updatedAt = this.clock().toISOString();
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  reset({ withDemo = true } = {}) {
    this.state = this.seedState();
    this.hydrateResources(this.state.resources);
    this.eventBus.history = [];
    if (withDemo) this.createDemoInterventions();
    return this.save();
  }

  getOperator(id = this.state.activeOperatorId) {
    const operator = WORKSHOP_OPERATORS.find((item) => item.id === id);
    if (!operator) throw new Error(`Opérateur inconnu : ${id}`);
    return operator;
  }

  setActiveOperator(operatorId) {
    this.getOperator(operatorId);
    this.state.activeOperatorId = operatorId;
    this.eventBus.publish({ type: 'workshop.operator.selected', payload: { operatorId } });
    return this.save();
  }

  setHumidity(value) {
    const humidity = Math.max(0, Math.min(100, Number(value)));
    this.state.environment.humidity = humidity;
    this.recalculateAll();
    this.eventBus.publish({ type: 'workshop.environment.updated', payload: { humidity } });
    return this.save();
  }

  context(operator = this.getOperator()) {
    return {
      environment: clone(this.state.environment),
      operatorSkills: clone(operator.skills),
      availableMinutes: 480
    };
  }

  evaluateTask(task) {
    const blocks = [];
    for (const resourceId of task.resources || []) {
      const quantity = resourceId === 'dry-ice' ? 20 : 1;
      if (!this.resourceManager.isAvailable(resourceId, { quantity })) {
        const resource = this.resourceManager.get(resourceId);
        blocks.push({ code: 'RESOURCE_UNAVAILABLE', message: `${resource.name} indisponible`, severity: 'error' });
      }
    }
    if (task.id === 'dinitrol' && Number(this.state.environment.humidity) > 80) {
      blocks.push({ code: 'HUMIDITY_HIGH', message: `Humidité ${this.state.environment.humidity} % : DINITROL bloqué au-dessus de 80 %`, severity: 'warning' });
    }
    return { blocks };
  }

  createIntervention({ clientName, vehicleName, registration = '', vin = '', mileage = 0, priority = 0, deadline = null, requestCategory = 'voiture', service = '', clientRequest = '' }) {
    if (!clientName?.trim() || !vehicleName?.trim()) throw new Error('Client et véhicule obligatoires');
    const id = `intervention-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const procedure = this.procedureFor(requestCategory);
    const intervention = this.interventionEngine.create({
      id,
      client: { id: `client-${Date.now()}`, name: clientName.trim() },
      vehicle: { id: `vehicle-${Date.now()}`, name: vehicleName.trim(), registration: registration.trim(), vin: vin.trim(), mileage: Number(mileage) || 0, type: procedure.vehicleType || procedure.requestCategory },
      template: GENTLECARE_GRAPH_TEMPLATE,
      metadata: { priority: Number(priority), deadline: deadline || null }
    });
    Object.assign(intervention, {
      requestCategory: procedure.requestCategory || requestCategory, procedureKey: procedure.key, procedure, procedureSteps: this.buildProcedureSteps(procedure),
      service: service.trim() || procedure.label, clientRequest: clientRequest.trim(), reports: [], reportStatus: 'Non généré'
    });
    this.state.interventions.push(intervention);
    this.state.selectedInterventionId = intervention.id;
    this.save();
    return clone(intervention);
  }

  createDemoInterventions() {
    const demo = [
      { clientName: 'Jean Dupont', vehicleName: 'Ford Mustang GT', registration: 'AA-123-BB', mileage: 72000, priority: 3, requestCategory: 'voiture', clientRequest: 'Cryonettoyage du dessous et protection anticorrosion.' },
      { clientName: 'Marie Martin', vehicleName: 'Ducati Monster', registration: 'CC-456-DD', mileage: 21800, priority: 2, requestCategory: 'moto', clientRequest: 'Nettoyage détaillé du moteur, cadre et bras oscillant.' },
      { clientName: 'Industrie Démo', vehicleName: 'Presse hydraulique Ligne 2', registration: 'EQ-L2', priority: 1, requestCategory: 'industriel', clientRequest: 'Décrassage technique avant maintenance préventive.' }
    ];
    for (const item of demo) this.createIntervention(item);
    this.state.selectedInterventionId = this.state.interventions[0]?.id || null;
  }

  selectIntervention(id) {
    this.getIntervention(id);
    this.state.selectedInterventionId = id;
    return this.save();
  }

  deleteIntervention(id) {
    const intervention = this.getIntervention(id);
    this.state.interventions = this.state.interventions.filter((item) => item.id !== id);
    this.state.selectedInterventionId = this.state.interventions[0]?.id || null;
    this.eventBus.publish({ type: 'workshop.intervention.deleted', interventionId: id, payload: { vehicle: intervention.vehicle?.name || '' } });
    return this.save();
  }

  importSnapshot(snapshot) {
    if (!snapshot || ![1, 2].includes(snapshot.version) || !Array.isArray(snapshot.interventions) || !Array.isArray(snapshot.resources)) {
      throw new Error('Fichier MAVIK incompatible');
    }
    this.state = this.migrate(clone(snapshot));
    this.hydrateResources(this.state.resources);
    this.eventBus.history = clone(this.state.audit || []);
    this.recalculateAll();
    return this.save();
  }

  getIntervention(id = this.state.selectedInterventionId) {
    const intervention = this.state.interventions.find((item) => item.id === id);
    if (!intervention) throw new Error('Intervention introuvable');
    return intervention;
  }

  recalculateAll() {
    for (const intervention of this.state.interventions) this.workflowEngine.recalculate(intervention, this.context());
  }

  startTask(interventionId, taskId) {
    const intervention = this.getIntervention(interventionId);
    const operator = this.getOperator();
    this.workflowEngine.startTask(intervention, taskId, operator, this.context(operator));
    for (const resourceId of this.workflowEngine.getTask(intervention, taskId).resources || []) {
      const resource = this.resourceManager.get(resourceId);
      if (resource.quantity === null) this.resourceManager.setStatus(resourceId, RESOURCE_STATUS.IN_USE, `Tâche ${taskId}`);
    }
    return this.save();
  }

  completeTask(interventionId, taskId, payload = {}) {
    const intervention = this.getIntervention(interventionId);
    const operator = this.getOperator();
    const task = this.workflowEngine.getTask(intervention, taskId);
    if (task.id === 'report') return this.generateReport(interventionId);
    if (task.id === 'cryo') this.consume(intervention, 'dry-ice', 20, 'kg', operator);
    if (task.id === 'dinitrol') this.consume(intervention, 'dinitrol-stock', 1, 'L', operator);
    if (task.id.startsWith('quality-control')) {
      this.interventionEngine.addQualityCheck(intervention, { name: task.name, passed: payload.passed !== false, notes: payload.note || '' }, operator);
    }
    this.workflowEngine.completeTask(intervention, taskId, operator, payload, this.context(operator));
    for (const resourceId of task.resources || []) {
      const resource = this.resourceManager.get(resourceId);
      if (resource.quantity === null) this.resourceManager.setStatus(resourceId, RESOURCE_STATUS.AVAILABLE, `Tâche ${taskId} terminée`);
    }
    return this.save();
  }

  updateProcedureStep(interventionId, stepId, { complete = true, note } = {}) {
    const intervention = this.getIntervention(interventionId);
    const step = (intervention.procedureSteps || []).find((item) => item.id === stepId);
    if (!step) throw new Error(`Étape de procédure inconnue : ${stepId}`);
    const operator = this.getOperator();
    step.status = complete ? 'Terminée' : 'À faire';
    if (note !== undefined) step.note = String(note || '').trim();
    step.completedAt = complete ? this.clock().toISOString() : '';
    step.completedBy = complete ? clone(operator) : null;
    this.eventBus.publish({ type: complete ? 'procedure.step.completed' : 'procedure.step.reopened', interventionId, payload: { stepId, operatorId: operator.id } });
    return this.save();
  }

  addProcedureEvidence(interventionId, stepId, evidence = {}) {
    const intervention = this.getIntervention(interventionId);
    const step = (intervention.procedureSteps || []).find((item) => item.id === stepId);
    if (!step) throw new Error(`Étape de procédure inconnue : ${stepId}`);
    if (!evidence.dataUrl && !evidence.title) throw new Error('Preuve vide');
    const item = {
      id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: String(evidence.title || 'Preuve atelier'),
      dataUrl: String(evidence.dataUrl || ''), note: String(evidence.note || ''), createdAt: this.clock().toISOString(), createdBy: clone(this.getOperator())
    };
    step.evidence ||= [];
    step.evidence.push(item);
    this.eventBus.publish({ type: 'procedure.evidence.added', interventionId, payload: { stepId, evidenceId: item.id } });
    this.save();
    return clone(item);
  }

  getReportReadiness(interventionId = this.state.selectedInterventionId) {
    return reportReadiness(this.getIntervention(interventionId));
  }

  generateReport(interventionId = this.state.selectedInterventionId) {
    const intervention = this.getIntervention(interventionId);
    const readiness = reportReadiness(intervention);
    const missing = [...readiness.missingIdentity, ...readiness.missingProcedureSteps, ...readiness.missingEvidence];
    if (!readiness.workflowReady || missing.length) throw new Error(`Rapport bloqué : ${missing[0] || 'le contrôle final et les photos finales doivent être terminés'}`);
    const operator = this.getOperator();
    const task = this.workflowEngine.getTask(intervention, 'report');
    if (task.status === TASK_STATUS.READY) this.workflowEngine.startTask(intervention, 'report', operator, this.context(operator));
    const report = buildWorkshopReport(intervention, operator, this.clock().toISOString());
    intervention.reports ||= [];
    intervention.reports.push(report);
    intervention.reportStatus = report.status;
    intervention.lastReport = report;
    if (task.status !== TASK_STATUS.DONE) this.workflowEngine.completeTask(intervention, 'report', operator, { note: `Rapport ${report.number} v${report.version}.0 généré` }, this.context(operator));
    this.eventBus.publish({ type: 'report.generated', interventionId, payload: { reportNumber: report.number, version: report.version } });
    this.save();
    return clone(report);
  }

  validateReport(interventionId = this.state.selectedInterventionId) {
    const intervention = this.getIntervention(interventionId);
    const operator = this.getOperator();
    if (!/Direction/.test(operator.role)) throw new Error('La validation du rapport appartient à la direction');
    if (!intervention.lastReport) throw new Error('Générez d’abord le rapport');
    intervention.lastReport.status = 'Validé en interne — prêt à remettre';
    intervention.lastReport.validatedAt = this.clock().toISOString();
    intervention.lastReport.validatedBy = clone(operator);
    intervention.reportStatus = intervention.lastReport.status;
    const index = (intervention.reports || []).findIndex((item) => item.version === intervention.lastReport.version);
    if (index >= 0) intervention.reports[index] = clone(intervention.lastReport);
    this.eventBus.publish({ type: 'report.validated', interventionId, payload: { reportNumber: intervention.lastReport.number, operatorId: operator.id } });
    this.save();
    return clone(intervention.lastReport);
  }

  renderReport(interventionId = this.state.selectedInterventionId, options = {}) {
    const report = this.getIntervention(interventionId).lastReport;
    if (!report) throw new Error('Aucun rapport généré');
    return renderWorkshopReport(report, options);
  }

  blockTask(interventionId, taskId, message) {
    const intervention = this.getIntervention(interventionId);
    this.workflowEngine.blockTask(intervention, taskId, { code: 'MANUAL_BLOCK', message: message || 'Blocage signalé', severity: 'warning' }, this.getOperator());
    return this.save();
  }

  unblockTask(interventionId, taskId) {
    const intervention = this.getIntervention(interventionId);
    this.workflowEngine.unblockTask(intervention, taskId, this.getOperator(), this.context());
    return this.save();
  }

  consume(intervention, resourceId, quantity, unit, operator = this.getOperator()) {
    this.resourceManager.consume(resourceId, quantity, { interventionId: intervention.id, operatorId: operator.id });
    this.interventionEngine.recordConsumption(intervention, { resourceId, quantity, unit }, operator);
  }

  setResourceStatus(resourceId, status) {
    this.resourceManager.setStatus(resourceId, status, 'Modification depuis le poste atelier');
    this.recalculateAll();
    return this.save();
  }

  restock(resourceId, quantity) {
    const resource = this.resourceManager.get(resourceId);
    if (resource.quantity === null) throw new Error('Cette ressource n’est pas un stock');
    resource.quantity = Number(resource.quantity) + Number(quantity);
    resource.updatedAt = this.clock().toISOString();
    this.eventBus.publish({ type: 'stock.resource.restocked', resourceId, payload: { quantity: Number(quantity), total: resource.quantity } });
    this.recalculateAll();
    return this.save();
  }

  getDashboard() {
    this.recalculateAll();
    const context = this.context();
    const decisions = this.decisionEngine.rank(this.state.interventions, context);
    const tasks = this.state.interventions.flatMap((intervention) => intervention.tasks.map((task) => ({ ...task, interventionId: intervention.id })));
    const interventions = this.state.interventions.map((intervention) => ({ ...clone(intervention), reportReadiness: reportReadiness(intervention) }));
    return {
      generatedAt: this.clock().toISOString(),
      operator: clone(this.getOperator()),
      interventions,
      selectedInterventionId: this.state.selectedInterventionId,
      resources: this.resourceManager.list().map(clone),
      environment: clone(this.state.environment),
      decisions: clone(decisions),
      nextDecision: clone(decisions.find((item) => item.canStart) || decisions[0] || null),
      counts: {
        interventions: this.state.interventions.length,
        ready: tasks.filter((task) => task.status === TASK_STATUS.READY).length,
        running: tasks.filter((task) => task.status === TASK_STATUS.RUNNING).length,
        blocked: tasks.filter((task) => task.status === TASK_STATUS.BLOCKED).length,
        completed: this.state.interventions.filter((item) => item.status === 'COMPLETED').length,
        reportsReady: interventions.filter((item) => item.reportReadiness.complete && !item.lastReport).length
      },
      audit: this.eventBus.getHistory({ limit: 100 })
    };
  }
}

export { TASK_STATUS, RESOURCE_STATUS };
