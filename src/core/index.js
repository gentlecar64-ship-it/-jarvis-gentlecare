import { EventBus } from './event-bus.js';
import { ModuleRegistry } from './module-registry.js';
import { StorageAdapter } from './storage.js';
import { AuditEngine } from './audit-engine.js';
import { TaskEngine } from './task-engine.js';
import { NotificationEngine } from './notification-engine.js';
import { WorkflowEngine } from './workflow-engine.js';
import { MemoryEngine } from '../jarvis/memory-engine.js';
import { IntelligenceEngine } from '../jarvis/intelligence-engine.js';
import { createAtelierModule } from '../modules/atelier/index.js';

export function createGCOSCore(options = {}) {
  const events = new EventBus();
  const modules = new ModuleRegistry();
  const storage = new StorageAdapter({
    namespace: options.storageNamespace ?? 'gcos',
    storage: options.storage,
  });
  const audit = new AuditEngine({ storage, events });
  const tasks = new TaskEngine({ storage, events, audit });
  const notifications = new NotificationEngine({ storage, events, audit });
  const workflows = new WorkflowEngine({ storage, events, audit });
  const memory = new MemoryEngine({ storage, events });
  const intelligence = new IntelligenceEngine({
    storage,
    events,
    audit,
    tasks,
    notifications,
    rules: options.jarvisRules,
    config: options.jarvisConfig,
  });

  const core = {
    version: '0.4.0',
    name: options.name ?? 'GCOS',
    environment: options.environment ?? 'browser',
    events,
    modules,
    storage,
    audit,
    tasks,
    notifications,
    workflows,
    jarvis: { memory, intelligence },
    atelier: null,

    async start(context = {}) {
      await events.emit('core:starting', { core }, { source: 'core' });
      await modules.startAll({ core, ...context });
      intelligence.analyze({ actor: context.actor ?? 'jarvis' });
      audit.record({
        actor: context.actor ?? 'system',
        action: 'core.started',
        entityType: 'system',
        entityId: core.name,
        details: { version: core.version, environment: core.environment },
      });
      await events.emit('core:started', { core }, { source: 'core' });
      return core;
    },

    async stop(context = {}) {
      await events.emit('core:stopping', { core }, { source: 'core' });
      await modules.stopAll({ core, ...context });
      audit.record({
        actor: context.actor ?? 'system',
        action: 'core.stopped',
        entityType: 'system',
        entityId: core.name,
      });
      await events.emit('core:stopped', { core }, { source: 'core' });
    },
  };

  const atelierModule = createAtelierModule(core);
  modules.register(atelierModule);
  core.atelier = atelierModule.service;

  return core;
}

export { EventBus } from './event-bus.js';
export { ModuleRegistry } from './module-registry.js';
export { StorageAdapter } from './storage.js';
export { AuditEngine } from './audit-engine.js';
export { TaskEngine } from './task-engine.js';
export { NotificationEngine } from './notification-engine.js';
export { WorkflowEngine } from './workflow-engine.js';
export { MemoryEngine } from '../jarvis/memory-engine.js';
export { IntelligenceEngine } from '../jarvis/intelligence-engine.js';
export { defaultJarvisRules } from '../jarvis/default-rules.js';
export { createAtelierModule, AtelierService } from '../modules/atelier/index.js';
