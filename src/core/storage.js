export class StorageAdapter {
  constructor({ namespace = 'gcos', storage } = {}) {
    this.namespace = namespace;
    this.storage = storage ?? globalThis.localStorage ?? null;
    this.memory = new Map();
  }

  key(name) {
    return `${this.namespace}:${name}`;
  }

  get(name, fallback = null) {
    const key = this.key(name);
    try {
      const raw = this.storage ? this.storage.getItem(key) : this.memory.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(name, value) {
    const key = this.key(name);
    const raw = JSON.stringify(value);
    if (this.storage) this.storage.setItem(key, raw);
    else this.memory.set(key, raw);
    return value;
  }

  remove(name) {
    const key = this.key(name);
    if (this.storage) this.storage.removeItem(key);
    else this.memory.delete(key);
  }
}
