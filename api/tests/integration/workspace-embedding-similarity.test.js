/**
 * WorkSpace Embedding-Based Similarity Tests (WS3-004)
 *
 * Validates the hybrid (name + embedding) similarity scoring used by
 * contradiction detection. We test:
 *   1. Pure helpers (cosine, hybrid weighting)
 *   2. Graceful fallback when embeddings are absent
 *   3. Embedding-driven detection: drafts with same name BUT semantically
 *      different vectors should NOT be grouped (embedding contradicts name).
 *   4. Embedding-driven detection: drafts with different names BUT identical
 *      vectors SHOULD be grouped (embedding agrees they are the same concept).
 *
 * Strategy for (3) and (4): we monkey-patch
 * `qdrant.workspaceGetVectors` to return our controlled vector map. This
 * keeps the test independent of TEI availability.
 *
 * Run: node api/tests/integration/workspace-embedding-similarity.test.js
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
function assertClose(a, b, eps, l) { if (Math.abs(a - b) > eps) throw new Error(`${l}: expected ${b} ±${eps}, got ${a}`); }
function assertNotNull(v, l) { if (v === null || v === undefined) throw new Error(`${l}: expected non-null`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Embedding-Based Similarity Tests (WS3-004)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, contradictions, qdrant, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    contradictions = require('../../src/services/workspace/contradiction.service');
    qdrant = require('../../src/services/qdrant.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // ─── 1. Pure helpers ───────────────────────────────────────────

  console.log('1. Pure helpers');

  await test('cosineSimilarity identical vectors = 1', () => {
    assertEq(contradictions.cosineSimilarity([1, 0, 0], [1, 0, 0]), 1, 'cos');
  });

  await test('cosineSimilarity orthogonal vectors = 0', () => {
    assertEq(contradictions.cosineSimilarity([1, 0, 0], [0, 1, 0]), 0, 'cos');
  });

  await test('cosineSimilarity scaled identical vectors = 1', () => {
    assertEq(contradictions.cosineSimilarity([1, 2, 3], [2, 4, 6]), 1, 'cos');
  });

  await test('cosineSimilarity opposite vectors = -1 (raw)', () => {
    assertEq(contradictions.cosineSimilarity([1, 0, 0], [-1, 0, 0]), -1, 'cos');
  });

  await test('cosineSimilarity returns 0 for invalid input', () => {
    assertEq(contradictions.cosineSimilarity([], [1, 2]), 0, 'empty');
    assertEq(contradictions.cosineSimilarity(null, [1, 2]), 0, 'null');
    assertEq(contradictions.cosineSimilarity([1, 2, 3], [1, 2]), 0, 'mismatched length');
  });

  await test('hybridSimilarity identical names + identical vecs = 1', () => {
    assertEq(contradictions.hybridSimilarity('foo', 'foo', [1, 0], [1, 0]), 1, 'hybrid');
  });

  await test('hybridSimilarity identical names + opposite vecs = 0.4 (clamped to 0)', () => {
    // Name=1 * 0.4 + clamp(-1)=0 * 0.6 = 0.4
    assertClose(contradictions.hybridSimilarity('foo', 'foo', [1, 0], [-1, 0]), 0.4, 0.001, 'hybrid');
  });

  await test('hybridSimilarity different names + identical vecs = 0.6', () => {
    // Name=0 * 0.4 + cos=1 * 0.6 = 0.6
    assertClose(contradictions.hybridSimilarity('foo', 'bar', [1, 0], [1, 0]), 0.6, 0.001, 'hybrid');
  });

  await test('hybridSimilarity falls back to name-only when no vectors', () => {
    assertEq(contradictions.hybridSimilarity('foo', 'foo', null, null), 1, 'fallback');
    assertEq(contradictions.hybridSimilarity('foo', 'foo', [], []), 1, 'fallback empty');
  });

  await test('NAME_WEIGHT + EMBEDDING_WEIGHT === 1', () => {
    assertClose(contradictions.NAME_WEIGHT + contradictions.EMBEDDING_WEIGHT, 1, 0.001, 'weights sum');
  });

  // ─── 2. Mocked vector map: hybrid in action ────────────────────

  console.log('\n2. Mocked qdrant — hybrid scoring drives grouping');

  const TEST_USER = 'test-embedding-user';
  let workspace, sourceA, sourceB;
  let draftSameName, draftSameNameDiff;
  let draftDiffName1, draftDiffName2;

  await test('create workspace + sources + drafts', async () => {
    workspace = await ws.create({
      name: 'Embedding Test WS',
      description: 'WS3-004',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    sourceA = await ws.addSource(workspace.id, {
      filename: 'a.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });
    sourceB = await ws.addSource(workspace.id, {
      filename: 'b.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });

    // Pair 1: same name "Customer", but semantically DIFFERENT (e.g. one is bank, one is restaurant)
    draftSameName = await drafts.create(workspace.id, {
      type: 'entity', name: 'Customer', description: 'banking customer',
      content: { account_id: 'string' }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    draftSameNameDiff = await drafts.create(workspace.id, {
      type: 'entity', name: 'Customer', description: 'restaurant customer',
      content: { account_id: 'number' }, sourceId: sourceB.id, confidence: 0.85, extractedBy: TEST_USER
    });

    // Pair 2: different names but semantically same ("Client" in source A == "Customer" in source B)
    draftDiffName1 = await drafts.create(workspace.id, {
      type: 'entity', name: 'Client', description: 'a client account',
      content: { id: 'uuid' }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    draftDiffName2 = await drafts.create(workspace.id, {
      type: 'entity', name: 'Patron', description: 'a patron record',
      content: { id: 'string' }, sourceId: sourceB.id, confidence: 0.9, extractedBy: TEST_USER
    });
  });

  // Save & restore the original method so we don't pollute other tests
  const originalGetVectors = qdrant.workspaceGetVectors.bind(qdrant);

  await test('mocked vectors: opposite vecs prevent same-name grouping', async () => {
    // Mock: same-name drafts have OPPOSITE vectors
    qdrant.workspaceGetVectors = async () => new Map([
      [draftSameName.id,     [1, 0, 0, 0]],   // banking
      [draftSameNameDiff.id, [-1, 0, 0, 0]],  // restaurant — semantically opposite
      [draftDiffName1.id,    [0, 1, 0, 0]],   // unrelated
      [draftDiffName2.id,    [0, 0, 1, 0]]    // unrelated
    ]);

    const result = await contradictions.detectContradictions(workspace.id);
    // Same-name pair should NOT produce a contradiction because hybrid sim = 0.4 < 0.75
    const sameNameContras = (result.created || []).filter(c =>
      c.entityIds.includes(draftSameName.id) && c.entityIds.includes(draftSameNameDiff.id)
    );
    assertEq(sameNameContras.length, 0, 'same-name pair NOT grouped (embedding overrode)');
  });

  await test('cleanup contradictions for next test', async () => {
    await mg.runQuery(
      `MATCH (c:ContradictionNode {workspaceId: $id}) DETACH DELETE c`,
      { id: workspace.id }
    );
  });

  await test('mocked vectors: identical vecs link different-name drafts', async () => {
    // Mock: different-name drafts have IDENTICAL vectors AND same content key
    qdrant.workspaceGetVectors = async () => new Map([
      [draftSameName.id,     [0, 0, 0, 1]],   // unrelated
      [draftSameNameDiff.id, [0, 0, 0, -1]],  // unrelated
      [draftDiffName1.id,    [1, 1, 1, 1]],   // semantically same
      [draftDiffName2.id,    [1, 1, 1, 1]]    // semantically same
    ]);

    const result = await contradictions.detectContradictions(workspace.id);
    // Different-name pair (Client vs Patron) should now be grouped because cos=1, hybrid >= 0.6
    // BUT 0.6 < 0.75 default threshold. Use a lower threshold to verify the embedding kicks in.
    const lowerThreshold = await contradictions.detectContradictions(workspace.id, {
      similarityThreshold: 0.55
    });
    // Check the field "id" differs ('uuid' vs 'string') so we expect a contradiction
    const diffNameContras = (result.created || []).concat(lowerThreshold.created || []).filter(c =>
      c.entityIds.includes(draftDiffName1.id) && c.entityIds.includes(draftDiffName2.id)
    );
    assert(diffNameContras.length >= 1, `expected contradiction Client↔Patron (got ${diffNameContras.length})`);
  });

  await test('cleanup contradictions for fallback test', async () => {
    await mg.runQuery(
      `MATCH (c:ContradictionNode {workspaceId: $id}) DETACH DELETE c`,
      { id: workspace.id }
    );
  });

  await test('useEmbeddings=false skips Qdrant entirely (name-only fallback)', async () => {
    // Even though mock is still active, useEmbeddings=false should skip the call
    let mockCalled = false;
    qdrant.workspaceGetVectors = async () => { mockCalled = true; return new Map(); };

    const result = await contradictions.detectContradictions(workspace.id, {
      useEmbeddings: false
    });
    assertEq(mockCalled, false, 'Qdrant not called');
    // With name-only, same-name "Customer" pair grouping returns based on name similarity
    const sameNameContras = (result.created || []).filter(c =>
      c.entityIds.includes(draftSameName.id) && c.entityIds.includes(draftSameNameDiff.id)
    );
    assert(sameNameContras.length >= 1, 'name-only path detects same-name conflict');
  });

  await test('restore original qdrant.workspaceGetVectors', () => {
    qdrant.workspaceGetVectors = originalGetVectors;
  });

  // ─── 3. Cleanup ────────────────────────────────────────────────

  console.log('\n3. Cleanup');

  await test('clean up test data', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (d)-[:HAS_CONTRADICTION]->(c)
       OPTIONAL MATCH (w)-[:HAS_SOURCE]->(s)
       DETACH DELETE w, d, c, s`,
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
