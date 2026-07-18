import { EventBus } from './event-bus.js';
import { ModuleRegistry } from './module-registry.js';

export function createGCOSCore(options = {}) {
  const events = new EventBus();
  const modules = new ModuleRegistry();

  const core = {
    version: '0.1.0',
    name: options.name ?? 'GCOS',
    environment: options.environment ?? 'browser',
    events,
    modules,

    async start(context = {}) {
      await events.emit('core:starting', { core }, { source: 'core' });
      await modules.startAll({ core, ...context });
      await events.emit('core:started', { core }, { source: 'core' });
      return core;
    },

    async stop(context = {}) {
      await events.emit('core:stopping', { core }, { source: 'core' });
      await modules.stopAll({ core, ...context });
      await events.emit('core:stopped', { core }, { source: 'core' });
    },
  };

  return core;
}

export { EventBus } from './event-bus.js';
export { ModuleRegistry } from './module-registry.js';
