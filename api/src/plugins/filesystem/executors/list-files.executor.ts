/**
 * List Files Executor
 * Lists files in the sandboxed Artefacts directory
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

class ListFilesExecutor extends BaseExecutor {
  readonly type = 'filesystem.list';
  readonly displayName = 'List Files';
  readonly description = 'List files in the Artefacts directory';
  readonly domain = 'filesystem';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', default: '.', description: 'Directory path relative to Artefacts/' },
      recursive: { type: 'boolean', default: false, description: 'List files recursively' },
      pattern: { type: 'string', description: 'Glob-like pattern to filter files (e.g. "*.txt")' },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const dirPath = this.getParam(parameters, 'path', '.');
    const recursive = this.getParam(parameters, 'recursive', false);
    const pattern = parameters.pattern as string | undefined;

    const resolved = path.resolve(ARTEFACTS_ROOT, dirPath);
    const relative = path.relative(ARTEFACTS_ROOT, resolved);

    if (relative.startsWith('..') || (relative !== '' && path.isAbsolute(relative))) {
      return this.error('SANDBOX_VIOLATION', `Path "${dirPath}" escapes the Artefacts directory`, false);
    }

    try {
      if (!fs.existsSync(resolved)) {
        return this.success({ files: [], count: 0 }, { path: relative, exists: false });
      }

      const files = this.listDir(resolved, ARTEFACTS_ROOT, recursive, pattern);

      return this.success(
        { files, count: files.length },
        { path: relative, recursive, pattern }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.error('LIST_ERROR', `Failed to list files: ${message}`, true);
    }
  }

  private listDir(
    dirPath: string,
    root: string,
    recursive: boolean,
    pattern?: string
  ): Array<{ name: string; path: string; size: number; isDirectory: boolean }> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: Array<{ name: string; path: string; size: number; isDirectory: boolean }> = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

      if (pattern && !this.matchPattern(entry.name, pattern)) {
        if (!entry.isDirectory() || !recursive) continue;
      }

      if (entry.isDirectory()) {
        if (!pattern || this.matchPattern(entry.name, pattern)) {
          results.push({ name: entry.name, path: relativePath, size: 0, isDirectory: true });
        }
        if (recursive) {
          results.push(...this.listDir(fullPath, root, true, pattern));
        }
      } else {
        if (!pattern || this.matchPattern(entry.name, pattern)) {
          const stats = fs.statSync(fullPath);
          results.push({ name: entry.name, path: relativePath, size: stats.size, isDirectory: false });
        }
      }
    }

    return results;
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob matching: *.ext, prefix*, *suffix*
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i').test(filename);
  }
}

export { ListFilesExecutor };
