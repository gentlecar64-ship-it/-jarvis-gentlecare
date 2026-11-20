export class ModuleRegistry {
  #modules = new Map();
  #started = new Set();

  register(definition) {
    this.#validateDefinition(definition);

    if (this.#modules.has(definition.id)) {
      throw new Error(`Le module « ${definition.id} » est déjà enregistré.`);
    }

    const normalized = {
      dependencies: [],
      start: async () => undefined,
      stop: async () => undefined,
      ...definition,
    };

    this.#modules.set(normalized.id, normalized);
    return normalized;
  }

  has(moduleId) {
    return this.#modules.has(moduleId);
  }

  get(moduleId) {
    return this.#modules.get(moduleId) ?? null;
  }

  list() {
    return [...this.#modules.values()].map(({ id, name, version, dependencies }) => ({
      id,
      name,
      version,
      dependencies: [...dependencies],
      started: this.#started.has(id),
    }));
  }

  async start(moduleId, context = {}) {
    const module = this.#require(moduleId);
    if (this.#started.has(moduleId)) return module;

    for (const dependencyId of module.dependencies) {
      if (!this.#modules.has(dependencyId)) {
        throw new Error(
          `Impossible de démarrer « ${moduleId} » : dépendance absente « ${dependencyId} ».`
        );
      }
      await this.start(dependencyId, context);
    }

    await module.start({ ...context, registry: this });
    this.#started.add(moduleId);
    return module;
  }

  async startAll(context = {}) {
    for (const moduleId of this.#modules.keys()) {
      await this.start(moduleId, context);
    }
  }

  async stop(moduleId, context = {}) {
    const module = this.#require(moduleId);
    if (!this.#started.has(moduleId)) return module;

    const dependants = [...this.#modules.values()].filter(
      (candidate) =>
        this.#started.has(candidate.id) && candidate.dependencies.includes(moduleId)
    );

    for (const dependant of dependants) {
      await this.stop(dependant.id, context);
    }

    await module.stop({ ...context, registry: this });
    this.#started.delete(moduleId);
    return module;
  }

  async stopAll(context = {}) {
    const startedIds = [...this.#started].reverse();
    for (const moduleId of startedIds) {
      await this.stop(moduleId, context);
    }
  }

  #require(moduleId) {
    const module = this.#modules.get(moduleId);
    if (!module) throw new Error(`Module inconnu : « ${moduleId} ».`);
    return module;
  }

  #validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('La définition du module doit être un objet.');
    }
    if (typeof definition.id !== 'string' || definition.id.trim() === '') {
      throw new TypeError('Chaque module doit avoir un identifiant non vide.');
    }
    if (!Array.isArray(definition.dependencies ?? [])) {
      throw new TypeError('Les dépendances du module doivent être un tableau.');
    }
    if (definition.start && typeof definition.start !== 'function') {
      throw new TypeError('La méthode start du module doit être une fonction.');
    }
    if (definition.stop && typeof definition.stop !== 'function') {
      throw new TypeError('La méthode stop du module doit être une fonction.');
    }
  }
}
