/**
 * WorkSpace Integration Tests
 *
 * End-to-end tests for WorkSpace subsystem.
 * Tests isolation, security, and full lifecycle.
 *
 * Run: node api/tests/integration/workspace.test.js
 *
 * @module tests/integration/workspace
 */

'use strict';

// Simple test harness (no external test framework dependency)
let passed = 0;
let failed = 0;
let skipped = 0;
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

function skip(name, reason) {
  skipped++;
  console.log(`  ○ ${name} (SKIPPED: ${reason})`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotNull(value, label) {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected non-null value`);
  }
}

function assertThrows(fn, expectedMessage) {
  let threw = false;
  let actualMessage = '';
  try {
    // If fn returns a promise, this won't work for async
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { throw new Error(`Expected error containing "${expectedMessage}" but none was thrown`); },
        (err) => {
          if (!err.message.includes(expectedMessage)) {
            throw new Error(`Expected error "${expectedMessage}" but got "${err.message}"`);
          }
        }
      );
    }
  } catch (err) {
    threw = true;
    actualMessage = err.message;
  }
  if (!threw) {
    throw new Error(`Expected error containing "${expectedMessage}" but none was thrown`);
  }
  if (!actualMessage.includes(expectedMessage)) {
    throw new Error(`Expected error "${expectedMessage}" but got "${actualMessage}"`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  WorkSpace Integration Tests');
  console.log('═══════════════════════════════════════════════════\n');

  // Lazy-load services (may fail if services not running)
  let ws, drafts, createProxy, qdrant;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    const wsModule = require('../../src/services/workspace');
    createProxy = wsModule.createReadOnlyProxy;
    qdrant = require('../../src/services/qdrant.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    console.error('  Ensure API services are available.\n');
    process.exit(1);
  }

  const TEST_USER = 'test-integration-user';
  let workspaceA = null;
  let workspaceB = null;
  let sourceA = null;
  let draftEntity = null;
  let draftRule = null;

  // ── 1. WORKSPACE LIFECYCLE ──────────────────────────────────────

  console.log('1. WorkSpace Lifecycle');

  await test('create workspace', async () => {
    workspaceA = await ws.create({
      name: 'Test WorkSpace Alpha',
      description: 'Integration test workspace A',
      domain: 'IT',
      tags: ['test', 'integration'],
      createdBy: TEST_USER
    });
    assertNotNull(workspaceA.id, 'workspace.id');
    assertEqual(workspaceA.status, 'CREATED', 'status');
    assert(workspaceA.namespace.startsWith('workspace:'), 'namespace prefix');
  });

  await test('get workspace by ID', async () => {
    const fetched = await ws.get(workspaceA.id);
    assertNotNull(fetched, 'fetched workspace');
    assertEqual(fetched.id, workspaceA.id, 'id match');
    assertEqual(fetched.name, 'Test WorkSpace Alpha', 'name match');
  });

  await test('list workspaces', async () => {
    const result = await ws.list({ limit: 50 });
    assert(result.items.length >= 1, 'at least 1 workspace');
    assert(result.items.some(w => w.id === workspaceA.id), 'contains our workspace');
  });

  await test('update workspace metadata', async () => {
    const updated = await ws.update(workspaceA.id, {
      description: 'Updated description',
      domain: 'FINANCE'
    });
    assertEqual(updated.description, 'Updated description', 'description updated');
  });

  await test('add source → auto-transition to PROFILING', async () => {
    sourceA = await ws.addSource(workspaceA.id, {
      filename: 'test-document.pdf',
      mimeType: 'application/pdf',
      sourceType: 'FILE',
      sizeBytes: 2048
    });
    assertNotNull(sourceA.id, 'source.id');
    assertEqual(sourceA.status, 'PENDING', 'source status');

    const updated = await ws.get(workspaceA.id);
    assertEqual(updated.status, 'PROFILING', 'workspace auto-transitioned');
  });

  await test('list sources', async () => {
    const sources = await ws.listSources(workspaceA.id);
    assert(sources.length === 1, 'one source');
    assertEqual(sources[0].filename, 'test-document.pdf', 'filename');
  });

  await test('valid status transitions: PROFILING → READY → EXTRACTING → READY', async () => {
    await ws.updateStatus(workspaceA.id, 'READY');
    let w = await ws.get(workspaceA.id);
    assertEqual(w.status, 'READY', 'READY');

    await ws.updateStatus(workspaceA.id, 'EXTRACTING');
    w = await ws.get(workspaceA.id);
    assertEqual(w.status, 'EXTRACTING', 'EXTRACTING');

    await ws.updateStatus(workspaceA.id, 'READY');
    w = await ws.get(workspaceA.id);
    assertEqual(w.status, 'READY', 'back to READY');
  });

  await test('invalid transition READY → PROMOTED throws', async () => {
    await assertThrows(
      () => ws.updateStatus(workspaceA.id, 'PROMOTED'),
      'Invalid status transition'
    );
  });

  await test('get workspace stats', async () => {
    const stats = await ws.getStats(workspaceA.id);
    assertNotNull(stats.sources, 'stats.sources');
    assertNotNull(stats.drafts, 'stats.drafts');
  });

  // ── 2. DRAFT KNOWLEDGE OBJECTS ────────────────────────────────

  console.log('\n2. Draft Knowledge Objects');

  await test('create draft entity', async () => {
    draftEntity = await drafts.create(workspaceA.id, {
      type: 'entity',
      name: 'Employee',
      description: 'Employee entity from HR module',
      content: {
        attributes: [
          { name: 'staff_id', type: 'integer', required: true },
          { name: 'full_name', type: 'string', required: true },
          { name: 'email', type: 'string', required: false }
        ],
        primaryKey: 'staff_id',
        domain: 'HR'
      },
      sourceId: sourceA.id,
      confidence: 0.85,
      extractedBy: 'test-agent'
    });
    assertNotNull(draftEntity.id, 'draft.id');
    assertEqual(draftEntity.type, 'entity', 'type');
    assertEqual(draftEntity.status, 'DRAFT', 'status');
    assert(typeof draftEntity.contentHash === 'string', 'has contentHash');
  });

  await test('create draft business rule', async () => {
    draftRule = await drafts.create(workspaceA.id, {
      type: 'business_rule',
      name: 'Leave Approval Limit',
      content: {
        condition: 'leave_days > 5',
        action: 'require_supervisor_approval',
        scope: 'HR',
        enforcement: 'mandatory'
      },
      sourceId: sourceA.id,
      confidence: 0.9
    });
    assertNotNull(draftRule.id, 'rule.id');
    assertEqual(draftRule.type, 'business_rule', 'type');
  });

  await test('create draft concept', async () => {
    const concept = await drafts.create(workspaceA.id, {
      type: 'concept',
      name: 'Duty Station',
      content: {
        definition: 'Official location where a staff member is assigned',
        synonyms: ['post', 'location', 'assignment location'],
        domain: 'HR'
      },
      sourceId: sourceA.id
    });
    assertNotNull(concept.id, 'concept.id');
  });

  await test('list drafts by type', async () => {
    const result = await drafts.list(workspaceA.id, { type: 'entity' });
    assert(result.items.length >= 1, 'at least 1 entity');
    assert(result.items.every(d => d.type === 'entity'), 'all entities');
  });

  await test('list all drafts', async () => {
    const result = await drafts.list(workspaceA.id, {});
    assert(result.total >= 3, 'at least 3 drafts total');
  });

  await test('get draft by ID', async () => {
    const fetched = await drafts.get(workspaceA.id, draftEntity.id);
    assertNotNull(fetched, 'fetched draft');
    assertEqual(fetched.id, draftEntity.id, 'id match');
    assertEqual(fetched.name, 'Employee', 'name');
  });

  await test('update draft content recomputes hash', async () => {
    const originalHash = draftEntity.contentHash;
    const updated = await drafts.update(workspaceA.id, draftEntity.id, {
      content: {
        attributes: [
          { name: 'staff_id', type: 'integer', required: true },
          { name: 'full_name', type: 'string', required: true },
          { name: 'email', type: 'string', required: false },
          { name: 'department', type: 'string', required: true }
        ],
        primaryKey: 'staff_id',
        domain: 'HR'
      }
    });
    assert(updated.contentHash !== originalHash, 'hash changed');
  });

  await test('update draft status: DRAFT → VALIDATED', async () => {
    const updated = await drafts.update(workspaceA.id, draftEntity.id, {
      status: 'VALIDATED'
    });
    assertEqual(updated.status, 'VALIDATED', 'status');
  });

  await test('invalid draft status transition throws', async () => {
    await assertThrows(
      () => drafts.update(workspaceA.id, draftEntity.id, { status: 'PROMOTED' }),
      'Invalid draft status transition'
    );
  });

  await test('create edge between drafts', async () => {
    const edge = await drafts.createEdge(workspaceA.id, {
      sourceId: draftRule.id,
      targetId: draftEntity.id,
      edgeType: 'GOVERNS',
      confidence: 0.85
    });
    assertNotNull(edge, 'edge created');
    assertEqual(edge.edgeType, 'GOVERNS', 'edgeType');
  });

  await test('get edges for draft', async () => {
    const edges = await drafts.getEdges(workspaceA.id, draftEntity.id, { direction: 'both' });
    assert(edges.length >= 1, 'has edges');
  });

  await test('batch create drafts', async () => {
    const batchDrafts = [
      { type: 'requirement', name: 'REQ-001', content: { reqType: 'FUNCTIONAL' }, sourceId: sourceA.id },
      { type: 'anomaly', name: 'ANM-001', content: { anomalyType: 'TECH_DEBT' }, sourceId: sourceA.id }
    ];
    const created = await drafts.createBatch(workspaceA.id, batchDrafts);
    assert(created.length === 2, 'batch created 2');
  });

  // ── 3. WORKSPACE ISOLATION ──────────────────────────────────

  console.log('\n3. WorkSpace Isolation');

  await test('create second workspace', async () => {
    workspaceB = await ws.create({
      name: 'Test WorkSpace Beta',
      description: 'For isolation testing',
      createdBy: TEST_USER
    });
    assertNotNull(workspaceB.id, 'workspaceB.id');
  });

  await test('workspace B drafts list is empty', async () => {
    const result = await drafts.list(workspaceB.id, {});
    assertEqual(result.total, 0, 'no drafts in B');
  });

  await test('cannot get workspace A draft from workspace B context', async () => {
    const result = await drafts.get(workspaceB.id, draftEntity.id);
    assertEqual(result, null, 'should be null (isolated)');
  });

  await test('cross-workspace edge creation fails', async () => {
    const draftInB = await drafts.create(workspaceB.id, {
      type: 'entity',
      name: 'BetaEntity',
      content: {}
    });

    await assertThrows(
      () => drafts.createEdge(workspaceA.id, {
        sourceId: draftEntity.id,
        targetId: draftInB.id,
        edgeType: 'CROSS_WS'
      }),
      'not found'
    );
  });

  // ── 4. READONLY PROXY SECURITY ────────────────────────────────

  console.log('\n4. ReadOnlyProxy Security');

  await test('blocks CREATE queries', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      await assertThrows(
        () => proxy.query('CREATE (n:Hack {id: 1}) RETURN n'),
        'Write operations not allowed'
      );
    } finally {
      await proxy.close();
    }
  });

  await test('blocks SET queries', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      await assertThrows(
        () => proxy.query('MATCH (n) SET n.hacked = true'),
        'Write operations not allowed'
      );
    } finally {
      await proxy.close();
    }
  });

  await test('blocks DELETE queries', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      await assertThrows(
        () => proxy.query('MATCH (n) DELETE n'),
        'Write operations not allowed'
      );
    } finally {
      await proxy.close();
    }
  });

  await test('blocks MERGE queries', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      await assertThrows(
        () => proxy.query('MERGE (n:Node {id: 1}) RETURN n'),
        'Write operations not allowed'
      );
    } finally {
      await proxy.close();
    }
  });

  await test('blocks workspace namespace in query', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      await assertThrows(
        () => proxy.query(`MATCH (n) WHERE n.namespace = 'workspace:${workspaceB.id}' RETURN n`),
        'workspace namespace not allowed'
      );
    } finally {
      await proxy.close();
    }
  });

  await test('allows MATCH on KB namespaces', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      const results = await proxy.query(
        "MATCH (n) WHERE n.namespace = 'core' RETURN n LIMIT 1"
      );
      assert(Array.isArray(results), 'returns array');
    } finally {
      await proxy.close();
    }
  });

  await test('getNodeStub returns null for non-existent entity', async () => {
    const proxy = createProxy(workspaceA.id, TEST_USER);
    try {
      const ref = await proxy.getNodeStub('non-existent-id-12345');
      assertEqual(ref, null, 'should be null');
    } finally {
      await proxy.close();
    }
  });

  // ── 5. ENUMS & CONFIG VALIDATION ────────────────────────────

  console.log('\n5. Enums & Config Validation');

  await test('WorkspaceStatus enum has all states', () => {
    const { WorkspaceStatus } = require('../../src/config/enums');
    const expected = ['CREATED', 'PROFILING', 'READY', 'EXTRACTING', 'PAUSED', 'REVIEW', 'PROMOTED', 'ARCHIVED'];
    for (const s of expected) {
      assertNotNull(WorkspaceStatus[s], `WorkspaceStatus.${s}`);
    }
  });

  await test('DraftKnowledgeStatus enum has all states', () => {
    const { DraftKnowledgeStatus } = require('../../src/config/enums');
    const expected = ['DRAFT', 'VALIDATED', 'READY_TO_PROMOTE', 'PROMOTED', 'REJECTED', 'CONFLICT', 'MERGED'];
    for (const s of expected) {
      assertNotNull(DraftKnowledgeStatus[s], `DraftKnowledgeStatus.${s}`);
    }
  });

  await test('PromotionAction enum has all actions', () => {
    const { PromotionAction } = require('../../src/config/enums');
    const expected = ['NEW', 'ENRICH', 'SUPERSEDE', 'MERGE', 'CONFLICT', 'REJECT'];
    for (const s of expected) {
      assertNotNull(PromotionAction[s], `PromotionAction.${s}`);
    }
  });

  await test('namespace config has WORKSPACE', () => {
    const { getNamespaceConfig } = require('../../src/config/namespace.config');
    const config = getNamespaceConfig('workspace:test-id');
    assertNotNull(config, 'workspace config exists');
    assertEqual(config.namespace, 'workspace', 'namespace value');
    assert(config.isolation.readFromGlobalKB === true, 'readFromGlobalKB');
    assert(config.isolation.writeToGlobalKB === false, 'writeToGlobalKB');
    assert(config.isolation.crossWorkspaceRead === false, 'crossWorkspaceRead');
  });

  await test('DRAFT_TYPE_LABELS has 12 types', () => {
    const { DRAFT_TYPE_LABELS } = require('../../src/services/workspace/draft.service');
    assertEqual(Object.keys(DRAFT_TYPE_LABELS).length, 12, 'type count');
  });

  // ── 6. CLEANUP ────────────────────────────────────────────────

  console.log('\n6. Cleanup');

  await test('archive and delete workspace B', async () => {
    if (!workspaceB) return;
    await ws.archive(workspaceB.id);
    const archived = await ws.get(workspaceB.id);
    assertEqual(archived.status, 'ARCHIVED', 'archived');
    await ws.delete(workspaceB.id);
    const deleted = await ws.get(workspaceB.id);
    assertEqual(deleted, null, 'deleted');
    workspaceB = null;
  });

  await test('cannot delete non-archived workspace', async () => {
    await assertThrows(
      () => ws.delete(workspaceA.id),
      'Archive it first'
    );
  });

  await test('archive and delete workspace A', async () => {
    if (!workspaceA) return;
    await ws.archive(workspaceA.id);
    await ws.delete(workspaceA.id);
    const deleted = await ws.get(workspaceA.id);
    assertEqual(deleted, null, 'deleted');
    workspaceA = null;
  });

  // ── SUMMARY ──────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  Total: ${passed + failed + skipped} checks`);
  console.log('═══════════════════════════════════════════════════');

  if (errors.length > 0) {
    console.log('\nFailures:');
    for (const e of errors) {
      console.log(`  ✗ ${e.name}: ${e.error}`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

// Run
run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
