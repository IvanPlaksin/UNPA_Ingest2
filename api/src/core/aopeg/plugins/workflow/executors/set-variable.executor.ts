/**
 * Set Variable Executor — sets a variable in execution context
 *
 * Stores values in the global variables map for downstream nodes to consume.
 * Supports template expressions for dynamic value resolution.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

export class SetVariableExecutor extends BaseExecutor {
  readonly type = 'workflow.set_variable';
  readonly displayName = 'Set Variable';
  readonly description = 'Sets a variable in execution context for downstream nodes';
  readonly domain = 'workflow';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Variable name' },
      value: { type: 'any', description: 'Value to set (can be template expression)' },
      scope: {
        type: 'string',
        enum: ['node', 'graph', 'execution'],
        default: 'graph',
        description: 'Variable scope',
      },
    },
    required: ['name', 'value'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const name = this.getRequiredParam<string>(parameters, 'name');
    let value = this.getRequiredParam<unknown>(parameters, 'value');
    const scope = this.getParam<string>(parameters, 'scope', 'graph');

    // Resolve template expressions in value
    if (typeof value === 'string') {
      value = this.resolveTemplate(value, context);
    }

    // Store in global variables
    const globalVars = (context as any).globalVariables;
    if (globalVars instanceof Map) {
      globalVars.set(name, value);
    } else if (globalVars && typeof globalVars === 'object') {
      (globalVars as any)[name] = value;
    }

    return this.success(
      {
        name,
        value,
        scope,
        set_at: new Date().toISOString(),
      },
      { scope },
      1.0,
    );
  }

  private resolveTemplate(template: string, context: ExecutionContext): string {
    const globalVars = (context as any).globalVariables;
    const variables: Record<string, any> = globalVars instanceof Map
      ? Object.fromEntries(globalVars)
      : (globalVars || {});

    // Also include upstream port data
    const input = (context as any).portData || {};
    const merged = { ...variables, input };

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let val: any = merged;
      for (const key of keys) {
        val = val?.[key];
      }
      return val != null ? String(val) : match;
    });
  }
}
