/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLUGIN BASE CLASS
 * Base class for creating domain plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  INodeExecutor,
  IConditionEvaluator,
  IDataTransformer,
  ExecutionContext,
  NodeExecutionResult,
  createSuccessResult,
  createErrorResult,
} from '../types/core.types';
import { pluginRegistry, PluginMetadata } from '../registry/plugin-registry';

// ────────────────────────────────────────────────────────────────────────────
// ABSTRACT PLUGIN BASE
// ────────────────────────────────────────────────────────────────────────────

export abstract class PluginBase {
  protected readonly executors: INodeExecutor[] = [];
  protected readonly conditions: IConditionEvaluator[] = [];
  protected readonly transformers: IDataTransformer[] = [];
  private registered = false;

  constructor(protected readonly metadata: PluginMetadata) {}

  /**
   * Get plugin metadata
   */
  getMetadata(): PluginMetadata {
    return this.metadata;
  }

  /**
   * Initialize the plugin (override in subclass)
   * Called before registration
   */
  async initialize(): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Register all components with the plugin registry
   */
  register(): void {
    if (this.registered) {
      console.warn(`[${this.metadata.name}] Already registered`);
      return;
    }

    console.log(`[${this.metadata.name}] Registering plugin...`);

    // Register executors
    for (const executor of this.executors) {
      pluginRegistry.registerExecutor(executor, this.metadata);
    }

    // Register conditions
    for (const condition of this.conditions) {
      pluginRegistry.registerCondition(condition, this.metadata);
    }

    // Register transformers
    for (const transformer of this.transformers) {
      pluginRegistry.registerTransformer(transformer, this.metadata);
    }

    this.registered = true;
    console.log(
      `[${this.metadata.name}] Registered: ` +
      `${this.executors.length} executors, ` +
      `${this.conditions.length} conditions, ` +
      `${this.transformers.length} transformers`
    );
  }

  /**
   * Unregister all components
   */
  unregister(): void {
    if (!this.registered) {
      return;
    }

    pluginRegistry.unregisterPlugin(this.metadata.name);
    this.registered = false;
    console.log(`[${this.metadata.name}] Unregistered`);
  }

  /**
   * Check if plugin is registered
   */
  isRegistered(): boolean {
    return this.registered;
  }

  /**
   * Add an executor to the plugin
   */
  protected addExecutor(executor: INodeExecutor): void {
    this.executors.push(executor);
  }

  /**
   * Add a condition to the plugin
   */
  protected addCondition(condition: IConditionEvaluator): void {
    this.conditions.push(condition);
  }

  /**
   * Add a transformer to the plugin
   */
  protected addTransformer(transformer: IDataTransformer): void {
    this.transformers.push(transformer);
  }

  /**
   * Cleanup resources (override in subclass)
   */
  async cleanup(): Promise<void> {
    // Override in subclass if needed
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BASE EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export abstract class BaseExecutor implements INodeExecutor {
  abstract readonly type: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly domain: string;
  abstract readonly parameterSchema: Record<string, unknown>;

  /**
   * Main execute method - override in subclass
   */
  abstract execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult>;

  /**
   * Validate parameters
   */
  validateParameters(parameters: Record<string, unknown>): { valid: boolean; errors: string[] } {
    // Basic validation - can be overridden
    const errors: string[] = [];
    const schema = this.parameterSchema;

    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required as string[]) {
        if (!(field in parameters)) {
          errors.push(`Missing required parameter: ${field}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get default parameters
   */
  getDefaultParameters(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    const properties = this.parameterSchema.properties as Record<string, { default?: unknown }> | undefined;

    if (properties) {
      for (const [key, prop] of Object.entries(properties)) {
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        }
      }
    }

    return defaults;
  }

  /**
   * Optional cleanup
   */
  async cleanup(_context: ExecutionContext): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Helper: Create success result
   */
  protected success(
    output: unknown,
    metadata: Record<string, unknown> = {},
    qualityScore?: number
  ): NodeExecutionResult {
    return createSuccessResult(output, metadata, qualityScore);
  }

  /**
   * Helper: Create error result
   */
  protected error(code: string, message: string, recoverable = false): NodeExecutionResult {
    return createErrorResult(code, message, recoverable);
  }

  /**
   * Helper: Get parameter with default
   */
  protected getParam<T>(
    parameters: Record<string, unknown>,
    key: string,
    defaultValue: T
  ): T {
    return (parameters[key] as T) ?? defaultValue;
  }

  /**
   * Helper: Get required parameter
   */
  protected getRequiredParam<T>(
    parameters: Record<string, unknown>,
    key: string
  ): T {
    if (!(key in parameters)) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return parameters[key] as T;
  }

  /**
   * Helper: Validate that context.input is usable for AI/LLM processing.
   * Returns null if input is valid, or a NodeExecutionResult error if garbage.
   * Call this at the start of any AI executor's execute() method.
   */
  protected validateAIInput(context: ExecutionContext): NodeExecutionResult | null {
    const input = context.input;
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    const trimmed = (inputStr || '').trim();

    // Empty / null / undefined input
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === '{}' || trimmed === '[]') {
      return this.error(
        'EMPTY_INPUT',
        `${this.displayName} received empty/null input from upstream. Ensure previous nodes produce valid output.`,
        true
      );
    }

    // Upstream error object forwarded as input
    if (trimmed.startsWith('{"error"') || trimmed.startsWith('{"code":"EXECUTION_ERROR"') || trimmed.startsWith('{"code":"NODE_TIMEOUT"')) {
      return this.error(
        'UPSTREAM_ERROR',
        `${this.displayName} received an error from upstream: ${trimmed.substring(0, 200)}. Fix the upstream node first.`,
        false
      );
    }

    return null; // Input is valid
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a simple executor from a function
 */
export function createSimpleExecutor(config: {
  type: string;
  displayName: string;
  description: string;
  domain: string;
  parameterSchema?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  execute: (params: Record<string, unknown>, context: ExecutionContext) => Promise<NodeExecutionResult>;
}): INodeExecutor {
  return {
    type: config.type,
    displayName: config.displayName,
    description: config.description,
    domain: config.domain,
    parameterSchema: config.parameterSchema || {},

    execute: config.execute,

    validateParameters: (params) => ({
      valid: true,
      errors: [],
    }),

    getDefaultParameters: () => config.defaultParameters || {},
  };
}

/**
 * Create a simple condition from a function
 */
export function createSimpleCondition(config: {
  type: string;
  evaluate: (
    condition: { type: string; config: Record<string, unknown> },
    result: NodeExecutionResult,
    context: ExecutionContext
  ) => Promise<boolean>;
}): IConditionEvaluator {
  return {
    type: config.type,
    evaluate: config.evaluate,
  };
}

/**
 * Create a simple transformer from a function
 */
export function createSimpleTransformer(config: {
  type: string;
  transform: (
    input: unknown,
    config: Record<string, unknown>,
    context: ExecutionContext
  ) => Promise<unknown>;
}): IDataTransformer {
  return {
    type: config.type,
    transform: config.transform,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

export {
  INodeExecutor,
  IConditionEvaluator,
  IDataTransformer,
  ExecutionContext,
  NodeExecutionResult,
  PluginMetadata,
  createSuccessResult,
  createErrorResult,
};
