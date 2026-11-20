export class RuleEngine {
  constructor({ rules = [], onAction = () => {} } = {}) {
    this.rules = [...rules];
    this.onAction = onAction;
  }

  register(rule) {
    validateRule(rule);
    this.rules.push(rule);
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return this;
  }

  evaluate(context, event = null) {
    const fired = [];
    const ordered = [...this.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const rule of ordered) {
      if (rule.enabled === false) continue;
      if (rule.event && rule.event !== event?.type) continue;
      if (!matches(rule.when, context, event)) continue;

      const actions = Array.isArray(rule.then) ? rule.then : [rule.then];
      for (const action of actions.filter(Boolean)) {
        const result = executeAction(action, context, event);
        fired.push({ ruleId: rule.id, action: action.type, result });
        this.onAction({ rule, action, result, context, event });
      }

      if (rule.stop === true) break;
    }

    return fired;
  }
}

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') throw new TypeError('Rule must be an object');
  if (!rule.id) throw new Error('Rule id is required');
  if (!rule.when) throw new Error(`Rule ${rule.id}: when is required`);
  if (!rule.then) throw new Error(`Rule ${rule.id}: then is required`);
}

function matches(condition, context, event) {
  if (typeof condition === 'function') return Boolean(condition(context, event));
  if (Array.isArray(condition.all)) return condition.all.every(item => matches(item, context, event));
  if (Array.isArray(condition.any)) return condition.any.some(item => matches(item, context, event));
  if (condition.not) return !matches(condition.not, context, event);

  const actual = getPath({ ...context, event }, condition.path);
  if ('eq' in condition) return actual === condition.eq;
  if ('neq' in condition) return actual !== condition.neq;
  if ('gt' in condition) return Number(actual) > Number(condition.gt);
  if ('gte' in condition) return Number(actual) >= Number(condition.gte);
  if ('lt' in condition) return Number(actual) < Number(condition.lt);
  if ('lte' in condition) return Number(actual) <= Number(condition.lte);
  if ('in' in condition) return condition.in.includes(actual);
  if ('exists' in condition) return condition.exists ? actual !== undefined && actual !== null : actual == null;
  return Boolean(actual);
}

function executeAction(action, context, event) {
  switch (action.type) {
    case 'set':
      setPath(context, action.path, resolveValue(action.value, context, event));
      return getPath(context, action.path);
    case 'increment': {
      const next = Number(getPath(context, action.path) ?? 0) + Number(resolveValue(action.by ?? 1, context, event));
      setPath(context, action.path, next);
      return next;
    }
    case 'append': {
      const list = getPath(context, action.path) ?? [];
      if (!Array.isArray(list)) throw new Error(`${action.path} is not an array`);
      const value = resolveValue(action.value, context, event);
      list.push(value);
      setPath(context, action.path, list);
      return value;
    }
    case 'notify': {
      const notification = {
        id: cryptoId(),
        level: action.level ?? 'info',
        message: interpolate(action.message, context),
        createdAt: new Date().toISOString()
      };
      context.notifications ??= [];
      context.notifications.push(notification);
      return notification;
    }
    case 'block-task': {
      const task = findTask(context, action.taskIdPath ?? 'currentTask.id');
      if (!task) return null;
      task.state = 'BLOCKED';
      task.blockReason = interpolate(action.reason ?? 'Bloquée par Jarvis', context);
      return task;
    }
    case 'ready-task': {
      const task = findTask(context, action.taskIdPath ?? 'currentTask.id');
      if (!task) return null;
      task.state = 'READY';
      delete task.blockReason;
      return task;
    }
    default:
      if (typeof action.run === 'function') return action.run(context, event);
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function findTask(context, taskIdPath) {
  const id = getPath(context, taskIdPath);
  return context.vehicle?.tasks?.find(task => task.id === id) ?? context.currentTask ?? null;
}

function resolveValue(value, context, event) {
  if (typeof value === 'function') return value(context, event);
  if (value && typeof value === 'object' && value.from) return getPath({ ...context, event }, value.from);
  return value;
}

function getPath(object, path = '') {
  return path.split('.').filter(Boolean).reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split('.').filter(Boolean);
  const last = keys.pop();
  const target = keys.reduce((cursor, key) => (cursor[key] ??= {}), object);
  target[last] = value;
}

function interpolate(template, context) {
  return String(template).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => getPath(context, path.trim()) ?? '');
}

function cryptoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
