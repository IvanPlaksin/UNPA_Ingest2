/**
 * KHopExpansionStrategy — graph expansion outward from the seed nodes.
 *
 * Vector search finds what a query *sounds* like. This finds what that is
 * *connected to*: the rule that governs the entity, the workflow it triggers,
 * the source that contradicts it. Those neighbours are frequently the answer
 * even though their text shares no vocabulary with the question.
 *
 * Traversal is bidirectional on purpose. Draft edges are directed, so a seed
 * "Session" would never reach "SessionTimeout GOVERNS Session" by following
 * outgoing edges alone — and that rule is exactly the context the model needs.
 * Each hop records which way it was walked.
 *
 * A path's score is the product of its edge weights. The product decays on its
 * own (0.9 × 0.8 = 0.72), so no separate depth penalty is applied — that would
 * charge for distance twice.
 *
 * @module services/radix/strategies/k-hop-expansion.strategy
 */

'use strict';

const { BaseStrategy } = require('./base-strategy');
const { buildContent, buildProvenance, draftTypeFromLabels } = require('./shared/draft-hydration');
const { edgeWeight, DEFAULT_EDGE_WEIGHTS } = require('../contracts/context-bundle');
const { CONFLICT_EDGE_TYPE } = require('../contracts/strategy.interface');
const { DRAFT_TYPE_TO_ELEMENT } = require('./vector-seed.strategy');

const DEFAULT_ELEMENT_TYPE = 'entity';
const DEFAULT_EXCLUDED_STATUSES = Object.freeze(['REJECTED', 'PROMOTED']);
const DEFAULT_GRAPH_MAX_RESULTS = 200;

/**
 * The single Memgraph relationship type carrying every draft→draft link.
 *
 * draft.service.createEdge writes ALL semantic relations as
 * `(a)-[:DRAFT_RELATES_TO {type: 'GOVERNS'}]->(b)` — the relationship label is
 * constant and the meaning lives in the `type` PROPERTY. Two consequences the
 * traversal must respect:
 *
 *   1. Pinning the pattern to this label is what keeps the walk on semantic
 *      edges. An untyped `-[*1..2]-` also follows CONTAINS_DRAFT back up to the
 *      WorkSpace node and down again, which puts every draft two hops from every
 *      other draft and turns expansion into "return the whole workspace".
 *   2. `type(r)` is always 'DRAFT_RELATES_TO', so edge weights must be read from
 *      `r.type`. Reading the label instead makes the entire weight table inert
 *      and CONFLICTS_WITH undetectable.
 */
const DRAFT_EDGE_LABEL = 'DRAFT_RELATES_TO';

/** Reads the semantic relation, falling back to the label. */
const EDGE_TYPE_EXPR = `coalesce(r.type, type(r))`;

class KHopExpansionStrategy extends BaseStrategy {
  /** @returns {import('../contracts/strategy.interface').StrategyMetadata} */
  get metadata() {
    return {
      name: 'k-hop-expansion',
      type: 'expansion',
      description: 'Bidirectional weighted graph traversal from seed drafts via Memgraph',
      version: '1.0.0',
      requiredServices: ['memgraphService']
    };
  }

  /**
   * @param {import('../contracts/strategy.interface').StrategyContext} context
   * @returns {Promise<{candidates: Object[], debug: Object}>}
   * @protected
   */
  async _execute(context) {
    const seeds = context.seeds || [];
    if (seeds.length === 0) {
      // No entry points means nothing to expand from. Touching Memgraph here
      // would be a guaranteed-empty query on the latency budget.
      return { candidates: [], debug: { seedCount: 0, rows: 0, targets: 0 } };
    }

    const memgraph = this.dependencies.memgraphService;
    if (!memgraph || typeof memgraph.runQuery !== 'function') {
      throw new Error('KHopExpansionStrategy requires a memgraphService with runQuery');
    }

    const { config } = context;
    const maxDepth = this._clampInt(config.graphMaxDepth, 1, 5, 2);
    const maxResults = this._clampInt(config.graphMaxResults, 1, 2000, DEFAULT_GRAPH_MAX_RESULTS);
    const excludeStatuses = Array.isArray(config.excludeDraftStatuses)
      ? config.excludeDraftStatuses
      : DEFAULT_EXCLUDED_STATUSES;

    const seedIds = seeds.map((s) => String(s.id)).filter(Boolean);
    const seedIdSet = new Set(seedIds);

    const rows = await memgraph.runQuery(
      this._buildCypher(maxDepth, maxResults, Array.isArray(config.graphEdgeTypes)),
      {
        wsId: context.workspaceId,
        seedIds,
        excludeStatuses,
        edgeTypes: config.graphEdgeTypes || []
      }
    );

    const { candidates, targets } = this._buildCandidates(rows || [], config, seedIdSet);

    return {
      candidates,
      debug: {
        seedCount: seedIds.length,
        rows: (rows || []).length,
        targets,
        maxDepth,
        maxResults,
        truncatedByLimit: (rows || []).length >= maxResults
      }
    };
  }

  /**
   * Builds the traversal query.
   *
   * Path nodes come back as three PARALLEL LISTS rather than one list of maps.
   * Memgraph evaluates a map literal inside a list comprehension incorrectly —
   * `[n IN nodes(path) | {id: n.id, name: n.name}]` yields the FIRST node's
   * values repeated for every position, while the plain projection
   * `[n IN nodes(path) | n.name]` is correct. Verified against Memgraph on real
   * data; the map form silently produced paths reading "A --> A --> A".
   *
   * `maxDepth` and `maxResults` are interpolated as literals rather than bound
   * as parameters: neither Cypher's variable-length bounds nor LIMIT accept a
   * parameter in Memgraph, and binding an integer here would additionally need
   * neo4j.int() wrapping. Both values are clamped integers before they get here,
   * so there is nothing injectable in them.
   *
   * @param {number} maxDepth
   * @param {number} maxResults
   * @param {boolean} filterEdgeTypes
   * @returns {string}
   * @private
   */
  _buildCypher(maxDepth, maxResults, filterEdgeTypes) {
    const edgeTypeClause = filterEdgeTypes
      ? `AND ALL(r IN rels WHERE ${EDGE_TYPE_EXPR} IN $edgeTypes)`
      : '';

    return `
      MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(seed)
      WHERE seed.id IN $seedIds
      MATCH path = (seed)-[rels:${DRAFT_EDGE_LABEL}*1..${maxDepth}]-(target)
      WHERE target.id <> seed.id
        AND NOT coalesce(target.status, '') IN $excludeStatuses
        ${edgeTypeClause}
      MATCH (w)-[:CONTAINS_DRAFT]->(target)
      OPTIONAL MATCH (target)-[:EXTRACTED_FROM]->(s:SourceReference)
      RETURN seed.id AS seedId,
             target.id AS targetId,
             properties(target) AS props,
             labels(target) AS labels,
             [n IN nodes(path) | n.id] AS pathNodeIds,
             [n IN nodes(path) | n.name] AS pathNodeNames,
             [n IN nodes(path) | labels(n)] AS pathNodeLabels,
             [r IN rels | ${EDGE_TYPE_EXPR}] AS edgeTypes,
             [i IN range(0, size(rels) - 1) |
               CASE WHEN startNode(rels[i]) = nodes(path)[i]
                    THEN 'outgoing' ELSE 'incoming' END] AS directions,
             size(rels) AS hops,
             s.id AS sourceRefId, s.sourceType AS sourceRefType, s.filename AS sourceRefName
      LIMIT ${maxResults}
    `;
  }

  /**
   * Collapses traversal rows into one candidate per target node.
   *
   * A target reachable by several paths keeps the HIGHEST-SCORING one, not the
   * shortest. Two hops over IMPLEMENTS (1.0 × 1.0) is a stronger connection than
   * one hop over BELONGS_TO (0.4), and the weights exist precisely to say so.
   * The path that survives is the one that justified the score.
   *
   * Targets that are already seeds are NOT dropped: being found by both the
   * vector and the graph is corroboration, and RRF is what turns that into rank.
   *
   * @param {Object[]} rows
   * @param {import('../contracts/context-bundle').RetrievalConfig} config
   * @param {Set<string>} seedIdSet
   * @returns {{candidates: Object[], targets: number}}
   * @private
   */
  _buildCandidates(rows, config, seedIdSet) {
    const weights = config.edgeWeights || DEFAULT_EDGE_WEIGHTS;
    /** @type {Map<string, {row: Object, score: number}>} */
    const best = new Map();

    for (const row of rows) {
      if (!row || !row.targetId || !Array.isArray(row.edgeTypes) || row.edgeTypes.length === 0) {
        continue;
      }

      const score = row.edgeTypes.reduce(
        (acc, type) => acc * edgeWeight(type, weights),
        1
      );

      const targetId = String(row.targetId);
      const current = best.get(targetId);
      if (!current || score > current.score) {
        best.set(targetId, { row, score });
      }
    }

    const candidates = [];
    for (const [targetId, { row, score }] of best) {
      const candidate = this._toCandidate(targetId, row, score, seedIdSet);
      if (candidate) candidates.push(candidate);
    }

    // Fusion ranks by position, so hand it an ordered list rather than an
    // arbitrary Map iteration order.
    candidates.sort((a, b) => b.score - a.score);

    return { candidates, targets: best.size };
  }

  /**
   * @param {string} targetId
   * @param {Object} row
   * @param {number} score
   * @param {Set<string>} seedIdSet
   * @returns {Object|null}
   * @private
   */
  _toCandidate(targetId, row, score, seedIdSet) {
    const props = row.props || {};
    const draftType = props.type || draftTypeFromLabels(row.labels);
    const name = props.name || targetId;

    const record = {
      sourceRefId: row.sourceRefId || null,
      sourceRefType: row.sourceRefType || null,
      sourceRefName: row.sourceRefName || null
    };

    try {
      return this._createCandidate({
        id: targetId,
        type: DRAFT_TYPE_TO_ELEMENT[draftType] || DEFAULT_ELEMENT_TYPE,
        content: buildContent(props, name),
        contentRaw: props,
        score,
        provenance: buildProvenance(targetId, draftType, record),
        metadata: {
          name,
          draftType,
          draftStatus: props.status || null,
          knowledgeFamily: props.knowledgeFamily || null,
          hydrated: true,
          sourceRefName: record.sourceRefName,
          documentSourceId: record.sourceRefId,
          alsoSeed: seedIdSet.has(targetId),
          ...this._buildExpansionMetadata(row)
        }
      });
    } catch (error) {
      this._logDebug('candidate:rejected', { targetId, reason: error.message });
      return null;
    }
  }

  /**
   * Builds the ExpansionMetadata contract for one traversal row.
   *
   * The full chain is carried, not just the last edge: the assembler renders a
   * path as a single statement and R2.2 scores reliability over every hop.
   *
   * @param {Object} row
   * @returns {import('../contracts/strategy.interface').ExpansionMetadata}
   * @private
   */
  _buildExpansionMetadata(row) {
    const ids = Array.isArray(row.pathNodeIds) ? row.pathNodeIds : [];
    const names = Array.isArray(row.pathNodeNames) ? row.pathNodeNames : [];
    const labelLists = Array.isArray(row.pathNodeLabels) ? row.pathNodeLabels : [];
    const edgeTypes = Array.isArray(row.edgeTypes) ? row.edgeTypes : [];
    const directions = Array.isArray(row.directions) ? row.directions : [];

    const expansionPath = ids.map((id, index) => ({
      nodeId: id ? String(id) : '',
      nodeType: draftTypeFromLabels(labelLists[index]) || null,
      nodeName: names[index] || (id ? String(id) : ''),
      edgeType: index === 0 ? null : (edgeTypes[index - 1] || null),
      edgeDirection: index === 0 ? null : (directions[index - 1] || null)
    }));

    const terminalEdgeType = edgeTypes.length > 0 ? edgeTypes[edgeTypes.length - 1] : null;

    /** @type {import('../contracts/strategy.interface').ExpansionMetadata} */
    const metadata = {
      expansionPath,
      hops: typeof row.hops === 'number' ? row.hops : edgeTypes.length,
      seedId: row.seedId ? String(row.seedId) : (expansionPath[0] && expansionPath[0].nodeId) || '',
      terminalEdgeType
    };

    if (terminalEdgeType === CONFLICT_EDGE_TYPE) {
      // The counterpart is the node one step back along the path — the thing
      // this candidate actually contradicts, which is not always the seed.
      const counterpart = expansionPath[expansionPath.length - 2] || expansionPath[0] || {};
      metadata.conflict = {
        withNodeId: counterpart.nodeId || metadata.seedId,
        withNodeName: counterpart.nodeName || counterpart.nodeId || 'another draft',
        conflictType: 'semantic'
      };
    }

    return metadata;
  }

  /**
   * @param {*} value
   * @param {number} min
   * @param {number} max
   * @param {number} fallback
   * @returns {number}
   * @private
   */
  _clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }
}

module.exports = {
  KHopExpansionStrategy,
  DEFAULT_GRAPH_MAX_RESULTS,
  DRAFT_EDGE_LABEL
};
