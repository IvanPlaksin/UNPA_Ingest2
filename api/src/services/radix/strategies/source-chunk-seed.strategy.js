/**
 * SourceChunkSeedStrategy — semantic search over raw source document text.
 *
 * A sibling to VectorSeedStrategy, deliberately kept separate rather than folded
 * into it. Drafts and chunks are different kinds of knowledge: a draft is
 * curated, reviewed, and typed; a chunk is raw prose from the document it came
 * from. Sharing one quota would let source text — of which there is far more —
 * crowd out the reviewed material, so each gets its own budget and threshold.
 *
 * Chunks are seed-only. They have no edges, so the graph phase cannot expand
 * from them; what they contribute is reach into text no extractor ever turned
 * into a draft.
 *
 * @module services/radix/strategies/source-chunk-seed.strategy
 */

'use strict';

const { BaseStrategy } = require('./base-strategy');
const { CHUNK_KIND } = require('../indexing/source-chunk-indexer');

class SourceChunkSeedStrategy extends BaseStrategy {
  /** @returns {import('../contracts/strategy.interface').StrategyMetadata} */
  get metadata() {
    return {
      name: 'source-chunk-seed',
      type: 'seed',
      description: 'Semantic search over indexed source document text',
      version: '1.0.0',
      requiredServices: ['qdrantService']
    };
  }

  /**
   * @param {import('../contracts/strategy.interface').StrategyContext} context
   * @returns {Promise<{candidates: Object[], debug: Object}>}
   * @protected
   */
  async _execute(context) {
    const qdrant = this.dependencies.qdrantService;
    if (!qdrant || typeof qdrant.workspaceSearch !== 'function') {
      throw new Error('SourceChunkSeedStrategy requires a qdrantService with workspaceSearch');
    }

    const { config } = context;
    const limit = typeof config.chunkTopK === 'number' ? config.chunkTopK : 5;

    // A zero quota means "drafts only" — skip the round trip entirely.
    if (limit === 0) {
      return { candidates: [], debug: { disabled: true, hitsReturned: 0, skipped: 0 } };
    }

    const hits = await qdrant.workspaceSearch(context.workspaceId, context.queryEmbedding, {
      limit,
      scoreThreshold: typeof config.chunkScoreThreshold === 'number'
        ? config.chunkScoreThreshold
        : 0.78,
      kind: CHUNK_KIND
    });

    const hitList = hits || [];
    const candidates = [];
    let skipped = 0;

    for (const hit of hitList) {
      const candidate = this._toCandidate(hit);
      if (candidate) candidates.push(candidate);
      else skipped += 1;
    }

    return {
      candidates,
      debug: {
        hitsReturned: hitList.length,
        skipped,
        limit,
        threshold: config.chunkScoreThreshold
      }
    };
  }

  /**
   * @param {{id: string, score: number, payload: Object}} hit
   * @returns {Object|null}
   * @private
   */
  _toCandidate(hit) {
    if (!hit || !hit.payload) return null;

    const payload = hit.payload;
    const content = payload.content;
    if (!content || typeof content !== 'string') return null;

    const sourceRefId = payload.sourceRefId ? String(payload.sourceRefId) : null;
    if (!sourceRefId) return null;

    try {
      return this._createCandidate({
        id: String(hit.id),
        type: 'text_chunk',
        content,
        contentRaw: payload,
        score: hit.score,
        provenance: {
          sourceId: sourceRefId,
          sourceType: payload.sourceRefType || 'SOURCE_REFERENCE',
          chunkIndex: typeof payload.chunkIndex === 'number' ? payload.chunkIndex : undefined,
          charOffset: typeof payload.charOffset === 'number' ? payload.charOffset : undefined
        },
        metadata: {
          // The section heading locates a passage in a regulation better than a
          // page number does, and it comes free from the chunker.
          name: payload.sectionTitle || payload.sourceRefName || `chunk ${payload.chunkIndex}`,
          sectionTitle: payload.sectionTitle || null,
          chunkIndex: payload.chunkIndex,
          sourceRefName: payload.sourceRefName || null,
          documentSourceId: sourceRefId,
          isSourceChunk: true
        }
      });
    } catch (error) {
      this._logDebug('candidate:rejected', { id: hit.id, reason: error.message });
      return null;
    }
  }
}

module.exports = { SourceChunkSeedStrategy };
