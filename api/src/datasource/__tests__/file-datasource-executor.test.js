/**
 * Tests for FileDataSourceExecutor.
 */

const path = require('path');
const { FileDataSourceExecutor } = require('../file-datasource.executor');
const { FileDataSourceBuilder, CacheStrategy } = require('../../schemas/datasource-config.schema');

const FIXTURES = path.join(__dirname, 'fixtures');

function createMockLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function jsonConfig(filename, opts = {}) {
  return new FileDataSourceBuilder(filename, {
    graphId: `ds_${filename}`,
    ...opts,
  })
    .setFilePath(path.join(FIXTURES, filename), 'json')
    .setOutputMapping(
      opts.valueField || 'id',
      opts.labelField || 'name',
      opts.metadataFields || [],
    )
    .setCacheStrategy(CacheStrategy.NONE)
    .build();
}

function csvConfig(filename, opts = {}) {
  return new FileDataSourceBuilder(filename, {
    graphId: `ds_${filename}`,
    ...opts,
  })
    .setFilePath(path.join(FIXTURES, filename), 'csv')
    .setOutputMapping(
      opts.valueField || 'code',
      opts.labelField || 'name',
      opts.metadataFields || [],
    )
    .setCacheStrategy(CacheStrategy.NONE)
    .build();
}

// =============================================================================
// TESTS
// =============================================================================

describe('FileDataSourceExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new FileDataSourceExecutor({ logger: createMockLogger() });
  });

  afterEach(() => {
    executor.cleanup();
  });

  // --- Setters ---

  test('setBasePath returns this', () => {
    expect(executor.setBasePath('/tmp')).toBe(executor);
  });

  test('setCsvParser returns this', () => {
    expect(executor.setCsvParser(() => [])).toBe(executor);
  });

  // ─── loadAll ───────────────────────────────────────────────────────────────

  describe('loadAll', () => {
    test('loads JSON file and transforms output', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config);

      expect(result.items.length).toBe(8);
      expect(result.total).toBe(8);
      expect(result.cached).toBe(false);
      expect(result.items[0]).toEqual({ value: 'GVA', label: 'Geneva' });
    });

    test('loads CSV file and transforms output', async () => {
      const config = csvConfig('test-data.csv');
      const result = await executor.loadAll(config);

      expect(result.items.length).toBe(8);
      expect(result.items[0]).toEqual({ value: 'LAPTOP', label: 'Laptop' });
    });

    test('paginates results', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, { limit: 3, offset: 2 });

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(8);
      expect(result.items[0].value).toBe('NBO'); // 3rd item (0-indexed offset 2)
    });

    test('applies filters', async () => {
      const config = jsonConfig('test-data.json', { metadataFields: ['region'] });
      const result = await executor.loadAll(config, {
        filters: { region: 'Europe' },
      });

      expect(result.items.length).toBe(2); // Geneva, Vienna
      expect(result.total).toBe(2);
    });

    test('applies sorting ASC', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, { orderBy: 'name ASC' });

      expect(result.items[0].label).toBe('Addis Ababa');
      expect(result.items[result.items.length - 1].label).toBe('Vienna');
    });

    test('applies sorting DESC', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, { orderBy: 'name DESC' });

      expect(result.items[0].label).toBe('Vienna');
    });

    test('handles wrapped JSON (data property)', async () => {
      const config = new FileDataSourceBuilder('wrapped', { graphId: 'ds_wrapped' })
        .setFilePath(path.join(FIXTURES, 'test-wrapped.json'), 'json')
        .setOutputMapping('id', 'label')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();

      const result = await executor.loadAll(config);

      expect(result.items.length).toBe(3);
      expect(result.items[0]).toEqual({ value: 1, label: 'Alpha' });
    });

    test('throws for missing file', async () => {
      const config = jsonConfig('nonexistent.json');
      await expect(executor.loadAll(config)).rejects.toThrow();
    });

    test('throws for invalid JSON', async () => {
      // Create a temp invalid file
      const fs = require('fs');
      const tmpPath = path.join(FIXTURES, '_invalid.json');
      fs.writeFileSync(tmpPath, '{ invalid json !!!');

      const config = new FileDataSourceBuilder('invalid', { graphId: 'ds_inv' })
        .setFilePath(tmpPath, 'json')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();

      await expect(executor.loadAll(config)).rejects.toThrow('Failed to parse JSON');

      fs.unlinkSync(tmpPath);
    });

    test('throws for unsupported format', async () => {
      const config = new FileDataSourceBuilder('xml', { graphId: 'ds_xml' })
        .setFilePath(path.join(FIXTURES, 'test-data.json'), 'xml')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();
      config.fileConfig.format = 'xml';

      await expect(executor.loadAll(config)).rejects.toThrow('Unsupported file format');
    });
  });

  // ─── search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    test('finds matching items by label', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: 'gen', limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].label).toBe('Geneva');
    });

    test('finds by value field', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: 'NYC', limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].value).toBe('NYC');
    });

    test('case-insensitive search', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: 'NAIROBI', limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].label).toBe('Nairobi');
    });

    test('returns total count of all matches', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: 'a', limit: 3 });

      // Several cities contain 'a'
      expect(result.items.length).toBeLessThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(result.items.length);
    });

    test('returns empty for empty query', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: '' });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    test('returns empty for no matches', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.search(config, { query: 'zzzzzzz', limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    test('searches CSV data', async () => {
      const config = csvConfig('test-data.csv');
      const result = await executor.search(config, { query: 'Laptop', limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].value).toBe('LAPTOP');
    });
  });

  // ─── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    test('returns item by ID', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.getById(config, { id: 'GVA' });

      expect(result).toEqual({ value: 'GVA', label: 'Geneva' });
    });

    test('returns null for non-existent ID', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.getById(config, { id: 'MISSING' });

      expect(result).toBeNull();
    });

    test('throws without id', async () => {
      const config = jsonConfig('test-data.json');
      await expect(executor.getById(config, {})).rejects.toThrow('id is required');
    });

    test('coerces ID to string for comparison', async () => {
      const config = new FileDataSourceBuilder('wrapped', { graphId: 'ds_w2' })
        .setFilePath(path.join(FIXTURES, 'test-wrapped.json'), 'json')
        .setOutputMapping('id', 'label')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();

      const result = await executor.getById(config, { id: 2 });
      expect(result).toEqual({ value: 2, label: 'Beta' });
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    test('returns total count', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.count(config);

      expect(result).toBe(8);
    });

    test('returns filtered count', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.count(config, {
        filters: { region: 'Africa' },
      });

      expect(result).toBe(2); // Nairobi, Addis Ababa
    });
  });

  // ─── validate ──────────────────────────────────────────────────────────────

  describe('validate', () => {
    test('returns true for existing value', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.validate(config, { value: 'GVA' });

      expect(result).toBe(true);
    });

    test('returns false for non-existing value', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.validate(config, { value: 'MISSING' });

      expect(result).toBe(false);
    });

    test('validates by custom field', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.validate(config, {
        value: 'Switzerland',
        field: 'country',
      });

      expect(result).toBe(true);
    });

    test('throws without value', async () => {
      const config = jsonConfig('test-data.json');
      await expect(executor.validate(config, {})).rejects.toThrow('value is required');
    });
  });

  // ─── CSV parsing ───────────────────────────────────────────────────────────

  describe('CSV parsing', () => {
    test('parses CSV with headers', async () => {
      const config = csvConfig('test-data.csv');
      const result = await executor.loadAll(config);

      expect(result.items.length).toBe(8);
      expect(result.items[0]).toHaveProperty('value');
      expect(result.items[0]).toHaveProperty('label');
    });

    test('parses CSV with custom delimiter', async () => {
      const fs = require('fs');
      const tmpPath = path.join(FIXTURES, '_semicolon.csv');
      fs.writeFileSync(tmpPath, 'id;name;active\n1;Alpha;true\n2;Beta;false\n');

      const config = new FileDataSourceBuilder('semi', { graphId: 'ds_semi' })
        .setFilePath(tmpPath, 'csv')
        .setCsvOptions(';', true)
        .setOutputMapping('id', 'name')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();

      const result = await executor.loadAll(config);

      expect(result.items.length).toBe(2);
      expect(result.items[0]).toEqual({ value: '1', label: 'Alpha' });

      fs.unlinkSync(tmpPath);
    });

    test('parses CSV with quoted fields', async () => {
      const fs = require('fs');
      const tmpPath = path.join(FIXTURES, '_quoted.csv');
      fs.writeFileSync(tmpPath, 'id,name\n1,"Hello, World"\n2,"No quotes"\n');

      const config = new FileDataSourceBuilder('quoted', { graphId: 'ds_quoted' })
        .setFilePath(tmpPath, 'csv')
        .setOutputMapping('id', 'name')
        .setCacheStrategy(CacheStrategy.NONE)
        .build();

      const result = await executor.loadAll(config);

      expect(result.items[0].label).toBe('Hello, World');

      fs.unlinkSync(tmpPath);
    });

    test('uses external CSV parser when provided', async () => {
      const customParser = jest.fn(() => [
        { code: 'X', name: 'Custom' },
      ]);

      const exec = new FileDataSourceExecutor({
        logger: createMockLogger(),
        csvParser: customParser,
      });

      const config = csvConfig('test-data.csv');
      const result = await exec.loadAll(config);

      expect(customParser).toHaveBeenCalled();
      expect(result.items[0].label).toBe('Custom');

      exec.cleanup();
    });
  });

  // ─── File caching ──────────────────────────────────────────────────────────

  describe('File caching', () => {
    test('caches file data in memory', async () => {
      const config = jsonConfig('test-data.json');

      await executor.loadAll(config);
      const filePath = path.join(FIXTURES, 'test-data.json');
      expect(executor.fileCache.has(filePath)).toBe(true);
    });

    test('clearFileCache removes cached data', async () => {
      const config = jsonConfig('test-data.json');

      await executor.loadAll(config);
      executor.clearFileCache();
      expect(executor.fileCache.size).toBe(0);
    });
  });

  // ─── Filters ───────────────────────────────────────────────────────────────

  describe('Operator filters', () => {
    test('$contains filter', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, {
        filters: { name: { $contains: 'york' } },
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].label).toBe('New York');
    });

    test('$in filter', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, {
        filters: { region: { $in: ['Europe', 'Africa'] } },
      });

      expect(result.total).toBe(4); // Geneva, Vienna, Nairobi, Addis Ababa
    });

    test('$gt filter on numeric field', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, {
        filters: { population: { $gt: 5000000 } },
      });

      expect(result.total).toBe(3); // NYC, Bangkok, Santiago
    });

    test('$regex filter', async () => {
      const config = jsonConfig('test-data.json');
      const result = await executor.loadAll(config, {
        filters: { name: { $regex: '^B' } },
      });

      expect(result.total).toBe(2); // Bangkok, Beirut
    });
  });

  // ─── Path resolution ──────────────────────────────────────────────────────

  describe('Path resolution', () => {
    test('resolves absolute paths as-is', () => {
      const resolved = executor._resolveFilePath('/absolute/path.json');
      expect(resolved).toBe('/absolute/path.json');
    });

    test('resolves relative paths against basePath', () => {
      executor.setBasePath('/base');
      const resolved = executor._resolveFilePath('data/file.json');
      expect(resolved).toBe(path.join('/base', 'data/file.json'));
    });

    test('throws for empty filePath', () => {
      expect(() => executor._resolveFilePath('')).toThrow('filePath is required');
    });

    test('detects format from extension', () => {
      expect(executor._detectFormat('data.json')).toBe('json');
      expect(executor._detectFormat('data.csv')).toBe('csv');
      expect(executor._detectFormat('data.tsv')).toBe('csv');
      expect(executor._detectFormat('data.txt')).toBe('json'); // default
    });
  });
});
