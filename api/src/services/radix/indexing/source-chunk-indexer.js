/**
 * Indexes source document text as searchable chunks.
 *
 * Until now only DRAFTS were searchable — the curated objects an extractor had
 * already pulled out. The source text itself, which is the largest body of
 * knowledge in a workspace, could not be retrieved at all: anything the
 * extractor missed was invisible to the assistant.
 *
 * Chunks live in the same per-workspace Qdrant collection as drafts, separated
 * by `kind`, and carry their own text in the payload — unlike drafts, there is
 * no graph node to hydrate them from.
 *
 * @module services/radix/indexing/source-chunk-indexer
 */

'use strict';

const crypto = require('crypto');
const { TextChunker } = require('../../chunking/text-chunker');
const logger = require('../../../utils/logger');

/** Payload discriminator. `type` is already the DRAFT type and cannot be reused. */
const CHUNK_KIND = 'source_chunk';

/**
 * Upper bound on chunks per source. A 500-page regulation would otherwise
 * produce thousands of embedding calls and dominate the workspace index.
 * Truncation is logged, never silent.
 */
const MAX_CHUNKS_PER_SOURCE = 500;

/** Texts embedded per TEI request. */
const EMBED_BATCH_SIZE = 32;

const chunker = new TextChunker();

/**
 * Deterministic point id for a chunk.
 *
 * Qdrant accepts only UUIDs or unsigned integers, so `${sourceId}#${index}`
 * cannot be used directly. Deriving a UUID from that pair keeps re-indexing
 * IDEMPOTENT: the same chunk of the same source always lands on the same point
 * and overwrites itself rather than accumulating duplicates.
 *
 * @param {string} sourceRefId
 * @param {number} chunkIndex
 * @returns {string} UUID
 */
function chunkPointId(sourceRefId, chunkIndex) {
  const hash = crypto
    .createHash('md5')
    .update(`${sourceRefId}#${chunkIndex}`)
    .digest('hex');

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
}

/**
 * Removes every chunk previously indexed for a source.
 *
 * Called before re-indexing so a shortened document does not leave orphaned
 * chunks behind, and on source deletion.
 *
 * @param {Object} qdrant
 * @param {string} workspaceId
 * @param {string} sourceRefId
 * @returns {Promise<void>}
 */
async function deleteSourceChunks(qdrant, workspaceId, sourceRefId) {
  await qdrant.workspaceDeleteByFilter(workspaceId, {
    must: [
      { key: 'kind', match: { value: CHUNK_KIND } },
      { key: 'sourceRefId', match: { value: String(sourceRefId) } }
    ]
  });
}

/**
 * Chunks a source's text and indexes it into the workspace collection.
 *
 * Never throws: indexing is an enrichment step, and failing it must not fail the
 * source upload that triggered it. Failures are returned in the result.
 *
 * @param {Object} params
 * @param {string} params.workspaceId
 * @param {Object} params.source - SourceReference ({ id, filename, sourceType })
 * @param {string} params.text - Already-extracted document text
 * @param {Object} params.qdrantService
 * @param {Object} params.teiService - Must expose getEmbeddings(string[])
 * @param {number} [params.maxChunks]
 * @returns {Promise<{indexed: number, skipped: boolean, truncated: boolean, reason?: string}>}
 */
async function indexSourceChunks({
  workspaceId,
  source,
  text,
  qdrantService,
  teiService,
  maxChunks = MAX_CHUNKS_PER_SOURCE
}) {
  const log = logger.child('Radix');

  if (!workspaceId || !source || !source.id) {
    return { indexed: 0, skipped: true, truncated: false, reason: 'missing workspaceId or source' };
  }
  if (typeof text !== 'string' || text.trim().length < 50) {
    // Below this there is nothing to retrieve — a filename or an OCR failure.
    return { indexed: 0, skipped: true, truncated: false, reason: 'text too short' };
  }
  if (!qdrantService || !teiService) {
    return { indexed: 0, skipped: true, truncated: false, reason: 'missing services' };
  }

  try {
    const allChunks = chunker.chunkForEmbedding(text);
    if (allChunks.length === 0) {
      return { indexed: 0, skipped: true, truncated: false, reason: 'chunker produced nothing' };
    }

    const truncated = allChunks.length > maxChunks;
    const chunks = truncated ? allChunks.slice(0, maxChunks) : allChunks;
    if (truncated) {
      log.warn('[Radix:chunk-indexer] source truncated', {
        sourceId: source.id,
        produced: allChunks.length,
        indexed: maxChunks
      });
    }

    // Replace rather than merge: a re-extracted or shortened document must not
    // leave stale chunks searchable.
    await deleteSourceChunks(qdrantService, workspaceId, source.id);

    let indexed = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await teiService.getEmbeddings(batch.map((c) => c.content));

      const points = [];
      batch.forEach((chunk, j) => {
        const vector = vectors[j];
        if (!Array.isArray(vector) || vector.length === 0) return;

        points.push({
          id: chunkPointId(source.id, chunk.index),
          vector,
          payload: {
            kind: CHUNK_KIND,
            sourceRefId: String(source.id),
            sourceRefName: source.filename || null,
            sourceRefType: source.sourceType || null,
            chunkIndex: chunk.index,
            charOffset: chunk.startOffset,
            charEnd: chunk.endOffset,
            sectionTitle: (chunk.metadata && chunk.metadata.header) || null,
            // Chunks carry their own text: there is no graph node behind them,
            // so the payload is the only place the content can come from.
            content: chunk.content
          }
        });
      });

      if (points.length > 0) {
        await qdrantService.workspaceUpsert(workspaceId, points);
        indexed += points.length;
      }
    }

    log.debug('[Radix:chunk-indexer] indexed source', {
      sourceId: source.id,
      chunks: indexed,
      truncated
    });

    return { indexed, skipped: false, truncated };
  } catch (error) {
    log.error('[Radix:chunk-indexer] failed', {
      sourceId: source.id,
      message: error.message
    });
    return { indexed: 0, skipped: true, truncated: false, reason: error.message };
  }
}

module.exports = {
  indexSourceChunks,
  deleteSourceChunks,
  chunkPointId,
  CHUNK_KIND,
  MAX_CHUNKS_PER_SOURCE
};
