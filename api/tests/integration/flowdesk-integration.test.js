/**
 * FlowDesk Integration E2E Tests
 *
 * Tests the full FlowDesk extraction → graph generation → runtime pipeline.
 *
 * Run: node api/tests/integration/flowdesk-integration.test.js
 */

'use strict';

let passed = 0, failed = 0;
const errors = [];

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; errors.push({ name, error: err.message }); console.log(`  ✗ ${name}\n    ${err.message}`); }
}

function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  FlowDesk Integration Tests');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 1. EXTRACTORS ──────────────────────────────────────

  console.log('1. FlowDesk Extractors');

  await test('service catalog extraction', async () => {
    const { extractServiceCatalog } = require('../../src/services/workspace/extraction/flowdesk/service-catalog.extractor');
    const result = await extractServiceCatalog();
    assert(result.success, 'extraction should succeed');
    assert(result.entities.length > 50, `should have 50+ entities, got ${result.entities.length}`);
    assert(result.stats.domains >= 6, `should have 6+ domains, got ${result.stats.domains}`);
    assert(result.relationships.length > 0, 'should have relationships');
  });

  await test('SLA rules extraction', async () => {
    const { extractSLARules } = require('../../src/services/workspace/extraction/flowdesk/sla-rules.extractor');
    const result = await extractSLARules();
    assert(result.success, 'extraction should succeed');
    assert(result.rules.length >= 20, `should have 20+ rules, got ${result.rules.length}`);
    assert(result.stats.priorities === 4, 'should have 4 priority levels');
  });

  await test('classification rules extraction', async () => {
    const { extractClassificationRules } = require('../../src/services/workspace/extraction/flowdesk/classification-rules.extractor');
    const result = await extractClassificationRules();
    assert(result.success, 'extraction should succeed');
    assert(result.rules.length > 10, `should have 10+ rules, got ${result.rules.length}`);
  });

  await test('routing rules extraction', async () => {
    const { extractRoutingRules } = require('../../src/services/workspace/extraction/flowdesk/routing-rules.extractor');
    const result = await extractRoutingRules();
    assert(result.success, 'extraction should succeed');
    assert(result.rules.length >= 10, `should have 10+ rules, got ${result.rules.length}`);
  });

  await test('dialog graph extraction', async () => {
    const { extractDialogGraphs } = require('../../src/services/workspace/extraction/flowdesk/dialog-graph.extractor');
    const result = await extractDialogGraphs();
    assert(result.success, 'extraction should succeed');
    // May have 0 if graphs dir is empty, but should not error
  });

  // ── 2. GXE BUILDER ────────────────────────────────────

  console.log('\n2. GXE Graph Builder');

  await test('create linear graph', () => {
    const { GxeGraphBuilder } = require('../../src/services/workspace/extraction/flowdesk/gxe-builder');
    const graph = GxeGraphBuilder.createLinearGraph('test.linear', [
      { label: 'Step 1', tool: 'ai.classify', config: {} },
      { label: 'Step 2', tool: 'ai.extract', config: {} }
    ], { description: 'Test graph' });

    assert(graph.nodes.length === 4, `should have 4 nodes (start+2+end), got ${graph.nodes.length}`);
    assert(graph.edges.length === 3, `should have 3 edges, got ${graph.edges.length}`);
    assert(graph.name === 'test.linear', 'name should match');
  });

  await test('create decision table graph', () => {
    const { GxeGraphBuilder } = require('../../src/services/workspace/extraction/flowdesk/gxe-builder');
    const graph = GxeGraphBuilder.createDecisionTableGraph('test.decision', {
      switchOn: 'priority',
      cases: [
        { value: 'HIGH', label: 'High', assignments: [{ target: 'sla', value: '4h' }] },
        { value: 'LOW', label: 'Low', assignments: [{ target: 'sla', value: '72h' }] }
      ],
      actions: {}
    });

    assert(graph.nodes.length >= 5, `should have 5+ nodes, got ${graph.nodes.length}`);
    assert(graph.edges.length >= 4, `should have 4+ edges, got ${graph.edges.length}`);
    const switchNode = graph.nodes.find(n => n.type === 'switch');
    assert(switchNode, 'should have switch node');
  });

  // ── 3. GENERATORS ─────────────────────────────────────

  console.log('\n3. Graph Generators');

  await test('generate SLA decision graph', async () => {
    const { extractSLARules } = require('../../src/services/workspace/extraction/flowdesk/sla-rules.extractor');
    const { generateSLADecisionGraph } = require('../../src/services/workspace/extraction/flowdesk/generators/sla-graph.generator');
    const slaResult = await extractSLARules();
    const graph = generateSLADecisionGraph(slaResult.rules);
    assert(graph.name === 'flowdesk.sla.decision', 'name should match');
    assert(graph.nodes.length >= 5, `should have 5+ nodes, got ${graph.nodes.length}`);
    assert(graph.namespace === 'FLOWDESK', 'namespace should be FLOWDESK');
  });

  await test('generate SLA escalation graph', async () => {
    const { generateSLAEscalationGraph } = require('../../src/services/workspace/extraction/flowdesk/generators/sla-graph.generator');
    const graph = generateSLAEscalationGraph();
    assert(graph.name === 'flowdesk.sla.escalation', 'name should match');
    assert(graph.nodes.length >= 6, `should have 6+ nodes, got ${graph.nodes.length}`);
  });

  await test('generate classification pipeline graph', async () => {
    const { extractServiceCatalog } = require('../../src/services/workspace/extraction/flowdesk/service-catalog.extractor');
    const { generateClassificationPipelineGraph } = require('../../src/services/workspace/extraction/flowdesk/generators/classification-graph.generator');
    const catalogResult = await extractServiceCatalog();
    const services = catalogResult.entities.filter(e => e.content?.entitySubType === 'SERVICE_CATALOG_ITEM');
    const graph = generateClassificationPipelineGraph([], services);
    assert(graph.name === 'flowdesk.classify.pipeline', 'name should match');
    assert(graph.nodes.length >= 10, `should have 10+ nodes (L1+L2+L3+fallback), got ${graph.nodes.length}`);
  });

  await test('generate queue routing graph', async () => {
    const { extractRoutingRules } = require('../../src/services/workspace/extraction/flowdesk/routing-rules.extractor');
    const { generateQueueRoutingGraph } = require('../../src/services/workspace/extraction/flowdesk/generators/routing-graph.generator');
    const routingResult = await extractRoutingRules();
    const graph = generateQueueRoutingGraph(routingResult.rules);
    assert(graph.name === 'flowdesk.route.queue', 'name should match');
    assert(graph.nodes.length >= 5, `should have 5+ nodes, got ${graph.nodes.length}`);
  });

  await test('generate all FlowDesk graphs', async () => {
    const { extractSLARules } = require('../../src/services/workspace/extraction/flowdesk/sla-rules.extractor');
    const { extractRoutingRules } = require('../../src/services/workspace/extraction/flowdesk/routing-rules.extractor');
    const { extractServiceCatalog } = require('../../src/services/workspace/extraction/flowdesk/service-catalog.extractor');
    const { generateAllFlowDeskGraphs } = require('../../src/services/workspace/extraction/flowdesk/generators');

    const [sla, routing, catalog] = await Promise.all([
      extractSLARules(),
      extractRoutingRules(),
      extractServiceCatalog()
    ]);

    const { graphs, log } = generateAllFlowDeskGraphs({
      slaRules: sla.rules,
      routingRules: routing.rules,
      services: catalog.entities
    });

    assert(graphs.length >= 5, `should generate 5+ graphs, got ${graphs.length}`);
    console.log(`    Generated: ${graphs.map(g => g.name).join(', ')}`);
  });

  // ── 4. GRAPH VALIDATION ────────────────────────────────

  console.log('\n4. Graph Validation');

  await test('validate generated graphs', () => {
    const { validateGraph } = require('../../src/services/workspace/extraction/flowdesk/catalog-integration');
    const { GxeGraphBuilder } = require('../../src/services/workspace/extraction/flowdesk/gxe-builder');

    const validGraph = GxeGraphBuilder.createLinearGraph('test', [{ label: 'A', tool: 'a', config: {} }]);
    const v1 = validateGraph(validGraph);
    assert(v1.valid, `valid graph should pass: ${v1.errors.join(', ')}`);

    const invalidGraph = { name: 'bad', nodes: [], edges: [] };
    const v2 = validateGraph(invalidGraph);
    assert(!v2.valid, 'empty graph should fail validation');
  });

  // ── 5. KB GRAPH LOADER ─────────────────────────────────

  console.log('\n5. Graph Loader');

  await test('load graph from file fallback', async () => {
    const loader = require('../../src/services/flowdesk/graph-loader-kb.service');
    const result = await loader.loadGraph('flowdesk.intake.dialog', { useCache: false });
    // May succeed (file) or fail (no file) — should not throw
    assert(result.source !== undefined, 'should have source field');
  });

  await test('cache stats', () => {
    const loader = require('../../src/services/flowdesk/graph-loader-kb.service');
    const stats = loader.getCacheStats();
    assert(typeof stats.size === 'number', 'should have size');
    assert(Array.isArray(stats.keys), 'should have keys array');
  });

  // ── SUMMARY ────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`  Total: ${passed + failed} checks`);
  console.log('═══════════════════════════════════════════════════');

  if (errors.length > 0) {
    console.log('\nFailures:');
    errors.forEach(e => console.log(`  ✗ ${e.name}: ${e.error}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Runner error:', err); process.exit(1); });
