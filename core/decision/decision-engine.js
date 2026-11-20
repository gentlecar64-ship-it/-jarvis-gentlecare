function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class DecisionEngine {
  constructor({ workflowEngine, resourceManager = null, clock = () => new Date() } = {}) {
    if (!workflowEngine) throw new Error('workflowEngine is required');
    this.workflowEngine = workflowEngine;
    this.resourceManager = resourceManager;
    this.clock = clock;
  }

  rank(interventions, context = {}) {
    const decisions = [];

    for (const intervention of interventions || []) {
      const readyTasks = this.workflowEngine.getReadyTasks(intervention, context);
      for (const task of readyTasks) {
        const resourceCheck = this.checkResources(task, context);
        const score = this.score(intervention, task, resourceCheck, context);
        decisions.push({
          interventionId: intervention.id,
          client: clone(intervention.client),
          vehicle: clone(intervention.vehicle),
          taskId: task.id,
          taskName: task.name,
          score,
          canStart: resourceCheck.available,
          reasons: this.explain(intervention, task, resourceCheck, score),
          estimatedDurationMinutes: task.estimatedDurationMinutes || 0,
          requiredResources: clone(task.resources || []),
          requiredSkills: clone(task.skills || []),
          generatedAt: this.clock().toISOString()
        });
      }
    }

    return decisions.sort((a, b) => b.score - a.score || a.estimatedDurationMinutes - b.estimatedDurationMinutes);
  }

  next(interventions, context = {}) {
    return this.rank(interventions, context)[0] || null;
  }

  checkResources(task, context) {
    if (!this.resourceManager || !(task.resources || []).length) {
      return { available: true, unavailable: [] };
    }

    const unavailable = task.resources.filter((resourceId) => {
      try {
        return !this.resourceManager.isAvailable(resourceId, context.resourceWindow || {});
      } catch {
        return true;
      }
    });

    return { available: unavailable.length === 0, unavailable };
  }

  score(intervention, task, resourceCheck, context) {
    let score = 100;
    const priority = Number(intervention.metadata?.priority || 0);
    const deadline = intervention.metadata?.deadline ? new Date(intervention.metadata.deadline).getTime() : null;
    const now = this.clock().getTime();

    score += priority * 20;
    if (!resourceCheck.available) score -= 1000;
    if (deadline) {
      const hoursRemaining = (deadline - now) / 3600000;
      if (hoursRemaining <= 0) score += 300;
      else if (hoursRemaining <= 24) score += 150;
      else if (hoursRemaining <= 72) score += 60;
    }
    if (task.skills?.some((skill) => (context.operatorSkills || []).includes(skill))) score += 30;
    if ((task.estimatedDurationMinutes || 0) <= Number(context.availableMinutes || Infinity)) score += 25;
    score -= Math.min(60, Number(task.estimatedDurationMinutes || 0) / 10);
    return Math.round(score);
  }

  explain(intervention, task, resourceCheck, score) {
    const reasons = [];
    if (resourceCheck.available) reasons.push('Ressources disponibles');
    else reasons.push(`Ressources indisponibles : ${resourceCheck.unavailable.join(', ')}`);
    if (Number(intervention.metadata?.priority || 0) > 0) reasons.push(`Priorité ${intervention.metadata.priority}`);
    if (intervention.metadata?.deadline) reasons.push(`Échéance ${intervention.metadata.deadline}`);
    if (task.estimatedDurationMinutes) reasons.push(`Durée estimée ${task.estimatedDurationMinutes} min`);
    reasons.push(`Score MAVIK ${score}`);
    return reasons;
  }
}
