const TASK_STATUS = Object.freeze({
  WAITING: 'WAITING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

export class GraphWorkflowEngine {
  constructor({ eventBus = null, ruleEngine = null, clock = () => new Date() } = {}) {
    this.eventBus = eventBus;
    this.ruleEngine = ruleEngine;
    this.clock = clock;
  }

  createIntervention({ id, client, vehicle, template, metadata = {} }) {
    assert(id, 'Intervention id is required');
    assert(template?.tasks?.length, 'A workflow template with tasks is required');

    const tasks = template.tasks.map((definition) => ({
      id: definition.id,
      name: definition.name,
      status: TASK_STATUS.WAITING,
      dependencies: unique(definition.dependencies || []),
      resources: unique(definition.resources || []),
      skills: unique(definition.skills || []),
      estimatedDurationMinutes: definition.estimatedDurationMinutes || 0,
      actualDurationMinutes: 0,
      startedAt: null,
      completedAt: null,
      assignees: [],
      history: [],
      notes: [],
      photos: [],
      blockReasons: []
    }));

    this.validateGraph(tasks);

    const intervention = {
      id,
      client: clone(client || {}),
      vehicle: clone(vehicle || {}),
      templateId: template.id,
      templateVersion: template.version || 1,
      status: 'WAITING_FOR_JARVIS',
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString(),
      metadata: clone(metadata),
      tasks,
      history: []
    };

    this.recalculate(intervention, {});
    this.record(intervention, 'intervention.created', { templateId: template.id });
    return intervention;
  }

  validateGraph(tasks) {
    const ids = new Set(tasks.map((task) => task.id));
    assert(ids.size === tasks.length, 'Task ids must be unique');

    for (const task of tasks) {
      for (const dependency of task.dependencies) {
        assert(ids.has(dependency), `Unknown dependency ${dependency} for task ${task.id}`);
        assert(dependency !== task.id, `Task ${task.id} cannot depend on itself`);
      }
    }

    const visiting = new Set();
    const visited = new Set();
    const byId = new Map(tasks.map((task) => [task.id, task]));

    const visit = (taskId) => {
      if (visited.has(taskId)) return;
      assert(!visiting.has(taskId), `Workflow cycle detected at ${taskId}`);
      visiting.add(taskId);
      for (const dependency of byId.get(taskId).dependencies) visit(dependency);
      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const task of tasks) visit(task.id);
  }

  recalculate(intervention, context = {}) {
    for (const task of intervention.tasks) {
      if ([TASK_STATUS.RUNNING, TASK_STATUS.DONE, TASK_STATUS.CANCELLED].includes(task.status)) continue;

      const dependenciesDone = task.dependencies.every((dependencyId) => {
        const dependency = this.getTask(intervention, dependencyId);
        return dependency.status === TASK_STATUS.DONE;
      });

      if (!dependenciesDone) {
        task.status = TASK_STATUS.WAITING;
        task.blockReasons = [];
        continue;
      }

      const blockReasons = this.evaluateBlocks(intervention, task, context);
      task.blockReasons = blockReasons;
      task.status = blockReasons.length ? TASK_STATUS.BLOCKED : TASK_STATUS.READY;
    }

    intervention.status = intervention.tasks.every((task) =>
      [TASK_STATUS.DONE, TASK_STATUS.CANCELLED].includes(task.status)
    ) ? 'COMPLETED' : 'WAITING_FOR_JARVIS';

    intervention.updatedAt = this.clock().toISOString();
    return intervention;
  }

  evaluateBlocks(intervention, task, context) {
    if (!this.ruleEngine?.evaluateTask) return [];
    const result = this.ruleEngine.evaluateTask({ intervention, task, context });
    return (result?.blocks || []).map((block) => ({
      code: block.code || 'RULE_BLOCK',
      message: block.message || String(block),
      severity: block.severity || 'error'
    }));
  }

  startTask(intervention, taskId, operator, context = {}) {
    this.recalculate(intervention, context);
    const task = this.getTask(intervention, taskId);
    assert(task.status === TASK_STATUS.READY, `Task ${taskId} is not ready`);
    assert(operator?.id || operator?.name, 'Operator is required');

    task.status = TASK_STATUS.RUNNING;
    task.startedAt = this.clock().toISOString();
    task.assignees = unique([...task.assignees, operator.id || operator.name]);
    task.history.push({
      type: 'task.started',
      at: task.startedAt,
      operator: clone(operator)
    });

    this.record(intervention, 'task.started', { taskId, operator: clone(operator) });
    return intervention;
  }

  completeTask(intervention, taskId, operator, payload = {}, context = {}) {
    const task = this.getTask(intervention, taskId);
    assert([TASK_STATUS.READY, TASK_STATUS.RUNNING].includes(task.status), `Task ${taskId} cannot be completed`);
    assert(operator?.id || operator?.name, 'Operator is required');

    const completedAt = this.clock();
    const startedAt = task.startedAt ? new Date(task.startedAt) : completedAt;
    task.status = TASK_STATUS.DONE;
    task.completedAt = completedAt.toISOString();
    task.actualDurationMinutes = Math.max(0, Math.round((completedAt - startedAt) / 60000));
    task.assignees = unique([...task.assignees, operator.id || operator.name]);
    if (payload.note) task.notes.push({ at: task.completedAt, operator: clone(operator), text: payload.note });
    if (payload.photos?.length) task.photos.push(...clone(payload.photos));
    task.history.push({
      type: 'task.completed',
      at: task.completedAt,
      operator: clone(operator),
      durationMinutes: task.actualDurationMinutes,
      note: payload.note || null,
      photos: clone(payload.photos || [])
    });

    this.record(intervention, 'task.completed', {
      taskId,
      operator: clone(operator),
      durationMinutes: task.actualDurationMinutes
    });

    return this.recalculate(intervention, context);
  }

  blockTask(intervention, taskId, reason, operator = null) {
    const task = this.getTask(intervention, taskId);
    assert(task.status !== TASK_STATUS.DONE, 'A completed task cannot be blocked');
    task.status = TASK_STATUS.BLOCKED;
    task.blockReasons = [{
      code: reason.code || 'MANUAL_BLOCK',
      message: reason.message || String(reason),
      severity: reason.severity || 'error'
    }];
    this.record(intervention, 'task.blocked', { taskId, reason: clone(reason), operator: clone(operator) });
    return intervention;
  }

  getReadyTasks(intervention, context = {}) {
    this.recalculate(intervention, context);
    return intervention.tasks.filter((task) => task.status === TASK_STATUS.READY);
  }

  getTask(intervention, taskId) {
    const task = intervention.tasks.find((candidate) => candidate.id === taskId);
    assert(task, `Unknown task ${taskId}`);
    return task;
  }

  record(intervention, type, payload) {
    const event = {
      id: `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type,
      at: this.clock().toISOString(),
      interventionId: intervention.id,
      payload: clone(payload || {})
    };
    intervention.history.unshift(event);
    intervention.updatedAt = event.at;
    if (this.eventBus?.publish) this.eventBus.publish(event);
    return event;
  }
}

export { TASK_STATUS };
