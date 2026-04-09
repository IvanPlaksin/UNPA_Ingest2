/**
 * WorkSpace Link Predictor Tests (WS3-007)
 *
 * Validates the GNN-based link predictor with mocked fetch responses.
 * We monkey-patch global.fetch so the test is hermetic — no GNN service
 * required to run.
 *
 * Test scenarios:
 *   1. suggestRelationType pure function
 *   2. GNN unavailable → graceful fallback (empty result)
 *   3. GNN /predict-links 200 → predictions parsed and filtered
 *   4. GNN /predict-links 404 → fallback to embedding cosine
 *   5. cross-source.suggestMissingLinks(includeGnn=true) merges GNN results
 *   6. existing edges filtered out
 *
 * Run: node api/tests/integration/workspace-link-predictor.test.js
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
  console.log('  Link Predictor Tests (WS3-007)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, linkPredictor, crossSource, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    linkPredictor = require('../../src/services/workspace/link-predictor.service');
    crossSource = require('../../src/services/workspace/cross-source.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // Save original fetch — we monkey-patch per test
  const originalFetch = global.fetch;

  function mockFetch(handlers) {
    global.fetch = async (url, opts) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      for (const h of handlers) {
        if (h.match.test(path)) return h.respond(opts);
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmatched' }) };
    };
  }

  const restoreFetch = () => { global.fetch = originalFetch; };

  // ─── 1. Pure helpers ───────────────────────────────────────────

  console.log('1. Pure helpers');

  await test('suggestRelationType: entity + business_rule → GOVERNED_BY', () => {
    assertEq(linkPredictor.suggestRelationType('entity', 'business_rule'), 'GOVERNED_BY', 'rel');
  });
  await test('suggestRelationType: business_rule + entity → GOVERNS', () => {
    assertEq(linkPredictor.suggestRelationType('business_rule', 'entity'), 'GOVERNS', 'rel');
  });
  await test('suggestRelationType: schema + entity → DEFINES', () => {
    assertEq(linkPredictor.suggestRelationType('schema', 'entity'), 'DEFINES', 'rel');
  });
  await test('suggestRelationType: same type → SIMILAR_TO', () => {
    assertEq(linkPredictor.suggestRelationType('entity', 'entity'), 'SIMILAR_TO', 'rel');
  });
  await test('suggestRelationType: unknown → RELATES_TO', () => {
    assertEq(linkPredictor.suggestRelationType('foo', 'bar'), 'RELATES_TO', 'rel');
  });

  // ─── 2. Setup ──────────────────────────────────────────────────

  console.log('\n2. Setup workspace');

  const TEST_USER = 'test-link-predictor';
  let workspace, sourceA, sourceB;
  let draftCustomer, draftClient, draftRule;

  await test('create workspace + 3 drafts', async () => {
    workspace = await ws.create({
      name: 'Link Predictor Test WS',
      description: 'WS3-007',
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
    draftCustomer = await drafts.create(workspace.id, {
      type: 'entity', name: 'Customer', description: 'Customer entity',
      content: { id: 'string' }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    draftClient = await drafts.create(workspace.id, {
      type: 'entity', name: 'Client', description: 'Client account',
      content: { id: 'string' }, sourceId: sourceB.id, confidence: 0.85, extractedBy: TEST_USER
    });
    draftRule = await drafts.create(workspace.id, {
      type: 'business_rule', name: 'KYC Rule', description: 'KYC requirement',
      content: { mandatory: true }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
  });

  // ─── 3. GNN unavailable → graceful empty ──────────────────────

  console.log('\n3. GNN unavailable');

  await test('predictLinks returns empty when GNN service is down', async () => {
    mockFetch([
      { match: /\/api\/v1\/gnn\/model-status/, respond: async () => { throw new Error('connection refused'); } },
      { match: /\/api\/v1\/gnn\/embed\/text/,    respond: async () => { throw new Error('connection refused'); } }
    ]);
    const result = await linkPredictor.predictLinks(workspace.id, { threshold: 0.7 });
    restoreFetch();
    assertEq(result.predictions.length, 0, 'no predictions');
    assertEq(result.stats.gnnAvailable, false, 'gnnAvailable=false');
  });

  // ─── 4. GNN /predict-links 200 → parsed ──────────────────────

  console.log('\n4. GNN /predict-links 200');

  await test('predictLinks parses GNN response and filters by threshold', async () => {
    mockFetch([
      { match: /\/api\/v1\/gnn\/model-status/, respond: async () => ({
          ok: true, status: 200, json: async () => ({ link_prediction: { loaded: true } })
      })},
      { match: /\/api\/v1\/gnn\/predict-links/, respond: async () => ({
          ok: true, status: 200, json: async () => ({
            predictions: [
              { sourceId: draftCustomer.id, targetId: draftClient.id, score: 0.92 },
              { sourceId: draftCustomer.id, targetId: draftRule.id, score: 0.81 },
              { sourceId: draftClient.id,   targetId: draftRule.id, score: 0.55 }  // below default threshold
            ]
          })
      })}
    ]);

    const result = await linkPredictor.predictLinks(workspace.id, { threshold: 0.7 });
    restoreFetch();

    assertEq(result.stats.method, 'gnn', 'method gnn');
    assertEq(result.stats.gnnAvailable, true, 'gnnAvailable=true');
    assertEq(result.predictions.length, 2, 'two passed threshold');

    const top = result.predictions[0];
    assertEq(top.source.id, draftCustomer.id, 'top source');
    assertEq(top.probability, 0.92, 'top probability');
    assert(top.suggestedType, 'suggestedType present');
  });

  // ─── 5. GNN 404 → fallback to embedding cosine ─────────────────

  console.log('\n5. GNN /predict-links 404 → embedding cosine fallback');

  await test('predictLinks falls back to embedding cosine on 404', async () => {
    let embedCalls = 0;
    mockFetch([
      { match: /\/api\/v1\/gnn\/model-status/, respond: async () => ({
          ok: true, status: 200, json: async () => ({ link_prediction: { loaded: true } })
      })},
      { match: /\/api\/v1\/gnn\/predict-links/, respond: async () => ({
          ok: false, status: 404, json: async () => ({ error: 'not implemented' })
      })},
      { match: /\/api\/v1\/gnn\/embed\/text/, respond: async (opts) => {
          embedCalls++;
          // Return identical vectors for Customer and Client (high cosine)
          // Different vector for KYC Rule
          const body = JSON.parse(opts.body);
          const text = body.text || '';
          let vec;
          if (text.includes('Customer') || text.includes('Client')) vec = [1, 0, 0, 0];
          else vec = [0, 0, 0, 1];
          return { ok: true, status: 200, json: async () => ({ embedding: vec }) };
      }}
    ]);

    const result = await linkPredictor.predictLinks(workspace.id, { threshold: 0.7 });
    restoreFetch();

    assertEq(result.stats.method, 'embedding-cosine', 'fallback method');
    assert(embedCalls >= 3, `embed/text called per draft (got ${embedCalls})`);
    // Customer ↔ Client should be the top match (cosine 1.0)
    const topPair = result.predictions[0];
    if (topPair) {
      const ids = [topPair.source.id, topPair.target.id].sort();
      const expected = [draftCustomer.id, draftClient.id].sort();
      assertEq(ids[0], expected[0], 'pair[0]');
      assertEq(ids[1], expected[1], 'pair[1]');
      assert(topPair.probability >= 0.9, 'high probability');
    } else {
      throw new Error('expected at least one prediction');
    }
  });

  // ─── 6. Existing edges filtered out ────────────────────────────

  console.log('\n6. Existing edges filter');

  await test('predictLinks skips existing edges when skipExisting=true', async () => {
    // Create an actual draft edge between Customer and Client
    await drafts.createEdge(workspace.id, {
      sourceId: draftCustomer.id, targetId: draftClient.id,
      edgeType: 'BELONGS_TO', confidence: 0.9
    });

    mockFetch([
      { match: /\/api\/v1\/gnn\/model-status/, respond: async () => ({
          ok: true, status: 200, json: async () => ({ link_prediction: { loaded: true } })
      })},
      { match: /\/api\/v1\/gnn\/predict-links/, respond: async () => ({
          ok: true, status: 200, json: async () => ({
            predictions: [
              { sourceId: draftCustomer.id, targetId: draftClient.id, score: 0.95 },  // existing
              { sourceId: draftCustomer.id, targetId: draftRule.id, score: 0.82 }     // new
            ]
          })
      })}
    ]);

    const result = await linkPredictor.predictLinks(workspace.id, { threshold: 0.7, skipExisting: true });
    restoreFetch();

    // Customer↔Client must be filtered out
    const hasExisting = result.predictions.some(p =>
      (p.source.id === draftCustomer.id && p.target.id === draftClient.id) ||
      (p.source.id === draftClient.id && p.target.id === draftCustomer.id)
    );
    assertEq(hasExisting, false, 'existing edge filtered');
    assert(result.predictions.length >= 1, 'still has Customer↔Rule prediction');
  });

  // ─── 7. cross-source.suggestMissingLinks(includeGnn=true) ──────

  console.log('\n7. cross-source includeGnn merge');

  await test('suggestMissingLinks merges GNN results when includeGnn=true', async () => {
    mockFetch([
      { match: /\/api\/v1\/gnn\/model-status/, respond: async () => ({
          ok: true, status: 200, json: async () => ({ link_prediction: { loaded: true } })
      })},
      { match: /\/api\/v1\/gnn\/predict-links/, respond: async () => ({
          ok: true, status: 200, json: async () => ({
            predictions: [
              { sourceId: draftCustomer.id, targetId: draftRule.id, score: 0.88 }
            ]
          })
      })}
    ]);

    const result = await crossSource.suggestMissingLinks(workspace.id, { includeGnn: true });
    restoreFetch();

    assertNotNull(result.gnnStats, 'gnnStats present');
    // GNN-sourced links should appear with source='gnn'
    const hasGnnLink = result.potentialLinks.some(l => l.source === 'gnn');
    assert(hasGnnLink, 'merged GNN link present');
  });

  // ─── 8. Cleanup ────────────────────────────────────────────────

  console.log('\n8. Cleanup');

  await test('clean up test data', async () => {
    restoreFetch();
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (w)-[:HAS_SOURCE]->(s)
       DETACH DELETE w, d, s`,
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
