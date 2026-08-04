/**
 * VectorSeedStrategy — semantic search over workspace drafts via Qdrant.
 *
 * The first seed strategy: it turns the user's text into the entry points from
 * which the graph phase expands. Scope is one workspace, enforced by Qdrant's
 * collection-per-workspace layout (`workspace_{uuid}`), so cross-workspace
 * leakage is structurally impossible rather than filtered out.
 *
 * Only DRAFTS are indexed today — source text chunks land in R2.3. Until then
 * this searches curated knowledge objects, not raw document text.
 *
 * @module services/radix/strategies/vector-seed.strategy
 */

'use strict';

const { BaseStrategy } = require('./base-strategy');
const {
  hydrateDrafts,
  buildContent,
  buildProvenance,
  CONTENT_FIELDS
} = require('./shared/draft-hydration');
const { CHUNK_KIND } = require('../indexing/source-chunk-indexer');

/**
 * Draft type key → ContextElement type.
 *
 * The element type is a RENDERING class, not a taxonomy: it tells the assembler
 * how to lay the fact out. The precise domain type is preserved in
 * `metadata.draftType` and is what the serializer actually displays, so
 * collapsing 12 draft types onto the 6 element types loses nothing in the prompt.
 *
 * Keys are the draft type keys stored in the Qdrant payload ('entity',
 * 'business_rule', ...), NOT the Memgraph labels ('DraftEntity', ...).
 */
const DRAFT_TYPE_TO_ELEMENT = Object.freeze({
  entity: 'entity',
  schema: 'entity',
  api_contract: 'entity',
  anomaly: 'entity',
  relationship: 'relation',
  business_rule: 'rule',
  policy: 'rule',
  calculation: 'rule',
  workflow: 'rule',
  requirement: 'rule',
  decision: 'concept',
  concept: 'concept'
});

const DEFAULT_ELEMENT_TYPE = 'entity';
const DEFAULT_EXCLUDED_STATUSES = Object.freeze(['REJECTED', 'PROMOTED']);

class VectorSeedStrategy extends BaseStrategy {
  /** @returns {import('../contracts/strategy.interface').StrategyMetadata} */
  get metadata() {
    return {
      name: 'vector-seed',
      type: 'seed',
      description: 'Semantic search over workspace drafts via Qdrant',
      version: '1.1.0',
      // memgraphService is optional-but-wanted: without it candidates still flow,
      // they just carry a name instead of a description.
      requiredServices: ['qdrantService', 'memgraphService']
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
      throw new Error('VectorSeedStrategy requires a qdrantService with workspaceSearch');
    }

    const { config } = context;
    const excludeStatus = Array.isArray(config.excludeDraftStatuses)
      ? config.excludeDraftStatuses
      : DEFAULT_EXCLUDED_STATUSES;

    const hits = await qdrant.workspaceSearch(context.workspaceId, context.queryEmbedding, {
      limit: config.vectorTopK,
      scoreThreshold: config.vectorThreshold,
      excludeStatus,
      // Source-text chunks live in the same collection and are served by their
      // own strategy with its own quota. Excluding by `kind` (rather than
      // requiring kind='draft') keeps drafts indexed before the field existed.
      excludeKind: CHUNK_KIND
    });

    const hitList = hits || [];
    if (hitList.length === 0) {
      return {
        candidates: [],
        debug: { hitsReturned: 0, skipped: 0, hydrated: 0, hydrationMs: 0, threshold: config.vectorThreshold, excludeStatus }
      };
    }

    // The Qdrant payload holds name/type/status only — the embedding was built
    // from the full text but the description was never stored alongside it.
    // Without this hydration the assembled context is a list of bare names.
    const draftIds = hitList
      .map((h) => (h.payload && h.payload.draftNodeId) || h.id)
      .filter(Boolean)
      .map(String);

    const hydrationStart = Date.now();
    const hydrated = await this._hydrateDrafts(context.workspaceId, draftIds);
    const hydrationMs = Date.now() - hydrationStart;

    const candidates = [];
    let skipped = 0;

    for (const hit of hitList) {
      const candidate = this._toCandidate(hit, hydrated);
      if (candidate) candidates.push(candidate);
      else skipped += 1;
    }

    return {
      candidates,
      debug: {
        hitsReturned: hitList.length,
        skipped,
        hydrated: hydrated.size,
        hydrationMs,
        threshold: config.vectorThreshold,
        excludeStatus
      }
    };
  }

  /**
   * @param {string} workspaceId
   * @param {string[]} draftIds
   * @returns {Promise<Map<string, Object>>}
   * @private
   */
  _hydrateDrafts(workspaceId, draftIds) {
    return hydrateDrafts(
      this.dependencies.memgraphService,
      workspaceId,
      draftIds,
      (error) => this._logDebug('hydration:failed', {
        message: error.message,
        ids: draftIds.length
      })
    );
  }

  /**
   * Maps one Qdrant hit onto a StrategyCandidate.
   *
   * Returns null rather than throwing for a malformed point: one bad row in the
   * index should cost that row, not the whole seed phase.
   *
   * @param {{id: string, score: number, payload: Object}} hit
   * @param {Map<string, Object>} hydrated - draftId → graph record
   * @returns {Object|null}
   * @private
   */
  _toCandidate(hit, hydrated = new Map()) {
    if (!hit || !hit.payload) return null;

    const payload = hit.payload;
    // The point id IS the draft id (draft.service indexes with `id: draftId`),
    // but payload.draftNodeId is the authoritative field.
    const draftId = payload.draftNodeId || hit.id;
    if (!draftId) return null;

    const record = hydrated.get(String(draftId)) || null;
    const props = (record && record.props) || {};

    const draftType = props.type || payload.type || null;
    const name = props.name || payload.name || String(draftId);

    // Graph first, Qdrant payload as fallback: hydration may have failed or the
    // draft may have been deleted from the graph while its point lingers.
    const content = record
      ? buildContent(props, name)
      : [name, payload.description].filter(Boolean).join('. ');

    const provenance = buildProvenance(draftId, draftType, record);

    try {
      return this._createCandidate({
        id: String(draftId),
        type: DRAFT_TYPE_TO_ELEMENT[draftType] || DEFAULT_ELEMENT_TYPE,
        content,
        contentRaw: record ? props : payload,
        score: hit.score,
        provenance,
        metadata: {
          name,
          draftType,
          draftStatus: props.status || payload.status || null,
          knowledgeFamily: props.knowledgeFamily || payload.knowledgeFamily || null,
          hydrated: Boolean(record),
          sourceRefName: (record && record.sourceRefName) || null,
          documentSourceId: (record && record.sourceRefId) || payload.sourceId || null
        }
      });
    } catch (error) {
      this._logDebug('candidate:rejected', { draftId, reason: error.message });
      return null;
    }
  }
}

module.exports = {
  VectorSeedStrategy,
  DRAFT_TYPE_TO_ELEMENT,
  DEFAULT_EXCLUDED_STATUSES,
  CONTENT_FIELDS
};
