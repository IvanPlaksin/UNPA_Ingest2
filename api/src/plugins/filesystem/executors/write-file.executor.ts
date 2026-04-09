/**
 * Write File Executor
 * Writes content to a file in the sandboxed Artefacts directory
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../core/aopeg/plugins/plugin-base';

// Resolve Artefacts dir relative to this file (api/src/plugins/filesystem/executors/ → api/Artefacts/)
// This works regardless of process.cwd()
const ARTEFACTS_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'Artefacts');

class WriteFileExecutor extends BaseExecutor {
  readonly type = 'filesystem.write';
  readonly displayName = 'Write File';
  readonly description = 'Write content to a file in the Artefacts directory';
  readonly domain = 'filesystem';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to Artefacts/' },
      content: { type: 'string', description: 'Content to write (if not using contentFromInput)' },
      contentFromInput: { type: 'boolean', default: false, description: 'Use upstream input as content' },
      append: { type: 'boolean', default: false, description: 'Append instead of overwrite' },
    },
    required: ['path'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const filePath = this.getRequiredParam<string>(parameters, 'path');
    const contentFromInput = this.getParam(parameters, 'contentFromInput', false);
    const append = this.getParam(parameters, 'append', false);

    const resolved = path.resolve(ARTEFACTS_ROOT, filePath);
    const relative = path.relative(ARTEFACTS_ROOT, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return this.error('SANDBOX_VIOLATION', `Path "${filePath}" escapes the Artefacts directory`, false);
    }

    let content: string;
    if (contentFromInput) {
      content = typeof context.input === 'string'
        ? context.input
        : JSON.stringify(context.input, null, 2);
    } else {
      content = this.getParam(parameters, 'content', '');
    }

    try {
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(resolved), { recursive: true });

      if (append) {
        fs.appendFileSync(resolved, content, 'utf-8');
      } else {
        fs.writeFileSync(resolved, content, 'utf-8');
      }

      const bytesWritten = Buffer.byteLength(content, 'utf-8');

      return this.success(
        { bytesWritten, path: relative },
        { append, absolutePath: resolved }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.error('WRITE_ERROR', `Failed to write file: ${message}`, true);
    }
  }
}

export { WriteFileExecutor };
