export const TASK_STATES = Object.freeze({
  WAITING: 'WAITING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE'
});

export class WorkflowEngine {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
  }

  initialize(vehicle, taskDefinitions) {
    vehicle.tasks = taskDefinitions.map((definition, index) => ({
      id: definition.id,
      name: definition.name,
      order: definition.order ?? index,
      dependencies: [...(definition.dependencies ?? [])],
      requiredResources: [...(definition.requiredResources ?? [])],
      state: definition.dependencies?.length ? TASK_STATES.WAITING : TASK_STATES.READY,
      completions: [],
      notes: []
    }));
    vehicle.history ??= [];
    vehicle.status = 'WAITING_FOR_JARVIS';
    this.recalculate(vehicle);
    return vehicle;
  }

  completeTask(vehicle, taskId, user, payload = {}) {
    const task = this.getTask(vehicle, taskId);
    if (![TASK_STATES.READY, TASK_STATES.RUNNING].includes(task.state)) {
      throw new Error(`Task ${taskId} cannot be completed from ${task.state}`);
    }

    const at = this.now().toISOString();
    const completion = {
      id: createId(),
      userId: user.id,
      userName: user.name,
      at,
      durationMinutes: payload.durationMinutes ?? null,
      notes: payload.notes ?? '',
      photos: [...(payload.photos ?? [])]
    };

    task.state = TASK_STATES.DONE;
    task.completedAt = at;
    task.completedBy = completion.userId;
    task.completions.push(completion);
    vehicle.history.push({
      id: createId(),
      type: 'task.completed',
      taskId,
      taskName: task.name,
      userId: user.id,
      userName: user.name,
      at,
      payload: completion
    });

    this.recalculate(vehicle);
    return completion;
  }

  startTask(vehicle, taskId, user) {
    const task = this.getTask(vehicle, taskId);
    if (task.state !== TASK_STATES.READY) throw new Error(`Task ${taskId} is not READY`);
    task.state = TASK_STATES.RUNNING;
    task.startedAt = this.now().toISOString();
    task.startedBy = user.id;
    vehicle.history.push({
      id: createId(),
      type: 'task.started',
      taskId,
      taskName: task.name,
      userId: user.id,
      userName: user.name,
      at: task.startedAt
    });
    this.recalculate(vehicle);
    return task;
  }

  blockTask(vehicle, taskId, reason, source = 'jarvis') {
    const task = this.getTask(vehicle, taskId);
    task.state = TASK_STATES.BLOCKED;
    task.blockReason = reason;
    task.blockedBy = source;
    task.blockedAt = this.now().toISOString();
    this.recalculate(vehicle);
    return task;
  }

  unblockTask(vehicle, taskId) {
    const task = this.getTask(vehicle, taskId);
    delete task.blockReason;
    delete task.blockedBy;
    delete task.blockedAt;
    task.state = this.dependenciesDone(vehicle, task) ? TASK_STATES.READY : TASK_STATES.WAITING;
    this.recalculate(vehicle);
    return task;
  }

  recalculate(vehicle) {
    for (const task of vehicle.tasks ?? []) {
      if ([TASK_STATES.DONE, TASK_STATES.RUNNING, TASK_STATES.BLOCKED].includes(task.state)) continue;
      task.state = this.dependenciesDone(vehicle, task) ? TASK_STATES.READY : TASK_STATES.WAITING;
    }

    const done = vehicle.tasks.filter(task => task.state === TASK_STATES.DONE).length;
    vehicle.progress = vehicle.tasks.length ? Math.round((done / vehicle.tasks.length) * 100) : 0;
    vehicle.readyTaskIds = vehicle.tasks.filter(task => task.state === TASK_STATES.READY).map(task => task.id);
    vehicle.runningTaskIds = vehicle.tasks.filter(task => task.state === TASK_STATES.RUNNING).map(task => task.id);
    vehicle.blockedTaskIds = vehicle.tasks.filter(task => task.state === TASK_STATES.BLOCKED).map(task => task.id);
    vehicle.nextAction = this.nextAction(vehicle);
    vehicle.status = done === vehicle.tasks.length ? 'COMPLETED' : 'WAITING_FOR_JARVIS';
    vehicle.updatedAt = this.now().toISOString();
    return vehicle;
  }

  nextAction(vehicle) {
    const candidates = vehicle.tasks
      .filter(task => task.state === TASK_STATES.READY)
      .sort((a, b) => a.order - b.order);
    return candidates[0] ?? null;
  }

  dependenciesDone(vehicle, task) {
    return task.dependencies.every(id => this.getTask(vehicle, id).state === TASK_STATES.DONE);
  }

  getTask(vehicle, taskId) {
    const task = vehicle.tasks?.find(candidate => candidate.id === taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    return task;
  }
}

export const GENTLECARE_WORKFLOW = [
  { id: 'inspection', name: 'Inspection' },
  { id: 'quote', name: 'Devis', dependencies: ['inspection'] },
  { id: 'client-validation', name: 'Validation client', dependencies: ['quote'] },
  { id: 'planning', name: 'Planification', dependencies: ['client-validation'] },
  { id: 'reception', name: 'Prise en charge', dependencies: ['planning'] },
  { id: 'wheel-removal', name: 'Dépose roues', dependencies: ['reception'] },
  { id: 'protection', name: 'Protection des éléments sensibles', dependencies: ['reception'] },
  { id: 'cryo', name: 'Cryonettoyage', dependencies: ['wheel-removal', 'protection'], requiredResources: ['cryo-machine', 'compressor', 'dry-ice'] },
  { id: 'quality-control-1', name: 'Contrôle après cryo', dependencies: ['cryo'] },
  { id: 'dinitrol', name: 'Traitement DINITROL', dependencies: ['quality-control-1'], requiredResources: ['dinitrol-zone', 'dinitrol-stock'] },
  { id: 'drying', name: 'Séchage', dependencies: ['dinitrol'], requiredResources: ['drying-zone'] },
  { id: 'quality-control-2', name: 'Contrôle final', dependencies: ['drying'] },
  { id: 'final-photos', name: 'Photos finales', dependencies: ['quality-control-2'] },
  { id: 'billing', name: 'Facturation', dependencies: ['quality-control-2'] },
  { id: 'delivery', name: 'Restitution', dependencies: ['final-photos', 'billing'] },
  { id: 'follow-up', name: 'Suivi client', dependencies: ['delivery'] }
];

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
