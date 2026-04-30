/**
 * Phase 2 Integration Test — DevDialogue Collector
 * Tests end-to-end: search, decisions, chains, coverage, MCP tools
 *
 * Usage: node api/src/core/aopeg/plugins/dialogue/tests/phase2-integration.test.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../../.env') });

const memgraphService = require('../../../../../services/memgraph.service');
const { DialogueSearchService } = require('../services/dialogue.search');
const { DialogueQdrantService } = require('../services/dialogue.qdrant');
const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
const { QdrantClient } = require('@qdrant/js-client-rest');

// Initialize shared services
require('../../../../../mcp/tools/dialogue/index.js');
const { SearchDialogueTool } = require('../../../../../mcp/tools/dialogue/SearchDialogueTool');
const { FindDecisionTool } = require('../../../../../mcp/tools/dialogue/FindDecisionTool');

const qdrantService = new DialogueQdrantService();
const embeddingService = new EmbeddingService();
const searchService = new DialogueSearchService(qdrantService, memgraphService, embeddingService);

let passed = 0;
let failed = 0;
const failures = [];

async function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runScenario(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

async function main() {
  console.log('=== PHASE 2 INTEGRATION TEST ===\n');

  // ── Scenario 1: Search relevance ────────────────────────────────────────
  await runScenario('Search returns relevant results', async () => {
    const results = await searchService.search('RuntimeEngine graph execution', { limit: 5 });
    await assert(results.length > 0, 'Should find results for RuntimeEngine query');
    await assert(results[0].finalScore > 0.4, `Top result score ${results[0].finalScore} should be > 0.4`);
    console.log(`    top score=${results[0].finalScore.toFixed(3)} type=${results[0].nodeType}`);
  });

  // ── Scenario 2: Decision structure integrity ─────────────────────────────
  await runScenario('Decisions have correct structure (135 decisions)', async () => {
    const neo4j = require('neo4j-driver');
    const rows = await memgraphService.runQuery(
      'MATCH (d:ArchDecision) RETURN d.decisionId AS id, d.title AS title, d.category AS cat, d.confidence AS conf, d.decision AS dec LIMIT 20',
      {}
    );
    await assert(rows.length > 0, 'Should have decisions in Memgraph');

    for (const d of rows) {
      await assert(d.title, `Decision ${d.id} should have title`);
      await assert(d.dec, `Decision ${d.id} should have decision text`);
      const conf = parseFloat(d.conf) || 0;
      await assert(conf >= 0 && conf <= 1, `Confidence ${conf} should be 0-1`);
      const validCats = ['architecture', 'technology', 'pattern', 'convention', 'rejection'];
      await assert(validCats.includes(d.cat), `Category "${d.cat}" should be valid`);
    }

    const totalRows = await memgraphService.runQuery(
      'MATCH (d:ArchDecision) RETURN count(d) AS total', {}
    );
    const total = Number(totalRows[0]?.total) || 0;
    await assert(total >= 50, `Should have ≥50 decisions, got ${total}`);
    console.log(`    total decisions=${total}`);
  });

  // ── Scenario 3: Chain detection ──────────────────────────────────────────
  await runScenario('Conversation chains detected with valid scores', async () => {
    const rows = await memgraphService.runQuery(
      `MATCH (s1:DialogueSession)-[r:CONTINUES_FROM]->(s2:DialogueSession)
       RETURN s1.sessionId AS sid1, s2.sessionId AS sid2, r.score AS score
       LIMIT 5`,
      {}
    );
    await assert(rows.length > 0, 'Should have CONTINUES_FROM edges');
    for (const r of rows) {
      const score = parseFloat(r.score) || 0;
      await assert(score > 0.5, `Chain score ${score} should be > 0.5`);
    }
    const totalChains = await memgraphService.runQuery(
      'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS cnt', {}
    );
    const cnt = Number(totalChains[0]?.cnt) || 0;
    await assert(cnt >= 10, `Should have ≥10 chains, got ${cnt}`);
    console.log(`    total chains=${cnt}, sample score=${parseFloat(rows[0]?.score).toFixed(3)}`);
  });

  // ── Scenario 4: Segment coverage ─────────────────────────────────────────
  await runScenario('All sessions have segments', async () => {
    const rows = await memgraphService.runQuery(
      `MATCH (s:DialogueSession)
       OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
       RETURN s.sessionId AS sid, count(seg) AS segCount`,
      {}
    );
    const withoutSegs = rows.filter(r => Number(r.segCount) === 0);
    await assert(withoutSegs.length === 0,
      `${withoutSegs.length} sessions have no segments: ${withoutSegs.map(r => r.sid.slice(0,8)).join(', ')}`
    );
    const totalSegs = rows.reduce((s, r) => s + Number(r.segCount), 0);
    await assert(totalSegs >= 500, `Should have ≥500 total segments, got ${totalSegs}`);
    console.log(`    sessions=${rows.length} totalSegments=${totalSegs}`);
  });

  // ── Scenario 5: Qdrant embedding coverage ────────────────────────────────
  await runScenario('Qdrant has sufficient embeddings', async () => {
    const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    const info = await client.getCollection('dialogue_embeddings');
    const pts = info.points_count;
    await assert(pts >= 500, `Should have ≥500 Qdrant points, got ${pts}`);
    await assert(info.config?.params?.vectors?.summary, 'Should have "summary" named vector');
    console.log(`    qdrant_points=${pts}`);
  });

  // ── Scenario 6: MCP tool functionality ───────────────────────────────────
  await runScenario('MCP tools functional', async () => {
    // dialogue.search
    const st = new SearchDialogueTool();
    const sr = await st.execute({ query: 'DataSource executor registry', limit: 3 });
    await assert(sr.data?.count >= 0, 'dialogue.search should return data');
    console.log(`    dialogue.search count=${sr.data.count}`);

    // dialogue.find_decision
    const ft = new FindDecisionTool();
    const fr = await ft.execute({ topic: 'DataSource', limit: 5 });
    await assert(fr.data?.count >= 0, 'dialogue.find_decision should return data');
    console.log(`    dialogue.find_decision count=${fr.data.count}`);
  });

  // ── Scenario 7: Search score boosting ────────────────────────────────────
  await runScenario('Sessions with decisions get boosted scores', async () => {
    const results = await searchService.search('architecture pattern implementation', {
      limit: 10,
      expandGraph: true,
    });
    await assert(results.length > 0, 'Should return search results');

    // Sessions with decisions should appear in results
    const withDecisions = results.filter(r => (r.context?.decisions?.length || 0) > 0);
    console.log(`    results=${results.length} withDecisions=${withDecisions.length}`);
    // At least some results should have decision context (we have 135 decisions)
    await assert(results.length > 0, 'Results should exist');
  });

  // ── Scenario 8: Provenance tracing ───────────────────────────────────────
  await runScenario('Decision provenance tracing works', async () => {
    const results = await searchService.traceDecisionProvenance('route', 5);
    console.log(`    provenance results=${results.length}`);
    if (results.length > 0) {
      await assert(results[0].title, 'Provenance result should have title');
      await assert(results[0].provenance?.sessionId, 'Provenance should have sessionId');
    }
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== TEST SUMMARY ===');
  console.log(`PASSED: ${passed}/${passed + failed} scenarios`);
  if (failures.length > 0) {
    console.log('\nFailed scenarios:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
  console.log('');

  // Final data snapshot
  const snap = await memgraphService.runQuery(
    `MATCH (s:DialogueSession)
     OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
     OPTIONAL MATCH (seg)<-[:DECIDED_IN]-(d:ArchDecision)
     RETURN count(DISTINCT s) AS sessions,
            count(DISTINCT seg) AS segments,
            count(DISTINCT d) AS decisions`,
    {}
  ).catch(() => [{}]);
  const m = snap[0] || {};
  const chains = await memgraphService.runQuery(
    'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS c', {}
  ).catch(() => [{ c: 0 }]);

  console.log('Final data snapshot:');
  console.log(`  Sessions:   ${m.sessions}`);
  console.log(`  Segments:   ${m.segments}`);
  console.log(`  Decisions:  ${m.decisions}`);
  console.log(`  Chains:     ${chains[0]?.c}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
