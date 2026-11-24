const RESOURCE_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  IN_USE: 'IN_USE',
  MAINTENANCE: 'MAINTENANCE',
  UNAVAILABLE: 'UNAVAILABLE'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class ResourceManager {
  constructor({ eventBus = null, clock = () => new Date() } = {}) {
    this.eventBus = eventBus;
    this.clock = clock;
    this.resources = new Map();
  }

  register(resource) {
    if (!resource?.id || !resource?.name) throw new Error('Resource id and name are required');
    if (this.resources.has(resource.id)) throw new Error(`Resource ${resource.id} already exists`);
    const normalized = {
      type: 'generic',
      status: RESOURCE_STATUS.AVAILABLE,
      capacity: 1,
      quantity: null,
      unit: null,
      reservations: [],
      maintenance: [],
      metadata: {},
      ...clone(resource),
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString()
    };
    this.resources.set(normalized.id, normalized);
    this.emit('resource.registered', normalized.id, { resource: normalized });
    return normalized;
  }

  get(id) {
    const resource = this.resources.get(id);
    if (!resource) throw new Error(`Unknown resource ${id}`);
    return resource;
  }

  list(filter = {}) {
    return [...this.resources.values()].filter((resource) =>
      (!filter.type || resource.type === filter.type) &&
      (!filter.status || resource.status === filter.status)
    );
  }

  isAvailable(id, { startAt = null, endAt = null, quantity = 1 } = {}) {
    const resource = this.get(id);
    if ([RESOURCE_STATUS.MAINTENANCE, RESOURCE_STATUS.UNAVAILABLE].includes(resource.status)) return false;
    if (resource.quantity !== null && Number(resource.quantity) < Number(quantity)) return false;
    if (!startAt || !endAt) return resource.status !== RESOURCE_STATUS.IN_USE;

    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();
    const overlapCount = resource.reservations.filter((reservation) => {
      const reservedStart = new Date(reservation.startAt).getTime();
      const reservedEnd = new Date(reservation.endAt).getTime();
      return reservation.status !== 'CANCELLED' && start < reservedEnd && end > reservedStart;
    }).length;
    return overlapCount < Number(resource.capacity || 1);
  }

  reserve(id, reservation) {
    if (!reservation?.interventionId || !reservation?.startAt || !reservation?.endAt) {
      throw new Error('interventionId, startAt and endAt are required');
    }
    if (!this.isAvailable(id, reservation)) throw new Error(`Resource ${id} is not available`);
    const resource = this.get(id);
    const item = {
      id: reservation.id || `reservation:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      status: 'RESERVED',
      quantity: 1,
      ...clone(reservation),
      createdAt: this.clock().toISOString()
    };
    resource.reservations.push(item);
    resource.status = RESOURCE_STATUS.RESERVED;
    resource.updatedAt = this.clock().toISOString();
    this.emit('resource.reserved', id, { reservation: item });
    return item;
  }

  startUse(id, reservationId, operator = null) {
    const resource = this.get(id);
    const reservation = resource.reservations.find((item) => item.id === reservationId);
    if (!reservation) throw new Error(`Unknown reservation ${reservationId}`);
    reservation.status = 'IN_USE';
    reservation.startedAt = this.clock().toISOString();
    reservation.operator = clone(operator);
    resource.status = RESOURCE_STATUS.IN_USE;
    resource.updatedAt = reservation.startedAt;
    this.emit('resource.use.started', id, { reservation });
    return reservation;
  }

  release(id, reservationId) {
    const resource = this.get(id);
    const reservation = resource.reservations.find((item) => item.id === reservationId);
    if (!reservation) throw new Error(`Unknown reservation ${reservationId}`);
    reservation.status = 'COMPLETED';
    reservation.completedAt = this.clock().toISOString();
    const active = resource.reservations.some((item) => ['RESERVED', 'IN_USE'].includes(item.status));
    resource.status = active ? RESOURCE_STATUS.RESERVED : RESOURCE_STATUS.AVAILABLE;
    resource.updatedAt = reservation.completedAt;
    this.emit('resource.released', id, { reservation });
    return resource;
  }

  consume(id, quantity, context = {}) {
    const resource = this.get(id);
    if (resource.quantity === null) throw new Error(`Resource ${id} is not consumable`);
    const amount = Number(quantity);
    if (!(amount > 0)) throw new Error('Quantity must be positive');
    if (Number(resource.quantity) < amount) throw new Error(`Insufficient stock for ${id}`);
    resource.quantity = Number(resource.quantity) - amount;
    resource.updatedAt = this.clock().toISOString();
    this.emit('resource.consumed', id, { quantity: amount, remaining: resource.quantity, ...clone(context) });
    return resource.quantity;
  }

  setStatus(id, status, reason = null) {
    if (!Object.values(RESOURCE_STATUS).includes(status)) throw new Error(`Invalid resource status ${status}`);
    const resource = this.get(id);
    resource.status = status;
    resource.updatedAt = this.clock().toISOString();
    this.emit('resource.status.changed', id, { status, reason });
    return resource;
  }

  emit(type, resourceId, payload) {
    if (this.eventBus?.publish) this.eventBus.publish({ type, resourceId, payload: clone(payload || {}) });
  }
}

export { RESOURCE_STATUS };
