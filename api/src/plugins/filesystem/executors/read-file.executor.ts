/**
 * Read File Executor
 * Reads a file from the sandboxed Artefacts directory
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

class ReadFileExecutor extends BaseExecutor {
  readonly type = 'filesystem.read';
  readonly displayName = 'Read File';
  readonly description = 'Read a file from the Artefacts directory';
  readonly domain = 'filesystem';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to Artefacts/' },
      encoding: { type: 'string', default: 'utf-8', description: 'File encoding' },
    },
    required: ['path'],
  };

  async execute(
    parameters: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const filePath = this.getRequiredParam<string>(parameters, 'path');
    const encoding = this.getParam(parameters, 'encoding', 'utf-8') as BufferEncoding;

    const resolved = path.resolve(ARTEFACTS_ROOT, filePath);
    const relative = path.relative(ARTEFACTS_ROOT, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return this.error('SANDBOX_VIOLATION', `Path "${filePath}" escapes the Artefacts directory`, false);
    }

    try {
      const content = fs.readFileSync(resolved, { encoding });
      const stats = fs.statSync(resolved);

      return this.success(
        { content, size: stats.size, path: relative },
        { encoding, absolutePath: resolved }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.error('READ_ERROR', `Failed to read file: ${message}`, true);
    }
  }
}

export { ReadFileExecutor };
