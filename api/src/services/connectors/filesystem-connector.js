/**
 * FileSystem Connector
 * Connector for local file system access
 *
 * Features:
 *   - Recursive directory listing
 *   - File fetch with optional parsing (via documentParser)
 *   - Search by name or content
 *   - Watch for changes (fs.watch)
 *
 * @module services/connectors/filesystem-connector
 */

const fs = require('fs').promises;
const path = require('path');
const { watch } = require('fs');
const { BaseConnector } = require('./base-connector');

class FileSystemConnector extends BaseConnector {
  constructor(options = {}) {
    super('filesystem', { type: 'filesystem', ...options });

    this.basePath = options.basePath || process.cwd();
    this.allowedExtensions = options.allowedExtensions || [
      '.txt', '.md', '.json', '.csv', '.xml', '.html', '.yaml', '.yml', '.log'
    ];
    this.excludePatterns = options.excludePatterns || [
      'node_modules', '.git', '.env', '__pycache__', '.DS_Store'
    ];
    this.maxDepth = options.maxDepth || 10;

    this.watchers = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async connect() {
    this._updateStats('connect');

    try {
      const stat = await fs.stat(this.basePath);
      if (!stat.isDirectory()) {
        throw new Error('Base path is not a directory');
      }

      this.connected = true;
      this._updateStats('connect_success');
      this.emit('connected');

      return { success: true, basePath: this.basePath };
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async disconnect() {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    this.connected = false;
    this.emit('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA ACCESS
  // ═══════════════════════════════════════════════════════════════════════

  async list(relativePath = '', options = {}) {
    const fullPath = path.join(this.basePath, relativePath);
    const depth = options.depth || 1;

    const items = await this._listRecursive(fullPath, depth, 0);

    return {
      path: relativePath,
      basePath: this.basePath,
      items,
      count: items.length
    };
  }

  async _listRecursive(dirPath, maxDepth, currentDepth) {
    if (currentDepth >= maxDepth) return [];

    const items = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (this._shouldExclude(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.basePath, fullPath);

        if (entry.isDirectory()) {
          const children = await this._listRecursive(fullPath, maxDepth, currentDepth + 1);
          items.push({
            name: entry.name,
            path: relativePath,
            type: 'directory',
            children: children.length,
            items: children
          });
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.allowedExtensions.includes(ext)) {
            const stat = await fs.stat(fullPath);
            items.push({
              name: entry.name,
              path: relativePath,
              type: 'file',
              extension: ext,
              size: stat.size,
              modified: stat.mtime.toISOString()
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[FileSystemConnector] Cannot list ${dirPath}:`, error.message);
    }

    return items;
  }

  async fetch(relativePath, options = {}) {
    const fullPath = path.resolve(this.basePath, relativePath);

    // Security check — prevent path traversal
    if (!fullPath.startsWith(path.resolve(this.basePath))) {
      throw new Error('Path traversal not allowed');
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      throw new Error('Path is not a file');
    }

    const ext = path.extname(relativePath).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new Error(`Extension ${ext} not allowed`);
    }

    this._updateStats('fetch');

    // Parse if requested and documentParser is available
    if (options.parse !== false) {
      try {
        const { documentParser } = require('../ingestion');
        const parsed = await documentParser.parseFile(fullPath);
        return {
          path: relativePath,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          ...parsed
        };
      } catch (err) {
        // Fall through to raw content if parse fails
      }
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return {
      path: relativePath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      content
    };
  }

  async search(query, options = {}) {
    const searchPath = options.path || '';
    const searchContent = options.searchContent || false;
    const maxResults = options.maxResults || 100;

    const results = [];
    const listing = await this.list(searchPath, { depth: this.maxDepth });

    const searchFile = async (item) => {
      if (results.length >= maxResults) return;

      if (item.type === 'file') {
        const nameMatch = item.name.toLowerCase().includes(query.toLowerCase());

        if (nameMatch) {
          results.push({ ...item, matchType: 'name' });
        } else if (searchContent) {
          try {
            const content = await this.fetch(item.path, { parse: false });
            if (content.content.toLowerCase().includes(query.toLowerCase())) {
              results.push({ ...item, matchType: 'content' });
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      } else if (item.type === 'directory' && item.items) {
        for (const child of item.items) {
          await searchFile(child);
        }
      }
    };

    for (const item of listing.items) {
      await searchFile(item);
    }

    return {
      query,
      results,
      count: results.length,
      truncated: results.length >= maxResults
    };
  }

  async watch(relativePath, callback) {
    const fullPath = path.join(this.basePath, relativePath);

    if (this.watchers.has(fullPath)) {
      throw new Error('Already watching this path');
    }

    const watcher = watch(fullPath, { recursive: true }, (eventType, filename) => {
      if (filename && !this._shouldExclude(filename)) {
        callback({
          type: eventType,
          path: path.join(relativePath, filename),
          timestamp: new Date().toISOString()
        });
      }
    });

    this.watchers.set(fullPath, watcher);

    return {
      watching: true,
      path: relativePath,
      stop: () => {
        watcher.close();
        this.watchers.delete(fullPath);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _shouldExclude(name) {
    return this.excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern || name.startsWith(pattern);
    });
  }
}

const filesystemConnector = new FileSystemConnector();

module.exports = {
  FileSystemConnector,
  filesystemConnector
};
