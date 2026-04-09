/**
 * Task 9.4 — Report Generation Tests
 *
 * Tests: ReportService (summary, entity, type, relationship,
 *        comparison, timeline) + Markdown/HTML formatting + Routes
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
    console.log(`  \u2705 ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  \u274C ${name}: ${err.message}`);
  }
}

function section(name) {
  console.log(`\n\u2501\u2501\u2501 ${name} \u2501\u2501\u2501`);
}

function createTestGraphCache() {
  const nodes = new Map();
  const edges = new Map();

  nodes.set('n1', { name: 'ServiceA', type: 'System', attributes: { lang: 'JS', version: '2.0' } });
  nodes.set('n2', { name: 'ServiceB', type: 'System', attributes: { lang: 'Python' } });
  nodes.set('n3', { name: 'John', type: 'Person', attributes: {} });
  nodes.set('n4', { name: 'Doc1', type: 'Document', attributes: { format: 'PDF' } });
  nodes.set('n5', { name: 'API GW', type: 'API', attributes: {} });
  nodes.set('n6', { name: 'UserDB', type: 'Database', attributes: { engine: 'PostgreSQL' } });

  edges.set('e1', { source: 'n1', target: 'n2', type: 'USES' });
  edges.set('e2', { source: 'n1', target: 'n6', type: 'DEPENDS_ON' });
  edges.set('e3', { source: 'n3', target: 'n4', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'n5', target: 'n1', type: 'CONTAINS' });
  edges.set('e5', { source: 'n2', target: 'n6', type: 'USES' });

  return { nodes, edges, adjacency: new Map() };
}

function createMockDashboard() {
  return {
    activityLog: [
      { id: 'a1', type: 'query', data: { text: 'find services' }, timestamp: '2026-02-09T10:00:00Z' },
      { id: 'a2', type: 'extraction', data: { entities: 5 }, timestamp: '2026-02-09T10:01:00Z' },
      { id: 'a3', type: 'query', data: { text: 'list systems' }, timestamp: '2026-02-09T10:02:00Z' }
    ]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SUMMARY REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testSummaryReport() {
  section('1. Summary Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Summary: basic structure', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport();

    assert.strictEqual(report.type, 'summary');
    assert.ok(report.title);
    assert.ok(report.generatedAt);
    assert.ok(report.graph);
    assert.ok(report.nodeTypeDistribution);
    assert.ok(report.edgeTypeDistribution);
    assert.ok(report.topEntities);
    assert.ok(report.health);
  });

  await test('Summary: graph metrics', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport();

    assert.strictEqual(report.graph.totalNodes, 6);
    assert.strictEqual(report.graph.totalEdges, 5);
    assert.ok(report.graph.avgDegree > 0);
    assert.ok(report.graph.density > 0);
  });

  await test('Summary: type distributions sorted', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport();

    assert.ok(report.nodeTypeDistribution.length > 0);
    const systemType = report.nodeTypeDistribution.find(t => t.name === 'System');
    assert.strictEqual(systemType.count, 2);
    // Sorted by count desc
    for (let i = 1; i < report.nodeTypeDistribution.length; i++) {
      assert.ok(report.nodeTypeDistribution[i - 1].count >= report.nodeTypeDistribution[i].count);
    }
  });

  await test('Summary: top entities limited by topN', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ topN: 3 });

    assert.strictEqual(report.topEntities.length, 3);
    assert.ok(report.topEntities[0].degree >= report.topEntities[1].degree);
  });

  await test('Summary: health assessment', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    assert.strictEqual(svc.generateSummaryReport().health, 'healthy');

    const emptySvc = new ReportService({
      graphCache: { nodes: new Map(), edges: new Map(), adjacency: new Map() }
    });
    assert.strictEqual(emptySvc.generateSummaryReport().health, 'empty');
  });

  await test('Summary: default format is json', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport();
    assert.strictEqual(report.format, 'json');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENTITY REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testEntityReport() {
  section('2. Entity Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Entity: found entity', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    assert.strictEqual(report.type, 'entity');
    assert.strictEqual(report.found, true);
    assert.strictEqual(report.entity.id, 'n1');
    assert.strictEqual(report.entity.name, 'ServiceA');
    assert.strictEqual(report.entity.type, 'System');
  });

  await test('Entity: connections counted correctly', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    // n1 outgoing: e1(->n2), e2(->n6) = 2
    // n1 incoming: e4(n5->) = 1
    assert.strictEqual(report.connections.outgoing, 2);
    assert.strictEqual(report.connections.incoming, 1);
    assert.strictEqual(report.connections.total, 3);
  });

  await test('Entity: outgoing relations detailed', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    assert.strictEqual(report.outgoingRelations.length, 2);
    const usesRel = report.outgoingRelations.find(r => r.type === 'USES');
    assert.ok(usesRel);
    assert.strictEqual(usesRel.targetId, 'n2');
    assert.strictEqual(usesRel.targetName, 'ServiceB');
  });

  await test('Entity: incoming relations detailed', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    assert.strictEqual(report.incomingRelations.length, 1);
    assert.strictEqual(report.incomingRelations[0].type, 'CONTAINS');
    assert.strictEqual(report.incomingRelations[0].sourceId, 'n5');
  });

  await test('Entity: neighbour count and types', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    assert.strictEqual(report.neighbours, 3); // n2, n6, n5
    assert.ok(report.neighbourTypes);
    assert.ok(report.neighbourTypes['System']); // n2
  });

  await test('Entity: attributes counted', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1');

    assert.strictEqual(report.entity.attributeCount, 2); // lang, version
    assert.deepStrictEqual(report.entity.attributes, { lang: 'JS', version: '2.0' });
  });

  await test('Entity: not found', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('nonexistent');

    assert.strictEqual(report.found, false);
    assert.ok(report.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TYPE REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testTypeReport() {
  section('3. Type Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Type: System type report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('System');

    assert.strictEqual(report.type, 'type');
    assert.strictEqual(report.typeName, 'System');
    assert.strictEqual(report.count, 2);
    assert.ok(report.entities.length === 2);
  });

  await test('Type: case-insensitive', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('system');

    assert.strictEqual(report.count, 2);
  });

  await test('Type: internal vs external edges', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('System');

    // Internal: e1 (n1->n2 both System) = 1
    // External: e2(n1->n6), e4(n5->n1), e5(n2->n6) = 3
    assert.strictEqual(report.internalEdges, 1);
    assert.strictEqual(report.externalEdges, 3);
  });

  await test('Type: entities sorted by connections', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('System');

    assert.ok(report.entities[0].connections >= report.entities[1].connections);
  });

  await test('Type: avg connections', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('System');

    assert.ok(report.avgConnections > 0);
  });

  await test('Type: nonexistent type', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('NonExistent');

    assert.strictEqual(report.count, 0);
    assert.strictEqual(report.entities.length, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. RELATIONSHIP REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testRelationshipReport() {
  section('4. Relationship Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Relationship: basic structure', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateRelationshipReport();

    assert.strictEqual(report.type, 'relationship');
    assert.strictEqual(report.totalEdges, 5);
    assert.ok(report.uniqueTypes > 0);
    assert.ok(report.typeDistribution.length > 0);
    assert.ok(report.patterns.length > 0);
    assert.ok(report.strongestConnections.length > 0);
  });

  await test('Relationship: type distribution sorted', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateRelationshipReport();

    // USES appears 2 times, others 1 time each
    assert.strictEqual(report.typeDistribution[0].name, 'USES');
    assert.strictEqual(report.typeDistribution[0].count, 2);
  });

  await test('Relationship: patterns include source->target types', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateRelationshipReport();

    assert.ok(report.patterns.some(p => p.pattern.includes('System')));
    assert.ok(report.patterns[0].edgeTypes.length > 0);
  });

  await test('Relationship: strongest connections', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateRelationshipReport();

    assert.ok(report.strongestConnections.length > 0);
    assert.ok(report.strongestConnections[0].source);
    assert.ok(report.strongestConnections[0].target);
    assert.ok(report.strongestConnections[0].count > 0);
    assert.ok(report.strongestConnections[0].types.length > 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. COMPARISON REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testComparisonReport() {
  section('5. Comparison Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Comparison: two entities', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2']);

    assert.strictEqual(report.type, 'comparison');
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.entities.length, 2);
    assert.ok(report.commonNeighbours !== undefined);
    assert.ok(report.uniqueNeighbours !== undefined);
    assert.ok(report.directConnections !== undefined);
    assert.ok(typeof report.similarity === 'number');
  });

  await test('Comparison: common neighbours', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2']);

    // n1 neighbours: n2, n6, n5
    // n2 neighbours: n1, n6
    // Common (excluding compared): n6
    assert.ok(report.commonNeighbours.some(n => n.id === 'n6'));
  });

  await test('Comparison: unique neighbours', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2']);

    // n1 unique (not in n2 neighbours, excluding n1,n2): n5
    assert.ok(report.uniqueNeighbours['n1'].some(n => n.id === 'n5'));
  });

  await test('Comparison: direct connections', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2']);

    // e1: n1 -> n2 (USES)
    assert.ok(report.directConnections.length > 0);
    assert.ok(report.directConnections.some(c => c.type === 'USES'));
  });

  await test('Comparison: similarity score', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2']);

    assert.ok(report.similarity >= 0 && report.similarity <= 100);
  });

  await test('Comparison: less than 2 entities returns error', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1']);

    assert.strictEqual(report.valid, false);
    assert.ok(report.error);
  });

  await test('Comparison: three entities', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2', 'n5']);

    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.entities.length, 3);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. TIMELINE REPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testTimelineReport() {
  section('6. Timeline Report');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Timeline: with activities', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport();

    assert.strictEqual(report.type, 'timeline');
    assert.strictEqual(report.totalActivities, 3);
    assert.ok(report.activityTypes.length > 0);
    assert.ok(report.recentActivities.length > 0);
    assert.ok(report.graphSnapshot);
  });

  await test('Timeline: activity types counted', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport();

    const queryType = report.activityTypes.find(t => t.name === 'query');
    assert.ok(queryType);
    assert.strictEqual(queryType.count, 2);
  });

  await test('Timeline: recent activities with summary', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport();

    assert.ok(report.recentActivities[0].summary);
    assert.ok(report.recentActivities[0].timestamp);
  });

  await test('Timeline: limit activities', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport({ limit: 1 });

    assert.strictEqual(report.recentActivities.length, 1);
  });

  await test('Timeline: without dashboard returns empty', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: null
    });
    const report = svc.generateTimelineReport();

    assert.strictEqual(report.totalActivities, 0);
  });

  await test('Timeline: graph snapshot', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport();

    assert.strictEqual(report.graphSnapshot.nodes, 6);
    assert.strictEqual(report.graphSnapshot.edges, 5);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. MARKDOWN FORMAT
// ═══════════════════════════════════════════════════════════════════════════

async function testMarkdownFormat() {
  section('7. Markdown Format');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Markdown: summary report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ format: 'markdown' });

    assert.strictEqual(report.format, 'markdown');
    assert.ok(report.formatted);
    assert.ok(report.formatted.includes('# Knowledge Graph Summary Report'));
    assert.ok(report.formatted.includes('| Nodes | 6 |'));
    assert.ok(report.formatted.includes('## Node Type Distribution'));
  });

  await test('Markdown: entity report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1', { format: 'markdown' });

    assert.ok(report.formatted.includes('# Entity Report: ServiceA'));
    assert.ok(report.formatted.includes('### Outgoing Relations'));
    assert.ok(report.formatted.includes('USES'));
  });

  await test('Markdown: type report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateTypeReport('System', { format: 'markdown' });

    assert.ok(report.formatted.includes('# Type Report: System'));
    assert.ok(report.formatted.includes('**Count:** 2'));
  });

  await test('Markdown: relationship report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateRelationshipReport({ format: 'markdown' });

    assert.ok(report.formatted.includes('# Relationship Analysis Report'));
    assert.ok(report.formatted.includes('## Type Distribution'));
  });

  await test('Markdown: comparison report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateComparisonReport(['n1', 'n2'], { format: 'markdown' });

    assert.ok(report.formatted.includes('# Entity Comparison Report'));
    assert.ok(report.formatted.includes('**Similarity:**'));
  });

  await test('Markdown: timeline report', () => {
    const svc = new ReportService({
      graphCache: createTestGraphCache(),
      dashboardService: createMockDashboard()
    });
    const report = svc.generateTimelineReport({ format: 'markdown' });

    assert.ok(report.formatted.includes('# Activity Timeline Report'));
    assert.ok(report.formatted.includes('**Total Activities:** 3'));
  });

  await test('Markdown: error report', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('nope', { format: 'markdown' });

    assert.ok(report.formatted.includes('**Error:**'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. HTML FORMAT
// ═══════════════════════════════════════════════════════════════════════════

async function testHTMLFormat() {
  section('8. HTML Format');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('HTML: basic structure', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ format: 'html' });

    assert.strictEqual(report.format, 'html');
    assert.ok(report.formatted.includes('<!DOCTYPE html>'));
    assert.ok(report.formatted.includes('<html>'));
    assert.ok(report.formatted.includes('</html>'));
    assert.ok(report.formatted.includes('<title>'));
  });

  await test('HTML: contains tables', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ format: 'html' });

    assert.ok(report.formatted.includes('<table>'));
    assert.ok(report.formatted.includes('<th>'));
    assert.ok(report.formatted.includes('<td>'));
  });

  await test('HTML: headings converted', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ format: 'html' });

    assert.ok(report.formatted.includes('<h1>'));
    assert.ok(report.formatted.includes('<h2>'));
  });

  await test('HTML: styling included', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateSummaryReport({ format: 'html' });

    assert.ok(report.formatted.includes('<style>'));
    assert.ok(report.formatted.includes('border-collapse'));
  });

  await test('HTML: entity report with lists', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    const report = svc.generateEntityReport('n1', { format: 'html' });

    assert.ok(report.formatted.includes('<strong>'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. REPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testReportRoutes() {
  section('9. Report Routes');

  const { reportService } = require('../../src/services/visualization');
  reportService._graphCache = createTestGraphCache();
  reportService._explicit = new Set(['graphCache', 'dashboardService']);
  reportService._dashboardService = createMockDashboard();

  const reportRoutes = require('../../src/routes/report.routes');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', reportRoutes);

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
    return { status: response.status, data: await response.json(), response };
  };

  const fetchRaw = async (url) => {
    const response = await fetch(`${baseUrl}${url}`);
    return { status: response.status, text: await response.text(), headers: response.headers };
  };

  await test('GET /formats returns formats and report types', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/formats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.formats.length, 3);
    assert.strictEqual(data.reportTypes.length, 6);
  });

  await test('GET /summary returns summary report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/summary');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.type, 'summary');
    assert.strictEqual(data.graph.totalNodes, 6);
  });

  await test('GET /summary?format=markdown returns markdown', async () => {
    const { status, text, headers } = await fetchRaw('/api/v1/reports/summary?format=markdown');
    assert.strictEqual(status, 200);
    assert.ok(headers.get('content-type').includes('text/markdown'));
    assert.ok(text.includes('# Knowledge Graph Summary Report'));
  });

  await test('GET /summary?format=html returns HTML', async () => {
    const { status, text, headers } = await fetchRaw('/api/v1/reports/summary?format=html');
    assert.strictEqual(status, 200);
    assert.ok(headers.get('content-type').includes('text/html'));
    assert.ok(text.includes('<!DOCTYPE html>'));
  });

  await test('GET /entity/:id returns entity report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/entity/n1');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.found, true);
    assert.strictEqual(data.entity.name, 'ServiceA');
  });

  await test('GET /entity/:id not found', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/entity/nope');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.found, false);
  });

  await test('GET /type/:type returns type report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/type/System');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 2);
  });

  await test('GET /relationships returns relationship report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/relationships');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.totalEdges, 5);
  });

  await test('POST /comparison returns comparison report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/comparison', {
      method: 'POST',
      body: JSON.stringify({ entityIds: ['n1', 'n2'] })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.valid, true);
    assert.ok(data.commonNeighbours);
  });

  await test('POST /comparison rejects < 2 entities', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/comparison', {
      method: 'POST',
      body: JSON.stringify({ entityIds: ['n1'] })
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('GET /timeline returns timeline report', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/timeline');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.totalActivities, 3);
  });

  await test('GET /stats returns generation stats', async () => {
    const { status, data } = await fetchJson('/api/v1/reports/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats.totalReports > 0);
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. STATS & MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function testStatsAndExports() {
  section('10. Stats & Module Exports');

  const { ReportService } = require('../../src/services/visualization/report.service');

  await test('Stats tracked per report type', () => {
    const svc = new ReportService({ graphCache: createTestGraphCache() });
    svc.generateSummaryReport();
    svc.generateSummaryReport();
    svc.generateEntityReport('n1');
    svc.generateRelationshipReport();

    const stats = svc.getStats();
    assert.strictEqual(stats.totalReports, 4);
    assert.strictEqual(stats.byType.summary, 2);
    assert.strictEqual(stats.byType.entity, 1);
    assert.strictEqual(stats.byType.relationship, 1);
  });

  await test('Module exports ReportService', () => {
    const mod = require('../../src/services/visualization');
    assert.ok(mod.ReportService);
    assert.ok(mod.reportService);
    assert.ok(mod.reportService instanceof mod.ReportService);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  Task 9.4 \u2014 Report Generation                  \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');

  await testSummaryReport();
  await testEntityReport();
  await testTypeReport();
  await testRelationshipReport();
  await testComparisonReport();
  await testTimelineReport();
  await testMarkdownFormat();
  await testHTMLFormat();
  await testReportRoutes();
  await testStatsAndExports();

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

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
