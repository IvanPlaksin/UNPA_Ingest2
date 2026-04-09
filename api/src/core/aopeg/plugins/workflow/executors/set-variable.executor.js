/**
 * Set Variable Executor — sets a variable in execution context
 */

const { BaseExecutor } = require('../../plugin-base');

class SetVariableExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.set_variable';
    this.displayName = 'Set Variable';
    this.description = 'Sets a variable in execution context for downstream nodes';
    this.domain = 'workflow';

    this.parameterSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable name' },
        value: { type: 'any', description: 'Value to set (can be template expression)' },
        scope: { type: 'string', enum: ['node', 'graph', 'execution'], default: 'graph' },
      },
      required: ['name', 'value'],
    };
  }

  async execute(parameters, context) {
    const name = this.getRequiredParam(parameters, 'name');
    let value = this.getRequiredParam(parameters, 'value');
    const scope = this.getParam(parameters, 'scope', 'graph');

    // Template resolution is now handled by NodeRunner (Phase 2.5),
    // but keep legacy fallback for direct executor calls
    if (typeof value === 'string' && value.includes('{{') && !context.executionContext) {
      value = this._resolveTemplate(value, context);
    }

    // Store in ExecutionContext (preferred) and legacy globalVariables
    if (context.executionContext) {
      context.executionContext.setVariable(name, value);
    }
    const globalVars = context.globalVariables;
    if (globalVars instanceof Map) {
      globalVars.set(name, value);
    } else if (globalVars && typeof globalVars === 'object') {
      globalVars[name] = value;
    }

    return this.success(
      { name, value, scope, set_at: new Date().toISOString() },
      { scope },
      1.0,
    );
  }

  _resolveTemplate(template, context) {
    const globalVars = context.globalVariables;
    const variables = globalVars instanceof Map
      ? Object.fromEntries(globalVars)
      : (globalVars || {});
    const input = context.portData || {};
    const merged = { ...variables, input };

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let val = merged;
      for (const key of keys) {
        val = val?.[key];
      }
      return val != null ? String(val) : match;
    });
  }
}

module.exports = { SetVariableExecutor };
