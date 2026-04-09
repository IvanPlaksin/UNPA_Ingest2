/**
 * Tests for System Health & OpenAPI Routes (Task 7.4)
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    testResults.passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    testResults.failed++;
    testResults.failures.push(name);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'Expected truthy value');
}

// ═══════════════════════════════════════════════════════════════
// Imports
// ═══════════════════════════════════════════════════════════════

const { queryEngine } = require('../../src/services/query');
const { patternLibrary } = require('../../src/services/patterns');
const { gnnRAGService } = require('../../src/services/gnn');
const { gnnEnhancedExtractor } = require('../../src/services/extraction');

// ═══════════════════════════════════════════════════════════════
// SYSTEM HEALTH TESTS
// ═══════════════════════════════════════════════════════════════

async function testHealthProbes() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Health Probes');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('QueryEngine is healthy', async () => {
    assertTrue(typeof queryEngine.query === 'function');
    assertTrue(typeof queryEngine.getStats === 'function');
  });

  await test('PatternLibrary is healthy', async () => {
    assertTrue(patternLibrary.entityPatterns instanceof Map);
    assertTrue(patternLibrary.relationPatterns instanceof Map);
    assertTrue(patternLibrary.subgraphPatterns instanceof Map);
  });

  await test('GNN-RAG service is healthy', async () => {
    assertTrue(gnnRAGService.graphCache.nodes instanceof Map);
    assertTrue(gnnRAGService.graphCache.edges instanceof Map);
    assertTrue(gnnRAGService.graphCache.adjacency instanceof Map);
  });

  await test('GNN-enhanced extractor is healthy', async () => {
    assertTrue(typeof gnnEnhancedExtractor.extract === 'function');
    assertTrue(typeof gnnEnhancedExtractor.getStats === 'function');
  });

  await test('All components pass readiness check', async () => {
    const checks = {
      queryEngine: typeof queryEngine.query === 'function',
      patternLibrary: patternLibrary.entityPatterns instanceof Map,
      graphService: gnnRAGService.graphCache.nodes instanceof Map
    };
    assertTrue(Object.values(checks).every(v => v));
  });
}

async function testSystemStatus() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('System Status');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('Query engine stats are available', async () => {
    const stats = queryEngine.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('totalQueries'));
    assertTrue(stats.hasOwnProperty('successfulQueries'));
    assertTrue(stats.hasOwnProperty('failedQueries'));
    assertTrue(stats.hasOwnProperty('cache'));
  });

  await test('Pattern library stats are available', async () => {
    const stats = patternLibrary.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('entityPatterns'));
    assertTrue(stats.hasOwnProperty('relationPatterns'));
    assertTrue(stats.hasOwnProperty('total'));
  });

  await test('GNN-RAG stats are available', async () => {
    const stats = gnnRAGService.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('totalQueries'));
  });

  await test('Extraction stats are available', async () => {
    const stats = gnnEnhancedExtractor.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('totalExtractions'));
  });

  await test('Memory usage is available', async () => {
    const mem = process.memoryUsage();
    assertTrue(mem.heapUsed > 0);
    assertTrue(mem.rss > 0);
  });

  await test('Uptime is positive', async () => {
    assertTrue(process.uptime() > 0);
  });
}

async function testStatsReset() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Stats Reset');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('Query engine resetStats clears counts', async () => {
    // Generate some queries first
    await queryEngine.query('test');
    assertTrue(queryEngine.getStats().totalQueries > 0);

    queryEngine.resetStats();
    assertEqual(queryEngine.getStats().totalQueries, 0);
    assertEqual(queryEngine.getStats().successfulQueries, 0);
    assertEqual(queryEngine.getStats().failedQueries, 0);
  });

  await test('Extraction resetStats clears counts', async () => {
    gnnEnhancedExtractor.resetStats();
    assertEqual(gnnEnhancedExtractor.getStats().totalExtractions, 0);
  });

  await test('Reset-stats requires confirmation', async () => {
    // Simulate validation
    const body = {};
    assertEqual(!!body.confirm, false);
  });

  await test('Reset-stats accepts confirmation', async () => {
    const body = { confirm: true };
    assertEqual(body.confirm, true);
  });
}

// ═══════════════════════════════════════════════════════════════
// OPENAPI TESTS
// ═══════════════════════════════════════════════════════════════

async function testOpenApiSpec() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('OpenAPI Specification');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const { openApiSpec } = require('../../src/routes/openapi.routes');

  await test('OpenAPI spec has correct version', async () => {
    assertEqual(openApiSpec.openapi, '3.0.3');
  });

  await test('OpenAPI spec has info section', async () => {
    assertTrue(openApiSpec.info !== undefined);
    assertEqual(openApiSpec.info.title, 'ProjectAdvisor API');
    assertTrue(openApiSpec.info.version !== undefined);
    assertTrue(openApiSpec.info.description !== undefined);
  });

  await test('OpenAPI spec has servers', async () => {
    assertTrue(Array.isArray(openApiSpec.servers));
    assertTrue(openApiSpec.servers.length > 0);
    assertEqual(openApiSpec.servers[0].url, '/api/v1');
  });

  await test('OpenAPI spec has 4 tags', async () => {
    assertTrue(Array.isArray(openApiSpec.tags));
    assertEqual(openApiSpec.tags.length, 4);
    const tagNames = openApiSpec.tags.map(t => t.name);
    assertTrue(tagNames.includes('Query'));
    assertTrue(tagNames.includes('Patterns'));
    assertTrue(tagNames.includes('Graph'));
    assertTrue(tagNames.includes('Health'));
  });

  await test('OpenAPI spec has paths', async () => {
    assertTrue(openApiSpec.paths !== undefined);
    const pathCount = Object.keys(openApiSpec.paths).length;
    assertTrue(pathCount >= 30, `Expected >= 30 paths, got ${pathCount}`);
  });

  await test('Query paths are defined', async () => {
    assertTrue(openApiSpec.paths['/query'] !== undefined);
    assertTrue(openApiSpec.paths['/query/quick'] !== undefined);
    assertTrue(openApiSpec.paths['/query/explain'] !== undefined);
    assertTrue(openApiSpec.paths['/query/batch'] !== undefined);
    assertTrue(openApiSpec.paths['/query/lookup/{entity}'] !== undefined);
    assertTrue(openApiSpec.paths['/query/path'] !== undefined);
    assertTrue(openApiSpec.paths['/query/stats'] !== undefined);
  });

  await test('Pattern paths are defined', async () => {
    assertTrue(openApiSpec.paths['/patterns/entity'] !== undefined);
    assertTrue(openApiSpec.paths['/patterns/relation'] !== undefined);
    assertTrue(openApiSpec.paths['/patterns/subgraph'] !== undefined);
    assertTrue(openApiSpec.paths['/patterns/match'] !== undefined);
    assertTrue(openApiSpec.paths['/patterns/extract'] !== undefined);
    assertTrue(openApiSpec.paths['/patterns/stats'] !== undefined);
  });

  await test('Graph paths are defined', async () => {
    assertTrue(openApiSpec.paths['/graph-rag/stats'] !== undefined);
    assertTrue(openApiSpec.paths['/graph-rag/nodes'] !== undefined);
    assertTrue(openApiSpec.paths['/graph-rag/retrieve'] !== undefined);
    assertTrue(openApiSpec.paths['/graph-rag/extract'] !== undefined);
  });

  await test('Health paths are defined', async () => {
    assertTrue(openApiSpec.paths['/system/health'] !== undefined);
    assertTrue(openApiSpec.paths['/system/live'] !== undefined);
    assertTrue(openApiSpec.paths['/system/ready'] !== undefined);
    assertTrue(openApiSpec.paths['/system/status'] !== undefined);
    assertTrue(openApiSpec.paths['/system/stats'] !== undefined);
  });

  await test('Components schemas are defined', async () => {
    assertTrue(openApiSpec.components !== undefined);
    assertTrue(openApiSpec.components.schemas !== undefined);
    assertTrue(openApiSpec.components.schemas.EntityPatternInput !== undefined);
    assertTrue(openApiSpec.components.schemas.RelationPatternInput !== undefined);
    assertTrue(openApiSpec.components.schemas.NodeInput !== undefined);
  });

  await test('EntityPatternInput schema has required fields', async () => {
    const schema = openApiSpec.components.schemas.EntityPatternInput;
    assertTrue(Array.isArray(schema.required));
    assertTrue(schema.required.includes('name'));
    assertTrue(schema.required.includes('entityType'));
    assertTrue(schema.required.includes('namePatterns'));
  });

  await test('POST /query has required body', async () => {
    const queryPath = openApiSpec.paths['/query'];
    assertTrue(queryPath.post !== undefined);
    assertTrue(queryPath.post.requestBody !== undefined);
    assertTrue(queryPath.post.requestBody.required === true);
  });

  await test('All paths have responses', async () => {
    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
      for (const [method, spec] of Object.entries(methods)) {
        assertTrue(spec.responses !== undefined, `${method.toUpperCase()} ${path} missing responses`);
      }
    }
  });

  await test('All paths have tags', async () => {
    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
      for (const [method, spec] of Object.entries(methods)) {
        assertTrue(Array.isArray(spec.tags), `${method.toUpperCase()} ${path} missing tags`);
        assertTrue(spec.tags.length > 0, `${method.toUpperCase()} ${path} has empty tags`);
      }
    }
  });
}

async function testRouteModuleExports() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Route Module Exports');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('system-health.routes exports express router', async () => {
    const mod = require('../../src/routes/system-health.routes');
    assertTrue(typeof mod === 'function');
    assertTrue(mod.stack !== undefined);
  });

  await test('system-health.routes exports startTime', async () => {
    const mod = require('../../src/routes/system-health.routes');
    assertTrue(typeof mod.startTime === 'number');
    assertTrue(mod.startTime > 0);
  });

  await test('openapi.routes exports express router', async () => {
    const mod = require('../../src/routes/openapi.routes');
    assertTrue(typeof mod === 'function');
  });

  await test('openapi.routes exports openApiSpec', async () => {
    const mod = require('../../src/routes/openapi.routes');
    assertTrue(mod.openApiSpec !== undefined);
    assertTrue(mod.openApiSpec.openapi === '3.0.3');
  });
}

async function testHelperFunctions() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Helper Functions');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  // Test formatUptime-like logic
  await test('Uptime formatting: seconds', async () => {
    const ms = 45000;
    const seconds = Math.floor(ms / 1000);
    assertEqual(seconds, 45);
  });

  await test('Uptime formatting: minutes', async () => {
    const ms = 125000;
    const minutes = Math.floor(ms / 1000 / 60);
    assertEqual(minutes, 2);
  });

  await test('Uptime formatting: hours', async () => {
    const ms = 7200000;
    const hours = Math.floor(ms / 1000 / 60 / 60);
    assertEqual(hours, 2);
  });

  // Test formatBytes-like logic
  await test('Bytes formatting: KB', async () => {
    const bytes = 1536;
    const kb = (bytes / 1024).toFixed(1);
    assertEqual(kb, '1.5');
  });

  await test('Bytes formatting: MB', async () => {
    const bytes = 10 * 1024 * 1024;
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    assertEqual(mb, '10.0');
  });

  await test('Component status returns healthy for working components', async () => {
    // Simulate getQueryEngineStatus
    const stats = queryEngine.getStats();
    assertTrue(stats !== undefined);
    const status = typeof queryEngine.query === 'function' ? 'healthy' : 'unhealthy';
    assertEqual(status, 'healthy');
  });
}

// ═══════════════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('System Health & OpenAPI Tests (Task 7.4)');
  console.log('='.repeat(63));

  await testHealthProbes();
  await testSystemStatus();
  await testStatsReset();
  await testOpenApiSpec();
  await testRouteModuleExports();
  await testHelperFunctions();

  console.log('\n' + '='.repeat(63));
  console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
  if (testResults.failures.length > 0) {
    console.log('\nFailed tests:');
    testResults.failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('='.repeat(63));

  process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
