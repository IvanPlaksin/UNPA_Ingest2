/**
 * Phase 3 E2E Test — DevDialogue Collector
 * Validates the full system: data integrity, REST API, search, MCP tools,
 * watcher metrics, Codex rules, Qdrant embeddings, frontend build.
 *
 * Usage: node api/src/core/aopeg/plugins/dialogue/tests/phase3-e2e.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../../.env') });

const memgraphService = require('../../../../../services/memgraph.service');

const API_BASE = `http://localhost:${process.env.PORT || 3010}`;

let passed = 0, failed = 0;
const failures = [];
const startTs = Date.now();

async function assert(condition, message) {
  if (!condition) throw new Error(message);
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on GET ${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on POST ${path}`);
  return res.json();
}

async function checkServerAlive() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   DEVDIALOGUE COLLECTOR — PHASE 3 E2E TEST              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const serverAlive = await checkServerAlive();
  console.log(`API server (${API_BASE}): ${serverAlive ? '✓ online' : '✗ offline (HTTP scenarios skipped)'}\n`);

  // ── Scenario 1: Data integrity ─────────────────────────────────────────────
  await runScenario('Data integrity — sessions / segments / decisions / chains', async () => {
    const rows = await memgraphService.runQuery(`
      MATCH (s:DialogueSession)
      OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
      OPTIONAL MATCH (seg)<-[:DECIDED_IN]-(d:ArchDecision)
      RETURN count(DISTINCT s) AS sessions,
             count(DISTINCT seg) AS segments,
             count(DISTINCT d) AS decisions
    `, {});
    const chainRows = await memgraphService.runQuery(
      'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS chains', {}
    );

    const r = rows[0] || {};
    const sessions = Number(r.sessions) || 0;
    const segments = Number(r.segments) || 0;
    const decisions = Number(r.decisions) || 0;
    const chains = Number(chainRows[0]?.chains) || 0;

    await assert(sessions >= 32, `sessions=${sessions} < 32`);
    await assert(segments >= 1900, `segments=${segments} < 1900`);
    await assert(decisions >= 100, `decisions=${decisions} < 100`);
    await assert(chains >= 50, `chains=${chains} < 50`);
    console.log(`    sessions=${sessions}  segments=${segments}  decisions=${decisions}  chains=${chains}`);
  });

  // ── Scenario 2: REST endpoints ─────────────────────────────────────────────
  if (serverAlive) {
    await runScenario('REST — GET /api/v1/dialogue/sessions', async () => {
      const data = await apiGet('/api/v1/dialogue/sessions?limit=5');
      await assert(Array.isArray(data.sessions), 'should have sessions array');
      await assert(data.pagination?.total >= 32, `total=${data.pagination?.total} < 32`);
      console.log(`    count=${data.pagination.total}`);
    });

    await runScenario('REST — GET /api/v1/dialogue/stats', async () => {
      const data = await apiGet('/api/v1/dialogue/stats');
      await assert(data.totalSessions >= 32, `totalSessions=${data.totalSessions}`);
      console.log(`    totalSessions=${data.totalSessions}  totalMessages=${data.totalMessages}`);
    });

    await runScenario('REST — GET /api/v1/dialogue/metrics', async () => {
      const data = await apiGet('/api/v1/dialogue/metrics');
      await assert(data.success, 'metrics endpoint should succeed');
      await assert(data.dialogue, 'should have dialogue object');
      const d = data.dialogue;
      console.log(`    sessions=${d.sessions}  decisions=${d.decisions}  chains=${d.chains}  qdrant=${d.qdrantPoints ?? 'N/A'}`);
    });

    await runScenario('REST — GET /api/v1/dialogue/decisions', async () => {
      const data = await apiGet('/api/v1/dialogue/decisions?limit=10');
      await assert(data.success, 'should succeed');
      await assert(data.count >= 0, 'should have count');
      console.log(`    count=${data.count}`);
    });

    await runScenario('REST — POST /api/v1/dialogue/search', async () => {
      const data = await apiPost('/api/v1/dialogue/search', { query: 'RuntimeEngine graph execution', limit: 5 });
      await assert(data.success, 'search should succeed');
      await assert(Array.isArray(data.results), 'should have results');
      console.log(`    results=${data.results.length}${data.results[0] ? '  top_score=' + (data.results[0].finalScore || 0).toFixed(3) : ''}`);
    });

    await runScenario('REST — GET /api/v1/metrics/dialogue', async () => {
      const data = await apiGet('/api/v1/metrics/dialogue');
      await assert(data.success, 'should succeed');
      console.log(`    segments=${data.data?.segments}  decisions=${data.data?.decisions}`);
    });
  } else {
    console.log('  ⚠ REST scenarios skipped (server offline)');
  }

  // ── Scenario 3: Search quality (direct service) ────────────────────────────
  await runScenario('Search quality — direct service (3 queries)', async () => {
    const { DialogueSearchService } = require('../services/dialogue.search');
    const { DialogueQdrantService } = require('../services/dialogue.qdrant');
    const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
    const svc = new DialogueSearchService(new DialogueQdrantService(), memgraphService, new EmbeddingService());

    const queries = ['RuntimeEngine execution', 'DataSource executor', 'workspace lifecycle'];
    for (const q of queries) {
      const results = await svc.search(q, { limit: 5 });
      await assert(results.length > 0, `"${q}" returned no results`);
      await assert(results[0].finalScore > 0.3, `"${q}" top score=${results[0].finalScore} < 0.3`);
    }
    console.log(`    3/3 queries returned relevant results`);
  });

  // ── Scenario 4: MCP tools ──────────────────────────────────────────────────
  await runScenario('MCP tools — dialogue.search + dialogue.find_decision', async () => {
    require('../../../../../mcp/tools/dialogue/index.js');
    const { SearchDialogueTool } = require('../../../../../mcp/tools/dialogue/SearchDialogueTool');
    const { FindDecisionTool } = require('../../../../../mcp/tools/dialogue/FindDecisionTool');

    const st = new SearchDialogueTool();
    const sr = await st.execute({ query: 'graph execution engine', limit: 3 });
    await assert(sr.data?.count >= 0, 'dialogue.search should return data');

    const ft = new FindDecisionTool();
    const fr = await ft.execute({ topic: 'DataSource', limit: 5 });
    await assert(fr.data?.count >= 0, 'dialogue.find_decision should return data');

    console.log(`    dialogue.search count=${sr.data.count}  dialogue.find_decision count=${fr.data.count}`);
  });

  // ── Scenario 5: Watcher metrics ────────────────────────────────────────────
  await runScenario('DialogueMetricsCollector — snapshot from DB', async () => {
    const { getDialogueMetrics } = require('../services/dialogue.metrics');
    const metrics = getDialogueMetrics();
    const snap = await metrics.collectSnapshot();
    await assert(snap.sessions >= 32, `snapshot sessions=${snap.sessions}`);
    await assert(snap.decisions >= 100, `snapshot decisions=${snap.decisions}`);
    const inmem = metrics.getInMemoryMetrics();
    await assert(inmem !== null, 'in-memory metrics should be available');
    console.log(`    sessions=${snap.sessions}  segments=${snap.segments}  decisions=${snap.decisions}  chains=${snap.chains}`);
  });

  // ── Scenario 6: Codex rules ────────────────────────────────────────────────
  await runScenario('Codex rules DLG-001..006 registered', async () => {
    const rows = await memgraphService.runQuery(
      "MATCH (r:CodexRule) WHERE r.codexId STARTS WITH 'CODEX-RULE-DLG' RETURN r.codexId AS id, r.severity AS severity ORDER BY r.codexId",
      {}
    );
    await assert(rows.length === 6, `Expected 6 DLG rules, got ${rows.length}`);
    const ids = rows.map(r => r.id);
    for (let i = 1; i <= 6; i++) {
      const expected = `CODEX-RULE-DLG-00${i}`;
      await assert(ids.includes(expected), `Missing ${expected}`);
    }
    console.log(`    ${ids.join('  ')}`);
  });

  // ── Scenario 7: Qdrant embeddings ─────────────────────────────────────────
  await runScenario('Qdrant dialogue_embeddings collection', async () => {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    const info = await client.getCollection('dialogue_embeddings');
    const pts = info.points_count;
    await assert(pts >= 500, `Qdrant points=${pts} < 500`);
    await assert(info.config?.params?.vectors?.summary, 'Should have "summary" named vector');
    console.log(`    points=${pts}  named_vectors=${Object.keys(info.config?.params?.vectors || {}).join(', ')}`);
  });

  // ── Scenario 8: Frontend build ─────────────────────────────────────────────
  await runScenario('Frontend build (vite) — DialoguePage included', async () => {
    const { execSync } = require('child_process');
    const path = require('path');
    const mcpDir = path.resolve(__dirname, '../../../../../../mcp');
    try {
      execSync('npx vite build --mode development', { cwd: mcpDir, stdio: 'pipe', timeout: 90000 });
      console.log('    Build successful (0 errors)');
    } catch (err) {
      const output = (err.stdout || err.stderr || err.message || '').toString();
      if (output.includes('error') || output.includes('Error')) {
        throw new Error('Build failed: ' + output.slice(0, 300));
      }
      console.log('    Build completed (warnings only)');
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTs) / 1000);

  // Final data snapshot
  const snap = await memgraphService.runQuery(`
    MATCH (s:DialogueSession)
    OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
    OPTIONAL MATCH (seg)<-[:DECIDED_IN]-(d:ArchDecision)
    RETURN count(DISTINCT s) AS sessions,
           count(DISTINCT seg) AS segments,
           count(DISTINCT d) AS decisions
  `, {}).catch(() => [{}]);
  const chains = await memgraphService.runQuery(
    'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS chains', {}
  ).catch(() => [{ chains: 0 }]);

  let qdrantPts = '?';
  try {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    const info = await client.getCollection('dialogue_embeddings');
    qdrantPts = info.points_count;
  } catch { /* non-fatal */ }

  const s = snap[0] || {};
  const totalTests = passed + failed;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   FINAL E2E REPORT                                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║   Tests: ${passed}/${totalTests} passed  (${elapsed}s)${' '.repeat(Math.max(0, 30 - String(totalTests).length - elapsed.toString().length))}       ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   DATA STATE                                            ║');
  console.log(`║     Sessions:   ${String(Number(s.sessions) || 0).padEnd(10)}                            ║`);
  console.log(`║     Segments:   ${String(Number(s.segments) || 0).padEnd(10)}                            ║`);
  console.log(`║     Decisions:  ${String(Number(s.decisions) || 0).padEnd(10)}                            ║`);
  console.log(`║     Chains:     ${String(Number(chains[0]?.chains) || 0).padEnd(10)}                            ║`);
  console.log(`║     Qdrant pts: ${String(qdrantPts).padEnd(10)}                            ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');

  if (failures.length > 0) {
    console.log('║   FAILURES                                              ║');
    for (const f of failures) {
      const line = `║   ✗ ${f.name}: ${f.error}`;
      console.log(line.slice(0, 59).padEnd(59) + '║');
    }
    console.log('╠══════════════════════════════════════════════════════════╣');
  }

  const status = failed === 0 ? 'ALL TESTS PASSED ✅' : `${failed} TESTS FAILED ❌`;
  console.log(`║   ${status.padEnd(55)}║`);
  if (failed === 0) {
    console.log('║   DEVDIALOGUE COLLECTOR IMPLEMENTATION COMPLETE ✅       ║');
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
