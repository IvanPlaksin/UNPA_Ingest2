/**
 * WorkSpace Graph (Canvas) Integration Tests (WS2-004)
 *
 * Validates the GET/PUT /workspaces/:id/graph round-trip:
 *   - getGraph returns ReactFlow-shaped nodes + edges
 *   - position serializes via positionX / positionY
 *   - saveGraph upserts new + existing nodes
 *   - saveGraph deletes removed nodes
 *   - saveGraph rebuilds edges
 *   - createCheckpoint flag triggers a GraphVersion
 *
 * Run: node api/tests/integration/workspace-graph.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertNotNull(v, l) { if (v === null || v === undefined) throw new Error(`${l}: expected non-null`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  WorkSpace Graph (Canvas) Tests (WS2-004)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, wgs, gv, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    wgs = require('../../src/services/workspace/workspace-graph.service');
    gv = require('../../src/services/workspace/graph-version.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  const TEST_USER = 'test-graph-canvas-user';
  let workspace = null;
  let entityA = null;
  let entityB = null;

  console.log('1. Setup');

  await test('create test workspace', async () => {
    workspace = await ws.create({
      name: 'Canvas Test WS',
      description: 'WS2-004',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    assertNotNull(workspace.id, 'workspace.id');
  });

  await test('seed two draft entities', async () => {
    entityA = await drafts.create(workspace.id, {
      type: 'entity', name: 'Customer', description: 'A customer',
      content: { fields: ['id', 'name'] }, confidence: 0.9, extractedBy: TEST_USER
    });
    entityB = await drafts.create(workspace.id, {
      type: 'entity', name: 'Order', description: 'An order',
      content: { fields: ['id', 'customerId'] }, confidence: 0.85, extractedBy: TEST_USER
    });
    assertNotNull(entityA.id, 'A.id');
    assertNotNull(entityB.id, 'B.id');
  });

  await test('seed an edge', async () => {
    await drafts.createEdge(workspace.id, {
      sourceId: entityB.id,
      targetId: entityA.id,
      edgeType: 'BELONGS_TO',
      confidence: 0.9
    });
  });

  console.log('\n2. getGraph');

  await test('getGraph returns ReactFlow shape', async () => {
    const graph = await wgs.getGraph(workspace.id);
    assertNotNull(graph, 'graph');
    assert(Array.isArray(graph.nodes), 'nodes array');
    assert(Array.isArray(graph.edges), 'edges array');
    assertEq(graph.nodes.length, 2, 'two nodes');
    assertEq(graph.edges.length, 1, 'one edge');
    const customer = graph.nodes.find(n => n.data?.label === 'Customer');
    assertNotNull(customer, 'customer node');
    assertEq(customer.type, 'workspaceDraft', 'reactflow type');
    assertEq(customer.data.draftType, 'entity', 'draft type');
    assert(typeof customer.position?.x === 'number', 'position.x is number');
  });

  await test('getGraph initial positions are 0,0', async () => {
    const graph = await wgs.getGraph(workspace.id);
    assert(graph.nodes.every(n => n.position.x === 0 && n.position.y === 0), 'all positions zero');
  });

  console.log('\n3. saveGraph (position update)');

  await test('saveGraph persists positions', async () => {
    const graph = await wgs.getGraph(workspace.id);
    const updated = {
      nodes: graph.nodes.map((n, i) => ({
        ...n,
        position: { x: 100 * (i + 1), y: 200 * (i + 1) }
      })),
      edges: graph.edges
    };
    const result = await wgs.saveGraph(workspace.id, updated);
    assert(result.success, 'success');
    assertEq(result.stats.updatedNodes, 2, 'two updated');

    // Read back
    const reloaded = await wgs.getGraph(workspace.id);
    const customer = reloaded.nodes.find(n => n.data?.label === 'Customer');
    assert(customer.position.x === 100 || customer.position.x === 200, 'customer position persisted');
  });

  console.log('\n4. saveGraph (create new node)');

  let newNodeId = null;

  await test('saveGraph creates new node and assigns canonical id', async () => {
    const graph = await wgs.getGraph(workspace.id);
    const newNode = {
      id: 'tmp-new-product',
      type: 'workspaceDraft',
      position: { x: 500, y: 100 },
      data: {
        label: 'Product',
        draftType: 'entity',
        description: 'A product',
        confidence: 0.7,
        properties: { sku: 'string' }
      }
    };
    const result = await wgs.saveGraph(workspace.id, {
      nodes: [...graph.nodes, newNode],
      edges: graph.edges
    });
    assertEq(result.stats.createdNodes, 1, 'one created');

    const reloaded = await wgs.getGraph(workspace.id);
    const product = reloaded.nodes.find(n => n.data?.label === 'Product');
    assertNotNull(product, 'product exists');
    assert(product.id !== 'tmp-new-product', 'got canonical id');
    newNodeId = product.id;
    assertEq(product.position.x, 500, 'position.x persisted');
  });

  console.log('\n5. saveGraph (rebuild edges)');

  await test('saveGraph rebuilds edges (delete then create)', async () => {
    const graph = await wgs.getGraph(workspace.id);
    // Replace existing edge with two new ones
    const newEdges = [
      { source: entityB.id, target: entityA.id, label: 'BELONGS_TO' },
      { source: newNodeId,  target: entityA.id, label: 'OWNED_BY' }
    ];
    const result = await wgs.saveGraph(workspace.id, {
      nodes: graph.nodes,
      edges: newEdges
    });
    assertEq(result.stats.createdEdges, 2, 'two created');
    assert(result.stats.deletedEdges >= 1, 'old edge deleted');

    const reloaded = await wgs.getGraph(workspace.id);
    assertEq(reloaded.edges.length, 2, 'two edges in reloaded');
    assert(reloaded.edges.some(e => e.label === 'OWNED_BY'), 'OWNED_BY exists');
  });

  console.log('\n6. saveGraph (delete node)');

  await test('saveGraph deletes node missing from payload', async () => {
    const graph = await wgs.getGraph(workspace.id);
    // Remove Product
    const remaining = graph.nodes.filter(n => n.id !== newNodeId);
    const result = await wgs.saveGraph(workspace.id, {
      nodes: remaining,
      edges: [{ source: entityB.id, target: entityA.id, label: 'BELONGS_TO' }]
    });
    assertEq(result.stats.deletedNodes, 1, 'one deleted');

    const reloaded = await wgs.getGraph(workspace.id);
    assertEq(reloaded.nodes.length, 2, 'back to two');
    assert(!reloaded.nodes.some(n => n.id === newNodeId), 'Product gone');
  });

  console.log('\n7. saveGraph with checkpoint');

  await test('saveGraph with createCheckpoint creates GraphVersion', async () => {
    const graph = await wgs.getGraph(workspace.id);
    const result = await wgs.saveGraph(workspace.id, graph, {
      createCheckpoint: true,
      checkpointNote: 'Test checkpoint',
      userId: TEST_USER
    });
    assertNotNull(result.versionId, 'versionId returned');
    const versions = await gv.getVersions(workspace.id);
    assert(versions.some(v => v.id === result.versionId), 'version exists');
    assert(versions.some(v => v.note === 'Test checkpoint'), 'note matches');
  });

  console.log('\n8. Cleanup');

  await test('clean up test data', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (w)-[:HAS_VERSION]->(v)
       DETACH DELETE w, d, v`,
      { id: workspace.id }
    );
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Errors:');
    for (const e of errors) console.log(`  - ${e.name}: ${e.error}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
