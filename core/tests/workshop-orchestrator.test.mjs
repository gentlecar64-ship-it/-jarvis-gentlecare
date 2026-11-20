import assert from 'node:assert/strict';
import { WorkshopOrchestrator, TASK_STATUS, RESOURCE_STATUS } from '../application/workshop-orchestrator.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

const fixedClock = (() => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 20, 10, tick++));
})();

const store = storage();
const orchestrator = new WorkshopOrchestrator({ storage: store, clock: fixedClock });
const intervention = orchestrator.createIntervention({ clientName: 'Client test', vehicleName: 'Véhicule test', priority: 2 });

assert.equal(intervention.tasks.find((task) => task.id === 'request').status, TASK_STATUS.READY);
assert.equal(intervention.tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.WAITING);

orchestrator.startTask(intervention.id, 'request');
assert.equal(orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'request').status, TASK_STATUS.RUNNING);
orchestrator.completeTask(intervention.id, 'request');
assert.equal(orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.READY);

orchestrator.blockTask(intervention.id, 'inspection', 'Pièce manquante');
assert.equal(orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.BLOCKED);
orchestrator.getDashboard();
assert.equal(orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.BLOCKED);
orchestrator.unblockTask(intervention.id, 'inspection');
assert.equal(orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.READY);

orchestrator.setResourceStatus('cryo-machine', RESOURCE_STATUS.UNAVAILABLE);
const cryo = orchestrator.getIntervention(intervention.id).tasks.find((task) => task.id === 'cryo');
assert.equal(cryo.status, TASK_STATUS.WAITING, 'Les dépendances doivent rester prioritaires sur les règles de ressource');

const restored = new WorkshopOrchestrator({ storage: store, clock: fixedClock });
assert.equal(restored.state.interventions.length, 1);
assert.equal(restored.getIntervention(intervention.id).tasks.find((task) => task.id === 'inspection').status, TASK_STATUS.READY);
assert.equal(restored.resourceManager.get('cryo-machine').status, RESOURCE_STATUS.UNAVAILABLE);
assert.ok(restored.getDashboard().audit.length > 0);

const full = new WorkshopOrchestrator({ storage: storage() });
const cycle = full.createIntervention({ clientName: 'Cycle complet', vehicleName: 'Mustang test', registration: 'TEST-001' });
const complete = (taskId) => { full.startTask(cycle.id, taskId); full.completeTask(cycle.id, taskId); };
for (const taskId of ['request', 'inspection', 'quote', 'client-validation', 'planning', 'reception', 'wheel-removal', 'protection', 'before-photos']) complete(taskId);

full.setResourceStatus('cryo-machine', RESOURCE_STATUS.UNAVAILABLE);
assert.equal(full.getIntervention(cycle.id).tasks.find((task) => task.id === 'cryo').status, TASK_STATUS.BLOCKED);
full.setResourceStatus('cryo-machine', RESOURCE_STATUS.AVAILABLE);
assert.equal(full.getIntervention(cycle.id).tasks.find((task) => task.id === 'cryo').status, TASK_STATUS.READY);
complete('cryo');
assert.equal(full.resourceManager.get('dry-ice').quantity, 220);

complete('quality-control-1');
full.setHumidity(85);
assert.equal(full.getIntervention(cycle.id).tasks.find((task) => task.id === 'dinitrol').status, TASK_STATUS.BLOCKED);
full.setHumidity(55);
assert.equal(full.getIntervention(cycle.id).tasks.find((task) => task.id === 'dinitrol').status, TASK_STATUS.READY);
complete('dinitrol');
assert.equal(full.resourceManager.get('dinitrol-stock').quantity, 17);
assert.equal(full.getIntervention(cycle.id).consumptions.length, 2);
assert.equal(full.getIntervention(cycle.id).qualityChecks.length, 1);

complete('drying');
complete('quality-control-2');
complete('final-photos');
for (const step of full.getIntervention(cycle.id).procedureSteps) full.updateProcedureStep(cycle.id, step.id, { complete: true, note: 'Contrôle tracé pour le test.' });
assert.equal(full.getReportReadiness(cycle.id).complete, true);
const report = full.generateReport(cycle.id);
assert.equal(report.version, 1);
assert.match(report.status, /Brouillon/);
assert.equal(full.getIntervention(cycle.id).tasks.find((task) => task.id === 'report').status, TASK_STATUS.DONE);
assert.match(full.renderReport(cycle.id), /Rapport d’intervention MAVIK/);
const validated = full.validateReport(cycle.id);
assert.match(validated.status, /prêt à remettre/);

console.log('WorkshopOrchestrator tests passed.');
