/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMON PLUGIN
 * General-purpose executors usable across all domains
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PluginBase,
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
  PluginMetadata,
} from '../../core/aopeg/plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const COMMON_PLUGIN_METADATA: PluginMetadata = {
  name: 'aopeg-common',
  version: '1.0.0',
  domain: 'common',
  description: 'General-purpose executors for common operations',
};

// ────────────────────────────────────────────────────────────────────────────
// EXECUTORS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Log executor - logs messages to console
 */
class LogExecutor extends BaseExecutor {
  readonly type = 'common.log';
  readonly displayName = 'Log';
  readonly description = 'Log a message to console';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
      message: { type: 'string' },
      includeInput: { type: 'boolean', default: false },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const level = this.getParam(parameters, 'level', 'info');
    const message = this.getParam(parameters, 'message', '');
    const includeInput = this.getParam(parameters, 'includeInput', false);

    const logMessage = includeInput
      ? `${message} | Input: ${JSON.stringify(context.input)}`
      : message;

    switch (level) {
      case 'debug': console.debug(`[AOPEG] ${logMessage}`); break;
      case 'info': console.info(`[AOPEG] ${logMessage}`); break;
      case 'warn': console.warn(`[AOPEG] ${logMessage}`); break;
      case 'error': console.error(`[AOPEG] ${logMessage}`); break;
    }

    return this.success(context.input, { logged: true, level, message: logMessage });
  }
}

/**
 * Delay executor - adds artificial delay
 */
class DelayExecutor extends BaseExecutor {
  readonly type = 'common.delay';
  readonly displayName = 'Delay';
  readonly description = 'Wait for specified duration';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      duration: { type: 'number', description: 'Duration in milliseconds', default: 1000 },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const duration = this.getParam(parameters, 'duration', 1000);

    await new Promise(resolve => setTimeout(resolve, duration));

    return this.success(context.input, { delayed: duration });
  }
}

/**
 * Pass-through executor - just passes input to output
 */
class PassThroughExecutor extends BaseExecutor {
  readonly type = 'common.passthrough';
  readonly displayName = 'Pass Through';
  readonly description = 'Pass input directly to output without modification';
  readonly domain = 'common';
  readonly parameterSchema = { type: 'object', properties: {} };

  async execute(
    _parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    return this.success(context.input);
  }
}

/**
 * Set variable executor - stores value in shared state
 */
class SetVariableExecutor extends BaseExecutor {
  readonly type = 'common.set_variable';
  readonly displayName = 'Set Variable';
  readonly description = 'Store a value in shared state';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      key: { type: 'string' },
      value: { type: 'any' },
      fromInput: { type: 'boolean', default: true },
    },
    required: ['key'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const key = this.getRequiredParam<string>(parameters, 'key');
    const fromInput = this.getParam(parameters, 'fromInput', true);
    const value = fromInput ? context.input : parameters.value;

    context.sharedState.set(key, value);

    return this.success(context.input, { variableSet: key });
  }
}

/**
 * Get variable executor - retrieves value from shared state
 */
class GetVariableExecutor extends BaseExecutor {
  readonly type = 'common.get_variable';
  readonly displayName = 'Get Variable';
  readonly description = 'Retrieve a value from shared state';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      key: { type: 'string' },
      defaultValue: { type: 'any' },
    },
    required: ['key'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const key = this.getRequiredParam<string>(parameters, 'key');
    const defaultValue = parameters.defaultValue;

    const value = context.sharedState.get(key) ?? defaultValue;

    return this.success(value, { variableKey: key });
  }
}

/**
 * Validate executor - validates input against rules
 */
class ValidateExecutor extends BaseExecutor {
  readonly type = 'common.validate';
  readonly displayName = 'Validate';
  readonly description = 'Validate input data against rules';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        items: { type: 'string' },
        description: 'Validation rules to apply',
      },
      schema: { type: 'object', description: 'JSON Schema for validation' },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const rules = this.getParam<string[]>(parameters, 'rules', []);
    const input = context.input;

    const errors: string[] = [];
    let score = 1.0;

    // Apply rules
    for (const rule of rules) {
      switch (rule) {
        case 'not_null':
          if (input === null || input === undefined) {
            errors.push('Input is null or undefined');
            score -= 0.2;
          }
          break;
        case 'not_empty':
          if (typeof input === 'string' && input.trim() === '') {
            errors.push('Input string is empty');
            score -= 0.2;
          }
          if (Array.isArray(input) && input.length === 0) {
            errors.push('Input array is empty');
            score -= 0.2;
          }
          break;
        case 'is_object':
          if (typeof input !== 'object' || input === null) {
            errors.push('Input is not an object');
            score -= 0.3;
          }
          break;
        case 'is_array':
          if (!Array.isArray(input)) {
            errors.push('Input is not an array');
            score -= 0.3;
          }
          break;
        case 'is_string':
          if (typeof input !== 'string') {
            errors.push('Input is not a string');
            score -= 0.3;
          }
          break;
      }
    }

    score = Math.max(0, score);

    if (errors.length > 0) {
      return {
        success: score >= 0.5,
        output: { valid: false, errors, input },
        metadata: { rulesChecked: rules.length },
        qualityScore: score,
        errors: errors.map(e => ({ code: 'VALIDATION_ERROR', message: e, recoverable: true })),
      };
    }

    return this.success({ valid: true, input }, { rulesChecked: rules.length }, score);
  }
}

/**
 * Aggregate executor - aggregates array data
 */
class AggregateExecutor extends BaseExecutor {
  readonly type = 'common.aggregate';
  readonly displayName = 'Aggregate';
  readonly description = 'Aggregate array data with various operations';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['merge', 'concat', 'sum', 'count', 'unique', 'first', 'last'],
        default: 'merge',
      },
      deduplicateBy: { type: 'string', description: 'Field to deduplicate by' },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const operation = this.getParam(parameters, 'operation', 'merge');
    const deduplicateBy = parameters.deduplicateBy as string | undefined;
    const input = context.input;

    if (!Array.isArray(input)) {
      return this.success(input, { operation, notArray: true });
    }

    let result: unknown;

    switch (operation) {
      case 'merge':
        result = input.reduce((acc, item) => {
          if (typeof item === 'object' && item !== null) {
            return { ...acc, ...item };
          }
          return acc;
        }, {});
        break;
      case 'concat':
        result = input.flat();
        break;
      case 'sum':
        result = input.reduce((sum, item) => sum + (typeof item === 'number' ? item : 0), 0);
        break;
      case 'count':
        result = input.length;
        break;
      case 'unique':
        if (deduplicateBy) {
          const seen = new Set();
          result = input.filter(item => {
            const key = (item as Record<string, unknown>)?.[deduplicateBy];
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } else {
          result = [...new Set(input)];
        }
        break;
      case 'first':
        result = input[0];
        break;
      case 'last':
        result = input[input.length - 1];
        break;
      default:
        result = input;
    }

    return this.success(result, { operation, inputLength: input.length });
  }
}

/**
 * HTTP Request executor - makes HTTP requests
 */
class HttpRequestExecutor extends BaseExecutor {
  readonly type = 'common.http_request';
  readonly displayName = 'HTTP Request';
  readonly description = 'Make an HTTP request';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      url: { type: 'string' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
      headers: { type: 'object' },
      body: { type: 'any' },
      bodyFromInput: { type: 'boolean', default: false },
      timeout: { type: 'number', default: 30000 },
    },
    required: ['url'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const url = this.getRequiredParam<string>(parameters, 'url');
    const method = this.getParam(parameters, 'method', 'GET');
    const headers = this.getParam<Record<string, string>>(parameters, 'headers', {});
    const bodyFromInput = this.getParam(parameters, 'bodyFromInput', false);
    const timeout = this.getParam(parameters, 'timeout', 30000);

    let body = bodyFromInput ? context.input : parameters.body;
    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? (body as string) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return this.error(
          'HTTP_ERROR',
          `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500
        );
      }

      return this.success(data, {
        status: response.status,
        statusText: response.statusText,
        url,
        method,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error('HTTP_REQUEST_FAILED', message, true);
    }
  }
}

/**
 * Notify executor - sends notifications (placeholder)
 */
class NotifyExecutor extends BaseExecutor {
  readonly type = 'common.notify';
  readonly displayName = 'Notify';
  readonly description = 'Send a notification';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Notification channel' },
      message: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
    },
    required: ['channel'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const channel = this.getRequiredParam<string>(parameters, 'channel');
    const message = this.getParam(parameters, 'message', '');
    const priority = this.getParam(parameters, 'priority', 'medium');

    // Placeholder - in real implementation, would send to notification service
    console.log(`[Notify] Channel: ${channel}, Priority: ${priority}, Message: ${message}`);

    return this.success(context.input, {
      notified: true,
      channel,
      priority,
    });
  }
}

/**
 * Conditional executor - executes based on condition
 */
class ConditionalExecutor extends BaseExecutor {
  readonly type = 'common.conditional';
  readonly displayName = 'Conditional';
  readonly description = 'Return different output based on condition';
  readonly domain = 'common';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      condition: { type: 'string', description: 'JavaScript expression' },
      trueValue: { type: 'any' },
      falseValue: { type: 'any' },
    },
    required: ['condition'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const condition = this.getRequiredParam<string>(parameters, 'condition');

    try {
      const fn = new Function('input', 'context', `return ${condition}`);
      const result = fn(context.input, {
        variables: context.variables,
        metadata: context.metadata,
      });

      const output = result ? parameters.trueValue : parameters.falseValue;

      return this.success(output ?? context.input, { conditionResult: result });
    } catch (error) {
      return this.error(
        'CONDITION_ERROR',
        `Failed to evaluate condition: ${error instanceof Error ? error.message : String(error)}`,
        false
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

export class CommonPlugin extends PluginBase {
  constructor() {
    super(COMMON_PLUGIN_METADATA);

    // Register executors
    this.addExecutor(new LogExecutor());
    this.addExecutor(new DelayExecutor());
    this.addExecutor(new PassThroughExecutor());
    this.addExecutor(new SetVariableExecutor());
    this.addExecutor(new GetVariableExecutor());
    this.addExecutor(new ValidateExecutor());
    this.addExecutor(new AggregateExecutor());
    this.addExecutor(new HttpRequestExecutor());
    this.addExecutor(new NotifyExecutor());
    this.addExecutor(new ConditionalExecutor());
  }
}

// Singleton instance
export const commonPlugin = new CommonPlugin();
