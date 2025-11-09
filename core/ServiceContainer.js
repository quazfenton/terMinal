/**
 * Service Container
 * Dependency injection container for managing service lifecycle
 */

class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.dependencies = new Map();
  }

  register(name, factory, options = {}) {
    this.factories.set(name, factory);
    
    if (options.dependencies) {
      this.dependencies.set(name, options.dependencies);
    }
    
    if (options.singleton !== false) {
      this.services.set(name, { singleton: true });
    }
  }

  get(name) {
    // Return singleton if exists
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service '${name}' not registered`);
    }

    // Resolve dependencies
    const deps = this.dependencies.get(name) || [];
    const resolvedDeps = deps.map(dep => this.get(dep));

    // Create instance
    const instance = factory(...resolvedDeps);

    // Store singleton
    const serviceConfig = this.services.get(name);
    if (serviceConfig && serviceConfig.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }

  has(name) {
    return this.factories.has(name);
  }

  remove(name) {
    this.factories.delete(name);
    this.services.delete(name);
    this.singletons.delete(name);
    this.dependencies.delete(name);
  }

  clear() {
    this.factories.clear();
    this.services.clear();
    this.singletons.clear();
    this.dependencies.clear();
  }

  getRegisteredServices() {
    return Array.from(this.factories.keys());
  }
}

module.exports = ServiceContainer;
