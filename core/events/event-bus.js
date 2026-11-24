export class EventBus {
  constructor({ clock = () => new Date(), maxHistory = 1000 } = {}) {
    this.clock = clock;
    this.maxHistory = maxHistory;
    this.listeners = new Map();
    this.history = [];
  }

  subscribe(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('Event type and handler are required');
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(type, handler) {
    const listeners = this.listeners.get(type);
    if (!listeners) return false;
    const removed = listeners.delete(handler);
    if (!listeners.size) this.listeners.delete(type);
    return removed;
  }

  publish(event) {
    if (!event?.type) throw new Error('Event type is required');
    const normalized = {
      id: event.id || `${event.type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      at: event.at || this.clock().toISOString(),
      ...event
    };

    this.history.unshift(normalized);
    if (this.history.length > this.maxHistory) this.history.length = this.maxHistory;

    const direct = [...(this.listeners.get(normalized.type) || [])];
    const wildcard = [...(this.listeners.get('*') || [])];
    for (const handler of [...direct, ...wildcard]) handler(normalized);
    return normalized;
  }

  getHistory({ type = null, interventionId = null, limit = 100 } = {}) {
    return this.history
      .filter((event) => !type || event.type === type)
      .filter((event) => !interventionId || event.interventionId === interventionId)
      .slice(0, limit);
  }
}
