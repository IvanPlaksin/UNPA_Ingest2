/**
 * Condition Executor — evaluates a JavaScript expression to determine branch
 */

const { BaseExecutor } = require('../../plugin-base');
const vm = require('vm');

class ConditionExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.condition';
    this.displayName = 'Condition';
    this.description = 'Evaluates a JavaScript expression and returns a branch name based on the result';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript expression to evaluate' },
        context_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of context key names to include in the evaluation sandbox',
        },
      },
      required: ['expression'],
    };
  }

  async execute(parameters, context) {
    const expression = this.getRequiredParam(parameters, 'expression');
    const contextKeys = this.getParam(parameters, 'context_keys', []);

    try {
      // Build sandbox: prefer ExecutionContext (has all node outputs) over globalVariables
      let sandbox;
      if (context.executionContext) {
        // Full expression context: { input, G0_N01: output, G0_N02: output, ...variables }
        sandbox = { ...context.executionContext.getExpressionContext(), ...parameters };
      } else {
        // Legacy fallback: globalVariables + parameters
        const globalVars = context.globalVariables;
        const variables = globalVars instanceof Map
          ? Object.fromEntries(globalVars)
          : (globalVars || {});
        sandbox = { ...variables, ...parameters };
      }

      // If specific context keys are requested, pull them from context
      if (contextKeys.length > 0) {
        for (const key of contextKeys) {
          if (context[key] !== undefined) {
            sandbox[key] = context[key];
          }
        }
      }

      const result = vm.runInNewContext(expression, sandbox, {
        timeout: 1000,
        displayErrors: false,
      });

      // Determine branch name from result
      let branch;
      if (typeof result === 'boolean') {
        branch = result ? 'true' : 'false';
      } else if (typeof result === 'string') {
        branch = result;
      } else {
        branch = result ? 'true' : 'false';
      }

      return this.success(
        { branch, expression_result: result, evaluated: true },
        { expression },
        1.0,
      );
    } catch (error) {
      return this.success(
        { branch: 'false', expression_result: null, evaluated: false },
        { expression, error: error.message },
        0.5,
      );
    }
  }
}

module.exports = { ConditionExecutor };
