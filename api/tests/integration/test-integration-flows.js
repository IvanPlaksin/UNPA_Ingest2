/**
 * Integration Tests - E2E Flows (Task 10.1)
 *
 * Tests 5 cross-service flows using ONLY in-memory services:
 *   Flow 1: TextChunker → EntityExtractor (regex) → GraphVizService → Dashboard query
 *   Flow 2: EntityExtractor → GraphVizService → GraphExportService (all 6 formats)
 *   Flow 3: FileSystemConnector → chunk → extract → ReportService
 *   Flow 4: DashboardService activity logging → ReportService timeline
 *   Flow 5: Full lifecycle (chunk → extract → graph → export → report → dashboard)
 *
 * NO external dependencies: no Neo4j, Qdrant, Redis, Ollama, etc.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Test framework ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('═'.repeat(60));
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function assertIncludes(str, sub, msg) {
  if (typeof str !== 'string' || !str.includes(sub))
    throw new Error(msg || `Expected string to include "${sub}"`);
}

function assertGte(a, b, msg) {
  if (a < b) throw new Error(msg || `Expected ${a} >= ${b}`);
}

// ── Imports ─────────────────────────────────────────────────────────────────
const { TextChunker } = require('../../src/services/chunking/text-chunker');
const { EntityExtractor, ENTITY_TYPES } = require('../../src/services/extraction/entity-extractor');
const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
const { GraphExportService } = require('../../src/services/visualization/export.service');
const { DashboardService } = require('../../src/services/visualization/dashboard.service');
const { ReportService } = require('../../src/services/visualization/report.service');

// ── Shared test data ────────────────────────────────────────────────────────
const SAMPLE_DOC = `
# UN Peacekeeping Reform Report

## 1. Executive Summary

The United Nations Department of Peace Operations (UNDPO) has launched a comprehensive
reform initiative. This document, A/RES/74/100, outlines the key findings.

UNICEF and UNESCO have been collaborating on education programs in conflict zones.
The Secretary-General submitted recommendations to the General Assembly on 2024-01-15.

## 2. Systems Overview

Key systems include Umoja (ERP), Inspira (HR), Unite Docs (document management),
and iNeed (procurement). The API endpoint at /api/v1/peacekeeping handles all requests.

Work item #12345 tracks the migration of Unite Docs data. The technical lead
(john.doe@un.org) coordinated with the DevOps team.

## 3. Budget Analysis

The budget for FY2024 is $2.4 billion across 12 peacekeeping missions.
MONUSCO accounts for 15% of the total. UNMISS and MINUSMA follow at 12% and 10%.

Version 3.2.1 of the reporting framework was deployed to /opt/unpa/reports.
Database connections use PostgreSQL 15 on port 5432.
`;

const SAMPLE_DOC_2 = `
# Technology Infrastructure Assessment

## Overview

The Office of Information and Communications Technology (OICT) manages the
core infrastructure. Systems like Umoja and Unite Docs require high availability.

Contact: jane.smith@un.org, Work item #67890 for the infra upgrade project.

## Recommendations

Deploy Unite Apps v2.0 to improve document workflow. A/RES/75/200 mandates
the digital transformation timeline. Budget ref: ST/SGB/2024/5.
`;

function createSharedGraphCache() {
  return {
    nodes: new Map(),
    edges: new Map(),
    adjacency: new Map()
  };
}

// ── Helper: populate graphCache from extraction results ─────────────────────
function populateGraphFromExtraction(graphCache, extractionResult, docId = 'doc1') {
  // Add document node
  graphCache.nodes.set(docId, {
    name: docId,
    type: 'Document',
    attributes: { source: 'integration-test' }
  });

  // Add entity nodes
  for (const entity of extractionResult.entities) {
    const nodeId = `entity_${entity.normalizedForm.replace(/[^a-z0-9]/gi, '_')}`;
    if (!graphCache.nodes.has(nodeId)) {
      graphCache.nodes.set(nodeId, {
        name: entity.name,
        type: entity.type,
        attributes: {
          confidence: entity.confidence,
          source: entity.source,
          normalizedForm: entity.normalizedForm,
          ...(entity.category ? { category: entity.category } : {}),
          ...(entity.fullName ? { fullName: entity.fullName } : {})
        }
      });

      // Add edge: document -> entity
      const edgeId = `e_${docId}_${nodeId}`;
      graphCache.edges.set(edgeId, {
        source: docId,
        target: nodeId,
        type: 'CONTAINS_ENTITY'
      });
    }
  }

  // Add relationships as edges
  for (const rel of extractionResult.relationships) {
    const relId = `rel_${rel.source}_${rel.target}_${rel.type}`.replace(/[^a-z0-9_]/gi, '_');
    if (!graphCache.edges.has(relId)) {
      graphCache.edges.set(relId, {
        source: rel.source,
        target: rel.target,
        type: rel.type || 'RELATED_TO'
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 1: TextChunker → EntityExtractor → GraphVizService → Dashboard
// ══════════════════════════════════════════════════════════════════════════════

async function testFlow1() {
  section('Flow 1: Ingestion → Graph → Query');

  const chunker = new TextChunker({ maxTokens: 256, overlapTokens: 20 });
  const extractor = new EntityExtractor({ useRegex: true, useLLM: false });
  const graphCache = createSharedGraphCache();

  // Step 1: Chunk the document
  let chunks;
  test('Chunker splits document into multiple chunks', () => {
    chunks = chunker.chunk(SAMPLE_DOC);
    assertGte(chunks.length, 2, `Expected >= 2 chunks, got ${chunks.length}`);
    assert(chunks.every(c => c.content && c.content.length > 0), 'All chunks have content');
  });

  test('Chunks have metadata', () => {
    assert(chunks[0].index !== undefined, 'Chunk has index');
    assert(chunks[0].tokenEstimate > 0, 'Chunk has token estimate');
    assert(chunks[0].startOffset !== undefined, 'Chunk has startOffset');
  });

  // Step 2: Extract entities from each chunk
  let allEntities = [];
  await asyncTest('EntityExtractor extracts from all chunks', async () => {
    for (const chunk of chunks) {
      const result = await extractor.extract(chunk.content);
      allEntities.push(...result.entities);
    }
    assert(allEntities.length > 0, `Expected entities, got ${allEntities.length}`);
  });

  test('Extracted entities include organizations', () => {
    const orgs = allEntities.filter(e => e.type === ENTITY_TYPES.ORGANIZATION);
    assert(orgs.length > 0, 'Expected organization entities');
    const orgNames = orgs.map(o => o.name);
    assert(orgNames.some(n => /UNICE|UNESCO|UNDPO/i.test(n)), `Expected UN orgs, got: ${orgNames.join(', ')}`);
  });

  test('Extracted entities include documents', () => {
    const docs = allEntities.filter(e => e.type === ENTITY_TYPES.DOCUMENT);
    assert(docs.length > 0, 'Expected document entities');
  });

  test('Extracted entities include work items', () => {
    const wis = allEntities.filter(e => e.type === ENTITY_TYPES.WORK_ITEM_REF);
    assert(wis.length > 0, 'Expected work item references');
    assert(wis.some(w => w.workItemId === '12345'), 'WI #12345 found');
  });

  test('Extracted entities include emails', () => {
    const emails = allEntities.filter(e =>
      e.type === ENTITY_TYPES.EMAIL || e.type === ENTITY_TYPES.PERSON
    );
    assert(emails.length > 0, 'Expected email/person entities');
  });

  // Step 3: Populate graph
  test('Populate GraphVizService from extraction results', () => {
    populateGraphFromExtraction(graphCache, { entities: allEntities, relationships: [] });
    assertGte(graphCache.nodes.size, 5, `Expected >= 5 nodes, got ${graphCache.nodes.size}`);
    assertGte(graphCache.edges.size, 4, `Expected >= 4 edges, got ${graphCache.edges.size}`);
  });

  // Step 4: Query via GraphVizService
  const vizService = new GraphVizService({ graphCache });

  test('GraphVizService returns full graph', () => {
    const graph = vizService.getGraph({ format: 'd3' });
    assertGte(graph.nodes.length, 5, `Expected >= 5 vis nodes, got ${graph.nodes.length}`);
    assertGte(graph.edges.length, 4, `Expected >= 4 vis edges, got ${graph.edges.length}`);
    assertEqual(graph.metadata.format, 'd3', 'Format is d3');
  });

  test('GraphVizService supports filtering by node type', () => {
    const graph = vizService.getFilteredGraph({ nodeTypes: ['Document'] });
    assertGte(graph.nodes.length, 1, 'At least 1 Document node');
  });

  test('GraphVizService supports search', () => {
    const result = vizService.getFilteredGraph({ search: 'UNICEF' });
    assertGte(result.nodes.length, 1, 'UNICEF found in search');
  });

  // Step 5: Dashboard sees the data
  const dashboard = new DashboardService({
    graphCache,
    queryEngine: null,
    extractor: null,
    patternLibrary: null,
    jobQueue: null,
    ingestionPipeline: null,
    sourceManager: null
  });

  test('DashboardService.getOverview reflects graph data', () => {
    const overview = dashboard.getOverview();
    assertGte(overview.graph.nodes, 5, `Overview shows >= 5 nodes, got ${overview.graph.nodes}`);
    assertGte(overview.graph.edges, 4, `Overview shows >= 4 edges, got ${overview.graph.edges}`);
  });

  test('DashboardService.getGraphMetrics shows type distribution', () => {
    const metrics = dashboard.getGraphMetrics();
    assert(Array.isArray(metrics.nodeTypeDistribution), 'Has node type distribution array');
    assert(metrics.nodeTypeDistribution.some(t => t.name === 'Document'), 'Document type in distribution');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 2: Extraction → Visualization → Export (all 6 formats)
// ══════════════════════════════════════════════════════════════════════════════

async function testFlow2() {
  section('Flow 2: Extraction → Visualization → Export');

  const extractor = new EntityExtractor({ useRegex: true, useLLM: false });
  const graphCache = createSharedGraphCache();

  // Extract entities from doc
  await asyncTest('Extract entities for graph', async () => {
    const result = await extractor.extract(SAMPLE_DOC);
    populateGraphFromExtraction(graphCache, result, 'report-doc');
    assertGte(graphCache.nodes.size, 3, 'Graph populated');
  });

  const vizService = new GraphVizService({ graphCache });
  const exportService = new GraphExportService({ graphCache });

  test('Visualization: d3 format export', () => {
    const g = vizService.getGraph({ format: 'd3' });
    assert(g.nodes.length > 0, 'D3 nodes exist');
    assert(g.nodes[0].id !== undefined, 'D3 node has id');
  });

  test('Visualization: cytoscape format export', () => {
    const g = vizService.getGraph({ format: 'cytoscape' });
    assert(g.nodes.length > 0, 'Cytoscape nodes exist');
    assert(g.nodes[0].data !== undefined, 'Cytoscape node has data wrapper');
  });

  // Test all 6 export formats
  test('Export: Cypher format', () => {
    const result = exportService.export('cypher');
    assert(result.content, 'Has content');
    assertIncludes(result.content, 'CREATE', 'Contains CREATE statements');
    assertIncludes(result.contentType, 'cypher', 'Content type is cypher');
  });

  test('Export: GraphML format', () => {
    const result = exportService.export('graphml');
    assert(result.content, 'Has content');
    assertIncludes(result.content, '<graphml', 'Valid GraphML');
    assertIncludes(result.content, '<node', 'Contains nodes');
  });

  test('Export: JSON-LD format', () => {
    const result = exportService.export('jsonld');
    assert(result.content, 'Has content');
    const parsed = JSON.parse(result.content);
    assert(parsed['@context'], 'Has @context');
    assert(parsed['@graph'], 'Has @graph');
    assert(parsed['@graph'].length > 0, 'Graph has entries');
  });

  test('Export: GEXF format', () => {
    const result = exportService.export('gexf');
    assert(result.content, 'Has content');
    assertIncludes(result.content, '<gexf', 'Valid GEXF');
    assertIncludes(result.content, '<node', 'Contains nodes');
  });

  test('Export: CSV format', () => {
    const result = exportService.export('csv');
    assert(result.files, 'Has files');
    assert(result.files.nodes, 'Has nodes CSV');
    assert(result.files.edges, 'Has edges CSV');
    assertIncludes(result.files.nodes.content, 'id,', 'Nodes CSV has header');
  });

  test('Export: JSON format', () => {
    const result = exportService.export('json');
    assert(result.content, 'Has content');
    const parsed = JSON.parse(result.content);
    assert(Array.isArray(parsed.nodes), 'JSON has nodes array');
    assert(Array.isArray(parsed.edges), 'JSON has edges array');
    assert(parsed.nodes.length > 0, 'Nodes not empty');
  });

  test('Export: filtering by node types', () => {
    const result = exportService.export('json', { nodeTypes: ['Document'] });
    const parsed = JSON.parse(result.content);
    assert(parsed.nodes.length > 0, 'Filtered export has nodes');
    assert(parsed.nodes.every(n => (n.type || '').toLowerCase() === 'document'),
      'All nodes are Document');
  });

  test('Export: stats track all exports', () => {
    const stats = exportService.getStats();
    assertGte(stats.totalExports, 7, `Expected >= 7 exports, got ${stats.totalExports}`);
    assertGte(stats.byFormat.cypher, 1, 'Cypher counted');
    assertGte(stats.byFormat.json, 2, 'JSON counted (includes filtered)');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 3: FileSystemConnector → chunk → extract → ReportService
// ══════════════════════════════════════════════════════════════════════════════

async function testFlow3() {
  section('Flow 3: Connector → Ingest → Report');

  // Create temp directory with test files
  const tmpDir = path.join(os.tmpdir(), `unpa_integration_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'report1.md'), SAMPLE_DOC);
  fs.writeFileSync(path.join(tmpDir, 'report2.md'), SAMPLE_DOC_2);
  fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify({ name: 'test' }));

  const { FileSystemConnector } = require('../../src/services/connectors/filesystem-connector');

  const connector = new FileSystemConnector({
    basePath: tmpDir,
    allowedExtensions: ['.md', '.json']
  });

  // Step 1: Connect and list files
  await asyncTest('FileSystemConnector connects to temp directory', async () => {
    const result = await connector.connect();
    assert(result.success, 'Connection successful');
  });

  let files;
  await asyncTest('FileSystemConnector lists files', async () => {
    const result = await connector.list('', { depth: 1 });
    files = result.items;
    assertGte(files.length, 2, `Expected >= 2 files, got ${files.length}`);
  });

  // Step 2: Read and chunk markdown files
  const chunker = new TextChunker({ maxTokens: 512, overlapTokens: 30 });
  const extractor = new EntityExtractor({ useRegex: true, useLLM: false });
  const graphCache = createSharedGraphCache();

  let totalEntities = 0;

  await asyncTest('Read, chunk, and extract from connector files', async () => {
    const mdFiles = files.filter(f => f.name.endsWith('.md'));
    assertGte(mdFiles.length, 2, 'Found markdown files');

    for (const file of mdFiles) {
      // Read file via connector (parse: false to skip documentParser)
      const fileData = await connector.fetch(file.path || file.name, { parse: false });
      const content = fileData.content || '';

      assert(content.length > 0, `File ${file.name} has content`);

      // Chunk
      const chunks = chunker.chunk(content);
      assertGte(chunks.length, 1, `File ${file.name} chunked`);

      // Extract from each chunk
      for (const chunk of chunks) {
        const result = await extractor.extract(chunk.content);
        populateGraphFromExtraction(graphCache, result, `doc_${file.name}`);
        totalEntities += result.entities.length;
      }
    }

    assert(totalEntities > 0, `Total entities extracted: ${totalEntities}`);
    assertGte(graphCache.nodes.size, 5, `Graph has >= 5 nodes`);
  });

  // Step 3: Generate reports
  const reportService = new ReportService({
    graphCache,
    dashboardService: null
  });

  test('ReportService: summary report from connector data', () => {
    const report = reportService.generateSummaryReport();
    assert(report.title, 'Has title');
    assertGte(report.graph.totalNodes, 5, `Summary shows >= 5 nodes, got ${report.graph.totalNodes}`);
    assertGte(report.graph.totalEdges, 4, `Summary shows >= 4 edges, got ${report.graph.totalEdges}`);
    assert(report.nodeTypeDistribution, 'Has type distribution');
  });

  test('ReportService: type report for organizations', () => {
    const report = reportService.generateTypeReport('Organization');
    assert(report.title, 'Has title');
    assertGte(report.entities.length, 1, 'At least 1 organization');
  });

  test('ReportService: relationship report', () => {
    const report = reportService.generateRelationshipReport();
    assertGte(report.totalEdges, 4, 'Has relationships');
    assert(report.typeDistribution, 'Has type distribution');
  });

  test('ReportService: summary as Markdown', () => {
    const report = reportService.generateSummaryReport({ format: 'markdown' });
    assert(report.formatted, 'Has formatted output');
    assertIncludes(report.formatted, '#', 'Markdown has headers');
  });

  test('ReportService: summary as HTML', () => {
    const report = reportService.generateSummaryReport({ format: 'html' });
    assert(report.formatted, 'Has formatted output');
    assertIncludes(report.formatted, '<html', 'Valid HTML');
  });

  // Cleanup
  await asyncTest('Disconnect and cleanup', async () => {
    await connector.disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 4: Dashboard activity → ReportService timeline
// ══════════════════════════════════════════════════════════════════════════════

async function testFlow4() {
  section('Flow 4: Dashboard → Activity → Timeline');

  const graphCache = createSharedGraphCache();

  // Pre-populate with some graph data
  graphCache.nodes.set('sys1', { name: 'Umoja', type: 'System', attributes: { lang: 'Java' } });
  graphCache.nodes.set('sys2', { name: 'Inspira', type: 'System', attributes: { lang: 'C#' } });
  graphCache.nodes.set('org1', { name: 'OICT', type: 'Organization', attributes: {} });
  graphCache.nodes.set('doc1', { name: 'A/RES/74/100', type: 'Document', attributes: {} });
  graphCache.edges.set('e1', { source: 'org1', target: 'sys1', type: 'MANAGES' });
  graphCache.edges.set('e2', { source: 'org1', target: 'sys2', type: 'MANAGES' });
  graphCache.edges.set('e3', { source: 'doc1', target: 'sys1', type: 'REFERENCES' });

  const dashboard = new DashboardService({
    graphCache,
    queryEngine: null,
    extractor: null,
    patternLibrary: null,
    jobQueue: null,
    ingestionPipeline: null,
    sourceManager: null
  });

  // Step 1: Log various activities
  test('Log activities to dashboard', () => {
    dashboard.logActivity('query', 'User searched for Umoja');
    dashboard.logActivity('extraction', 'Extracted 15 entities from report');
    dashboard.logActivity('ingestion', 'Ingested 3 documents');
    dashboard.logActivity('query', 'User queried relationships for OICT');
    dashboard.logActivity('export', 'Exported graph as Cypher');

    const result = dashboard.getRecentActivity();
    assertEqual(result.activities.length, 5, `Expected 5 activities, got ${result.activities.length}`);
  });

  test('Activities have timestamps', () => {
    const result = dashboard.getRecentActivity();
    assert(result.activities.every(a => a.timestamp), 'All have timestamps');
    assert(result.activities.every(a => a.type), 'All have types');
  });

  // Step 2: Record time-series data
  test('Record time-series metrics', () => {
    dashboard.recordMetric('queries', { count: 5, avgLatency: 120 });
    dashboard.recordMetric('queries', { count: 3, avgLatency: 95 });
    dashboard.recordMetric('extractions', { count: 15 });
    dashboard.recordMetric('ingestions', { count: 3 });
    dashboard.recordMetric('errors', { count: 1, type: 'timeout' });

    assertEqual(dashboard.timeSeries.queries.length, 2, '2 query data points');
    assertEqual(dashboard.timeSeries.extractions.length, 1, '1 extraction data point');
  });

  // Step 3: Get overview with all data
  test('Dashboard overview aggregates everything', () => {
    const overview = dashboard.getOverview();
    assertEqual(overview.graph.nodes, 4, '4 nodes');
    assertEqual(overview.graph.edges, 3, '3 edges');
  });

  // Step 4: Feed dashboard data to ReportService
  const reportService = new ReportService({
    graphCache,
    dashboardService: dashboard
  });

  test('ReportService timeline from dashboard activity', () => {
    const report = reportService.generateTimelineReport();
    assert(report.title, 'Has title');
    assertGte(report.totalActivities, 5, `Expected >= 5 activities, got ${report.totalActivities}`);
    assertGte(report.recentActivities.length, 5, `Expected >= 5 recent, got ${report.recentActivities.length}`);
  });

  test('ReportService comparison of two systems', () => {
    const report = reportService.generateComparisonReport(['sys1', 'sys2']);
    assert(report.title, 'Has title');
    assertEqual(report.entities.length, 2, '2 entities compared');
    assert(report.commonNeighbours !== undefined, 'Has common neighbours');
    assert(report.uniqueNeighbours !== undefined, 'Has unique neighbours');
  });

  test('ReportService entity report for OICT', () => {
    const report = reportService.generateEntityReport('org1');
    assertEqual(report.entity.name, 'OICT', 'Correct entity');
    assertGte(report.outgoingRelations.length, 2, 'OICT has >= 2 outgoing relations');
  });

  test('Timeline report as Markdown', () => {
    const report = reportService.generateTimelineReport({ format: 'markdown' });
    assert(report.formatted, 'Has formatted');
    assertIncludes(report.formatted, '#', 'Has markdown headers');
  });

  test('Comparison report as HTML', () => {
    const report = reportService.generateComparisonReport(['sys1', 'sys2'], { format: 'html' });
    assert(report.formatted, 'Has formatted');
    assertIncludes(report.formatted, '<html', 'Valid HTML');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOW 5: Full Lifecycle
// ══════════════════════════════════════════════════════════════════════════════

async function testFlow5() {
  section('Flow 5: Full Lifecycle');

  const graphCache = createSharedGraphCache();
  const chunker = new TextChunker({ maxTokens: 512, overlapTokens: 40 });
  const extractor = new EntityExtractor({ useRegex: true, useLLM: false, minConfidence: 0.5 });
  const vizService = new GraphVizService({ graphCache });
  const exportService = new GraphExportService({ graphCache });
  const dashboard = new DashboardService({
    graphCache,
    queryEngine: null,
    extractor: null,
    patternLibrary: null,
    jobQueue: null,
    ingestionPipeline: null,
    sourceManager: null
  });
  const reportService = new ReportService({
    graphCache,
    dashboardService: dashboard
  });

  // ── Phase 1: Ingest two documents ────────────────────────────────────────
  let doc1Entities = 0;
  let doc2Entities = 0;

  await asyncTest('Phase 1a: Chunk & extract from doc 1', async () => {
    const chunks = chunker.chunk(SAMPLE_DOC);
    for (const chunk of chunks) {
      const result = await extractor.extract(chunk.content);
      populateGraphFromExtraction(graphCache, result, 'lifecycle_doc1');
      doc1Entities += result.entities.length;
    }
    dashboard.logActivity('ingestion', `Doc 1 ingested: ${doc1Entities} entities`);
    dashboard.recordMetric('extractions', { count: doc1Entities });
    assert(doc1Entities > 0, `Doc 1 entities: ${doc1Entities}`);
  });

  await asyncTest('Phase 1b: Chunk & extract from doc 2', async () => {
    const chunks = chunker.chunk(SAMPLE_DOC_2);
    for (const chunk of chunks) {
      const result = await extractor.extract(chunk.content);
      populateGraphFromExtraction(graphCache, result, 'lifecycle_doc2');
      doc2Entities += result.entities.length;
    }
    dashboard.logActivity('ingestion', `Doc 2 ingested: ${doc2Entities} entities`);
    dashboard.recordMetric('extractions', { count: doc2Entities });
    assert(doc2Entities > 0, `Doc 2 entities: ${doc2Entities}`);
  });

  test('Phase 1c: Graph contains data from both documents', () => {
    assert(graphCache.nodes.has('lifecycle_doc1'), 'Doc 1 node exists');
    assert(graphCache.nodes.has('lifecycle_doc2'), 'Doc 2 node exists');
    assertGte(graphCache.nodes.size, 8, `Expected >= 8 total nodes, got ${graphCache.nodes.size}`);
  });

  // ── Phase 2: Visualize & Query ───────────────────────────────────────────
  test('Phase 2a: Get full graph visualization', () => {
    const graph = vizService.getGraph({ format: 'd3' });
    assertGte(graph.nodes.length, 8, `Visualization has >= 8 nodes`);
    assertGte(graph.edges.length, 6, `Visualization has >= 6 edges`);
    dashboard.logActivity('query', 'Full graph visualization requested');
  });

  test('Phase 2b: Get node type summary', () => {
    const summary = vizService.getNodeTypes();
    assertGte(summary.totalTypes, 2, 'Multiple node types');
    dashboard.logActivity('query', 'Node type summary requested');
  });

  test('Phase 2c: Search for shared entities', () => {
    const result = vizService.getFilteredGraph({ search: 'Umoja' });
    assertGte(result.nodes.length, 1, 'Umoja found');
    dashboard.logActivity('query', 'Search for Umoja');
  });

  // ── Phase 3: Export in all formats ───────────────────────────────────────
  const exportResults = {};

  test('Phase 3a: Export as Cypher', () => {
    exportResults.cypher = exportService.export('cypher');
    assertIncludes(exportResults.cypher.content, 'CREATE', 'Valid Cypher');
    dashboard.logActivity('export', 'Exported as Cypher');
  });

  test('Phase 3b: Export as GraphML', () => {
    exportResults.graphml = exportService.export('graphml');
    assertIncludes(exportResults.graphml.content, '<graphml', 'Valid GraphML');
    dashboard.logActivity('export', 'Exported as GraphML');
  });

  test('Phase 3c: Export as JSON-LD', () => {
    exportResults.jsonld = exportService.export('jsonld');
    const parsed = JSON.parse(exportResults.jsonld.content);
    assertGte(parsed['@graph'].length, 8, 'JSON-LD has all nodes');
    dashboard.logActivity('export', 'Exported as JSON-LD');
  });

  test('Phase 3d: Export as JSON', () => {
    exportResults.json = exportService.export('json');
    const parsed = JSON.parse(exportResults.json.content);
    assertGte(parsed.nodes.length, 8, 'JSON has all nodes');
    dashboard.logActivity('export', 'Exported as JSON');
  });

  // ── Phase 4: Generate Reports ────────────────────────────────────────────
  test('Phase 4a: Summary report', () => {
    const report = reportService.generateSummaryReport();
    assertGte(report.graph.totalNodes, 8, 'Summary reflects full graph');
    assertGte(Object.keys(report.nodeTypeDistribution).length, 2, 'Multiple types');
  });

  test('Phase 4b: Relationship report', () => {
    const report = reportService.generateRelationshipReport();
    assertGte(report.totalEdges, 6, 'All relationships counted');
  });

  test('Phase 4c: Timeline report with all activities', () => {
    const report = reportService.generateTimelineReport();
    assertGte(report.totalActivities, 8, `Expected >= 8 activities, got ${report.totalActivities}`);
    // Verify activity types cover ingestion, query, export
    const types = new Set(report.recentActivities.map(a => a.type));
    assert(types.has('ingestion'), 'Has ingestion activities');
    assert(types.has('query'), 'Has query activities');
    assert(types.has('export'), 'Has export activities');
  });

  // ── Phase 5: Dashboard overview reflects everything ──────────────────────
  test('Phase 5a: Dashboard overview shows complete state', () => {
    const overview = dashboard.getOverview();
    assertGte(overview.graph.nodes, 8, 'Overview has all nodes');
    assertGte(overview.graph.edges, 6, 'Overview has all edges');
  });

  test('Phase 5b: Dashboard time-series has extraction data', () => {
    assertGte(dashboard.timeSeries.extractions.length, 2, 'Extraction time-series from both docs');
  });

  test('Phase 5c: Dashboard activity log is comprehensive', () => {
    const result = dashboard.getRecentActivity();
    assertGte(result.activities.length, 8, `Expected >= 8 activities, got ${result.activities.length}`);
  });

  // ── Phase 6: Cross-format consistency ────────────────────────────────────
  test('Phase 6: Export consistency across formats', () => {
    const jsonData = JSON.parse(exportResults.json.content);
    const jsonldData = JSON.parse(exportResults.jsonld.content);

    // Node counts should match
    assertEqual(
      jsonData.nodes.length,
      jsonldData['@graph'].length,
      `JSON nodes (${jsonData.nodes.length}) != JSON-LD graph entries (${jsonldData['@graph'].length})`
    );

    // Cypher should have CREATE for each node
    const createCount = (exportResults.cypher.content.match(/CREATE\s*\(/g) || []).length;
    assertGte(createCount, jsonData.nodes.length,
      `Cypher CREATEs (${createCount}) should >= JSON nodes (${jsonData.nodes.length})`);
  });

  // ── Phase 7: Export stats ────────────────────────────────────────────────
  test('Phase 7: Export stats reflect all operations', () => {
    const stats = exportService.getStats();
    assertGte(stats.totalExports, 4, `Expected >= 4 exports, got ${stats.totalExports}`);
  });

  test('Phase 7b: Report stats reflect all reports', () => {
    const stats = reportService.getStats();
    assertGte(stats.totalReports, 3, `Expected >= 3 reports, got ${stats.totalReports}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EXTRA: Cross-service edge cases
// ══════════════════════════════════════════════════════════════════════════════

async function testEdgeCases() {
  section('Edge Cases: Cross-service boundaries');

  test('Empty document produces empty chunks', () => {
    const chunker = new TextChunker();
    const chunks = chunker.chunk('');
    assertEqual(chunks.length, 0, 'No chunks from empty text');
  });

  await asyncTest('Short text below extraction threshold', async () => {
    const extractor = new EntityExtractor({ useRegex: true, useLLM: false });
    const result = await extractor.extract('Hello');
    assertEqual(result.entities.length, 0, 'No entities from short text');
  });

  test('Export from empty graph', () => {
    const emptyCache = createSharedGraphCache();
    const exportService = new GraphExportService({ graphCache: emptyCache });
    const result = exportService.export('json');
    const parsed = JSON.parse(result.content);
    assertEqual(parsed.nodes.length, 0, 'Empty JSON export');
    assertEqual(parsed.edges.length, 0, 'No edges in empty export');
  });

  test('Report from empty graph', () => {
    const emptyCache = createSharedGraphCache();
    const reportService = new ReportService({
      graphCache: emptyCache,
      dashboardService: null
    });
    const report = reportService.generateSummaryReport();
    assertEqual(report.graph.totalNodes, 0, 'Summary shows 0 nodes');
    assertEqual(report.graph.totalEdges, 0, 'Summary shows 0 edges');
  });

  test('Dashboard with no activity shows empty log', () => {
    const emptyCache = createSharedGraphCache();
    const dashboard = new DashboardService({
      graphCache: emptyCache,
      queryEngine: null,
      extractor: null,
      patternLibrary: null,
      jobQueue: null,
      ingestionPipeline: null,
      sourceManager: null
    });
    const result = dashboard.getRecentActivity();
    assertEqual(result.activities.length, 0, 'No activities');
  });

  test('Multiple extractions deduplicate in graph', () => {
    const graphCache = createSharedGraphCache();
    const extractor = new EntityExtractor({ useRegex: true, useLLM: false });

    // Extract same text twice
    const text = 'UNICEF and UNESCO are key organizations. Refer to A/RES/74/100 for details.';
    const r1 = extractor.extractWithRegex(text);
    const r2 = extractor.extractWithRegex(text);

    populateGraphFromExtraction(graphCache, { entities: r1, relationships: [] }, 'dup_doc1');
    populateGraphFromExtraction(graphCache, { entities: r2, relationships: [] }, 'dup_doc2');

    // Count unique entity nodes (excluding doc nodes)
    const entityNodes = [...graphCache.nodes.entries()].filter(([id]) => id.startsWith('entity_'));
    // Same entities from different docs should map to same node IDs
    const uniqueNames = new Set(entityNodes.map(([, n]) => n.name));
    assertEqual(entityNodes.length, uniqueNames.size, 'No duplicate entity nodes');
  });

  test('Services share same graphCache reference', () => {
    const graphCache = createSharedGraphCache();
    graphCache.nodes.set('test1', { name: 'TestNode', type: 'Test', attributes: {} });

    const viz = new GraphVizService({ graphCache });
    const exp = new GraphExportService({ graphCache });
    const report = new ReportService({ graphCache, dashboardService: null });

    const vizGraph = viz.getGraph();
    assertEqual(vizGraph.nodes.length, 1, 'VizService sees node');

    const jsonExport = JSON.parse(exp.export('json').content);
    assertEqual(jsonExport.nodes.length, 1, 'ExportService sees same node');

    const summary = report.generateSummaryReport();
    assertEqual(summary.graph.totalNodes, 1, 'ReportService sees same node');

    // Add a node via graphCache — all services see it immediately
    graphCache.nodes.set('test2', { name: 'TestNode2', type: 'Test', attributes: {} });
    assertEqual(viz.getGraph().nodes.length, 2, 'VizService sees new node');
    assertEqual(JSON.parse(exp.export('json').content).nodes.length, 2, 'ExportService sees new node');
    assertEqual(report.generateSummaryReport().graph.totalNodes, 2, 'ReportService sees new node');
  });

  test('Chunker stats work on extracted chunks', () => {
    const chunker = new TextChunker();
    const chunks = chunker.chunk(SAMPLE_DOC);
    const stats = chunker.getStats(chunks);
    assert(stats.count > 0, 'Stats show chunk count');
    assert(stats.avgTokens > 0, 'Stats show avg tokens');
  });

  test('Entity extractor returns stats in extract result', async () => {
    const extractor = new EntityExtractor({ useRegex: true, useLLM: false });
    const result = await extractor.extract(SAMPLE_DOC);
    assert(result.stats, 'Has stats');
    assert(result.stats.regex > 0, 'Regex count > 0');
    assertEqual(result.stats.provider, 'none', 'No LLM provider');
  });

  test('Filtered graph limits results', () => {
    const graphCache = createSharedGraphCache();
    for (let i = 0; i < 20; i++) {
      graphCache.nodes.set(`n${i}`, { name: `Node${i}`, type: 'Test', attributes: {} });
    }
    const viz = new GraphVizService({ graphCache });
    const result = viz.getFilteredGraph({}, { limit: 5 });
    assertEqual(result.nodes.length, 5, 'Limit respected');
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RUNNER
// ══════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Integration Tests - E2E Flows (Task 10.1)           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    await testFlow1();
    await testFlow2();
    await testFlow3();
    await testFlow4();
    await testFlow5();
    await testEdgeCases();
  } catch (err) {
    console.error('\n💥 Unexpected error:', err);
    failed++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60));
  console.log(`Finished: ${new Date().toISOString()}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
