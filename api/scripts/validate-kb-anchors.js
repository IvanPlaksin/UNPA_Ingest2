'use strict';

/**
 * CI anchor-drift validation (Phase 8) — keep code `data-kb-anchor` ids and the
 * Memgraph UIAnchor registry in step.
 *
 * Reports:
 *   ✅ matched         — anchor in code AND graph
 *   ⚠️  code-only       — data-kb-anchor in code with no UIAnchor node (undocumented)
 *   ⚠️  graph-only      — UIAnchor node with no code reference (possibly stale)
 *   ⚠️  no-EXPLAINS     — UIAnchor with zero EXPLAINS edges (documentation gap:
 *                         explain will fall back to fuzzy semantic search)
 *
 * Policy: WARN-FIRST (PO-ratified). Mismatches → exit 1 (non-blocking warning in
 * CI); a hard error (e.g. Memgraph unreachable) → exit 2; all clean → exit 0.
 * Escalate to strict later by treating exit 1 as a build failure.
 *
 * Scan roots default to the in-repo frontend; override with args or
 * KB_ANCHOR_SCAN_ROOTS (comma-separated). Note: only LITERAL
 * `data-kb-anchor="id"` attributes are statically extractable — components that
 * bind the id dynamically must be covered by an integration test instead.
 *
 * Run: node scripts/validate-kb-anchors.js [scanRoot ...]
 */

const fs = require('fs');
const path = require('path');
const { read, close } = require('../src/instances/flowdesk/schema-graph/driver');

const DEFAULT_ROOTS = ['../mcp/src', '../../FlowDesk/FlowDesk/Frontend/Clients/FlowDeskPortal/src'];
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.html']);
// Literal ids only; excludes JSX bindings ({}) and doc placeholders (<id>).
const RE = /data-kb-anchor=["']([^"'{}<>]+)["']/g;

function scanRoots() {
  const fromArg = process.argv.slice(2);
  const fromEnv = (process.env.KB_ANCHOR_SCAN_ROOTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const roots = (fromArg.length ? fromArg : fromEnv.length ? fromEnv : DEFAULT_ROOTS)
    .map((r) => path.resolve(__dirname, '..', r));
  return roots.filter((r) => { try { return fs.existsSync(r); } catch { return false; } });
}

function extractCodeAnchors(roots) {
  const anchors = new Set();
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { recursive: true, withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !EXT.has(path.extname(e.name))) continue;
      const dir = e.parentPath || e.path || root;
      let content = '';
      try { content = fs.readFileSync(path.join(dir, e.name), 'utf8'); } catch { continue; }
      for (const m of content.matchAll(RE)) anchors.add(m[1]);
    }
  }
  return anchors;
}

async function main() {
  const roots = scanRoots();
  const codeAnchors = extractCodeAnchors(roots);

  const records = await read(
    `MATCH (a:UIAnchor)
     OPTIONAL MATCH (a)-[:EXPLAINS]->(k)
     RETURN a.anchorId AS anchorId, count(k) AS edges`,
  );
  const graph = new Map(records.map((r) => [r.get('anchorId'), Number(r.get('edges')) || 0]));

  const matched = [...codeAnchors].filter((a) => graph.has(a));
  const codeOnly = [...codeAnchors].filter((a) => !graph.has(a));
  const graphOnly = [...graph.keys()].filter((a) => !codeAnchors.has(a));
  const noExplains = [...graph.entries()].filter(([, n]) => n === 0).map(([a]) => a);

  console.log(`\n[validate-kb-anchors] scan roots: ${roots.length ? roots.join(', ') : '(none found)'}`);
  console.log(`  code anchors: ${codeAnchors.size} · graph anchors: ${graph.size}`);
  console.log(`  ✅ matched: ${matched.length}`);
  if (codeOnly.length) { console.log(`  ⚠️  code-only (undocumented):`); codeOnly.forEach((a) => console.log(`     - ${a}`)); }
  if (graphOnly.length) { console.log(`  ⚠️  graph-only (possibly stale / not yet in code):`); graphOnly.forEach((a) => console.log(`     - ${a}`)); }
  if (noExplains.length) { console.log(`  ⚠️  no EXPLAINS edges (documentation gap → semantic fallback):`); noExplains.forEach((a) => console.log(`     - ${a}`)); }

  await close();
  const hasWarnings = codeOnly.length || graphOnly.length || noExplains.length;
  process.exit(hasWarnings ? 1 : 0);
}

main().catch(async (err) => { console.error('[validate-kb-anchors] error:', err.message); try { await close(); } catch (_) {} process.exit(2); });
