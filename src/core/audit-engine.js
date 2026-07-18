export class AuditEngine {
  constructor({ storage, events } = {}) {
    if (!storage) throw new Error('AuditEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.storeName = 'audit-log';
  }

  record({ actor = 'system', action, entityType = null, entityId = null, details = {}, severity = 'info' }) {
    if (!action) throw new Error('Audit action is required');
    const entries = this.storage.get(this.storeName, []);
    const entry = {
      id: crypto.randomUUID(),
      actor,
      action,
      entityType,
      entityId,
      details,
      severity,
      timestamp: new Date().toISOString(),
    };
    entries.push(entry);
    this.storage.set(this.storeName, entries);
    this.events?.emit('audit:recorded', { entry }, { source: 'core.audit' });
    return entry;
  }

  list({ actor, action, entityType, entityId, severity, limit = 100 } = {}) {
    return this.storage.get(this.storeName, [])
      .filter((entry) =>
        (!actor || entry.actor === actor) &&
        (!action || entry.action === action) &&
        (!entityType || entry.entityType === entityType) &&
        (!entityId || entry.entityId === entityId) &&
        (!severity || entry.severity === severity)
      )
      .slice(-limit)
      .reverse();
  }
}
