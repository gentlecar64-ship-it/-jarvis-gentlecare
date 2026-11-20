export class WorkflowEngine {
  constructor({ storage, events, audit } = {}) {
    if (!storage) throw new Error('WorkflowEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.audit = audit;
    this.definitionsStore = 'workflow-definitions';
    this.instancesStore = 'workflow-instances';
  }

  define({ id, name, steps }) {
    if (!id || !name || !Array.isArray(steps) || steps.length === 0) {
      throw new Error('Workflow id, name and non-empty steps are required');
    }
    const definitions = this.storage.get(this.definitionsStore, []);
    const definition = { id, name, steps };
    const index = definitions.findIndex((item) => item.id === id);
    if (index >= 0) definitions[index] = definition;
    else definitions.push(definition);
    this.storage.set(this.definitionsStore, definitions);
    return definition;
  }

  start(definitionId, { entityType = null, entityId = null, actor = 'system', context = {} } = {}) {
    const definition = this.storage.get(this.definitionsStore, []).find((item) => item.id === definitionId);
    if (!definition) throw new Error(`Unknown workflow definition: ${definitionId}`);
    const now = new Date().toISOString();
    const instance = {
      id: crypto.randomUUID(),
      definitionId,
      entityType,
      entityId,
      context,
      status: 'active',
      currentStep: 0,
      steps: definition.steps.map((step, index) => ({
        ...step,
        index,
        status: index === 0 ? 'active' : 'pending',
        completedAt: null,
      })),
      createdAt: now,
      updatedAt: now,
    };
    const instances = this.storage.get(this.instancesStore, []);
    instances.push(instance);
    this.storage.set(this.instancesStore, instances);
    this.audit?.record({ actor, action: 'workflow.started', entityType: 'workflow', entityId: instance.id, details: { definitionId, entityType, entityId } });
    this.events?.emit('workflow:started', { instance }, { source: 'core.workflows' });
    return instance;
  }

  get(id) {
    return this.storage.get(this.instancesStore, []).find((item) => item.id === id) ?? null;
  }

  completeStep(id, { actor = 'system', evidence = {}, validator = null } = {}) {
    const instances = this.storage.get(this.instancesStore, []);
    const instance = instances.find((item) => item.id === id);
    if (!instance) throw new Error(`Unknown workflow instance: ${id}`);
    if (instance.status !== 'active') throw new Error(`Workflow is not active: ${id}`);

    const step = instance.steps[instance.currentStep];
    if (validator && !validator({ step, evidence, instance })) {
      throw new Error(`Validation failed for step: ${step.id ?? step.name}`);
    }

    step.status = 'done';
    step.completedAt = new Date().toISOString();
    step.evidence = evidence;
    const next = instance.steps[instance.currentStep + 1];
    if (next) {
      next.status = 'active';
      instance.currentStep += 1;
    } else {
      instance.status = 'done';
      instance.completedAt = step.completedAt;
    }
    instance.updatedAt = step.completedAt;
    this.storage.set(this.instancesStore, instances);
    this.audit?.record({ actor, action: 'workflow.step.completed', entityType: 'workflow', entityId: id, details: { step: step.id ?? step.name } });
    this.events?.emit('workflow:step:completed', { instance, step }, { source: 'core.workflows' });
    return instance;
  }
}
