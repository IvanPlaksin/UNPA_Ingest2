/**
 * Script Execute Executor
 * Runs user-provided JavaScript code in a sandboxed VM context.
 * The user sets a `result` variable to produce output.
 */

import * as vm from 'vm';
import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../core/aopeg/plugins/plugin-base';

class ScriptExecuteExecutor extends BaseExecutor {
  readonly type = 'script.execute';
  readonly displayName = 'Execute Script';
  readonly description = 'Run sandboxed JavaScript code with access to upstream data';
  readonly domain = 'script';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute. Set `result` to produce output.' },
      timeout: { type: 'number', default: 5000, description: 'Execution timeout in ms' },
    },
    required: ['code'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const code = this.getRequiredParam<string>(parameters, 'code');
    const timeout = this.getParam(parameters, 'timeout', 5000);
    const logs: string[] = [];
    const startTime = Date.now();

    // Build sandboxed context
    const sandbox: Record<string, unknown> = {
      input: context.input,
      result: undefined,
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(String).join(' ')}`),
        error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(String).join(' ')}`),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
    };

    try {
      const ctx = vm.createContext(sandbox);
      vm.runInContext(code, ctx, { timeout, filename: 'script.js' });

      const executionTime = Date.now() - startTime;

      return this.success(
        { result: sandbox.result, logs, executionTime },
        { timeout, codeLength: code.length }
      );
    } catch (err) {
      const executionTime = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return this.error(
        'SCRIPT_ERROR',
        `Script execution failed: ${message}`,
        false
      );
    }
  }
}

export { ScriptExecuteExecutor };
