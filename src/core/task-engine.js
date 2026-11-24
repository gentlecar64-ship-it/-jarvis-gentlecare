const VALID_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];

export class TaskEngine {
  constructor({ storage, events, audit } = {}) {
    if (!storage) throw new Error('TaskEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.audit = audit;
    this.storeName = 'tasks';
  }

  create({ title, description = '', priority = 'normal', assignee = null, dueAt = null, dependencies = [], metadata = {} }) {
    if (!title) throw new Error('Task title is required');
    if (!VALID_PRIORITIES.includes(priority)) throw new Error(`Invalid priority: ${priority}`);
    const tasks = this.storage.get(this.storeName, []);
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      title,
      description,
      priority,
      assignee,
      dueAt,
      dependencies,
      metadata,
      status: dependencies.length ? 'blocked' : 'todo',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    tasks.push(task);
    this.storage.set(this.storeName, tasks);
    this.audit?.record({ action: 'task.created', entityType: 'task', entityId: task.id, details: { title } });
    this.events?.emit('task:created', { task }, { source: 'core.tasks' });
    return task;
  }

  list({ status, assignee, priority } = {}) {
    return this.storage.get(this.storeName, []).filter((task) =>
      (!status || task.status === status) &&
      (!assignee || task.assignee === assignee) &&
      (!priority || task.priority === priority)
    );
  }

  get(id) {
    return this.storage.get(this.storeName, []).find((task) => task.id === id) ?? null;
  }

  update(id, patch = {}, actor = 'system') {
    const tasks = this.storage.get(this.storeName, []);
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error(`Unknown task: ${id}`);
    if (patch.status && !VALID_STATUSES.includes(patch.status)) throw new Error(`Invalid status: ${patch.status}`);
    if (patch.priority && !VALID_PRIORITIES.includes(patch.priority)) throw new Error(`Invalid priority: ${patch.priority}`);

    const next = { ...tasks[index], ...patch, id, updatedAt: new Date().toISOString() };
    if (next.status === 'done' && !next.completedAt) next.completedAt = next.updatedAt;
    if (next.status !== 'done') next.completedAt = null;
    tasks[index] = next;
    this.storage.set(this.storeName, tasks);
    this.audit?.record({ actor, action: 'task.updated', entityType: 'task', entityId: id, details: patch });
    this.events?.emit('task:updated', { task: next, patch }, { source: 'core.tasks' });
    this.refreshBlockedTasks();
    return next;
  }

  refreshBlockedTasks() {
    const tasks = this.storage.get(this.storeName, []);
    let changed = false;
    for (const task of tasks) {
      if (!task.dependencies.length || task.status !== 'blocked') continue;
      const ready = task.dependencies.every((id) => tasks.find((candidate) => candidate.id === id)?.status === 'done');
      if (ready) {
        task.status = 'todo';
        task.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.storage.set(this.storeName, tasks);
  }
}
