export class EventBus {
  #listeners = new Map();

  on(eventName, handler) {
    this.#assertEventName(eventName);
    if (typeof handler !== 'function') {
      throw new TypeError('Le gestionnaire d’événement doit être une fonction.');
    }

    const handlers = this.#listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    this.#listeners.set(eventName, handlers);

    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    let unsubscribe;
    const wrapper = async (payload, metadata) => {
      unsubscribe();
      return handler(payload, metadata);
    };
    unsubscribe = this.on(eventName, wrapper);
    return unsubscribe;
  }

  off(eventName, handler) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers) return false;

    const deleted = handlers.delete(handler);
    if (handlers.size === 0) this.#listeners.delete(eventName);
    return deleted;
  }

  async emit(eventName, payload = undefined, metadata = {}) {
    this.#assertEventName(eventName);
    const handlers = [...(this.#listeners.get(eventName) ?? [])];
    const eventMetadata = {
      eventName,
      emittedAt: new Date().toISOString(),
      ...metadata,
    };

    const results = [];
    for (const handler of handlers) {
      results.push(await handler(payload, eventMetadata));
    }
    return results;
  }

  listenerCount(eventName) {
    return this.#listeners.get(eventName)?.size ?? 0;
  }

  clear(eventName = undefined) {
    if (eventName === undefined) {
      this.#listeners.clear();
      return;
    }
    this.#listeners.delete(eventName);
  }

  #assertEventName(eventName) {
    if (typeof eventName !== 'string' || eventName.trim() === '') {
      throw new TypeError('Le nom de l’événement doit être une chaîne non vide.');
    }
  }
}
