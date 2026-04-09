/**
 * Migration: Add BackLogTask label and assign namespaces to BackLog items.
 *
 * 1. Add :BackLogTask label to all :BackLogItem nodes
 * 2. Assign namespace based on targetPath/tags/relatedCodexRules:
 *    - CODEX: tasks related to Codex rules/structure
 *    - GXE: tasks related to GXE/graph building
 *    - FLOWDESK: tasks related to FlowDesk executors
 *    - CORE: everything else (default)
 */

const memgraph = require('../src/services/memgraph.service');

async function migrate() {
  console.log('Migrating BackLog items...\n');

  // Step 1: Add BackLogTask label
  const addLabel = await memgraph.runQuery(`
    MATCH (b:BackLogItem)
    SET b:BackLogTask
    RETURN count(b) as cnt
  `);
  console.log(`  Added :BackLogTask label to ${addLabel[0]?.cnt || 0} nodes`);

  // Step 2: Load all items and classify namespace
  const items = await memgraph.runQuery(`
    MATCH (b:BackLogItem)
    RETURN b.backlogId as id, b.targetPath as path, b.tags as tags,
           b.relatedCodexRules as rules, b.title as title, b.namespace as ns
  `);

  let updated = 0;
  for (const item of items) {
    const ns = classifyNamespace(item);
    if (ns !== item.ns) {
      await memgraph.runQuery(
        'MATCH (b:BackLogItem {backlogId: $id}) SET b.namespace = $ns',
        { id: item.id, ns }
      );
      updated++;
      console.log(`  ${item.id}: ${item.ns || 'CORE'} → ${ns}`);
    }
  }

  console.log(`\n  Updated namespace for ${updated} items`);
  console.log('Done.');
  process.exit(0);
}

function classifyNamespace(item) {
  const path = (item.path || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  let tags = item.tags;
  if (typeof tags === 'string') try { tags = JSON.parse(tags); } catch { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  const tagsStr = tags.join(' ').toLowerCase();

  let rules = item.rules;
  if (typeof rules === 'string') try { rules = JSON.parse(rules); } catch { rules = []; }
  if (!Array.isArray(rules)) rules = [];
  const rulesStr = rules.join(' ').toLowerCase();

  // CODEX namespace
  if (rulesStr.includes('codex-rule-km') || rulesStr.includes('codex-rule-tm') || rulesStr.includes('codex-rule-bl')
      || path.includes('codex') || tagsStr.includes('codex') || title.includes('codex')) {
    return 'CODEX';
  }

  // FLOWDESK namespace
  if (path.includes('flowdesk') || tagsStr.includes('flowdesk')
      || rulesStr.includes('codex-rule-fd') || title.includes('flowdesk')) {
    return 'FLOWDESK';
  }

  // GXE namespace
  if (path.includes('gxe') || tagsStr.includes('gxe') || title.includes('gxe')
      || path.includes('graph-builder') || path.includes('runtime')) {
    return 'GXE';
  }

  return 'CORE';
}

migrate().catch(e => { console.error(e); process.exit(1); });
