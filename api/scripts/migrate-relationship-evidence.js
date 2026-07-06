'use strict';
/**
 * migrate-relationship-evidence.js
 *
 * Backfill RelationshipEvidence nodes from existing ES_RELATED_TO edges.
 * Each edge (sourceEntityId, targetEntityId, relType, documentId) produces one
 * RelationshipEvidence node keyed by `${sourceId}|${targetId}|${relType}|${documentId}`.
 *
 * Safe to re-run: uses MERGE so already-created nodes are just updated in place.
 *
 * Usage:
 *   node api/scripts/migrate-relationship-evidence.js
 *   node api/scripts/migrate-relationship-evidence.js --dry-run
 *   node api/scripts/migrate-relationship-evidence.js --limit 1000
 */

const mg        = require('../src/services/memgraph.service');
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 10000;
const BATCH_SIZE  = 200;

const now = () => new Date().toISOString();

async function main() {
  console.log(`[Migrate] RelationshipEvidence backfill — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}, limit=${BATCH_LIMIT}`);

  const ts     = now();
  let offset   = 0;
  let total    = 0;
  let created  = 0;
  let skipped  = 0;

  while (true) {
    const edges = await mg.runQuery(
      `MATCH (s:ESEntity)-[r:ES_RELATED_TO]->(t:ESEntity)
       WHERE r.documentId IS NOT NULL AND r.relType IS NOT NULL
       RETURN s.id AS sourceId, t.id AS targetId,
              r.relType AS relType, r.documentId AS documentId,
              r.context AS context, r.confidence AS confidence,
              r.extractedAt AS extractedAt
       ORDER BY s.id, t.id, r.relType
       SKIP $skip LIMIT $batchSize`,
      { skip: require('neo4j-driver').int(offset), batchSize: require('neo4j-driver').int(Math.min(BATCH_SIZE, BATCH_LIMIT - total)) }
    );

    if (!edges.length) break;

    for (const edge of edges) {
      const { sourceId, targetId, relType, documentId, context, confidence, extractedAt } = edge;
      if (!sourceId || !targetId || !relType) { skipped++; continue; }

      const id   = `${sourceId}|${targetId}|${relType}|${documentId || 'unknown'}`;
      const conf = typeof confidence === 'number' ? confidence : (confidence?.low ?? null);
      const ets  = extractedAt || ts;

      if (DRY_RUN) {
        console.log(`  [dry] MERGE RelationshipEvidence { id: "${id.slice(0, 80)}..." }`);
        created++;
        continue;
      }

      await mg.runQuery(
        `MERGE (ev:RelationshipEvidence {id: $id})
         SET ev.sourceEntityId = $sourceId,
             ev.targetEntityId = $targetId,
             ev.relType        = $relType,
             ev.documentId     = $documentId,
             ev.context        = $context,
             ev.confidence     = $confidence,
             ev.extractedAt    = $ts`,
        { id, sourceId, targetId, relType, documentId: documentId || null, context: context || null, confidence: conf, ts: ets }
      ).then(() => { created++; })
       .catch(err => { console.warn(`  [warn] Failed for ${id.slice(0, 60)}: ${err.message}`); skipped++; });
    }

    total += edges.length;
    offset += edges.length;
    console.log(`[Migrate] Progress: ${total} edges processed, ${created} evidence nodes written, ${skipped} skipped`);

    if (edges.length < BATCH_SIZE || total >= BATCH_LIMIT) break;
  }

  console.log(`\n[Migrate] Done.`);
  console.log(`  Total edges scanned:   ${total}`);
  console.log(`  Evidence nodes merged: ${created}`);
  console.log(`  Skipped (bad data):    ${skipped}`);
  if (DRY_RUN) console.log('  (dry-run — no changes written)');

  process.exit(0);
}

main().catch(err => {
  console.error('[Migrate] Fatal error:', err.message);
  process.exit(1);
});
