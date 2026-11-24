import { AtelierService } from './atelier-service.js';
import { registerCryoDinitrolWorkflow } from './workflow-definition.js';

export function createAtelierModule(core) {
  registerCryoDinitrolWorkflow(core.workflows);
  const service = new AtelierService({
    storage: core.storage,
    events: core.events,
    audit: core.audit,
    workflows: core.workflows,
  });

  return {
    id: 'atelier',
    name: 'Atelier',
    version: '0.1.0',
    service,
    async start() {
      await core.events.emit('atelier:started', { module: 'atelier' }, { source: 'atelier' });
    },
    async stop() {
      await core.events.emit('atelier:stopped', { module: 'atelier' }, { source: 'atelier' });
    },
  };
}

export { AtelierService } from './atelier-service.js';
export { CRYO_DINITROL_WORKFLOW_ID, registerCryoDinitrolWorkflow, validateRequiredEvidence } from './workflow-definition.js';
