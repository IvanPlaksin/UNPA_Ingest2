#!/usr/bin/env node
/**
 * add-vector-ids.migration.js
 *
 * Backfill vectorId for existing EntityMention and Draft* nodes
 * that were persisted before the unified extraction pipeline introduced
 * step 08 (embed-and-index).
 *
 * Processing:
 *   EntityMention  → embeds text → upserts to `documents_entities` Qdrant collection
 *   Draft* nodes   → embeds text → upserts to `workspace_{id}` Qdrant collection
 *
 * Usage:
 *   node api/scripts/add-vector-ids.migration.js [--dry-run] [--batch-size=50]
 */

'use strict';

const BATCH_SIZE_DEFAULT = 50;
const DRY_RUN  = process.argv.includes('--dry-run');
const batchArg = process.argv.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : BATCH_SIZE_DEFAULT;

const DRAFT_LABELS = [
  'DraftEntity', 'DraftRelationship', 'DraftBusinessRule', 'DraftSchema',
  'DraftWorkflow', 'DraftCalculation', 'DraftConcept', 'DraftPolicy',
  'DraftDecision', 'DraftRequirement', 'DraftAnomaly', 'DraftAPIContract',
];

// ── Lazy service handles ────────────────────────────────────

let _mg, _qdrant, _tei;
function mg()     { if (!_mg)     _mg     = require('../src/services/memgraph.service');  return _mg; }
function qdrant() { if (!_qdrant) _qdrant = require('../src/services/qdrant.service');    return _qdrant; }
function tei()    { if (!_tei)    _tei    = require('../src/services/tei.service');        return _tei; }

// ── Embedding text builders ─────────────────────────────────

const { buildEmbedText, DOCS_COLLECTION } = require('../src/services/extraction/vector-indexer');

// ── Stats ───────────────────────────────────────────────────

const stats = {
  entityMentions: { found: 0, indexed: 0, failed: 0 },
  drafts:         { found: 0, indexed: 0, failed: 0 },
};

// ── Ensure documents_entities Qdrant collection ─────────────

async function _ensureDocsCollection() {
  try {
    const q = qdrant();
    if (typeof q.client?.getCollection !== 'function') return;
    const exists = await q.client.getCollection(DOCS_COLLECTION).then(() => true).catch(() => false);
    if (!exists) {
      await q.client.createCollection(DOCS_COLLECTION, {
        vectors: { size: 384, distance: 'Cosine' },
        optimizers_config: { default_segment_number: 2 },
      });
      for (const field of ['documentId', 'type', 'epistemicLayer', 'memgraphNodeLabel', 'knowledgeFamily']) {
        await q.client.createPayloadIndex(DOCS_COLLECTION, {
          field_name: field, field_schema: 'keyword',
        }).catch(() => {});
      }
      console.log(`  Created Qdrant collection '${DOCS_COLLECTION}'`);
    }
  } catch (err) {
    console.warn(`  Could not ensure documents collection: ${err.message}`);
  }
}

// ── Batch embed + upsert helper ─────────────────────────────

async function processNodes(nodes, mode, workspaceId = null) {
  if (nodes.length === 0) return;

  const texts = nodes.map(n => buildEmbedText(
    { name: n.name, description: n.description, content: n.content || {}, ...n },
    n._label
  ));

  let embeddings;
  try {
    embeddings = await tei().getEmbeddings(texts);
  } catch (err) {
    console.error(`  ✗ TEI embed failed: ${err.message}`);
    if (mode === 'DOCUMENT') stats.entityMentions.failed += nodes.length;
    else                     stats.drafts.failed         += nodes.length;
    return;
  }

  if (!embeddings || embeddings.length !== texts.length) {
    console.error(`  ✗ Embedding count mismatch (got ${embeddings?.length}, expected ${texts.length})`);
    return;
  }

  const points = nodes.map((n, i) => ({
    id:      n.id,
    vector:  embeddings[i],
    payload: {
      memgraphNodeId:    n.id,
      memgraphNodeLabel: n._label,
      mode,
      sourceId:          n.documentId || n.sourceId || null,
      workspaceId:       workspaceId || null,
      documentId:        mode === 'DOCUMENT' ? (n.documentId || null) : null,
      name:              n.name || '',
      type:              n.type || '',
      knowledgeFamily:   n.knowledgeFamily || 'SEMANTIC',
      status:            n.status || null,
      epistemicLayer:    n.epistemicLayer || null,
      confidence:        n.confidence || null,
      indexedAt:         new Date().toISOString(),
    },
  }));

  if (DRY_RUN) {
    console.log(`  [dry-run] Would upsert ${points.length} points to ${
      mode === 'WORKSPACE' ? `workspace_${workspaceId}` : DOCS_COLLECTION
    }`);
    return;
  }

  try {
    if (mode === 'WORKSPACE' && workspaceId) {
      await qdrant().workspaceUpsert(workspaceId, points);
    } else {
      await _ensureDocsCollection();
      await qdrant().client.upsert(DOCS_COLLECTION, { wait: true, points });
    }
  } catch (err) {
    console.error(`  ✗ Qdrant upsert failed: ${err.message}`);
    if (mode === 'DOCUMENT') stats.entityMentions.failed += nodes.length;
    else                     stats.drafts.failed         += nodes.length;
    return;
  }

  // Patch Memgraph
  const now = new Date().toISOString();
  try {
    await mg().runQuery(
      `UNWIND $updates AS u
       MATCH (n {id: u.nodeId})
       SET n.vectorId = u.vectorId, n.vectorIndexedAt = $now`,
      { updates: points.map(p => ({ nodeId: p.id, vectorId: p.id })), now }
    );
  } catch (err) {
    console.error(`  ✗ Memgraph patch failed: ${err.message}`);
  }

  if (mode === 'DOCUMENT') stats.entityMentions.indexed += nodes.length;
  else                     stats.drafts.indexed         += nodes.length;
}

// ── EntityMention migration ─────────────────────────────────

async function migrateEntityMentions() {
  console.log('\n── EntityMention nodes ────────────────────────────────');

  const rows = await mg().runQuery(
    `MATCH (n:EntityMention) WHERE n.vectorId IS NULL
     RETURN n.id as id, n.name as name, n.type as type,
            n.description as description, n.documentId as documentId,
            n.epistemicLayer as epistemicLayer, n.confidence as confidence,
            n.knowledgeFamily as knowledgeFamily`,
    {}
  );

  stats.entityMentions.found = rows.length;
  console.log(`  Found ${rows.length} EntityMention node(s) without vectorId`);
  if (rows.length === 0) return;

  const nodes = rows.map(r => ({ ...r, _label: 'EntityMention' }));
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    const to = Math.min(i + BATCH_SIZE, nodes.length);
    console.log(`  Batch ${i + 1}–${to} / ${nodes.length}`);
    await processNodes(batch, 'DOCUMENT');
  }
}

// ── Draft* migration ────────────────────────────────────────

async function migrateDraftNodes() {
  console.log('\n── Draft* nodes ────────────────────────────────────────');

  // Query all Draft* labels in one pass
  const labelUnion = DRAFT_LABELS.map(
    l => `MATCH (w:WorkSpace)-[:CONTAINS_DRAFT]->(n:${l}) WHERE n.vectorId IS NULL
          RETURN n.id as id, n.name as name, n.type as type,
                 n.description as description, n.sourceId as sourceId,
                 n.epistemicLayer as epistemicLayer, n.confidence as confidence,
                 n.knowledgeFamily as knowledgeFamily, n.content as content,
                 n.status as status, '${l}' as _label, w.id as workspaceId`
  ).join(' UNION ');

  const rows = await mg().runQuery(labelUnion, {});

  stats.drafts.found = rows.length;
  console.log(`  Found ${rows.length} Draft* node(s) without vectorId`);
  if (rows.length === 0) return;

  // Group by workspaceId
  const byWorkspace = new Map();
  for (const r of rows) {
    if (!byWorkspace.has(r.workspaceId)) byWorkspace.set(r.workspaceId, []);
    byWorkspace.get(r.workspaceId).push({
      ...r,
      content: (() => { try { return JSON.parse(r.content || '{}'); } catch { return {}; } })()
    });
  }

  for (const [wsId, nodes] of byWorkspace) {
    console.log(`  Workspace ${wsId}: ${nodes.length} node(s)`);
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      const to = Math.min(i + BATCH_SIZE, nodes.length);
      console.log(`    Batch ${i + 1}–${to} / ${nodes.length}`);
      await processNodes(batch, 'WORKSPACE', wsId);
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== add-vector-ids migration ${DRY_RUN ? '[DRY RUN] ' : ''}===`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  // Check TEI availability
  try {
    const health = await tei().healthCheck?.();
    console.log(`TEI: ${health ? 'OK' : 'available'}`);
  } catch {
    console.warn('TEI not available — migration cannot proceed. Start the TEI service first.');
    process.exit(1);
  }

  try {
    await migrateEntityMentions();
    await migrateDraftNodes();
  } catch (err) {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  }

  console.log('\n=== Migration summary ===');
  console.log(`EntityMention — found: ${stats.entityMentions.found}, indexed: ${stats.entityMentions.indexed}, failed: ${stats.entityMentions.failed}`);
  console.log(`Draft*        — found: ${stats.drafts.found}, indexed: ${stats.drafts.indexed}, failed: ${stats.drafts.failed}`);
  if (DRY_RUN) console.log('\n[dry-run] No changes written.');
  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
