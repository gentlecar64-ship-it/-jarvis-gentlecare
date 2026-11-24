export class MemoryEngine {
  constructor({ storage, events } = {}) {
    if (!storage) throw new Error('MemoryEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.storeName = 'jarvis-memory';
  }

  list({ type, subjectId } = {}) {
    return this.storage.get(this.storeName, []).filter((entry) =>
      (!type || entry.type === type) && (!subjectId || entry.subjectId === subjectId)
    );
  }

  remember({ type = 'fact', subjectId = null, key, value, source = 'user', confidence = 1 }) {
    if (!key) throw new Error('Memory key is required');
    const entries = this.storage.get(this.storeName, []);
    const now = new Date().toISOString();
    const existingIndex = entries.findIndex((entry) =>
      entry.type === type && entry.subjectId === subjectId && entry.key === key
    );
    const entry = {
      id: existingIndex >= 0 ? entries[existingIndex].id : crypto.randomUUID(),
      type,
      subjectId,
      key,
      value,
      source,
      confidence,
      createdAt: existingIndex >= 0 ? entries[existingIndex].createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) entries[existingIndex] = entry;
    else entries.push(entry);
    this.storage.set(this.storeName, entries);
    this.events?.emit('jarvis:memory:updated', { entry }, { source: 'jarvis.memory' });
    return entry;
  }

  recall(key, { type = 'fact', subjectId = null, fallback = null } = {}) {
    const entry = this.list({ type, subjectId }).find((item) => item.key === key);
    return entry?.value ?? fallback;
  }

  forget(id) {
    const entries = this.storage.get(this.storeName, []);
    const next = entries.filter((entry) => entry.id !== id);
    this.storage.set(this.storeName, next);
    return next.length !== entries.length;
  }
}
