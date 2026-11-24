export class NotificationEngine {
  constructor({ storage, events, audit } = {}) {
    if (!storage) throw new Error('NotificationEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.audit = audit;
    this.storeName = 'notifications';
  }

  create({ title, message = '', level = 'info', recipient = null, action = null, metadata = {} }) {
    if (!title) throw new Error('Notification title is required');
    const notifications = this.storage.get(this.storeName, []);
    const notification = {
      id: crypto.randomUUID(),
      title,
      message,
      level,
      recipient,
      action,
      metadata,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    notifications.push(notification);
    this.storage.set(this.storeName, notifications);
    this.audit?.record({ action: 'notification.created', entityType: 'notification', entityId: notification.id, details: { title, recipient } });
    this.events?.emit('notification:created', { notification }, { source: 'core.notifications' });
    return notification;
  }

  list({ recipient, unreadOnly = false } = {}) {
    return this.storage.get(this.storeName, [])
      .filter((item) => (!recipient || item.recipient === recipient) && (!unreadOnly || !item.readAt))
      .reverse();
  }

  markRead(id, actor = 'system') {
    const notifications = this.storage.get(this.storeName, []);
    const item = notifications.find((notification) => notification.id === id);
    if (!item) throw new Error(`Unknown notification: ${id}`);
    item.readAt = item.readAt ?? new Date().toISOString();
    this.storage.set(this.storeName, notifications);
    this.audit?.record({ actor, action: 'notification.read', entityType: 'notification', entityId: id });
    return item;
  }
}
