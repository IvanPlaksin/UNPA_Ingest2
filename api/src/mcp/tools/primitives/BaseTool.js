class BaseTool {
  constructor() {
    if (new.target === BaseTool) {
      throw new Error('BaseTool is abstract');
    }
  }

  // Must be overridden
  getDefinition() {
    throw new Error('getDefinition() must be implemented');
  }

  // Must be overridden
  async execute(args, context, server) {
    throw new Error('execute() must be implemented');
  }

  // Helpers
  success(data, metrics = {}) {
    return { data, metrics };
  }

  error(code, message) {
    throw new Error(`[${code}] ${message}`);
  }

  validateArgs(args, required = []) {
    for (const field of required) {
      if (args[field] === undefined) {
        this.error('MISSING_ARGUMENT', `Required argument missing: ${field}`);
      }
    }
  }
}

// Shared input/output schemas for primitives
const CommonSchemas = {
  path: { type: 'string', description: 'Dot-notation path (e.g., "user.name")' },
  anyValue: { description: 'Any JSON value' },
  array: { type: 'array', items: {} },
  object: { type: 'object' },
  expression: { type: 'string', description: 'JSONPath or JMESPath expression' },
  predicate: { type: 'object', description: 'Filter predicate object' },
  comparator: { type: 'string', enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith', 'endsWith'] }
};

module.exports = { BaseTool, CommonSchemas };
