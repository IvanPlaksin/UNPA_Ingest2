/**
 * Migrate FlowDesk Codex rules into the Altiora domain (F9.4b/N2).
 *
 * Codex nodes must keep namespace='Codex' (API-visibility invariant), so the
 * "Altiora namespace" is represented as scope:'altiora' + domain:'Altiora'.
 * Every rule scoped 'flowdesk' (073…079 + the earlier FlowDesk rules) is
 * migrated; the chat's Codex loader then filters by domain='Altiora'.
 *
 * Note: some Codex nodes store `scope` as a string rather than a list, so we
 * filter/normalise in JS instead of relying on Cypher IN.
 *
 * Run: node api/scripts/seed-codex-altiora-migration.js
 */

const { read, write, close } = require('../src/instances/flowdesk/schema-graph/driver');

function toList(scope) {
  if (Array.isArray(scope)) return scope;
  if (typeof scope === 'string') {
    const s = scope.trim();
    if (s.startsWith('[')) { try { return JSON.parse(s); } catch { /* fall through */ } }
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

async function migrate() {
  const all = await read(`MATCH (n:CodexRule {namespace:'Codex'}) RETURN n.codexId AS id, n.title AS title, n.scope AS scope`);
  const targets = all
    .map((r) => ({ id: r.get('id'), title: r.get('title'), scope: toList(r.get('scope')) }))
    .filter((r) => r.scope.includes('flowdesk'));

  console.log(`Found ${targets.length} FlowDesk-scoped Codex rules to migrate:`);
  targets.forEach((r) => console.log(`  ${r.id}: ${r.title}`));

  for (const r of targets) {
    const scope = r.scope.includes('altiora') ? r.scope : [...r.scope, 'altiora'];
    await write(`MATCH (n:CodexRule {codexId:$id}) SET n.domain='Altiora', n.scope=$scope`, { id: r.id, scope });
  }

  const after = await read(`MATCH (n:CodexRule {namespace:'Codex', domain:'Altiora'}) RETURN count(n) AS c`);
  const count = after[0] ? after[0].get('c') : 0;
  console.log(`\nMigrated. Codex rules now in Altiora domain: ${count}`);
  return count;
}

if (require.main === module) {
  migrate()
    .then(async () => { await close(); process.exit(0); })
    .catch(async (e) => { console.error(e.message || e); await close(); process.exit(1); });
}

module.exports = { migrate };
