/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILT-IN CONDITION EVALUATORS
 * Core provides these basic conditions; plugins can add more
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { pluginRegistry } = require('../registry/plugin-registry');

const CORE_PLUGIN = {
  name: 'aopeg-core',
  version: '1.0.0',
  domain: 'core',
  description: 'AOPEG Core built-in components',
};

// ────────────────────────────────────────────────────────────────────────────
// ALWAYS - Edge always taken
// ────────────────────────────────────────────────────────────────────────────

class AlwaysCondition {
  constructor() {
    this.type = 'always';
  }

  async evaluate() {
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SUCCESS - Edge taken only if previous node succeeded
// ────────────────────────────────────────────────────────────────────────────

class SuccessCondition {
  constructor() {
    this.type = 'success';
  }

  async evaluate(_condition, nodeResult) {
    return nodeResult.success;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FAILURE - Edge taken only if previous node failed
// ────────────────────────────────────────────────────────────────────────────

class FailureCondition {
  constructor() {
    this.type = 'failure';
  }

  async evaluate(_condition, nodeResult) {
    return !nodeResult.success;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// QUALITY - Edge taken based on quality score
// ────────────────────────────────────────────────────────────────────────────

class QualityCondition {
  constructor() {
    this.type = 'quality';
  }

  async evaluate(condition, nodeResult) {
    const config = condition.config;
    const score = nodeResult.qualityScore ?? 1;

    switch (config.operator) {
      case '<': return score < config.threshold;
      case '<=': return score <= config.threshold;
      case '=': return score === config.threshold;
      case '>=': return score >= config.threshold;
      case '>': return score > config.threshold;
      case '!=': return score !== config.threshold;
      default: return true;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// METRIC - Edge taken based on custom metric
// ────────────────────────────────────────────────────────────────────────────

class MetricCondition {
  constructor() {
    this.type = 'metric';
  }

  async evaluate(condition, nodeResult) {
    const config = condition.config;
    const metricValue = nodeResult.metrics?.customMetrics?.[config.metricName];
    if (metricValue === undefined) return false;

    switch (config.operator) {
      case '<': return metricValue < config.value;
      case '<=': return metricValue <= config.value;
      case '=': return metricValue === config.value;
      case '>=': return metricValue >= config.value;
      case '>': return metricValue > config.value;
      case '!=': return metricValue !== config.value;
      default: return true;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPRESSION - Edge taken based on JavaScript expression
// ────────────────────────────────────────────────────────────────────────────

class ExpressionCondition {
  constructor() {
    this.type = 'expression';
  }

  async evaluate(condition, nodeResult, context) {
    const config = condition.config;

    try {
      // Create safe evaluation context
      const evalContext = {
        result: nodeResult,
        output: nodeResult.output,
        success: nodeResult.success,
        quality: nodeResult.qualityScore ?? 1,
        metrics: nodeResult.metrics,
        context: {
          variables: context.variables,
          metadata: context.metadata,
        },
      };

      // Safe eval using Function constructor
      const fn = new Function(
        ...Object.keys(evalContext),
        `return ${config.expression}`
      );

      return Boolean(fn(...Object.values(evalContext)));
    } catch (error) {
      console.error(`[ExpressionCondition] Failed to evaluate: ${config.expression}`, error);
      return false;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OUTPUT_TYPE - Edge taken based on output type
// ────────────────────────────────────────────────────────────────────────────

class OutputTypeCondition {
  constructor() {
    this.type = 'output_type';
  }

  async evaluate(condition, nodeResult) {
    const config = condition.config;
    const output = nodeResult.output;

    switch (config.expectedType) {
      case 'string': return typeof output === 'string';
      case 'number': return typeof output === 'number';
      case 'boolean': return typeof output === 'boolean';
      case 'array': return Array.isArray(output);
      case 'object': return typeof output === 'object' && output !== null && !Array.isArray(output);
      case 'null': return output === null;
      case 'undefined': return output === undefined;
      default: return false;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OUTPUT_MATCH - Edge taken if output matches pattern
// ────────────────────────────────────────────────────────────────────────────

class OutputMatchCondition {
  constructor() {
    this.type = 'output_match';
  }

  async evaluate(condition, nodeResult) {
    const config = condition.config;
    let value = nodeResult.output;

    // Navigate path if provided
    if (config.path) {
      const parts = config.path.split('.');
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          return false;
        }
      }
    }

    const operator = config.operator || 'eq';

    // Check based on operator
    switch (operator) {
      case 'eq':
        return value === config.value;
      case 'ne':
        return value !== config.value;
      case 'contains':
        return String(value).includes(String(config.value));
      case 'startsWith':
        return String(value).startsWith(String(config.value));
      case 'endsWith':
        return String(value).endsWith(String(config.value));
      case 'regex':
        if (config.pattern) {
          const regex = new RegExp(config.pattern);
          return regex.test(String(value));
        }
        return false;
      default:
        return true;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ERROR_CODE - Edge taken if specific error code occurred
// ────────────────────────────────────────────────────────────────────────────

class ErrorCodeCondition {
  constructor() {
    this.type = 'error_code';
  }

  async evaluate(condition, nodeResult) {
    const config = condition.config;
    const errorCodes = nodeResult.errors.map(e => e.code);
    const mode = config.mode || 'any';

    switch (mode) {
      case 'any':
        return config.codes.some(code => errorCodes.includes(code));
      case 'all':
        return config.codes.every(code => errorCodes.includes(code));
      case 'none':
        return !config.codes.some(code => errorCodes.includes(code));
      default:
        return false;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// VARIABLE - Edge taken based on context variable
// ────────────────────────────────────────────────────────────────────────────

class VariableCondition {
  constructor() {
    this.type = 'variable';
  }

  async evaluate(condition, _nodeResult, context) {
    const config = condition.config;
    const variableValue = context.variables[config.variableName];

    switch (config.operator) {
      case 'exists':
        return variableValue !== undefined;
      case 'not_exists':
        return variableValue === undefined;
      case '<':
        return variableValue < config.value;
      case '<=':
        return variableValue <= config.value;
      case '=':
        return variableValue === config.value;
      case '>=':
        return variableValue >= config.value;
      case '>':
        return variableValue > config.value;
      case '!=':
        return variableValue !== config.value;
      default:
        return false;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// REGISTER ALL BUILT-IN CONDITIONS
// ────────────────────────────────────────────────────────────────────────────

function registerBuiltinConditions() {
  pluginRegistry.registerCondition(new AlwaysCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new SuccessCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new FailureCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new QualityCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new MetricCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new ExpressionCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new OutputTypeCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new OutputMatchCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new ErrorCodeCondition(), CORE_PLUGIN);
  pluginRegistry.registerCondition(new VariableCondition(), CORE_PLUGIN);
}

// Export all conditions for direct use
const builtinConditions = {
  AlwaysCondition,
  SuccessCondition,
  FailureCondition,
  QualityCondition,
  MetricCondition,
  ExpressionCondition,
  OutputTypeCondition,
  OutputMatchCondition,
  ErrorCodeCondition,
  VariableCondition,
};

module.exports = {
  registerBuiltinConditions,
  builtinConditions,
  AlwaysCondition,
  SuccessCondition,
  FailureCondition,
  QualityCondition,
  MetricCondition,
  ExpressionCondition,
  OutputTypeCondition,
  OutputMatchCondition,
  ErrorCodeCondition,
  VariableCondition,
};
