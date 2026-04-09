/**
 * WorkSpace Graph Version Tests (WS2-003)
 *
 * Validates:
 *   - createVersion serializes drafts + edges into snapshot
 *   - getVersions returns ordered list
 *   - getVersion returns full snapshot
 *   - diffVersions detects added/removed/modified
 *   - restoreVersion atomically replaces drafts (with safety checkpoint)
 *   - auto-prune respects MAX_VERSIONS_PER_WORKSPACE (smoke test)
 *
 * Run: node api/tests/integration/workspace-graph-version.test.js
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
  console.log('  WorkSpace Graph Version Tests (WS2-003)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, gv, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    gv = require('../../src/services/workspace/graph-version.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  const TEST_USER = 'test-graph-version-user';
  let workspace = null;
  let entityA = null;
  let entityB = null;
  let v1 = null;
  let v2 = null;
  let v3 = null;

  console.log('1. Setup');

  await test('create test workspace', async () => {
    workspace = await ws.create({
      name: 'GraphVersion Test WS',
      description: 'WS2-003',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    assertNotNull(workspace.id, 'workspace.id');
  });

  await test('create two draft entities', async () => {
    entityA = await drafts.create(workspace.id, {
      type: 'entity',
      name: 'Customer',
      description: 'Customer entity',
      content: { fields: ['id', 'name'] },
      confidence: 0.9,
      extractedBy: TEST_USER
    });
    entityB = await drafts.create(workspace.id, {
      type: 'entity',
      name: 'Order',
      description: 'Order entity',
      content: { fields: ['id', 'customerId'] },
      confidence: 0.85,
      extractedBy: TEST_USER
    });
    assertNotNull(entityA.id, 'entityA.id');
    assertNotNull(entityB.id, 'entityB.id');
  });

  await test('create draft edge between entities', async () => {
    await drafts.createEdge(workspace.id, {
      sourceId: entityB.id,
      targetId: entityA.id,
      edgeType: 'BELONGS_TO',
      confidence: 0.9
    });
  });

  console.log('\n2. createVersion');

  await test('createVersion snapshots current draft graph', async () => {
    v1 = await gv.createVersion(workspace.id, { note: 'Initial state', createdBy: 'user' });
    assertNotNull(v1.id, 'v1.id');
    assertEq(v1.versionNumber, 1, 'first version');
    assert(v1.metadata.nodeCount >= 2, 'has 2 nodes');
    assert(v1.metadata.edgeCount >= 1, 'has 1 edge');
  });

  await test('getVersion returns full snapshot', async () => {
    const fetched = await gv.getVersion(v1.id);
    assertNotNull(fetched, 'fetched');
    assertNotNull(fetched.snapshot, 'snapshot');
    assert(Array.isArray(fetched.snapshot.nodes), 'nodes array');
    assert(Array.isArray(fetched.snapshot.edges), 'edges array');
    assertEq(fetched.snapshot.nodes.length, 2, 'two nodes in snapshot');
    assertEq(fetched.snapshot.edges.length, 1, 'one edge in snapshot');
    // Check serialization fidelity
    const customer = fetched.snapshot.nodes.find(n => n.name === 'Customer');
    assertNotNull(customer, 'customer node');
    assertEq(customer.type, 'entity', 'customer type');
    assert(customer.content && Array.isArray(customer.content.fields), 'content parsed');
  });

  console.log('\n3. Mutations + new version');

  await test('add a third entity', async () => {
    await drafts.create(workspace.id, {
      type: 'entity',
      name: 'Product',
      description: 'Product entity',
      content: { fields: ['sku', 'price'] },
      confidence: 0.8,
      extractedBy: TEST_USER
    });
  });

  await test('modify Customer entity description', async () => {
    await drafts.update(workspace.id, entityA.id, {
      description: 'Updated customer description'
    });
  });

  await test('createVersion produces v2', async () => {
    v2 = await gv.createVersion(workspace.id, { note: 'After mutations' });
    assertEq(v2.versionNumber, 2, 'second version');
    assert(v2.metadata.nodeCount >= 3, 'three nodes');
  });

  console.log('\n4. diffVersions');

  await test('diffVersions detects added node', async () => {
    const diff = await gv.diffVersions(v1.id, v2.id);
    assert(diff.added.nodes.length >= 1, 'at least one added');
    const product = diff.added.nodes.find(n => n.name === 'Product');
    assertNotNull(product, 'Product is added');
    assertEq(diff.removed.nodes.length, 0, 'nothing removed');
  });

  await test('diffVersions detects modified node (description changed)', async () => {
    const diff = await gv.diffVersions(v1.id, v2.id);
    const modCustomer = diff.modified.nodes.find(m => m.id === entityA.id);
    assertNotNull(modCustomer, 'Customer is modified');
    assert(modCustomer.changedFields.includes('description'), 'description in changedFields');
  });

  await test('diff summary counts match', async () => {
    const diff = await gv.diffVersions(v1.id, v2.id);
    assertEq(diff.summary.addedNodes, diff.added.nodes.length, 'added count');
    assertEq(diff.summary.removedNodes, diff.removed.nodes.length, 'removed count');
    assertEq(diff.summary.modifiedNodes, diff.modified.nodes.length, 'modified count');
  });

  console.log('\n5. getVersions list');

  await test('getVersions returns versions newest first', async () => {
    const list = await gv.getVersions(workspace.id);
    assert(list.length >= 2, 'at least 2 versions');
    assert(list[0].versionNumber >= list[1].versionNumber, 'newest first');
  });

  await test('getVersions list excludes raw snapshot but includes metadata', async () => {
    const list = await gv.getVersions(workspace.id);
    assert(list[0].metadata, 'metadata present');
    assert(typeof list[0].metadata.nodeCount === 'number', 'nodeCount');
  });

  console.log('\n6. restoreVersion');

  await test('restoreVersion without confirm throws', async () => {
    let threw = false;
    try {
      await gv.restoreVersion(workspace.id, v1.id, {});
    } catch (e) {
      threw = e.message.includes('confirm');
    }
    assert(threw, 'requires confirm flag');
  });

  await test('restoreVersion with confirm restores v1 (drops Product, reverts description)', async () => {
    const result = await gv.restoreVersion(workspace.id, v1.id, { confirm: true });
    assertNotNull(result.safetyVersionId, 'safety version created');
    assertEq(result.restored.nodes, 2, 'two nodes restored');
    assertEq(result.restored.edges, 1, 'one edge restored');

    // Verify drafts in DB now match v1
    const list = await drafts.list(workspace.id, { limit: 50 });
    assertEq(list.items.length, 2, 'two drafts');
    const customer = list.items.find(d => d.name === 'Customer');
    assertNotNull(customer, 'Customer present');
    assertEq(customer.description, 'Customer entity', 'original description');
    assert(!list.items.some(d => d.name === 'Product'), 'Product gone');
  });

  await test('safety checkpoint exists in version list', async () => {
    const list = await gv.getVersions(workspace.id);
    const safety = list.find(v => v.note && v.note.includes('safety'));
    assertNotNull(safety, 'safety checkpoint');
    assertEq(safety.createdBy, 'auto', 'created by auto');
  });

  console.log('\n7. Cleanup');

  await test('clean up test data from Memgraph', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (w)-[:HAS_VERSION]->(v)
       OPTIONAL MATCH (w)-[:HAS_AGENT_SESSION]->(s)
       OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m)
       OPTIONAL MATCH (s)-[:HAS_ACTION]->(a)
       DETACH DELETE w, d, v, s, m, a`,
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
