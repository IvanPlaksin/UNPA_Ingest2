'use strict';
/**
 * CGE-005 — Integration test: verify all primitives work with typed edge labels.
 * Run from project root: node api/scripts/test-cge005.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mg = require('../src/services/memgraph.service');
const { ALL_EDGE_TYPES } = require('../src/constants/canonical-graph.constants');
const { entityStoreService } = require('../src/services/knowledge/entity-store.service');
const { impactAnalysisService } = require('../src/services/knowledge/impact-analysis.service');

// Services object required by primitives' execute(params, ctx, services)
const SERVICES = { entityStoreService, impactAnalysisService };

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function getTestEntity() {
  const rows = await mg.runQuery(
    `MATCH (e:ESEntity) RETURN e.id AS id, e.name AS name, e.type AS type LIMIT 100`, {}
  );
  // Find one with outgoing edges
  for (const row of rows) {
    const edgeCheck = await mg.runQuery(
      `MATCH (a:ESEntity {id: $id})-[r:MENTIONS|GOVERNS|MANDATES|PART_OF|REFERENCES|RELATED_TO]->(b:ESEntity)
       RETURN count(r) AS cnt LIMIT 1`,
      { id: row.id }
    );
    const cnt = edgeCheck[0]?.cnt;
    const n = typeof cnt === 'object' ? (cnt?.low ?? 0) : (cnt ?? 0);
    if (n > 0) return row;
  }
  return rows[0];
}

async function main() {
  console.log('=== CGE-005 Integration Test ===\n');

  // ── 1. Verify typed edges exist ──────────────────────────────────────────────
  console.log('1. Typed edge existence');
  for (const edgeType of ALL_EDGE_TYPES.slice(0, 5)) { // sample 5
    const rows = await mg.runQuery(
      `MATCH ()-[r:${edgeType}]->() RETURN count(r) AS cnt`,
      {}
    );
    const cnt = rows[0]?.cnt;
    const n = typeof cnt === 'object' ? (cnt?.low ?? 0) : (cnt ?? 0);
    ok(`:${edgeType}`, n > 0, `${n} edges`);
  }

  // ── 2. type(r) returns canonical label ──────────────────────────────────────
  console.log('\n2. type(r) returns canonical label');
  const typeRows = await mg.runQuery(
    `MATCH ()-[r:GOVERNS]->() RETURN type(r) AS t LIMIT 1`, {}
  );
  ok('type(r) on :GOVERNS', typeRows[0]?.t === 'GOVERNS', typeRows[0]?.t);

  // ── 3. No ES_RELATED_TO edges remain without migration ──────────────────────
  console.log('\n3. ES_RELATED_TO still present (rollback available)');
  const oldEdges = await mg.runQuery(
    `MATCH ()-[r:ES_RELATED_TO]->() RETURN count(r) AS cnt`, {}
  );
  const oldCnt = oldEdges[0]?.cnt;
  const n = typeof oldCnt === 'object' ? (oldCnt?.low ?? 0) : (oldCnt ?? 0);
  ok('ES_RELATED_TO count', n > 0, `${n} legacy edges available for rollback`);

  // ── 4. profile.primitive.js ─────────────────────────────────────────────────
  console.log('\n4. PROFILE primitive');
  const testEntity = await getTestEntity();
  console.log(`   Using entity: ${testEntity.name} (${testEntity.type})`);
  const profilePrim = require('../src/services/investigation/primitives/profile.primitive.js');
  const profileResult = await profilePrim.execute({ entityId: testEntity.id }, {}, SERVICES);
  const out = profileResult?.content?.outgoing || [];
  const inc = profileResult?.content?.incoming || [];
  ok('profile returns results', !!(profileResult?.content), `outgoing=${out.length}, incoming=${inc.length}`);
  if (out.length > 0) {
    ok('outgoing relType is canonical', ALL_EDGE_TYPES.includes(out[0].relType), out[0].relType);
  }
  if (inc.length > 0) {
    ok('incoming relType is canonical', ALL_EDGE_TYPES.includes(inc[0].relType), inc[0].relType);
  }

  // ── 5. resolve.primitive.js ─────────────────────────────────────────────────
  console.log('\n5. RESOLVE primitive');
  try {
    const resolvePrim = require('../src/services/investigation/primitives/resolve.primitive.js');
    const resolveResult = await resolvePrim.execute({ entityId: testEntity.id, threshold: 0.5 }, {}, SERVICES);
    const candidates = resolveResult?.content?.candidates || [];
    ok('resolve returns', !!resolveResult?.content, `candidates=${candidates.length}`);
  } catch (e) {
    ok('resolve no crash', false, e.message);
  }

  // ── 6. structure.primitive.js ───────────────────────────────────────────────
  console.log('\n6. STRUCTURE primitive');
  try {
    const structPrim = require('../src/services/investigation/primitives/structure.primitive.js');
    const structResult = await structPrim.execute({ entityIds: [testEntity.id], depth: 1 }, {}, SERVICES);
    const nodes = structResult?.content?.nodes || [];
    const edges = structResult?.content?.edges || [];
    ok('structure returns', !!structResult?.content, `nodes=${nodes.length}, edges=${edges.length}`);
    if (edges.length > 0) {
      ok('structure edge relType is canonical', ALL_EDGE_TYPES.includes(edges[0].relType), edges[0].relType);
    }
  } catch (e) {
    ok('structure no crash', false, e.message);
  }

  // ── 7. matrix.primitive.js ──────────────────────────────────────────────────
  console.log('\n7. MATRIX primitive');
  try {
    const matrixPrim = require('../src/services/investigation/primitives/matrix.primitive.js');
    const edgeSample = await mg.runQuery(
      `MATCH (a:ESEntity)-[:GOVERNS]->(b:ESEntity) RETURN a.id AS aId, b.id AS bId LIMIT 1`, {}
    );
    if (edgeSample.length > 0) {
      const matrixResult = await matrixPrim.execute({
        rowEntityIds: [edgeSample[0].aId],
        colEntityIds: [edgeSample[0].bId],
      }, {}, SERVICES);
      ok('matrix returns', !!matrixResult?.content, `cells=${matrixResult?.content?.cells?.length || 0}`);
    } else {
      ok('matrix no GOVERNS edges found', true, 'skip');
    }
  } catch (e) {
    ok('matrix no crash', false, e.message);
  }

  // ── 8. impact-analysis.service.js ───────────────────────────────────────────
  console.log('\n8. IMPACT ANALYSIS');
  try {
    const summary = await impactAnalysisService.quickSummary(testEntity.id);
    ok('quickSummary returns', summary != null, `direct=${summary.directCount}, total=${summary.total}`);

    const full = await impactAnalysisService.analyzeImpact(testEntity.id, { maxDepth: 3, includeStructural: false });
    ok('analyzeImpact returns', !!full, `dependents=${full?.directDependents?.length || 0}`);
    if (full?.directDependents?.length > 0) {
      ok('impact relType is canonical', ALL_EDGE_TYPES.includes(full.directDependents[0].relType), full.directDependents[0].relType);
    }
  } catch (e) {
    ok('impactAnalysisService no crash', false, e.message);
  }

  // ── 9. entity-store getAllEdgesBetween ───────────────────────────────────────
  console.log('\n9. getAllEdgesBetween');
  try {
    const edgeSample = await mg.runQuery(
      `MATCH (a:ESEntity)-[r:PART_OF]->(b:ESEntity) RETURN a.id AS aId, b.id AS bId LIMIT 1`, {}
    );
    if (edgeSample.length > 0) {
      const edges = await entityStoreService.getAllEdgesBetween(edgeSample[0].aId, edgeSample[0].bId);
      ok('getAllEdgesBetween returns', edges.length > 0, `${edges.length} edges`);
      ok('edge relType is canonical', ALL_EDGE_TYPES.includes(edges[0].relType), edges[0].relType);
    } else {
      ok('getAllEdgesBetween no PART_OF edges', true, 'skip');
    }
  } catch (e) {
    ok('getAllEdgesBetween no crash', false, e.message);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed === 0) {
    console.log('CGE-005 PASSED — ready for CGE-006 (ES_RELATED_TO cleanup)');
  } else {
    console.log('CGE-005 FAILED — do NOT proceed to CGE-006');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
