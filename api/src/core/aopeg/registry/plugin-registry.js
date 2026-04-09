/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG PLUGIN REGISTRY
 * Central registry for all executors, conditions, and transformers
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY CLASS
// ────────────────────────────────────────────────────────────────────────────

class PluginRegistry {
  constructor() {
    this.executors = new Map();
    this.conditions = new Map();
    this.transformers = new Map();
    this.plugins = new Map();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTOR REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a node executor
   */
  registerExecutor(executor, plugin) {
    if (this.executors.has(executor.type)) {
      throw new Error(`Executor type "${executor.type}" is already registered`);
    }

    this.executors.set(executor.type, {
      executor,
      plugin,
      registeredAt: new Date(),
    });

    this.plugins.set(plugin.name, plugin);

    console.log(`[PluginRegistry] Registered executor: ${executor.type} (${plugin.name})`);
  }

  /**
   * Get executor by type
   */
  getExecutor(type) {
    return this.executors.get(type)?.executor;
  }

  /**
   * Check if executor exists
   */
  hasExecutor(type) {
    return this.executors.has(type);
  }

  /**
   * List all executors
   */
  listExecutors() {
    return Array.from(this.executors.entries()).map(([type, reg]) => ({
      type,
      displayName: reg.executor.displayName,
      domain: reg.executor.domain,
      description: reg.executor.description,
      plugin: reg.plugin.name,
    }));
  }

  /**
   * List executors by domain
   */
  listExecutorsByDomain(domain) {
    return Array.from(this.executors.entries())
      .filter(([, reg]) => reg.executor.domain === domain)
      .map(([type, reg]) => ({
        type,
        displayName: reg.executor.displayName,
        description: reg.executor.description,
        parameterSchema: reg.executor.parameterSchema,
      }));
  }

  /**
   * Get all domains
   */
  getDomains() {
    const domains = new Set();
    for (const [, reg] of this.executors) {
      domains.add(reg.executor.domain);
    }
    return Array.from(domains);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONDITION REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a condition evaluator
   */
  registerCondition(evaluator, plugin) {
    if (this.conditions.has(evaluator.type)) {
      throw new Error(`Condition type "${evaluator.type}" is already registered`);
    }

    this.conditions.set(evaluator.type, {
      evaluator,
      plugin,
      registeredAt: new Date(),
    });

    this.plugins.set(plugin.name, plugin);

    console.log(`[PluginRegistry] Registered condition: ${evaluator.type} (${plugin.name})`);
  }

  /**
   * Get condition evaluator by type
   */
  getCondition(type) {
    return this.conditions.get(type)?.evaluator;
  }

  /**
   * Check if condition exists
   */
  hasCondition(type) {
    return this.conditions.has(type);
  }

  /**
   * List all conditions
   */
  listConditions() {
    return Array.from(this.conditions.entries()).map(([type, reg]) => ({
      type,
      plugin: reg.plugin.name,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSFORMER REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a data transformer
   */
  registerTransformer(transformer, plugin) {
    if (this.transformers.has(transformer.type)) {
      throw new Error(`Transformer type "${transformer.type}" is already registered`);
    }

    this.transformers.set(transformer.type, {
      transformer,
      plugin,
      registeredAt: new Date(),
    });

    this.plugins.set(plugin.name, plugin);

    console.log(`[PluginRegistry] Registered transformer: ${transformer.type} (${plugin.name})`);
  }

  /**
   * Get transformer by type
   */
  getTransformer(type) {
    return this.transformers.get(type)?.transformer;
  }

  /**
   * Check if transformer exists
   */
  hasTransformer(type) {
    return this.transformers.has(type);
  }

  /**
   * List all transformers
   */
  listTransformers() {
    return Array.from(this.transformers.entries()).map(([type, reg]) => ({
      type,
      plugin: reg.plugin.name,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLUGIN MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * List all registered plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin info
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * Unregister all items from a plugin
   */
  unregisterPlugin(pluginName) {
    // Remove executors
    for (const [type, reg] of this.executors) {
      if (reg.plugin.name === pluginName) {
        this.executors.delete(type);
      }
    }

    // Remove conditions
    for (const [type, reg] of this.conditions) {
      if (reg.plugin.name === pluginName) {
        this.conditions.delete(type);
      }
    }

    // Remove transformers
    for (const [type, reg] of this.transformers) {
      if (reg.plugin.name === pluginName) {
        this.transformers.delete(type);
      }
    }

    this.plugins.delete(pluginName);
    console.log(`[PluginRegistry] Unregistered plugin: ${pluginName}`);
  }

  /**
   * Clear all registrations (for testing)
   */
  clear() {
    this.executors.clear();
    this.conditions.clear();
    this.transformers.clear();
    this.plugins.clear();
  }

  /**
   * Get registry stats
   */
  getStats() {
    return {
      executorCount: this.executors.size,
      conditionCount: this.conditions.size,
      transformerCount: this.transformers.size,
      pluginCount: this.plugins.size,
      domains: this.getDomains(),
    };
  }

  /**
   * Get full executor info (including schema)
   */
  getExecutorInfo(type) {
    const registered = this.executors.get(type);
    if (!registered) return undefined;

    const { executor, plugin } = registered;
    return {
      type: executor.type,
      displayName: executor.displayName,
      description: executor.description,
      domain: executor.domain,
      parameterSchema: executor.parameterSchema,
      defaultParameters: executor.getDefaultParameters ? executor.getDefaultParameters() : {},
      plugin,
    };
  }

  /**
   * Validate that all executor types in a graph are registered
   */
  validateGraphExecutors(executorTypes) {
    const missing = executorTypes.filter(type => !this.hasExecutor(type));
    return {
      valid: missing.length === 0,
      missingExecutors: missing,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL CONTROLLER-USED METHODS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get executors by domain (alias for listExecutorsByDomain)
   */
  getExecutorsByDomain(domain) {
    return this.listExecutorsByDomain(domain);
  }

  /**
   * Get all executors with full details
   */
  getAllExecutors() {
    return Array.from(this.executors.values()).map(reg => ({
      id: reg.executor.type,
      type: reg.executor.type,
      displayName: reg.executor.displayName,
      description: reg.executor.description,
      domain: reg.executor.domain,
      parameterSchema: reg.executor.parameterSchema || {},
    }));
  }

  /**
   * Get all condition types
   */
  getConditionTypes() {
    return Array.from(this.conditions.keys());
  }

  /**
   * Get all transformer types
   */
  getTransformerTypes() {
    return Array.from(this.transformers.keys());
  }
}

// Singleton instance
const pluginRegistry = new PluginRegistry();

module.exports = {
  PluginRegistry,
  pluginRegistry,
};
