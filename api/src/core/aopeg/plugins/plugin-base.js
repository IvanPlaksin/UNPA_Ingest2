/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLUGIN BASE CLASS
 * Base class for creating domain plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { pluginRegistry } = require('../registry/plugin-registry');

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Create Success/Error Result
// ────────────────────────────────────────────────────────────────────────────

function createSuccessResult(output, metadata = {}, qualityScore) {
  return {
    success: true,
    output,
    metadata,
    qualityScore,
    errors: [],
  };
}

function createErrorResult(code, message, recoverable = false) {
  return {
    success: false,
    output: null,
    metadata: {},
    errors: [{ code, message, recoverable }],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN BASE
// ────────────────────────────────────────────────────────────────────────────

class PluginBase {
  constructor(metadata) {
    this.metadata = metadata;
    this.executors = [];
    this.conditions = [];
    this.transformers = [];
    this.registered = false;
  }

  /**
   * Get plugin metadata
   */
  getMetadata() {
    return this.metadata;
  }

  /**
   * Initialize the plugin (override in subclass)
   * Called before registration
   */
  async initialize() {
    // Override in subclass if needed
  }

  /**
   * Register all components with the plugin registry
   */
  register() {
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
  unregister() {
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
  isRegistered() {
    return this.registered;
  }

  /**
   * Add an executor to the plugin
   */
  addExecutor(executor) {
    this.executors.push(executor);
  }

  /**
   * Add a condition to the plugin
   */
  addCondition(condition) {
    this.conditions.push(condition);
  }

  /**
   * Add a transformer to the plugin
   */
  addTransformer(transformer) {
    this.transformers.push(transformer);
  }

  /**
   * Cleanup resources (override in subclass)
   */
  async cleanup() {
    // Override in subclass if needed
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BASE EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

class BaseExecutor {
  constructor() {
    this.type = '';
    this.displayName = '';
    this.description = '';
    this.domain = '';
    this.parameterSchema = {};
  }

  /**
   * Main execute method - override in subclass
   */
  async execute(parameters, context) {
    throw new Error('execute() must be implemented');
  }

  /**
   * Validate parameters
   */
  validateParameters(parameters) {
    const errors = [];
    const schema = this.parameterSchema;

    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
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
  getDefaultParameters() {
    const defaults = {};
    const properties = this.parameterSchema.properties;

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
  async cleanup(context) {
    // Override in subclass if needed
  }

  /**
   * Helper: Create success result
   */
  success(output, metadata = {}, qualityScore) {
    return createSuccessResult(output, metadata, qualityScore);
  }

  /**
   * Helper: Create error result
   */
  error(code, message, recoverable = false) {
    return createErrorResult(code, message, recoverable);
  }

  /**
   * Helper: Get parameter with default
   */
  getParam(parameters, key, defaultValue) {
    return parameters[key] ?? defaultValue;
  }

  /**
   * Helper: Get required parameter
   */
  getRequiredParam(parameters, key) {
    if (!(key in parameters)) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return parameters[key];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a simple executor from a function
 */
function createSimpleExecutor(config) {
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
function createSimpleCondition(config) {
  return {
    type: config.type,
    evaluate: config.evaluate,
  };
}

/**
 * Create a simple transformer from a function
 */
function createSimpleTransformer(config) {
  return {
    type: config.type,
    transform: config.transform,
  };
}

module.exports = {
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
  createSuccessResult,
  createErrorResult,
};
