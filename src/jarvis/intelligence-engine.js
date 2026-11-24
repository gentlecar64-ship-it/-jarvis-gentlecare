import { defaultJarvisRules } from './default-rules.js';

const SEVERITY_SCORE = { info: 1, warning: 2, critical: 3 };

export class IntelligenceEngine {
  constructor({ storage, events, audit, tasks, notifications, rules = defaultJarvisRules, config = {} } = {}) {
    if (!storage) throw new Error('IntelligenceEngine requires a storage adapter');
    this.storage = storage;
    this.events = events;
    this.audit = audit;
    this.tasks = tasks;
    this.notifications = notifications;
    this.rules = [...rules];
    this.config = config;
    this.insightsStore = 'jarvis-insights';
    this.inventoryStore = 'inventory-items';
    this.quotesStore = 'quotes';
    this.equipmentStore = 'equipment';
  }

  registerRule(rule) {
    if (!rule?.id || typeof rule.evaluate !== 'function') {
      throw new Error('A Jarvis rule requires an id and an evaluate function');
    }
    const index = this.rules.findIndex((candidate) => candidate.id === rule.id);
    if (index >= 0) this.rules[index] = rule;
    else this.rules.push(rule);
    return rule;
  }

  snapshot() {
    return {
      tasks: this.storage.get('tasks', []),
      interventions: this.storage.get('atelier-interventions', []),
      inventory: this.storage.get(this.inventoryStore, []),
      quotes: this.storage.get(this.quotesStore, []),
      equipment: this.storage.get(this.equipmentStore, []),
      workflows: this.storage.get('workflow-instances', []),
    };
  }

  analyze({ now = new Date(), actor = 'jarvis' } = {}) {
    const snapshot = this.snapshot();
    const previous = this.storage.get(this.insightsStore, []);
    const previousByKey = new Map(previous.map((item) => [item.key, item]));
    const findings = [];

    for (const rule of [...this.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
      const results = rule.evaluate({ snapshot, now, config: this.config }) ?? [];
      for (const result of results) {
        const existing = previousByKey.get(result.key);
        findings.push({
          id: existing?.id ?? crypto.randomUUID(),
          ruleId: rule.id,
          status: existing?.status === 'resolved' ? 'open' : (existing?.status ?? 'open'),
          firstDetectedAt: existing?.firstDetectedAt ?? now.toISOString(),
          lastDetectedAt: now.toISOString(),
          acknowledgedAt: existing?.acknowledgedAt ?? null,
          resolvedAt: null,
          ...result,
        });
      }
    }

    const activeKeys = new Set(findings.map((item) => item.key));
    for (const old of previous) {
      if (!activeKeys.has(old.key) && old.status !== 'resolved') {
        findings.push({ ...old, status: 'resolved', resolvedAt: now.toISOString() });
      }
    }

    findings.sort((a, b) => (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0));
    this.storage.set(this.insightsStore, findings);
    this.audit?.record({
      actor,
      action: 'jarvis.analysis.completed',
      entityType: 'system',
      entityId: 'jarvis',
      details: { openInsights: findings.filter((item) => item.status === 'open').length },
    });
    this.events?.emit('jarvis:analysis:completed', { insights: findings, snapshot }, { source: 'jarvis.intelligence' });
    return findings;
  }

  list({ status = 'open', severity, entityType } = {}) {
    return this.storage.get(this.insightsStore, []).filter((item) =>
      (!status || item.status === status) &&
      (!severity || item.severity === severity) &&
      (!entityType || item.entityType === entityType)
    );
  }

  acknowledge(id, actor = 'system') {
    return this.#patchInsight(id, {
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    }, actor, 'jarvis.insight.acknowledged');
  }

  resolve(id, actor = 'system') {
    return this.#patchInsight(id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    }, actor, 'jarvis.insight.resolved');
  }

  createTaskFromInsight(id, { assignee = null, dueAt = null, actor = 'system' } = {}) {
    if (!this.tasks) throw new Error('Task engine is not available');
    const insight = this.#requireInsight(id);
    const priority = insight.severity === 'critical' ? 'critical' : insight.severity === 'warning' ? 'high' : 'normal';
    const task = this.tasks.create({
      title: insight.title,
      description: insight.message,
      priority,
      assignee,
      dueAt,
      metadata: { insightId: insight.id, entityType: insight.entityType, entityId: insight.entityId },
    });
    this.#patchInsight(id, { taskId: task.id, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }, actor, 'jarvis.insight.task_created');
    return task;
  }

  notifyInsight(id, { recipient = null, actor = 'jarvis' } = {}) {
    if (!this.notifications) throw new Error('Notification engine is not available');
    const insight = this.#requireInsight(id);
    return this.notifications.create({
      title: insight.title,
      message: insight.message,
      level: insight.severity === 'critical' ? 'error' : insight.severity,
      recipient,
      action: insight.recommendedAction,
      metadata: { insightId: insight.id, entityType: insight.entityType, entityId: insight.entityId, actor },
    });
  }

  calculateInterventionMargin({ revenue = 0, dryIceCost = 0, productCost = 0, labourCost = 0, otherCosts = 0 } = {}) {
    const totalCosts = [dryIceCost, productCost, labourCost, otherCosts].reduce((sum, value) => sum + Number(value || 0), 0);
    const grossMargin = Number(revenue || 0) - totalCosts;
    const marginRate = Number(revenue || 0) > 0 ? grossMargin / Number(revenue) : 0;
    return { revenue: Number(revenue || 0), totalCosts, grossMargin, marginRate };
  }

  #requireInsight(id) {
    const insight = this.storage.get(this.insightsStore, []).find((item) => item.id === id);
    if (!insight) throw new Error(`Unknown Jarvis insight: ${id}`);
    return insight;
  }

  #patchInsight(id, patch, actor, action) {
    const insights = this.storage.get(this.insightsStore, []);
    const index = insights.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Unknown Jarvis insight: ${id}`);
    insights[index] = { ...insights[index], ...patch };
    this.storage.set(this.insightsStore, insights);
    this.audit?.record({ actor, action, entityType: 'jarvis-insight', entityId: id, details: patch });
    this.events?.emit('jarvis:insight:updated', { insight: insights[index], patch }, { source: 'jarvis.intelligence' });
    return insights[index];
  }
}
