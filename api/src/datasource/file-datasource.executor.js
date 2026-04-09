/**
 * =============================================================================
 * FILE DATASOURCE EXECUTOR
 *
 * Executor for loading data from local files:
 *   - JSON (.json)
 *   - CSV  (.csv / .tsv)
 *
 * Features:
 *   - In-memory cache with mtime-based invalidation
 *   - Built-in CSV parser (quoted fields, custom delimiter)
 *   - Filter operators ($eq, $ne, $gt, $gte, $lt, $lte, $in, $contains, $regex)
 *   - Sorting (field ASC/DESC)
 *   - Optional fs.watch for auto-reload
 * =============================================================================
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { BaseDataSourceExecutor } = require('./base-datasource.executor');

class FileDataSourceExecutor extends BaseDataSourceExecutor {
  constructor(options = {}) {
    super(options);
    this.fileCache = new Map();
    this.watchers = new Map();
    this.basePath = options.basePath || process.cwd();
    this.csvParser = options.csvParser || null;
  }

  setBasePath(basePath) { this.basePath = basePath; return this; }
  setCsvParser(parser) { this.csvParser = parser; return this; }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  async loadAll(config, params = {}) {
    this.validateConfig(config);

    return this.withCache(config, 'loadAll', params, async () => {
      const data = await this._loadFile(config);
      const { limit, offset } = this.applyLimits(params, config);

      let filtered = this._applyFilters(data, params.filters);

      if (params.orderBy) {
        filtered = this._applySorting(filtered, params.orderBy);
      }

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);
      const items = this.transformOutput(paginated, config);

      return { items, total };
    });
  }

  async search(config, params = {}) {
    this.validateConfig(config);

    const { query: searchText, limit = 10 } = params;
    if (!searchText || searchText.length < 1) return { items: [], total: 0 };

    const data = await this._loadFile(config);
    const searchFields = this._getSearchFields(config);
    const searchLower = searchText.toLowerCase();

    const matched = data.filter(row =>
      searchFields.some(field => {
        const value = this._getNestedValue(row, field);
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      }),
    );

    const limited = matched.slice(0, Math.min(limit, config.config?.maxLimit || 100));
    const items = this.transformOutput(limited, config);

    return { items, total: matched.length };
  }

  async getById(config, params = {}) {
    this.validateConfig(config);

    const { id } = params;
    if (id === undefined || id === null) throw new Error('id is required for getById');

    const data = await this._loadFile(config);
    const valueField = config.config?.valueField || 'id';

    const item = data.find(row => {
      const value = this._getNestedValue(row, valueField);
      return String(value) === String(id);
    });

    if (!item) return null;
    const transformed = this.transformOutput([item], config);
    return transformed[0];
  }

  async count(config, params = {}) {
    this.validateConfig(config);
    const data = await this._loadFile(config);
    const filtered = this._applyFilters(data, params.filters);
    return filtered.length;
  }

  async validate(config, params = {}) {
    this.validateConfig(config);

    const { value, field } = params;
    if (value === undefined) throw new Error('value is required for validate');

    const data = await this._loadFile(config);
    const checkField = field || config.config?.valueField || 'id';

    return data.some(row => {
      const rowValue = this._getNestedValue(row, checkField);
      return String(rowValue) === String(value);
    });
  }

  // ---------------------------------------------------------------------------
  // File Loading + Caching
  // ---------------------------------------------------------------------------

  async _loadFile(config) {
    const fileConfig = config.fileConfig || {};
    const filePath = this._resolveFilePath(fileConfig.filePath);
    const cacheKey = filePath;

    // Check in-memory cache
    const cached = this.fileCache.get(cacheKey);
    if (cached) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs <= cached.mtimeMs) return cached.data;
      } catch { /* file gone — reload */ }
    }

    // Read file
    const content = await fs.readFile(filePath, fileConfig.encoding || 'utf-8');

    // Parse
    const format = fileConfig.format || this._detectFormat(filePath);
    let data;

    switch (format) {
      case 'json':
        data = this._parseJson(content);
        break;
      case 'csv':
        data = this._parseCsv(content, fileConfig);
        break;
      default:
        throw new Error(`Unsupported file format: ${format}`);
    }

    // Ensure array
    if (!Array.isArray(data)) {
      if (data && Array.isArray(data.data)) {
        data = data.data;
      } else if (data && typeof data === 'object') {
        const arrayProp = Object.values(data).find(v => Array.isArray(v));
        data = arrayProp || [data];
      } else {
        throw new Error('File does not contain valid array data');
      }
    }

    // Update cache
    const stats = await fs.stat(filePath);
    this.fileCache.set(cacheKey, { data, mtimeMs: stats.mtimeMs, loadedAt: Date.now() });

    // Watch
    if (fileConfig.watchFile && !this.watchers.has(cacheKey)) {
      this._setupWatcher(filePath, cacheKey);
    }

    return data;
  }

  _resolveFilePath(filePath) {
    if (!filePath) throw new Error('filePath is required');
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.basePath, filePath);
  }

  _detectFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.csv' || ext === '.tsv') return 'csv';
    return 'json';
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  _parseJson(content) {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error.message}`);
    }
  }

  _parseCsv(content, fileConfig) {
    const { delimiter = ',', hasHeader = true } = fileConfig;

    if (this.csvParser) {
      return this.csvParser(content, { delimiter, header: hasHeader });
    }

    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    const parseRow = (line) => {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    if (hasHeader) {
      const headers = parseRow(lines[0]);
      return lines.slice(1).map(line => {
        const values = parseRow(line);
        const obj = {};
        headers.forEach((header, i) => { obj[header] = values[i] || ''; });
        return obj;
      });
    }

    return lines.map(line => {
      const values = parseRow(line);
      const obj = {};
      values.forEach((value, i) => { obj[`col${i}`] = value; });
      return obj;
    });
  }

  // ---------------------------------------------------------------------------
  // Filtering & Sorting
  // ---------------------------------------------------------------------------

  _applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return data;

    return data.filter(row =>
      Object.entries(filters).every(([field, filterValue]) => {
        const rowValue = this._getNestedValue(row, field);

        if (filterValue === null || filterValue === undefined) {
          return rowValue === null || rowValue === undefined;
        }
        if (Array.isArray(filterValue)) return filterValue.includes(rowValue);
        if (typeof filterValue === 'object') return this._applyOperatorFilter(rowValue, filterValue);
        return String(rowValue) === String(filterValue);
      }),
    );
  }

  _applyOperatorFilter(value, filter) {
    if (filter.$eq !== undefined) return value === filter.$eq;
    if (filter.$ne !== undefined) return value !== filter.$ne;
    if (filter.$gt !== undefined) return value > filter.$gt;
    if (filter.$gte !== undefined) return value >= filter.$gte;
    if (filter.$lt !== undefined) return value < filter.$lt;
    if (filter.$lte !== undefined) return value <= filter.$lte;
    if (filter.$in !== undefined) return filter.$in.includes(value);
    if (filter.$nin !== undefined) return !filter.$nin.includes(value);
    if (filter.$contains !== undefined) {
      return String(value).toLowerCase().includes(String(filter.$contains).toLowerCase());
    }
    if (filter.$regex !== undefined) {
      return new RegExp(filter.$regex, filter.$options || 'i').test(String(value));
    }
    return true;
  }

  _applySorting(data, orderBy) {
    if (!orderBy) return data;

    const [field, direction = 'ASC'] = orderBy.split(' ');
    const dir = direction.toUpperCase() === 'DESC' ? -1 : 1;

    return [...data].sort((a, b) => {
      const aVal = this._getNestedValue(a, field);
      const bVal = this._getNestedValue(b, field);
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }

  _getSearchFields(config) {
    const fields = [];
    if (config.config?.labelField) fields.push(config.config.labelField);
    if (config.config?.valueField) fields.push(config.config.valueField);
    if (config.config?.metadataFields) fields.push(...config.config.metadataFields);
    if (fields.length === 0) fields.push('name', 'label', 'title', 'value', 'id');
    return [...new Set(fields)];
  }

  // ---------------------------------------------------------------------------
  // File Watching
  // ---------------------------------------------------------------------------

  _setupWatcher(filePath, cacheKey) {
    try {
      const watcher = fsSync.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.fileCache.delete(cacheKey);
          this.logger.info(`File changed, cache invalidated: ${filePath}`);
        }
      });
      this.watchers.set(cacheKey, watcher);
    } catch (error) {
      this.logger.warn(`Failed to setup file watcher: ${error.message}`);
    }
  }

  cleanup() {
    for (const [, watcher] of this.watchers) watcher.close();
    this.watchers.clear();
    this.fileCache.clear();
  }

  clearFileCache() {
    this.fileCache.clear();
  }
}

module.exports = { FileDataSourceExecutor };
