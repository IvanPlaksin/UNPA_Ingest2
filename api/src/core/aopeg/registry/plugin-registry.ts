/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG PLUGIN REGISTRY
 * Central registry for all executors, conditions, and transformers
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  INodeExecutor,
  IConditionEvaluator,
  IDataTransformer,
} from '../types/core.types';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

export interface PluginMetadata {
  name: string;
  version: string;
  domain: string;
  description: string;
  author?: string;
}

export interface RegisteredExecutor {
  executor: INodeExecutor;
  plugin: PluginMetadata;
  registeredAt: Date;
}

export interface RegisteredCondition {
  evaluator: IConditionEvaluator;
  plugin: PluginMetadata;
  registeredAt: Date;
}

export interface RegisteredTransformer {
  transformer: IDataTransformer;
  plugin: PluginMetadata;
  registeredAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY CLASS
// ────────────────────────────────────────────────────────────────────────────

class PluginRegistry {
  private executors: Map<string, RegisteredExecutor> = new Map();
  private conditions: Map<string, RegisteredCondition> = new Map();
  private transformers: Map<string, RegisteredTransformer> = new Map();
  private plugins: Map<string, PluginMetadata> = new Map();

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTOR REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a node executor
   */
  registerExecutor(executor: INodeExecutor, plugin: PluginMetadata): void {
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
  getExecutor(type: string): INodeExecutor | undefined {
    return this.executors.get(type)?.executor;
  }

  /**
   * Check if executor exists
   */
  hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }

  /**
   * List all executors
   */
  listExecutors(): Array<{
    type: string;
    displayName: string;
    domain: string;
    description: string;
    plugin: string;
  }> {
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
  listExecutorsByDomain(domain: string): Array<{
    type: string;
    displayName: string;
    description: string;
    parameterSchema: Record<string, unknown>;
  }> {
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
  getDomains(): string[] {
    const domains = new Set<string>();
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
  registerCondition(evaluator: IConditionEvaluator, plugin: PluginMetadata): void {
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
  getCondition(type: string): IConditionEvaluator | undefined {
    return this.conditions.get(type)?.evaluator;
  }

  /**
   * Check if condition exists
   */
  hasCondition(type: string): boolean {
    return this.conditions.has(type);
  }

  /**
   * List all conditions
   */
  listConditions(): Array<{ type: string; plugin: string }> {
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
  registerTransformer(transformer: IDataTransformer, plugin: PluginMetadata): void {
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
  getTransformer(type: string): IDataTransformer | undefined {
    return this.transformers.get(type)?.transformer;
  }

  /**
   * Check if transformer exists
   */
  hasTransformer(type: string): boolean {
    return this.transformers.has(type);
  }

  /**
   * List all transformers
   */
  listTransformers(): Array<{ type: string; plugin: string }> {
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
  listPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin info
   */
  getPlugin(name: string): PluginMetadata | undefined {
    return this.plugins.get(name);
  }

  /**
   * Unregister all items from a plugin
   */
  unregisterPlugin(pluginName: string): void {
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
  clear(): void {
    this.executors.clear();
    this.conditions.clear();
    this.transformers.clear();
    this.plugins.clear();
  }

  /**
   * Get registry stats
   */
  getStats(): {
    executorCount: number;
    conditionCount: number;
    transformerCount: number;
    pluginCount: number;
    domains: string[];
  } {
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
  getExecutorInfo(type: string): {
    type: string;
    displayName: string;
    description: string;
    domain: string;
    parameterSchema: Record<string, unknown>;
    defaultParameters: Record<string, unknown>;
    plugin: PluginMetadata;
  } | undefined {
    const registered = this.executors.get(type);
    if (!registered) return undefined;

    const { executor, plugin } = registered;
    return {
      type: executor.type,
      displayName: executor.displayName,
      description: executor.description,
      domain: executor.domain,
      parameterSchema: executor.parameterSchema,
      defaultParameters: executor.getDefaultParameters(),
      plugin,
    };
  }

  /**
   * Validate that all executor types in a graph are registered
   */
  validateGraphExecutors(executorTypes: string[]): {
    valid: boolean;
    missingExecutors: string[];
  } {
    const missing = executorTypes.filter(type => !this.hasExecutor(type));
    return {
      valid: missing.length === 0,
      missingExecutors: missing,
    };
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();
