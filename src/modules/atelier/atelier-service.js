import { CRYO_DINITROL_WORKFLOW_ID, validateRequiredEvidence } from './workflow-definition.js';

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class AtelierService {
  constructor({ storage, events, audit, workflows } = {}) {
    if (!storage || !workflows) throw new Error('AtelierService requires storage and workflows');
    this.storage = storage;
    this.events = events;
    this.audit = audit;
    this.workflows = workflows;
    this.clientsStore = 'atelier-clients';
    this.vehiclesStore = 'atelier-vehicles';
    this.interventionsStore = 'atelier-interventions';
  }

  createClient(data, { actor = 'system' } = {}) {
    if (!data?.name) throw new Error('Client name is required');
    const now = new Date().toISOString();
    const client = { id: createId('cli'), ...data, createdAt: now, updatedAt: now };
    const clients = this.storage.get(this.clientsStore, []);
    clients.push(client);
    this.storage.set(this.clientsStore, clients);
    this.audit?.record({ actor, action: 'atelier.client.created', entityType: 'client', entityId: client.id, details: { name: client.name } });
    this.events?.emit('atelier:client:created', { client }, { source: 'atelier' });
    return client;
  }

  createVehicle(data, { actor = 'system' } = {}) {
    if (!data?.clientId || !data?.make || !data?.model) throw new Error('clientId, make and model are required');
    const now = new Date().toISOString();
    const vehicle = { id: createId('veh'), ...data, createdAt: now, updatedAt: now };
    const vehicles = this.storage.get(this.vehiclesStore, []);
    vehicles.push(vehicle);
    this.storage.set(this.vehiclesStore, vehicles);
    this.audit?.record({ actor, action: 'atelier.vehicle.created', entityType: 'vehicle', entityId: vehicle.id, details: { clientId: vehicle.clientId, make: vehicle.make, model: vehicle.model } });
    this.events?.emit('atelier:vehicle:created', { vehicle }, { source: 'atelier' });
    return vehicle;
  }

  createIntervention(data, { actor = 'system' } = {}) {
    if (!data?.clientId || !data?.vehicleId) throw new Error('clientId and vehicleId are required');
    const now = new Date().toISOString();
    const intervention = {
      id: createId('int'),
      reference: data.reference ?? `GC-${new Date().getFullYear()}-${String(this.listInterventions().length + 1).padStart(5, '0')}`,
      type: data.type ?? 'cryo-dinitrol',
      status: 'open',
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    const workflow = this.workflows.start(CRYO_DINITROL_WORKFLOW_ID, {
      entityType: 'intervention',
      entityId: intervention.id,
      actor,
      context: { clientId: intervention.clientId, vehicleId: intervention.vehicleId },
    });
    intervention.workflowId = workflow.id;
    const interventions = this.storage.get(this.interventionsStore, []);
    interventions.push(intervention);
    this.storage.set(this.interventionsStore, interventions);
    this.audit?.record({ actor, action: 'atelier.intervention.created', entityType: 'intervention', entityId: intervention.id, details: { reference: intervention.reference, workflowId: workflow.id } });
    this.events?.emit('atelier:intervention:created', { intervention, workflow }, { source: 'atelier' });
    return intervention;
  }

  completeCurrentStep(interventionId, evidence, { actor = 'system' } = {}) {
    const intervention = this.getIntervention(interventionId);
    if (!intervention) throw new Error(`Unknown intervention: ${interventionId}`);
    const workflow = this.workflows.completeStep(intervention.workflowId, { actor, evidence, validator: validateRequiredEvidence });
    const interventions = this.storage.get(this.interventionsStore, []);
    const stored = interventions.find((item) => item.id === interventionId);
    stored.status = workflow.status === 'done' ? 'completed' : 'in-progress';
    stored.currentStep = workflow.steps[workflow.currentStep]?.id ?? null;
    stored.updatedAt = new Date().toISOString();
    this.storage.set(this.interventionsStore, interventions);
    return { intervention: stored, workflow };
  }

  getClient(id) { return this.storage.get(this.clientsStore, []).find((item) => item.id === id) ?? null; }
  getVehicle(id) { return this.storage.get(this.vehiclesStore, []).find((item) => item.id === id) ?? null; }
  getIntervention(id) { return this.storage.get(this.interventionsStore, []).find((item) => item.id === id) ?? null; }
  listClients() { return this.storage.get(this.clientsStore, []); }
  listVehicles(clientId = null) { return this.storage.get(this.vehiclesStore, []).filter((item) => !clientId || item.clientId === clientId); }
  listInterventions(status = null) { return this.storage.get(this.interventionsStore, []).filter((item) => !status || item.status === status); }
}
