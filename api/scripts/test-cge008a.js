'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');
const { entityStoreService } = require('../src/services/knowledge/entity-store.service');
const { ALL_EDGE_TYPES } = require('../src/constants/canonical-graph.constants');
const SERVICES = { entityStoreService };

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== CGE-008A: EXPAND + CONNECT envelope test ===\n');

  // Get a test entity with GOVERNS edges
  const rows = await mg.runQuery(
    `MATCH (a:ESEntity)-[:GOVERNS]->(b:ESEntity) RETURN a.id AS id LIMIT 1`, {}
  );
  const entityId = rows[0]?.id;
  if (!entityId) throw new Error('No test entity with GOVERNS edge found');
  console.log(`Using entity: ${entityId}\n`);

  // ── EXPAND ──────────────────────────────────────────────────────────────────
  console.log('1. EXPAND primitive');
  const expandPrim = require('../src/services/investigation/primitives/expand.primitive.js');
  const expandResult = await expandPrim.execute({ entityId, depth: 1 }, {}, SERVICES);
  const ec = expandResult.content;

  ok('EXPAND: content.nodes is array',     Array.isArray(ec.nodes),             `len=${ec.nodes?.length}`);
  ok('EXPAND: content.edges is array',     Array.isArray(ec.edges),             `len=${ec.edges?.length}`);
  ok('EXPAND: roots = [entityId]',         ec.roots?.[0] === entityId);
  ok('EXPAND: projection.kind = graph',    ec.projection?.kind === 'graph');
  ok('EXPAND: summary.depth',              ec.summary?.depth === 1);
  ok('EXPAND: evidencedBy populated',      expandResult.evidencedBy?.length > 0);
  if (ec.nodes?.length > 0) {
    ok('EXPAND: node has .label (CGE)',     !!ec.nodes[0]?.label,               ec.nodes[0]?.label);
  }
  if (ec.edges?.length > 0) {
    ok('EXPAND: edge has .source (CGE)',    !!ec.edges[0]?.source);
    ok('EXPAND: edge.relType canonical',   ALL_EDGE_TYPES.includes(ec.edges[0]?.relType), ec.edges[0]?.relType);
  }

  // ── CONNECT ────────────────────────────────────────────────────────────────
  console.log('\n2. CONNECT primitive');
  try {
    const edgePair = await mg.runQuery(
      `MATCH (a:ESEntity)-[:GOVERNS]->(b:ESEntity) RETURN a.id AS fromId, b.id AS toId LIMIT 1`, {}
    );
    if (edgePair.length > 0) {
      const connectPrim = require('../src/services/investigation/primitives/connect.primitive.js');
      const connectResult = await connectPrim.execute({
        fromEntityId: edgePair[0].fromId,
        toEntityId:   edgePair[0].toId,
        maxPaths: 3,
      }, {}, SERVICES);
      const cc = connectResult.content;
      ok('CONNECT: content.nodes is array',   Array.isArray(cc.nodes));
      ok('CONNECT: content.edges is array',   Array.isArray(cc.edges));
      ok('CONNECT: roots has 2 entries',      cc.roots?.length === 2);
      ok('CONNECT: projection.kind = paths',  cc.projection?.kind === 'paths');
      ok('CONNECT: hints.paths present',      Array.isArray(cc.projection?.hints?.paths));
      ok('CONNECT: hints.bundles present',    typeof cc.projection?.hints?.bundles === 'object');
      ok('CONNECT: summary.pathCount',        cc.summary?.pathCount >= 0);
    } else {
      ok('CONNECT: skip (no GOVERNS pairs)',  true);
    }
  } catch (e) {
    ok('CONNECT: no crash', false, e.message);
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('CGE-008A PASSED');
  else            console.log('CGE-008A FAILED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
