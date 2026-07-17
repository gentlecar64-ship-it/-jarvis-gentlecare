(() => {
  'use strict';
  if (window.GCOS) return;

  const listeners = new Map();
  const state = {
    version: '0.1.0',
    mode: 'cloud-first',
    online: navigator.onLine,
    startedAt: new Date().toISOString(),
    user: null,
    services: {}
  };

  function on(eventName, handler) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
    return () => listeners.get(eventName)?.delete(handler);
  }

  function emit(eventName, detail = {}) {
    const event = { name: eventName, detail, at: new Date().toISOString() };
    listeners.get(eventName)?.forEach((handler) => {
      try { handler(event); } catch (error) { console.error('[GCOS event]', error); }
    });
    window.dispatchEvent(new CustomEvent(`gcos:${eventName}`, { detail: event }));
    return event;
  }

  function registerService(name, service) {
    if (!name || !service) throw new Error('GCOS_SERVICE_INVALID');
    state.services[name] = service;
    emit('service:registered', { name });
    return service;
  }

  function service(name) {
    return state.services[name] || null;
  }

  function setUser(user) {
    state.user = user || null;
    emit('user:changed', { user: state.user });
  }

  function snapshot() {
    return JSON.parse(JSON.stringify({ ...state, services: Object.keys(state.services) }));
  }

  window.addEventListener('online', () => {
    state.online = true;
    emit('network:online');
  });
  window.addEventListener('offline', () => {
    state.online = false;
    emit('network:offline');
  });

  window.GCOS = Object.freeze({
    state,
    on,
    emit,
    registerService,
    service,
    setUser,
    snapshot
  });

  emit('core:ready', { version: state.version });
})();
