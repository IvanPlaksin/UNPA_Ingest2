/**
 * Task 9.2 — Dashboard Metrics & Analytics Tests
 *
 * Tests: DashboardService (overview, graph metrics, query analytics,
 *        extraction analytics, top entities/relations, activity,
 *        time-series, system status) + Dashboard Routes
 */

const assert = require('assert');
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

function createTestGraphCache() {
  const nodes = new Map();
  const edges = new Map();
  const adjacency = new Map();

  nodes.set('n1', { name: 'ServiceA', type: 'System', attributes: { lang: 'JS' } });
  nodes.set('n2', { name: 'ServiceB', type: 'System', attributes: {} });
  nodes.set('n3', { name: 'John', type: 'Person', attributes: {} });
  nodes.set('n4', { name: 'Doc1', type: 'Document', attributes: {} });
  nodes.set('n5', { name: 'API GW', type: 'API', attributes: {} });
  nodes.set('n6', { name: 'UserDB', type: 'Database', attributes: {} });

  edges.set('e1', { source: 'n1', target: 'n2', type: 'USES' });
  edges.set('e2', { source: 'n1', target: 'n6', type: 'DEPENDS_ON' });
  edges.set('e3', { source: 'n3', target: 'n4', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'n5', target: 'n1', type: 'CONTAINS' });
  edges.set('e5', { source: 'n2', target: 'n6', type: 'USES' });

  return { nodes, edges, adjacency };
}

function createMockQueryEngine() {
  return {
    getStats: () => ({
      totalQueries: 100,
      successfulQueries: 90,
      failedQueries: 10,
      avgQueryTime: 42,
      cacheHits: 60,
      cacheMisses: 40,
      byIntent: { search: 50, analyze: 30, aggregate: 20 },
      byMode: { graph: 70, vector: 30 },
      cache: { size: 50, maxSize: 200, hitRate: '60%' }
    })
  };
}

function createMockExtractor() {
  return {
    getStats: () => ({
      totalExtractions: 50,
      nodesAdded: 200,
      edgesAdded: 150,
      patternsLearned: 10
    })
  };
}

function createMockPatternLibrary() {
  return {
    getStats: () => ({
      entityPatterns: 15,
      relationPatterns: 10,
      subgraphPatterns: 5,
      total: 30
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD SERVICE — OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════

async function testOverview() {
  section('1. Overview');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('getOverview returns all sections', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      queryEngine: createMockQueryEngine(),
      extractor: createMockExtractor(),
      patternLibrary: createMockPatternLibrary()
    });

    const overview = svc.getOverview();
    assert.ok(overview.graph);
    assert.ok(overview.queries);
    assert.ok(overview.extraction);
    assert.ok(overview.patterns);
    assert.ok(overview.health);
    assert.ok(overview.timestamp);
  });

  await test('Overview graph section has correct counts', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const overview = svc.getOverview();
    assert.strictEqual(overview.graph.nodes, 6);
    assert.strictEqual(overview.graph.edges, 5);
    assert.ok(overview.graph.nodeTypes > 0);
    assert.ok(overview.graph.edgeTypes > 0);
  });

  await test('Overview query section uses mock data', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      queryEngine: createMockQueryEngine()
    });
    const overview = svc.getOverview();
    assert.strictEqual(overview.queries.total, 100);
    assert.strictEqual(overview.queries.successful, 90);
    assert.strictEqual(overview.queries.successRate, '90%');
  });

  await test('Overview extraction section', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      extractor: createMockExtractor()
    });
    const overview = svc.getOverview();
    assert.strictEqual(overview.extraction.total, 50);
    assert.strictEqual(overview.extraction.entities, 200);
  });

  await test('Overview patterns section', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      patternLibrary: createMockPatternLibrary()
    });
    const overview = svc.getOverview();
    assert.strictEqual(overview.patterns.total, 30);
    assert.strictEqual(overview.patterns.entityPatterns, 15);
  });

  await test('Health returns healthy when all available', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      queryEngine: createMockQueryEngine(),
      patternLibrary: createMockPatternLibrary()
    });
    const overview = svc.getOverview();
    assert.strictEqual(overview.health, 'healthy');
  });

  await test('Health returns degraded when partial', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      queryEngine: null,
      patternLibrary: null
    });
    const overview = svc.getOverview();
    assert.strictEqual(overview.health, 'degraded');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GRAPH METRICS
// ═══════════════════════════════════════════════════════════════════════════

async function testGraphMetrics() {
  section('2. Graph Metrics');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('Graph metrics summary', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const metrics = svc.getGraphMetrics();

    assert.strictEqual(metrics.summary.totalNodes, 6);
    assert.strictEqual(metrics.summary.totalEdges, 5);
    assert.ok(metrics.summary.avgDegree > 0);
    assert.ok(metrics.summary.maxDegree > 0);
    assert.ok(metrics.summary.density > 0);
  });

  await test('Node type distribution', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const metrics = svc.getGraphMetrics();

    assert.ok(metrics.nodeTypeDistribution.length > 0);
    const systemType = metrics.nodeTypeDistribution.find(t => t.name === 'System');
    assert.ok(systemType);
    assert.strictEqual(systemType.count, 2);
    assert.ok(systemType.percentage > 0);
  });

  await test('Edge type distribution', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const metrics = svc.getGraphMetrics();

    assert.ok(metrics.edgeTypeDistribution.length > 0);
    const usesType = metrics.edgeTypeDistribution.find(t => t.name === 'USES');
    assert.ok(usesType);
    assert.strictEqual(usesType.count, 2);
  });

  await test('Hub nodes (top degree)', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const metrics = svc.getGraphMetrics();

    assert.ok(metrics.hubs.length > 0);
    // n1 (ServiceA) connects to n2, n6, n5 = degree 3
    const topHub = metrics.hubs[0];
    assert.ok(topHub.degree >= 2);
    assert.ok(topHub.name);
    assert.ok(topHub.type);
  });

  await test('Density calculation', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const metrics = svc.getGraphMetrics();
    // 6 nodes: max edges = 15, actual = 5, density = 5/15 = 0.3333
    assert.ok(metrics.summary.density > 0 && metrics.summary.density <= 1);
  });

  await test('Empty graph metrics', () => {
    const svc = new DashboardService({
      graphCache: { nodes: new Map(), edges: new Map(), adjacency: new Map() }
    });
    const metrics = svc.getGraphMetrics();
    assert.strictEqual(metrics.summary.totalNodes, 0);
    assert.strictEqual(metrics.summary.density, 0);
    assert.strictEqual(metrics.hubs.length, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUERY ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

async function testQueryAnalytics() {
  section('3. Query Analytics');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('Query analytics with mock engine', () => {
    const svc = new DashboardService({ queryEngine: createMockQueryEngine() });
    const analytics = svc.getQueryAnalytics();

    assert.strictEqual(analytics.summary.totalQueries, 100);
    assert.strictEqual(analytics.summary.successfulQueries, 90);
    assert.strictEqual(analytics.summary.successRate, '90%');
    assert.strictEqual(analytics.summary.avgResponseTime, 42);
    assert.strictEqual(analytics.summary.cacheHits, 60);
    assert.strictEqual(analytics.summary.cacheHitRate, '60%');
  });

  await test('Intent distribution', () => {
    const svc = new DashboardService({ queryEngine: createMockQueryEngine() });
    const analytics = svc.getQueryAnalytics();

    assert.ok(analytics.intentDistribution.length === 3);
    assert.ok(analytics.intentDistribution[0].name === 'search');
    assert.strictEqual(analytics.intentDistribution[0].count, 50);
  });

  await test('Mode distribution', () => {
    const svc = new DashboardService({ queryEngine: createMockQueryEngine() });
    const analytics = svc.getQueryAnalytics();

    assert.ok(analytics.modeDistribution.length === 2);
  });

  await test('Cache stats', () => {
    const svc = new DashboardService({ queryEngine: createMockQueryEngine() });
    const analytics = svc.getQueryAnalytics();

    assert.strictEqual(analytics.cache.size, 50);
    assert.strictEqual(analytics.cache.maxSize, 200);
    assert.strictEqual(analytics.cache.hitRate, '60%');
  });

  await test('Query analytics without engine returns defaults', () => {
    const svc = new DashboardService({ queryEngine: null });
    const analytics = svc.getQueryAnalytics();

    assert.strictEqual(analytics.summary.totalQueries, 0);
    assert.strictEqual(analytics.summary.successRate, '0%');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXTRACTION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

async function testExtractionAnalytics() {
  section('4. Extraction Analytics');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('Extraction analytics with mock extractor', () => {
    const svc = new DashboardService({ extractor: createMockExtractor() });
    const analytics = svc.getExtractionAnalytics();

    assert.strictEqual(analytics.summary.totalExtractions, 50);
    assert.strictEqual(analytics.summary.entitiesExtracted, 200);
    assert.strictEqual(analytics.summary.relationsExtracted, 150);
  });

  await test('Ingestion stats', () => {
    const mockIngestion = {
      getStats: () => ({
        totalIngested: 25,
        totalChunks: 100,
        totalEntities: 150,
        totalRelations: 80,
        byFormat: { '.txt': 15, '.md': 10 },
        errors: 2
      })
    };
    const svc = new DashboardService({ ingestionPipeline: mockIngestion });
    const analytics = svc.getExtractionAnalytics();

    assert.strictEqual(analytics.ingestion.totalIngested, 25);
    assert.strictEqual(analytics.ingestion.totalChunks, 100);
    assert.strictEqual(analytics.ingestion.errors, 2);
  });

  await test('Extraction analytics without services returns defaults', () => {
    const svc = new DashboardService({ extractor: null, ingestionPipeline: null });
    const analytics = svc.getExtractionAnalytics();

    assert.strictEqual(analytics.summary.totalExtractions, 0);
    assert.strictEqual(analytics.ingestion.totalIngested, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. TOP ENTITIES & RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function testTopEntitiesRelations() {
  section('5. Top Entities & Relations');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('Top entities sorted by connections', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopEntities({ limit: 3, sortBy: 'connections' });

    assert.strictEqual(result.entities.length, 3);
    assert.strictEqual(result.total, 6);
    assert.strictEqual(result.sortBy, 'connections');
    // First should have most connections
    assert.ok(result.entities[0].connections >= result.entities[1].connections);
  });

  await test('Top entities sorted by name', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopEntities({ sortBy: 'name' });

    assert.ok(result.entities.length > 0);
    assert.strictEqual(result.sortBy, 'name');
  });

  await test('Top entities include attributes count', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopEntities();

    const n1 = result.entities.find(e => e.id === 'n1');
    assert.ok(n1);
    assert.strictEqual(n1.attributes, 1); // { lang: 'JS' }
  });

  await test('Top relations sorted by frequency', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopRelations();

    assert.ok(result.relations.length > 0);
    assert.strictEqual(result.total, 5);
    assert.ok(result.uniqueTypes >= 3);
    // First should have highest count
    assert.ok(result.relations[0].count >= result.relations[1].count);
  });

  await test('Top relations include examples', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopRelations();

    const usesRelation = result.relations.find(r => r.type === 'USES');
    assert.ok(usesRelation);
    assert.ok(usesRelation.examples.length > 0);
    assert.ok(usesRelation.examples[0].source);
    assert.ok(usesRelation.examples[0].target);
  });

  await test('Top relations percentage', () => {
    const svc = new DashboardService({ graphCache: createTestGraphCache() });
    const result = svc.getTopRelations();

    for (const rel of result.relations) {
      assert.ok(rel.percentage);
    }
  });

  await test('Empty graph top entities', () => {
    const svc = new DashboardService({
      graphCache: { nodes: new Map(), edges: new Map(), adjacency: new Map() }
    });
    const result = svc.getTopEntities();
    assert.strictEqual(result.entities.length, 0);
    assert.strictEqual(result.total, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ACTIVITY & TIME-SERIES
// ═══════════════════════════════════════════════════════════════════════════

async function testActivityTimeSeries() {
  section('6. Activity & Time-Series');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('logActivity records activities', () => {
    const svc = new DashboardService();
    svc.logActivity('query', { text: 'test query' });
    svc.logActivity('extraction', { entities: 5 });
    svc.logActivity('query', { text: 'another query' });

    const recent = svc.getRecentActivity();
    assert.strictEqual(recent.total, 3);
    assert.strictEqual(recent.activities.length, 3);
    // Most recent first
    assert.strictEqual(recent.activities[0].type, 'query');
    assert.ok(recent.activities[0].id.startsWith('act_'));
    assert.ok(recent.activities[0].timestamp);
  });

  await test('Activity filter by type', () => {
    const svc = new DashboardService();
    svc.logActivity('query', { text: 'q1' });
    svc.logActivity('extraction', { entities: 5 });
    svc.logActivity('query', { text: 'q2' });

    const queryActivities = svc.getRecentActivity({ type: 'query' });
    assert.strictEqual(queryActivities.total, 2);
    assert.ok(queryActivities.activities.every(a => a.type === 'query'));
  });

  await test('Activity limit works', () => {
    const svc = new DashboardService();
    for (let i = 0; i < 10; i++) svc.logActivity('test', { i });

    const limited = svc.getRecentActivity({ limit: 3 });
    assert.strictEqual(limited.activities.length, 3);
  });

  await test('Activity log capped at maxActivityLog', () => {
    const svc = new DashboardService({ maxActivityLog: 5 });
    for (let i = 0; i < 10; i++) svc.logActivity('test', { i });

    assert.strictEqual(svc.activityLog.length, 5);
    // Most recent activities should be kept
    assert.strictEqual(svc.activityLog[0].data.i, 9);
  });

  await test('recordMetric stores time-series data', () => {
    const svc = new DashboardService();
    svc.recordMetric('queries', { count: 10, avgTime: 50 });
    svc.recordMetric('queries', { count: 15, avgTime: 45 });

    assert.strictEqual(svc.timeSeries.queries.length, 2);
    assert.strictEqual(svc.timeSeries.queries[0].count, 10);
  });

  await test('Time-series capped at maxTimeSeriesPoints', () => {
    const svc = new DashboardService({ maxTimeSeriesPoints: 5 });
    for (let i = 0; i < 10; i++) svc.recordMetric('queries', { count: i });

    assert.strictEqual(svc.timeSeries.queries.length, 5);
    // Most recent should be kept
    assert.strictEqual(svc.timeSeries.queries[0].count, 5);
  });

  await test('recordMetric ignores unknown series', () => {
    const svc = new DashboardService();
    svc.recordMetric('nonexistent', { data: 1 });
    assert.strictEqual(svc.timeSeries.nonexistent, undefined);
  });

  await test('getStats returns time-series and activity counts', () => {
    const svc = new DashboardService();
    svc.recordMetric('queries', { count: 1 });
    svc.logActivity('test', {});

    const stats = svc.getStats();
    assert.strictEqual(stats.timeSeriesPoints.queries, 1);
    assert.strictEqual(stats.activityLogSize, 1);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. SYSTEM STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function testSystemStatus() {
  section('7. System Status');

  const { DashboardService } = require('../../src/services/visualization/dashboard.service');

  await test('System status returns uptime and memory', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache()
    });
    const status = svc.getSystemStatus();

    assert.ok(status.uptime > 0);
    assert.ok(status.memory.heapUsed);
    assert.ok(status.memory.heapTotal);
    assert.ok(status.memory.rss);
    assert.ok(status.memory.heapUsedPercent > 0);
    assert.ok(status.timestamp);
  });

  await test('System status shows component health', () => {
    const svc = new DashboardService({
      graphCache: createTestGraphCache(),
      queryEngine: createMockQueryEngine(),
      extractor: createMockExtractor(),
      patternLibrary: createMockPatternLibrary()
    });
    const status = svc.getSystemStatus();

    assert.strictEqual(status.components.graph, 'healthy');
    assert.strictEqual(status.components.query, 'healthy');
    assert.strictEqual(status.components.extraction, 'healthy');
    assert.strictEqual(status.components.patterns, 'healthy');
  });

  await test('System status shows unavailable for missing components', () => {
    const svc = new DashboardService({
      graphCache: { nodes: new Map(), edges: new Map(), adjacency: new Map() },
      queryEngine: null,
      extractor: null
    });
    const status = svc.getSystemStatus();

    assert.strictEqual(status.components.graph, 'empty');
    assert.strictEqual(status.components.query, 'unavailable');
    assert.strictEqual(status.components.extraction, 'unavailable');
  });

  await test('Memory formatting', () => {
    const svc = new DashboardService();
    assert.strictEqual(svc._formatBytes(500), '500 B');
    assert.strictEqual(svc._formatBytes(2048), '2.0 KB');
    assert.strictEqual(svc._formatBytes(5 * 1024 * 1024), '5.0 MB');
    assert.strictEqual(svc._formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testDashboardRoutes() {
  section('8. Dashboard Routes');

  // Inject test data into singleton
  const { dashboardService } = require('../../src/services/visualization');
  dashboardService._graphCache = createTestGraphCache();
  dashboardService._queryEngine = createMockQueryEngine();
  dashboardService._extractor = createMockExtractor();
  dashboardService._patternLibrary = createMockPatternLibrary();
  dashboardService._ingestionPipeline = { getStats: () => ({ totalIngested: 10, totalChunks: 40 }) };

  const dashboardRoutes = require('../../src/routes/dashboard.routes');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/dashboard', dashboardRoutes);

  let server, baseUrl;
  await new Promise(resolve => {
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

  await test('GET /overview returns overview', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/overview');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.graph);
    assert.ok(data.queries);
    assert.ok(data.extraction);
  });

  await test('GET /graph returns graph metrics', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/graph');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.summary.totalNodes, 6);
    assert.ok(data.hubs.length > 0);
  });

  await test('GET /queries returns query analytics', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/queries');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.summary.totalQueries, 100);
  });

  await test('GET /extraction returns extraction analytics', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/extraction');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.ingestion.totalIngested, 10);
  });

  await test('GET /top-entities returns entities', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/top-entities?limit=3');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.entities.length, 3);
  });

  await test('GET /top-relations returns relations', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/top-relations');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.relations.length > 0);
  });

  await test('POST /activity logs and GET /activity retrieves', async () => {
    const { status: postStatus, data: postData } = await fetchJson('/api/v1/dashboard/activity', {
      method: 'POST',
      body: JSON.stringify({ type: 'test', data: { msg: 'hello' } })
    });
    assert.strictEqual(postStatus, 201);
    assert.strictEqual(postData.success, true);
    assert.ok(postData.activity.id);

    const { status: getStatus, data: getData } = await fetchJson('/api/v1/dashboard/activity');
    assert.strictEqual(getStatus, 200);
    assert.ok(getData.activities.length > 0);
  });

  await test('POST /activity rejects missing type', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/activity', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('GET /system returns system status', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/system');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.uptime > 0);
    assert.ok(data.memory);
    assert.ok(data.components);
  });

  await test('GET /stats returns dashboard stats', async () => {
    const { status, data } = await fetchJson('/api/v1/dashboard/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats);
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function testModuleExports() {
  section('9. Module Exports');

  await test('visualization/index.js exports DashboardService', () => {
    const mod = require('../../src/services/visualization');
    assert.ok(mod.DashboardService);
    assert.ok(mod.dashboardService);
    assert.ok(mod.dashboardService instanceof mod.DashboardService);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Task 9.2 — Dashboard Metrics & Analytics       ║');
  console.log('╚══════════════════════════════════════════════════╝');

  await testOverview();
  await testGraphMetrics();
  await testQueryAnalytics();
  await testExtractionAnalytics();
  await testTopEntitiesRelations();
  await testActivityTimeSeries();
  await testSystemStatus();
  await testDashboardRoutes();
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
