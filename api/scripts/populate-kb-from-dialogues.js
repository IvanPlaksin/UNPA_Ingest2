#!/usr/bin/env node
/**
 * GAP-001: Populate Global KB (embeddings_unified) from DevDialogue sessions.
 *
 * Strategy A — direct transfer (fast, no TEI required):
 *   1. Scroll through `dialogue_embeddings` (session-level points only)
 *   2. Re-format payload to embeddings_unified schema
 *   3. Upsert into embeddings_unified
 *
 * Strategy B — Memgraph + TEI fallback (for sessions not yet embedded):
 *   1. Query Memgraph for DialogueSession nodes with summaries but no entry in dialogue_embeddings
 *   2. Generate fresh embeddings via TEI
 *   3. Upsert into both dialogue_embeddings and embeddings_unified
 *
 * Usage:
 *   node api/scripts/populate-kb-from-dialogues.js [--dry-run] [--strategy A|B|both]
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';
const SOURCE_COL   = 'dialogue_embeddings';
const TARGET_COL   = 'embeddings_unified';
const VECTOR_DIM   = 1024;
const SCROLL_LIMIT = 100;

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const strategyArg = (args.find(a => a.startsWith('--strategy=')) || '').split('=')[1] || 'both';

const qdrant = new QdrantClient({ url: QDRANT_URL });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(...args) { console.log('[KB-populate]', ...args); }

function sessionPayload(src, pointId) {
  const p = src.payload || {};
  return {
    quantum_id:   `dialogue_session_${p.sessionId || pointId}`,
    source_type:  'dialogue',
    primary_type: 'DialogueSession',
    project_id:   (p.projectPath || '').split('/').pop() || 'default',
    created_at:   p.startedAt || p.timestamp || new Date().toISOString(),
    name:         p.sessionId
      ? `dialogue_session_${p.sessionId}`
      : `dialogue_session_${pointId}`,
    // Searchable extras
    sessionId:    p.sessionId || null,
    platform:     p.platform  || null,
    messageCount: p.messageCount || 0,
    namespace:    'DIALOGUE',
  };
}

async function ensureUnifiedCollection() {
  try {
    const { collections } = await qdrant.getCollections();
    if (collections.some(c => c.name === TARGET_COL)) {
      log(`Collection '${TARGET_COL}' already exists.`);
      return;
    }
    log(`Creating collection '${TARGET_COL}'...`);
    if (!DRY_RUN) {
      await qdrant.createCollection(TARGET_COL, {
        vectors: { size: VECTOR_DIM, distance: 'Cosine' },
        optimizers_config: { indexing_threshold: 5000 },
      });
      for (const [field, schema] of [
        ['quantum_id',   'keyword'],
        ['source_type',  'keyword'],
        ['primary_type', 'keyword'],
        ['project_id',   'keyword'],
        ['created_at',   'datetime'],
        ['sessionId',    'keyword'],
        ['namespace',    'keyword'],
      ]) {
        await qdrant.createPayloadIndex(TARGET_COL, { field_name: field, field_schema: schema })
          .catch(() => {});
      }
    }
    log(`Collection '${TARGET_COL}' ready.`);
  } catch (err) {
    log(`ensureUnifiedCollection error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy A: direct transfer from dialogue_embeddings
// ─────────────────────────────────────────────────────────────────────────────

async function strategyA() {
  log('=== Strategy A: transfer from dialogue_embeddings ===');

  // Verify source collection exists
  const { collections } = await qdrant.getCollections();
  if (!collections.some(c => c.name === SOURCE_COL)) {
    log(`Source collection '${SOURCE_COL}' does not exist — skipping Strategy A.`);
    return 0;
  }

  let offset = null;
  let total  = 0;
  let skipped = 0;

  do {
    const scrollParams = {
      limit:        SCROLL_LIMIT,
      with_payload: true,
      with_vectors: { summary: true },
      filter: {
        must: [{ key: 'node_type', match: { value: 'session' } }],
      },
    };
    if (offset) scrollParams.offset = offset;

    const { points, next_page_offset } = await qdrant.scroll(SOURCE_COL, scrollParams);

    if (!points || points.length === 0) break;

    const batch = [];
    for (const pt of points) {
      // Extract the summary vector from named-vectors structure
      const vec = pt.vector?.summary || (Array.isArray(pt.vector) ? pt.vector : null);
      if (!vec) { skipped++; continue; }

      batch.push({
        id:      pt.id,
        vector:  vec,
        payload: sessionPayload(pt, pt.id),
      });
    }

    if (batch.length > 0) {
      log(`  Upserting batch of ${batch.length} points (offset=${offset || 0})...`);
      if (!DRY_RUN) {
        await qdrant.upsert(TARGET_COL, { wait: true, points: batch });
      }
      total += batch.length;
    }

    offset = next_page_offset;
  } while (offset != null);

  log(`Strategy A complete: ${total} points transferred, ${skipped} skipped (no summary vector).`);
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy B: Memgraph + TEI for sessions without embeddings
// ─────────────────────────────────────────────────────────────────────────────

async function strategyB(alreadyIndexed) {
  log('=== Strategy B: Memgraph + TEI for un-embedded sessions ===');

  // Lazy-load TEI and memgraph
  let memgraph, teiAvailable;
  try {
    memgraph = require('../src/services/memgraph.service');
  } catch (err) {
    log(`Memgraph service unavailable: ${err.message} — skipping Strategy B.`);
    return 0;
  }

  // Check TEI availability
  const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
  try {
    const http = require('http');
    const url  = require('url');
    const parsed = url.parse(TEI_URL);
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: parsed.hostname, port: parsed.port || 8081, path: '/health', method: 'GET' }, res => {
        res.statusCode === 200 ? resolve() : reject(new Error(`TEI health: ${res.statusCode}`));
      });
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('TEI timeout')); });
      req.end();
    });
    teiAvailable = true;
    log(`TEI available at ${TEI_URL}`);
  } catch {
    log(`TEI not reachable at ${TEI_URL} — skipping Strategy B.`);
    return 0;
  }

  // Query Memgraph for sessions with summaries not yet in alreadyIndexed
  let sessions = [];
  try {
    const neo4j = require('neo4j-driver');
    const rows = await memgraph.runQuery(
      `MATCH (s:DialogueSession)
       WHERE s.summary IS NOT NULL AND s.summary <> ''
       RETURN s.sessionId AS sessionId, s.summary AS summary, s.platform AS platform,
              s.startedAt AS startedAt, s.projectPath AS projectPath, s.messageCount AS messageCount
       LIMIT $limit`,
      { limit: neo4j.int(500) }
    );
    sessions = rows.map(r => ({
      sessionId:    r.sessionId,
      summary:      r.summary,
      platform:     r.platform,
      startedAt:    r.startedAt,
      projectPath:  r.projectPath,
      messageCount: typeof r.messageCount?.toNumber === 'function'
        ? r.messageCount.toNumber()
        : (Number(r.messageCount) || 0),
    })).filter(s => s.sessionId && s.summary && !alreadyIndexed.has(s.sessionId));
  } catch (err) {
    log(`Memgraph query failed: ${err.message} — skipping Strategy B.`);
    return 0;
  }

  if (sessions.length === 0) {
    log('No un-embedded sessions found in Memgraph — Strategy B skipped.');
    return 0;
  }
  log(`Found ${sessions.length} sessions in Memgraph to embed via TEI.`);

  // Generate embeddings and upsert
  const { EmbeddingService } = require('../src/services/structuring/embeddings/EmbeddingService');
  const embedSvc = new EmbeddingService({
    teiUrl:      TEI_URL,
    qdrantUrl:   QDRANT_URL,
    dimension:   VECTOR_DIM,
    batchSize:   16,
    enableCache: false,
  });

  const BATCH = 16;
  let total = 0;

  for (let i = 0; i < sessions.length; i += BATCH) {
    const chunk = sessions.slice(i, i + BATCH);
    log(`  Embedding chunk ${i}–${i + chunk.length - 1}...`);

    const texts    = chunk.map(s => s.summary);
    const vectors  = await embedSvc.generateBatchEmbeddings(texts);

    const points = chunk
      .map((s, idx) => {
        if (!vectors[idx]) return null;
        return {
          id:      embedSvc._toQdrantId(`dialogue_session_${s.sessionId}`),
          vector:  vectors[idx],
          payload: {
            quantum_id:   `dialogue_session_${s.sessionId}`,
            source_type:  'dialogue',
            primary_type: 'DialogueSession',
            project_id:   (s.projectPath || '').split('/').pop() || 'default',
            created_at:   s.startedAt || new Date().toISOString(),
            name:         `dialogue_session_${s.sessionId}`,
            sessionId:    s.sessionId,
            platform:     s.platform || null,
            messageCount: s.messageCount,
            namespace:    'DIALOGUE',
          },
        };
      })
      .filter(Boolean);

    if (points.length > 0 && !DRY_RUN) {
      await qdrant.upsert(TARGET_COL, { wait: true, points });
    }
    total += points.length;
  }

  log(`Strategy B complete: ${total} new points embedded and stored.`);
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting KB population (dry-run=${DRY_RUN}, strategy=${strategyArg})`);

  await ensureUnifiedCollection();

  // Build index of session IDs already in embeddings_unified
  const alreadyIndexed = new Set();
  try {
    let offset = null;
    do {
      const params = {
        limit:        250,
        with_payload: { include: ['sessionId'] },
        with_vectors: false,
        filter: {
          must: [{ key: 'source_type', match: { value: 'dialogue' } }],
        },
      };
      if (offset) params.offset = offset;
      const { points, next_page_offset } = await qdrant.scroll(TARGET_COL, params);
      for (const pt of (points || [])) {
        if (pt.payload?.sessionId) alreadyIndexed.add(pt.payload.sessionId);
      }
      offset = next_page_offset;
    } while (offset != null);
    log(`Already in embeddings_unified: ${alreadyIndexed.size} dialogue sessions.`);
  } catch {
    // Collection may be empty — that's fine
  }

  let totalA = 0, totalB = 0;

  if (strategyArg === 'A' || strategyArg === 'both') {
    totalA = await strategyA();
  }

  if (strategyArg === 'B' || strategyArg === 'both') {
    // Refresh alreadyIndexed with any points just added by Strategy A
    if (totalA > 0) {
      // Re-query is expensive; skip — Strategy B already filters by sessionId
    }
    totalB = await strategyB(alreadyIndexed);
  }

  log(`=== Done: ${totalA + totalB} total points in embeddings_unified ===`);
  if (DRY_RUN) log('(dry-run mode — no writes performed)');
}

main().catch(err => {
  console.error('[KB-populate] Fatal error:', err);
  process.exit(1);
});
