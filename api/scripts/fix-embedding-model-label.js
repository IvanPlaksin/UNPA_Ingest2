'use strict';
/**
 * Patches the `embeddingModel` payload field in all Qdrant collections
 * where it incorrectly says "MiniLM-L6-v2" (a wrong hardcoded label).
 *
 * The vectors themselves are correct (1024-dim, produced by intfloat/multilingual-e5-large
 * via TEI). Only the metadata label needs to be updated — no re-embedding required.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL   = process.env.QDRANT_URL || 'http://localhost:6333';
const WRONG_LABEL  = 'MiniLM-L6-v2';
const CORRECT_MODEL = 'intfloat/multilingual-e5-large';

// Collections to scan — add more if needed
const TARGET_COLLECTIONS = [
  'documents_entities',
  'knowledge_entities',
  'embeddings_unified',
  'embeddings_docs',
  'embeddings_workitems',
  'project_knowledge',
];

async function patchCollection(client, collection) {
  // Verify collection exists
  try {
    await client.getCollection(collection);
  } catch {
    process.stdout.write(`  [SKIP] ${collection} — not found\n`);
    return { scanned: 0, updated: 0 };
  }

  let offset    = null;
  let scanned   = 0;
  let updated   = 0;
  let batchNum  = 0;

  do {
    const opts = { limit: 250, with_payload: true, with_vector: false };
    if (offset) opts.offset = offset;

    const result = await client.scroll(collection, opts);
    const pts = result?.points ?? [];
    scanned += pts.length;
    batchNum++;

    // Filter points that have the wrong label
    const toFix = pts.filter(p => p.payload?.embeddingModel === WRONG_LABEL);

    if (toFix.length > 0) {
      const ids = toFix.map(p => p.id);
      await client.setPayload(collection, {
        payload: { embeddingModel: CORRECT_MODEL },
        points:  ids,
        wait:    true,
      });
      updated += ids.length;
      process.stdout.write(`    batch ${batchNum}: fixed ${ids.length}/${pts.length} points\n`);
    } else if (pts.length > 0) {
      process.stdout.write(`    batch ${batchNum}: ${pts.length} points OK (label already correct or absent)\n`);
    }

    offset = result?.next_page_offset ?? null;
  } while (offset);

  return { scanned, updated };
}

async function main() {
  const client = new QdrantClient({ url: QDRANT_URL });
  console.log(`\nQdrant: ${QDRANT_URL}`);
  console.log(`Wrong label  : "${WRONG_LABEL}"`);
  console.log(`Correct model: "${CORRECT_MODEL}"`);
  console.log('─'.repeat(60));

  let totalScanned = 0;
  let totalUpdated = 0;

  for (const col of TARGET_COLLECTIONS) {
    console.log(`\n▸ ${col}`);
    const { scanned, updated } = await patchCollection(client, col);
    totalScanned += scanned;
    totalUpdated += updated;
    if (scanned > 0) {
      console.log(`  ✓ scanned=${scanned}, updated=${updated}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`TOTAL: scanned=${totalScanned}, updated=${totalUpdated}`);
  if (totalUpdated === 0) {
    console.log('All labels were already correct — nothing to fix.');
  } else {
    console.log(`✅ ${totalUpdated} vectors re-labeled to "${CORRECT_MODEL}"`);
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
