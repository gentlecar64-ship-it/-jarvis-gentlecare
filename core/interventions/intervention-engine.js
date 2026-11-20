function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function required(value, message) {
  if (!value) throw new Error(message);
}

export class InterventionEngine {
  constructor({ workflowEngine, eventBus = null, clock = () => new Date() } = {}) {
    required(workflowEngine, 'workflowEngine is required');
    this.workflowEngine = workflowEngine;
    this.eventBus = eventBus;
    this.clock = clock;
  }

  create({ id, client, vehicle, template, diagnostic = {}, metadata = {} }) {
    required(id, 'Intervention id is required');
    required(client, 'Client is required');
    required(vehicle, 'Vehicle is required');

    const workflow = this.workflowEngine.createIntervention({ id, client, vehicle, template, metadata });
    const intervention = {
      ...workflow,
      diagnostic: clone(diagnostic),
      documents: [],
      photos: [],
      consumptions: [],
      reservations: [],
      invoices: [],
      qualityChecks: [],
      delivery: null
    };

    this.emit('intervention.aggregate.created', intervention, { clientId: client.id || null, vehicleId: vehicle.id || null });
    return intervention;
  }

  addPhoto(intervention, photo, operator = null) {
    required(photo?.url || photo?.id, 'Photo url or id is required');
    const item = { ...clone(photo), addedAt: this.clock().toISOString(), operator: clone(operator) };
    intervention.photos.push(item);
    this.touch(intervention);
    this.emit('intervention.photo.added', intervention, { photo: item });
    return item;
  }

  addDocument(intervention, document, operator = null) {
    required(document?.name, 'Document name is required');
    const item = { ...clone(document), addedAt: this.clock().toISOString(), operator: clone(operator) };
    intervention.documents.push(item);
    this.touch(intervention);
    this.emit('intervention.document.added', intervention, { document: item });
    return item;
  }

  recordConsumption(intervention, consumption, operator = null) {
    required(consumption?.resourceId, 'resourceId is required');
    required(Number(consumption?.quantity) > 0, 'Consumption quantity must be positive');
    const item = {
      id: consumption.id || `consumption:${Date.now()}`,
      unit: consumption.unit || 'unit',
      ...clone(consumption),
      quantity: Number(consumption.quantity),
      recordedAt: this.clock().toISOString(),
      operator: clone(operator)
    };
    intervention.consumptions.push(item);
    this.touch(intervention);
    this.emit('intervention.consumption.recorded', intervention, { consumption: item });
    return item;
  }

  addQualityCheck(intervention, check, operator) {
    required(check?.name, 'Quality check name is required');
    const item = {
      id: check.id || `quality:${Date.now()}`,
      ...clone(check),
      passed: Boolean(check.passed),
      checkedAt: this.clock().toISOString(),
      operator: clone(operator)
    };
    intervention.qualityChecks.push(item);
    this.touch(intervention);
    this.emit('intervention.quality.checked', intervention, { check: item });
    return item;
  }

  setDelivery(intervention, delivery, operator = null) {
    intervention.delivery = {
      ...clone(delivery),
      updatedAt: this.clock().toISOString(),
      operator: clone(operator)
    };
    this.touch(intervention);
    this.emit('intervention.delivery.updated', intervention, { delivery: intervention.delivery });
    return intervention.delivery;
  }

  touch(intervention) {
    intervention.updatedAt = this.clock().toISOString();
  }

  emit(type, intervention, payload) {
    if (!this.eventBus?.publish) return;
    this.eventBus.publish({ type, interventionId: intervention.id, payload: clone(payload || {}) });
  }
}
