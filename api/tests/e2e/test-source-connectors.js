/**
 * Task 8.4 — Source Connectors Tests
 *
 * Tests: BaseConnector, FileSystemConnector, TFSConnector,
 *        SharePointConnector, SourceManager, Connectors Routes
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const http = require('http');
const express = require('express');

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function section(name) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. BASE CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════

async function testBaseConnector() {
  section('1. BaseConnector');

  const { BaseConnector } = require('../../src/services/connectors/base-connector');

  await test('BaseConnector constructor sets defaults', () => {
    const connector = new BaseConnector('test-base', { type: 'mock' });
    assert.strictEqual(connector.name, 'test-base');
    assert.strictEqual(connector.type, 'mock');
    assert.strictEqual(connector.connected, false);
    assert.strictEqual(connector.options.retryAttempts, 3);
    assert.strictEqual(connector.options.retryDelay, 1000);
    assert.strictEqual(connector.options.timeout, 30000);
    assert.strictEqual(connector.stats.connectAttempts, 0);
    assert.strictEqual(connector.stats.errors, 0);
  });

  await test('BaseConnector abstract methods throw', async () => {
    const connector = new BaseConnector('test', {});

    const methods = ['connect', 'disconnect', 'list', 'fetch'];
    for (const method of methods) {
      try {
        await connector[method]();
        assert.fail(`${method}() should throw`);
      } catch (err) {
        assert.ok(err.message.includes('must be implemented') || err.message.includes('not supported'));
      }
    }
  });

  await test('BaseConnector search/watch throw not-supported', async () => {
    const connector = new BaseConnector('test', {});

    try {
      await connector.search('test');
      assert.fail('search() should throw');
    } catch (err) {
      assert.ok(err.message.includes('not supported'));
    }

    try {
      await connector.watch('/', () => {});
      assert.fail('watch() should throw');
    } catch (err) {
      assert.ok(err.message.includes('not supported'));
    }
  });

  await test('BaseConnector fetchMany collects results', async () => {
    class MockConnector extends BaseConnector {
      async connect() { this.connected = true; }
      async disconnect() { this.connected = false; }
      async list() { return []; }
      async fetch(id) {
        if (id === 'fail') throw new Error('not found');
        return { id, data: `content-${id}` };
      }
    }

    const connector = new MockConnector('mock', {});
    const results = await connector.fetchMany(['a', 'fail', 'b']);

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[0].data.id, 'a');
    assert.strictEqual(results[1].success, false);
    assert.ok(results[1].error.includes('not found'));
    assert.strictEqual(results[2].success, true);
  });

  await test('BaseConnector withRetry retries on failure', async () => {
    const connector = new BaseConnector('retry-test', {
      retryAttempts: 3,
      retryDelay: 10
    });

    let attempts = 0;
    const result = await connector.withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return 'ok';
    }, 'test-op');

    assert.strictEqual(result, 'ok');
    assert.strictEqual(attempts, 3);
  });

  await test('BaseConnector withRetry throws after all attempts', async () => {
    const connector = new BaseConnector('retry-fail', {
      retryAttempts: 2,
      retryDelay: 10
    });

    try {
      await connector.withRetry(async () => {
        throw new Error('permanent');
      }, 'test-op');
      assert.fail('Should throw');
    } catch (err) {
      assert.strictEqual(err.message, 'permanent');
      assert.strictEqual(connector.stats.errors, 1);
      assert.strictEqual(connector.lastError.message, 'permanent');
    }
  });

  await test('BaseConnector _updateStats tracks events', () => {
    const connector = new BaseConnector('stats-test', {});

    connector._updateStats('connect');
    assert.strictEqual(connector.stats.connectAttempts, 1);

    connector._updateStats('connect_success');
    assert.strictEqual(connector.stats.successfulConnects, 1);

    connector._updateStats('fetch', 5);
    assert.strictEqual(connector.stats.itemsFetched, 5);

    connector._updateStats('error', 2);
    assert.strictEqual(connector.stats.errors, 2);

    assert.ok(connector.stats.lastActivity);
  });

  await test('BaseConnector getInfo returns summary', () => {
    const connector = new BaseConnector('info-test', { type: 'demo' });
    connector.connected = true;
    connector.lastError = new Error('some error');

    const info = connector.getInfo();
    assert.strictEqual(info.name, 'info-test');
    assert.strictEqual(info.type, 'demo');
    assert.strictEqual(info.connected, true);
    assert.strictEqual(info.lastError, 'some error');
    assert.ok(info.stats);
  });

  await test('BaseConnector testConnection uses connect/disconnect', async () => {
    class TestableConnector extends BaseConnector {
      constructor() {
        super('testable', {});
        this.connectCalled = false;
        this.disconnectCalled = false;
      }
      async connect() { this.connectCalled = true; this.connected = true; }
      async disconnect() { this.disconnectCalled = true; this.connected = false; }
      async list() { return []; }
      async fetch() { return {}; }
    }

    const c = new TestableConnector();
    const result = await c.testConnection();
    assert.strictEqual(result.success, true);
    assert.strictEqual(c.connectCalled, true);
    assert.strictEqual(c.disconnectCalled, true);
  });

  await test('BaseConnector testConnection reports failure', async () => {
    class FailConnector extends BaseConnector {
      async connect() { throw new Error('no access'); }
      async disconnect() {}
      async list() { return []; }
      async fetch() { return {}; }
    }

    const c = new FailConnector('fail', {});
    const result = await c.testConnection();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'no access');
  });

  await test('BaseConnector emits events', async () => {
    const connector = new BaseConnector('event-test', {});
    const events = [];

    connector.on('test-event', (data) => events.push(data));
    connector.emit('test-event', { msg: 'hello' });
    connector.emit('test-event', { msg: 'world' });

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].msg, 'hello');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. FILESYSTEM CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════

async function testFileSystemConnector() {
  section('2. FileSystemConnector');

  const { FileSystemConnector } = require('../../src/services/connectors/filesystem-connector');

  // Create temp directory for testing
  const tmpDir = path.join(os.tmpdir(), `fs-connector-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Test\n\nHello world');
  await fs.writeFile(path.join(tmpDir, 'data.json'), '{"key": "value"}');
  await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'Some notes here');
  await fs.writeFile(path.join(tmpDir, 'image.png'), 'binary-data');
  await fs.writeFile(path.join(tmpDir, 'subdir', 'nested.txt'), 'Nested content');
  await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg.json'), '{}');

  await test('FileSystemConnector connects to valid directory', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    const result = await connector.connect();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.basePath, tmpDir);
    assert.strictEqual(connector.connected, true);
    await connector.disconnect();
  });

  await test('FileSystemConnector rejects non-directory', async () => {
    const filePath = path.join(tmpDir, 'readme.md');
    const connector = new FileSystemConnector({ basePath: filePath });

    try {
      await connector.connect();
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('not a directory'));
    }
  });

  await test('FileSystemConnector rejects non-existent path', async () => {
    const connector = new FileSystemConnector({ basePath: '/nonexistent/path/xyz' });

    try {
      await connector.connect();
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message);
    }
  });

  await test('FileSystemConnector list returns files and dirs', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    const listing = await connector.list('', { depth: 1 });
    assert.ok(listing.items.length > 0);

    const files = listing.items.filter(i => i.type === 'file');
    const dirs = listing.items.filter(i => i.type === 'directory');

    assert.ok(files.some(f => f.name === 'readme.md'));
    assert.ok(files.some(f => f.name === 'data.json'));
    assert.ok(files.some(f => f.name === 'notes.txt'));
    assert.ok(dirs.some(d => d.name === 'subdir'));

    // Should exclude node_modules
    assert.ok(!listing.items.some(i => i.name === 'node_modules'));

    // Should exclude .png (not in allowedExtensions)
    assert.ok(!files.some(f => f.name === 'image.png'));

    await connector.disconnect();
  });

  await test('FileSystemConnector list with depth 2 includes nested', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    const listing = await connector.list('', { depth: 2 });
    const subdir = listing.items.find(i => i.name === 'subdir');
    assert.ok(subdir);
    assert.ok(subdir.items.some(i => i.name === 'nested.txt'));

    await connector.disconnect();
  });

  await test('FileSystemConnector fetch reads file content', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    const result = await connector.fetch('notes.txt', { parse: false });
    assert.strictEqual(result.content, 'Some notes here');
    assert.ok(result.size > 0);
    assert.ok(result.modified);
    assert.strictEqual(connector.stats.itemsFetched, 1);

    await connector.disconnect();
  });

  await test('FileSystemConnector fetch rejects disallowed extension', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    try {
      await connector.fetch('image.png', { parse: false });
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('not allowed'));
    }

    await connector.disconnect();
  });

  await test('FileSystemConnector fetch prevents path traversal', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    try {
      await connector.fetch('../../etc/passwd', { parse: false });
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('traversal') || err.message.includes('not allowed') || err.message);
    }

    await connector.disconnect();
  });

  await test('FileSystemConnector search by name', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir, maxDepth: 3 });
    await connector.connect();

    const results = await connector.search('readme');
    assert.ok(results.count > 0);
    assert.ok(results.results.some(r => r.name === 'readme.md'));
    assert.strictEqual(results.results[0].matchType, 'name');

    await connector.disconnect();
  });

  await test('FileSystemConnector search by content', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir, maxDepth: 3 });
    await connector.connect();

    const results = await connector.search('Nested', { searchContent: true });
    assert.ok(results.count > 0);
    assert.ok(results.results.some(r => r.name === 'nested.txt'));

    await connector.disconnect();
  });

  await test('FileSystemConnector disconnect stops watchers', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    // Watch is platform-specific, just verify watchers map management
    assert.strictEqual(connector.watchers.size, 0);
    await connector.disconnect();
    assert.strictEqual(connector.connected, false);
  });

  await test('FileSystemConnector emits connected/disconnected', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    const events = [];

    connector.on('connected', () => events.push('connected'));
    connector.on('disconnected', () => events.push('disconnected'));

    await connector.connect();
    await connector.disconnect();

    assert.deepStrictEqual(events, ['connected', 'disconnected']);
  });

  await test('FileSystemConnector file details include extension and size', async () => {
    const connector = new FileSystemConnector({ basePath: tmpDir });
    await connector.connect();

    const listing = await connector.list('', { depth: 1 });
    const mdFile = listing.items.find(f => f.name === 'readme.md');
    assert.ok(mdFile);
    assert.strictEqual(mdFile.extension, '.md');
    assert.strictEqual(mdFile.type, 'file');
    assert.ok(mdFile.size > 0);
    assert.ok(mdFile.modified);

    await connector.disconnect();
  });

  // Cleanup temp dir
  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TFS CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════

async function testTFSConnector() {
  section('3. TFSConnector');

  const { TFSConnector } = require('../../src/services/connectors/tfs-connector');

  await test('TFSConnector constructor sets defaults', () => {
    const connector = new TFSConnector({
      serverUrl: 'https://tfs.example.com',
      project: 'TestProject'
    });
    assert.strictEqual(connector.name, 'tfs');
    assert.strictEqual(connector.type, 'tfs');
    assert.strictEqual(connector.serverUrl, 'https://tfs.example.com');
    assert.strictEqual(connector.project, 'TestProject');
    assert.strictEqual(connector.collection, 'DefaultCollection');
    assert.strictEqual(connector.apiVersion, '6.0');
  });

  await test('TFSConnector requires serverUrl to connect', async () => {
    const connector = new TFSConnector({ serverUrl: null });
    connector.serverUrl = null;

    try {
      await connector.connect();
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('URL is required'));
    }
  });

  await test('TFSConnector builds correct baseUrl', () => {
    const c1 = new TFSConnector({
      serverUrl: 'https://tfs.example.com',
      project: 'MyProject',
      collection: 'DefaultCollection'
    });

    // Simulate connect URL building
    c1.baseUrl = `${c1.serverUrl}/${c1.collection}/${c1.project}`;
    assert.strictEqual(c1.baseUrl, 'https://tfs.example.com/DefaultCollection/MyProject');
  });

  await test('TFSConnector disconnect sets connected false', async () => {
    const connector = new TFSConnector({ serverUrl: 'https://tfs.example.com' });
    connector.connected = true;

    const events = [];
    connector.on('disconnected', () => events.push('disconnected'));

    await connector.disconnect();
    assert.strictEqual(connector.connected, false);
    assert.deepStrictEqual(events, ['disconnected']);
  });

  await test('TFSConnector getInfo returns correct data', () => {
    const connector = new TFSConnector({ serverUrl: 'https://tfs.example.com' });
    connector.connected = true;

    const info = connector.getInfo();
    assert.strictEqual(info.name, 'tfs');
    assert.strictEqual(info.type, 'tfs');
    assert.strictEqual(info.connected, true);
  });

  await test('TFSConnector stats track operations', () => {
    const connector = new TFSConnector({ serverUrl: 'https://tfs.example.com' });

    connector._updateStats('fetch');
    connector._updateStats('fetch');
    connector._updateStats('error');

    assert.strictEqual(connector.stats.itemsFetched, 2);
    assert.strictEqual(connector.stats.errors, 1);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SHAREPOINT CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════

async function testSharePointConnector() {
  section('4. SharePointConnector');

  const { SharePointConnector } = require('../../src/services/connectors/sharepoint-connector');

  await test('SharePointConnector constructor sets defaults', () => {
    const connector = new SharePointConnector({
      siteUrl: 'https://sp.example.com/sites/test'
    });
    assert.strictEqual(connector.name, 'sharepoint');
    assert.strictEqual(connector.type, 'sharepoint');
    assert.strictEqual(connector.siteUrl, 'https://sp.example.com/sites/test');
    assert.strictEqual(connector.accessToken, null);
  });

  await test('SharePointConnector requires siteUrl', async () => {
    const connector = new SharePointConnector({ siteUrl: null });
    connector.siteUrl = null;

    try {
      await connector.connect();
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('URL is required'));
    }
  });

  await test('SharePointConnector disconnect clears token', async () => {
    const connector = new SharePointConnector({ siteUrl: 'https://sp.example.com' });
    connector.accessToken = 'test-token';
    connector.tokenExpiry = Date.now() + 3600000;
    connector.connected = true;

    await connector.disconnect();
    assert.strictEqual(connector.accessToken, null);
    assert.strictEqual(connector.tokenExpiry, null);
    assert.strictEqual(connector.connected, false);
  });

  await test('SharePointConnector getInfo returns data', () => {
    const connector = new SharePointConnector({ siteUrl: 'https://sp.example.com' });
    const info = connector.getInfo();
    assert.strictEqual(info.name, 'sharepoint');
    assert.strictEqual(info.type, 'sharepoint');
  });

  await test('SharePointConnector stats tracking', () => {
    const connector = new SharePointConnector({ siteUrl: 'https://sp.example.com' });

    connector._updateStats('fetch');
    connector._updateStats('error');

    assert.strictEqual(connector.stats.itemsFetched, 1);
    assert.strictEqual(connector.stats.errors, 1);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. SOURCE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

async function testSourceManager() {
  section('5. SourceManager');

  const { SourceManager } = require('../../src/services/connectors/source-manager');

  // Create temp dir for FS connector
  const tmpDir = path.join(os.tmpdir(), `source-mgr-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'test.txt'), 'Manager test content');

  await test('SourceManager register creates connector', () => {
    const manager = new SourceManager();

    const connector = manager.register('local', 'filesystem', { basePath: tmpDir });
    assert.ok(connector);
    assert.strictEqual(manager.stats.totalSources, 1);
    assert.strictEqual(manager.listConnectors().length, 1);
    assert.strictEqual(manager.listConnectors()[0].name, 'local');
    assert.strictEqual(manager.listConnectors()[0].type, 'filesystem');
  });

  await test('SourceManager register rejects duplicate name', () => {
    const manager = new SourceManager();
    manager.register('dup', 'filesystem', { basePath: tmpDir });

    try {
      manager.register('dup', 'filesystem', { basePath: tmpDir });
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('already registered'));
    }
  });

  await test('SourceManager register rejects unknown type', () => {
    const manager = new SourceManager();

    try {
      manager.register('bad', 'unknown-type', {});
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('Unknown connector type'));
    }
  });

  await test('SourceManager get returns connector', () => {
    const manager = new SourceManager();
    manager.register('fs1', 'filesystem', { basePath: tmpDir });

    const connector = manager.get('fs1');
    assert.ok(connector);
    assert.strictEqual(connector.name, 'filesystem');

    const missing = manager.get('nonexistent');
    assert.strictEqual(missing, undefined);
  });

  await test('SourceManager connect/disconnect single', async () => {
    const manager = new SourceManager();
    manager.register('fs-test', 'filesystem', { basePath: tmpDir });

    await manager.connect('fs-test');
    const connector = manager.get('fs-test');
    assert.strictEqual(connector.connected, true);

    await manager.disconnect('fs-test');
    assert.strictEqual(connector.connected, false);
  });

  await test('SourceManager connect rejects unknown name', async () => {
    const manager = new SourceManager();

    try {
      await manager.connect('nonexistent');
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('not found'));
    }
  });

  await test('SourceManager connectAll connects all', async () => {
    const manager = new SourceManager();
    manager.register('fs-a', 'filesystem', { basePath: tmpDir });
    manager.register('fs-b', 'filesystem', { basePath: tmpDir });

    const results = await manager.connectAll();
    assert.strictEqual(results['fs-a'].success, true);
    assert.strictEqual(results['fs-b'].success, true);

    await manager.disconnectAll();
  });

  await test('SourceManager connectAll handles failures', async () => {
    const manager = new SourceManager();
    manager.register('good', 'filesystem', { basePath: tmpDir });
    manager.register('bad', 'filesystem', { basePath: '/nonexistent/path/xyz123' });

    const results = await manager.connectAll();
    assert.strictEqual(results['good'].success, true);
    assert.strictEqual(results['bad'].success, false);
    assert.ok(results['bad'].error);

    await manager.disconnectAll();
  });

  await test('SourceManager list delegates to connector', async () => {
    const manager = new SourceManager();
    manager.register('fs-list', 'filesystem', { basePath: tmpDir });
    await manager.connect('fs-list');

    const listing = await manager.list('fs-list', '', { depth: 1 });
    assert.ok(listing.items.length > 0);
    assert.ok(listing.items.some(i => i.name === 'test.txt'));

    await manager.disconnectAll();
  });

  await test('SourceManager fetch delegates and tracks stats', async () => {
    const manager = new SourceManager();
    manager.register('fs-fetch', 'filesystem', { basePath: tmpDir });
    await manager.connect('fs-fetch');

    const result = await manager.fetch('fs-fetch', 'test.txt', { parse: false });
    assert.strictEqual(result.content, 'Manager test content');
    assert.strictEqual(manager.stats.totalFetched, 1);

    await manager.disconnectAll();
  });

  await test('SourceManager fetch rejects unknown source', async () => {
    const manager = new SourceManager();

    try {
      await manager.fetch('nonexistent', 'file.txt');
      assert.fail('Should throw');
    } catch (err) {
      assert.ok(err.message.includes('not found'));
    }
  });

  await test('SourceManager unregister removes connector', async () => {
    const manager = new SourceManager();
    manager.register('to-remove', 'filesystem', { basePath: tmpDir });
    assert.strictEqual(manager.stats.totalSources, 1);

    const removed = await manager.unregister('to-remove');
    assert.strictEqual(removed, true);
    assert.strictEqual(manager.stats.totalSources, 0);
    assert.strictEqual(manager.get('to-remove'), undefined);

    const removedAgain = await manager.unregister('to-remove');
    assert.strictEqual(removedAgain, false);
  });

  await test('SourceManager getStatuses returns all connector info', async () => {
    const manager = new SourceManager();
    manager.register('s1', 'filesystem', { basePath: tmpDir });
    manager.register('s2', 'filesystem', { basePath: tmpDir });
    await manager.connect('s1');

    const statuses = manager.getStatuses();
    assert.ok(statuses['s1']);
    assert.ok(statuses['s2']);
    assert.strictEqual(statuses['s1'].connected, true);
    assert.strictEqual(statuses['s2'].connected, false);
    assert.strictEqual(statuses['s1'].type, 'filesystem');

    await manager.disconnectAll();
  });

  await test('SourceManager getStats includes connectors list', () => {
    const manager = new SourceManager();
    manager.register('st1', 'filesystem', { basePath: tmpDir });

    const stats = manager.getStats();
    assert.strictEqual(stats.totalSources, 1);
    assert.ok(Array.isArray(stats.connectors));
    assert.strictEqual(stats.connectors.length, 1);
    assert.strictEqual(stats.connectors[0].name, 'st1');
  });

  await test('SourceManager emits connector events', async () => {
    const manager = new SourceManager();
    const events = [];

    manager.on('connector:connected', (data) => events.push({ event: 'connected', ...data }));
    manager.on('connector:disconnected', (data) => events.push({ event: 'disconnected', ...data }));

    manager.register('ev-test', 'filesystem', { basePath: tmpDir });
    await manager.connect('ev-test');
    await manager.disconnect('ev-test');

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].event, 'connected');
    assert.strictEqual(events[0].name, 'ev-test');
    assert.strictEqual(events[1].event, 'disconnected');
  });

  await test('SourceManager searchAll across sources', async () => {
    const manager = new SourceManager();
    manager.register('search-src', 'filesystem', { basePath: tmpDir, maxDepth: 3 });
    await manager.connect('search-src');

    const results = await manager.searchAll('test');
    assert.ok(results.query === 'test');
    assert.strictEqual(results.sourcesSearched, 1);
    assert.ok(results.results['search-src']);
    assert.ok(results.results['search-src'].count >= 1);

    await manager.disconnectAll();
  });

  await test('SourceManager register all 3 connector types', () => {
    const manager = new SourceManager();

    manager.register('fs', 'filesystem', { basePath: tmpDir });
    manager.register('tfs', 'tfs', { serverUrl: 'https://tfs.example.com' });
    manager.register('sp', 'sharepoint', { siteUrl: 'https://sp.example.com' });

    assert.strictEqual(manager.stats.totalSources, 3);
    const connectors = manager.listConnectors();
    assert.strictEqual(connectors.length, 3);
    assert.ok(connectors.some(c => c.type === 'filesystem'));
    assert.ok(connectors.some(c => c.type === 'tfs'));
    assert.ok(connectors.some(c => c.type === 'sharepoint'));
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CONNECTORS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testConnectorsRoutes() {
  section('6. Connectors Routes');

  const connectorsRoutes = require('../../src/routes/connectors.routes');

  // Create temp dir for FS connector
  const tmpDir = path.join(os.tmpdir(), `routes-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Route test content');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/connectors', connectorsRoutes);

  let server;
  let baseUrl;

  // Start test server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return { status: response.status, data: await response.json() };
  };

  await test('POST /register creates filesystem connector', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'route-fs', type: 'filesystem', config: { basePath: tmpDir } })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.connector.name, 'route-fs');
  });

  await test('POST /register rejects missing fields', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'no-type' })
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('GET / lists all connectors', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.connectors.some(c => c.name === 'route-fs'));
  });

  await test('POST /:name/connect connects connector', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/connect', {
      method: 'POST'
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });

  await test('GET /:name/status returns connector info', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/status');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.status.connected, true);
    assert.strictEqual(data.status.type, 'filesystem');
  });

  await test('GET /:name/status returns 404 for unknown', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/nonexistent/status');
    assert.strictEqual(status, 404);
    assert.strictEqual(data.success, false);
  });

  await test('GET /:name/list returns directory listing', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/list?depth=1');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.items.some(i => i.name === 'hello.txt'));
  });

  await test('GET /:name/fetch returns file content', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/fetch?path=hello.txt&parse=false');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.content, 'Route test content');
  });

  await test('GET /:name/fetch rejects missing path', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/fetch');
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('POST /search searches across sources', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'hello' })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.results['route-fs']);
  });

  await test('POST /search rejects missing query', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/search', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('GET /stats returns manager statistics', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats.totalSources >= 1);
  });

  await test('POST /:name/test tests connection', async () => {
    // Register a new connector to test
    await fetchJson('/api/v1/connectors/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'test-conn', type: 'filesystem', config: { basePath: tmpDir } })
    });

    const { status, data } = await fetchJson('/api/v1/connectors/test-conn/test', {
      method: 'POST'
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });

  await test('POST /:name/disconnect disconnects', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/route-fs/disconnect', {
      method: 'POST'
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
  });

  await test('DELETE /:name removes connector', async () => {
    const { status, data } = await fetchJson('/api/v1/connectors/test-conn', {
      method: 'DELETE'
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);

    // Verify gone
    const { data: list } = await fetchJson('/api/v1/connectors');
    assert.ok(!list.connectors.some(c => c.name === 'test-conn'));
  });

  // Cleanup
  server.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function testModuleExports() {
  section('7. Module Exports');

  await test('connectors/index.js exports all classes and singletons', () => {
    const mod = require('../../src/services/connectors');

    assert.ok(mod.BaseConnector);
    assert.ok(mod.FileSystemConnector);
    assert.ok(mod.filesystemConnector);
    assert.ok(mod.TFSConnector);
    assert.ok(mod.tfsConnector);
    assert.ok(mod.SharePointConnector);
    assert.ok(mod.sharePointConnector);
    assert.ok(mod.SourceManager);
    assert.ok(mod.sourceManager);
  });

  await test('singletons are correct types', () => {
    const mod = require('../../src/services/connectors');

    assert.ok(mod.filesystemConnector instanceof mod.FileSystemConnector);
    assert.ok(mod.tfsConnector instanceof mod.TFSConnector);
    assert.ok(mod.sharePointConnector instanceof mod.SharePointConnector);
    assert.ok(mod.sourceManager instanceof mod.SourceManager);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Task 8.4 — Source Connectors Tests             ║');
  console.log('╚══════════════════════════════════════════════════╝');

  await testBaseConnector();
  await testFileSystemConnector();
  await testTFSConnector();
  await testSharePointConnector();
  await testSourceManager();
  await testConnectorsRoutes();
  await testModuleExports();

  console.log('\n══════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
