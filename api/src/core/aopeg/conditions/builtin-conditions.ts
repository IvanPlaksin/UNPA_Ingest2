/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILT-IN CONDITION EVALUATORS
 * Core provides these basic conditions; plugins can add more
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  IConditionEvaluator,
  EdgeCondition,
  NodeExecutionResult,
  ExecutionContext,
} from '../types/core.types';
import { pluginRegistry, PluginMetadata } from '../registry/plugin-registry';

const CORE_PLUGIN: PluginMetadata = {
  name: 'aopeg-core',
  version: '1.0.0',
  domain: 'core',
  description: 'AOPEG Core built-in components',
};

// ────────────────────────────────────────────────────────────────────────────
// ALWAYS - Edge always taken
// ────────────────────────────────────────────────────────────────────────────

export class AlwaysCondition implements IConditionEvaluator {
  readonly type = 'always';

  async evaluate(): Promise<boolean> {
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SUCCESS - Edge taken only if previous node succeeded
// ────────────────────────────────────────────────────────────────────────────

export class SuccessCondition implements IConditionEvaluator {
  readonly type = 'success';

  async evaluate(
    _condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    return nodeResult.success;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FAILURE - Edge taken only if previous node failed
// ────────────────────────────────────────────────────────────────────────────

export class FailureCondition implements IConditionEvaluator {
  readonly type = 'failure';

  async evaluate(
    _condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    return !nodeResult.success;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// QUALITY - Edge taken based on quality score
// ────────────────────────────────────────────────────────────────────────────

export class QualityCondition implements IConditionEvaluator {
  readonly type = 'quality';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    const config = condition.config as {
      operator: '<' | '<=' | '=' | '>=' | '>' | '!=';
      threshold: number;
    };

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

export class MetricCondition implements IConditionEvaluator {
  readonly type = 'metric';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    const config = condition.config as {
      metricName: string;
      operator: '<' | '<=' | '=' | '>=' | '>' | '!=';
      value: number;
    };

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

export class ExpressionCondition implements IConditionEvaluator {
  readonly type = 'expression';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult,
    context: ExecutionContext
  ): Promise<boolean> {
    const config = condition.config as { expression: string };

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

export class OutputTypeCondition implements IConditionEvaluator {
  readonly type = 'output_type';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    const config = condition.config as {
      expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'undefined';
    };

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

export class OutputMatchCondition implements IConditionEvaluator {
  readonly type = 'output_match';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    const config = condition.config as {
      path?: string;
      pattern?: string;
      value?: unknown;
      operator?: 'eq' | 'ne' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
    };

    let value: unknown = nodeResult.output;

    // Navigate path if provided
    if (config.path) {
      const parts = config.path.split('.');
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part];
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

export class ErrorCodeCondition implements IConditionEvaluator {
  readonly type = 'error_code';

  async evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult
  ): Promise<boolean> {
    const config = condition.config as {
      codes: string[];
      mode: 'any' | 'all' | 'none';
    };

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

export class VariableCondition implements IConditionEvaluator {
  readonly type = 'variable';

  async evaluate(
    condition: EdgeCondition,
    _nodeResult: NodeExecutionResult,
    context: ExecutionContext
  ): Promise<boolean> {
    const config = condition.config as {
      variableName: string;
      operator: '<' | '<=' | '=' | '>=' | '>' | '!=' | 'exists' | 'not_exists';
      value?: unknown;
    };

    const variableValue = context.variables[config.variableName];

    switch (config.operator) {
      case 'exists':
        return variableValue !== undefined;
      case 'not_exists':
        return variableValue === undefined;
      case '<':
        return (variableValue as number) < (config.value as number);
      case '<=':
        return (variableValue as number) <= (config.value as number);
      case '=':
        return variableValue === config.value;
      case '>=':
        return (variableValue as number) >= (config.value as number);
      case '>':
        return (variableValue as number) > (config.value as number);
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

export function registerBuiltinConditions(): void {
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
export const builtinConditions = {
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
