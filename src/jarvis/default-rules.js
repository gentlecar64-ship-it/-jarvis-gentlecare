const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(date, now) {
  if (!date) return null;
  return Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS);
}

export const defaultJarvisRules = [
  {
    id: 'overdue-task',
    name: 'Tâche en retard',
    priority: 100,
    evaluate({ snapshot, now }) {
      return snapshot.tasks
        .filter((task) => task.dueAt && !['done', 'cancelled'].includes(task.status) && new Date(task.dueAt) < now)
        .map((task) => ({
          key: `overdue-task:${task.id}`,
          severity: 'critical',
          title: `Tâche en retard : ${task.title}`,
          message: `Échéance dépassée depuis ${Math.max(1, daysBetween(task.dueAt, now))} jour(s).`,
          entityType: 'task',
          entityId: task.id,
          recommendedAction: 'review-task',
        }));
    },
  },
  {
    id: 'stale-intervention',
    name: 'Intervention inactive',
    priority: 90,
    evaluate({ snapshot, now, config }) {
      const thresholdDays = config.staleInterventionDays ?? 2;
      return snapshot.interventions
        .filter((item) => item.status === 'in_progress' && daysBetween(item.updatedAt, now) >= thresholdDays)
        .map((item) => ({
          key: `stale-intervention:${item.id}`,
          severity: 'warning',
          title: `Intervention sans activité : ${item.number ?? item.id}`,
          message: `Aucune mise à jour depuis ${daysBetween(item.updatedAt, now)} jour(s).`,
          entityType: 'intervention',
          entityId: item.id,
          recommendedAction: 'open-intervention',
        }));
    },
  },
  {
    id: 'low-stock',
    name: 'Stock faible',
    priority: 80,
    evaluate({ snapshot }) {
      return snapshot.inventory
        .filter((item) => Number(item.quantity ?? 0) <= Number(item.minimumQuantity ?? 0))
        .map((item) => ({
          key: `low-stock:${item.id}`,
          severity: Number(item.quantity ?? 0) <= 0 ? 'critical' : 'warning',
          title: `Stock critique : ${item.name}`,
          message: `${item.quantity ?? 0} ${item.unit ?? ''} disponible(s), seuil minimum ${item.minimumQuantity ?? 0}.`,
          entityType: 'inventory-item',
          entityId: item.id,
          recommendedAction: 'create-purchase-task',
        }));
    },
  },
  {
    id: 'quote-follow-up',
    name: 'Devis à relancer',
    priority: 70,
    evaluate({ snapshot, now, config }) {
      const thresholdDays = config.quoteFollowUpDays ?? 7;
      return snapshot.quotes
        .filter((quote) => ['sent', 'pending'].includes(quote.status) && daysBetween(quote.sentAt ?? quote.updatedAt, now) >= thresholdDays)
        .map((quote) => ({
          key: `quote-follow-up:${quote.id}`,
          severity: 'info',
          title: `Devis à relancer : ${quote.number ?? quote.id}`,
          message: `Aucune réponse depuis ${daysBetween(quote.sentAt ?? quote.updatedAt, now)} jour(s).`,
          entityType: 'quote',
          entityId: quote.id,
          recommendedAction: 'follow-up-quote',
        }));
    },
  },
  {
    id: 'maintenance-due',
    name: 'Maintenance équipement',
    priority: 75,
    evaluate({ snapshot }) {
      return snapshot.equipment
        .filter((item) => {
          const current = Number(item.hours ?? 0);
          const due = Number(item.nextMaintenanceAtHours ?? Infinity);
          return current >= due - Number(item.warningBeforeHours ?? 10);
        })
        .map((item) => {
          const remaining = Number(item.nextMaintenanceAtHours ?? 0) - Number(item.hours ?? 0);
          return {
            key: `maintenance-due:${item.id}`,
            severity: remaining <= 0 ? 'critical' : 'warning',
            title: `Maintenance : ${item.name}`,
            message: remaining <= 0 ? 'Échéance de maintenance dépassée.' : `Maintenance à prévoir dans ${remaining} heure(s).`,
            entityType: 'equipment',
            entityId: item.id,
            recommendedAction: 'schedule-maintenance',
          };
        });
    },
  },
];
