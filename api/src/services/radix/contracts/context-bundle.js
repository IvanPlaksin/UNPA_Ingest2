/**
 * Radix Retrieval — Core Data Contracts
 *
 * ContextBundle is the universal output of workspace-scoped retrieval.
 * Every consumer of Radix (AI Assistant, REST API, MCP tools) receives this structure.
 *
 * Design principles:
 * - Every element carries provenance (traceability requirement)
 * - Every element carries score + strategy attribution (debuggability)
 * - Serialization-ready (can be directly assembled into an LLM prompt)
 * - Extensible via metadata (new element types without schema changes)
 *
 * @module services/radix/contracts/context-bundle
 */

'use strict';

/**
 * @typedef {'graph_path' | 'text_chunk' | 'entity' | 'relation' | 'rule' | 'concept'} ContextElementType
 */

/**
 * @typedef {Object} ElementProvenance
 * @property {string} sourceId - ID of the source (SourceReference.id or Draft.id)
 * @property {string} sourceType - Type of source ('SOURCE_REFERENCE' | 'DRAFT_ENTITY' | 'DRAFT_RULE' | ...)
 * @property {string} [extractionJobId] - ID of the extraction job that created this element
 * @property {number} [chunkIndex] - For chunked content: index of the chunk
 * @property {number} [charOffset] - Character offset in the original source
 * @property {string} [embeddingModel] - Model used for embedding
 * @property {string} [embeddingModelVersion] - Version of the embedding model
 */

/**
 * @typedef {Object} StrategyAttribution
 * @property {string} strategyName - Which strategy found this element
 * @property {'seed'|'expansion'} strategyType - Phase the strategy ran in
 * @property {number|null} rawScore - Original score from the strategy (before normalization)
 * @property {number|null} normalizedScore - Score after cross-strategy normalization [0..1];
 *   null until the orchestrator normalizes the fused scores
 * @property {number} rank - Rank within this strategy's results (1-based)
 */

/**
 * Single element of retrieved context.
 *
 * @typedef {Object} ContextElement
 * @property {string} id - Unique identifier (graph node id or Qdrant point id)
 * @property {ContextElementType} type - Type of element
 * @property {string} content - Human-readable content (for prompt injection)
 * @property {*} [contentRaw] - Raw/structured content (for programmatic use)
 * @property {number} score - Final fused score [0..1]
 * @property {StrategyAttribution[]} strategies - Which strategies contributed this element
 * @property {ElementProvenance} provenance - Traceability information
 * @property {Object.<string, any>} metadata - Type-specific metadata
 *   For 'graph_path': { pathNodes: string[], pathEdges: string[], pathLength: number }
 *   For 'text_chunk': { totalChunks: number, chunkSize: number }
 *   For 'entity':     { entityType: string, properties: Object }
 *   For 'relation':   { sourceEntity: string, targetEntity: string, relationType: string }
 *   For 'rule':       { ruleType: string, conditions: any[], actions: any[] }
 */

/**
 * @typedef {Object} RetrievalTiming
 * @property {number} totalMs - Total retrieval time in milliseconds
 * @property {Object.<string, number>} byStrategy - Time per strategy (strategyName → ms)
 * @property {number} embeddingMs - Time spent embedding the query. Broken out because
 *   it is typically the single largest term and is charged before any strategy runs;
 *   folding it into another bucket makes the profile unreadable.
 * @property {number} fusionMs - Time spent in fusion/ranking (measured, not inferred)
 * @property {number} rerankMs - Time spent in LLM reranking (0 when skipped)
 * @property {number} assemblyMs - Time spent in context assembly
 */

/**
 * @typedef {Object} RetrievalStats
 * @property {number} candidatesFromSeed - Candidates returned by all seed strategies
 * @property {number} candidatesFromExpansion - Candidates returned by all expansion strategies
 * @property {number} afterFusion - Elements after fusion (before truncation)
 * @property {number} afterTruncation - Elements in the final result
 * @property {number} totalTokens - Estimated token count of the assembled context
 * @property {string[]} failedStrategies - Names of strategies that failed or timed out.
 *   This is what separates "nothing matched" from "retrieval is broken": an empty
 *   `elements` with an empty `failedStrategies` is a genuine miss, an empty
 *   `elements` with entries here means the caller should say so rather than
 *   answer as though the workspace held nothing.
 */

/**
 * One labelled block of the assembled context.
 *
 * A workspace declares its retrieval endpoints as connectors, and each connector
 * produces a section. The category is what lets the consuming model tell one
 * kind of knowledge from another — "this is the service catalogue" versus "this
 * is policy" — rather than receiving one undifferentiated wall of facts.
 *
 * @typedef {Object} ContextSection
 * @property {string} category - Category name, e.g. 'serviceCatalog'
 * @property {string|null} connectorId - Connector that produced it; null for the default section
 * @property {string|null} connectorName
 * @property {ContextElement[]} elements
 * @property {number} tokenCount
 * @property {string} preamble - Introduces the section. For some categories this
 *   carries a guardrail that configuration cannot remove.
 * @property {number} priority - Higher sorts earlier
 */

/**
 * Complete result of workspace-scoped retrieval.
 * This is the primary output contract of RadixRetriever.
 *
 * @typedef {Object} ContextBundle
 * @property {string} bundleId - Unique id for this retrieval (logging/debugging)
 * @property {string} workspaceId - Workspace scope
 * @property {string} query - Original query text
 * @property {number[]|null} queryEmbedding - Query embedding vector (optional, for debugging)
 * @property {ContextElement[]} elements - Retrieved elements, ordered by score desc
 * @property {ContextSection[]} sections - The same elements grouped by category.
 *   `assembledContext` is the serialization of these, so a consumer can either take
 *   the ready text or work with the groups directly.
 * @property {string[]} strategiesUsed - Names of strategies that contributed
 * @property {RetrievalTiming} timing - Performance metrics
 * @property {RetrievalStats} stats - Retrieval statistics
 * @property {boolean} truncated - Whether the result was truncated by the token budget
 * @property {RetrievalConfig} config - Configuration used (for reproducibility)
 * @property {string} assembledContext - Pre-serialized context ready for prompt injection
 */

/**
 * Configuration for a retrieval request.
 *
 * @typedef {Object} RetrievalConfig
 * @property {number} [vectorTopK=20] - Max results from vector search
 * @property {number} [vectorThreshold=0.82] - Minimum cosine similarity for vector results
 * @property {number} [chunkTopK=5] - Max source-text chunks in the seed phase. Kept
 *   separate from `vectorTopK` on purpose: source text is far more voluminous than
 *   curated drafts, so a shared quota would let raw text crowd out reviewed knowledge.
 * @property {number} [chunkScoreThreshold=0.78] - Minimum cosine for chunks. Lower than
 *   the draft threshold because raw prose is noisier than a curated draft's name and
 *   description, so an equally relevant passage scores lower.
 * @property {string[]} [excludeDraftStatuses=['REJECTED','PROMOTED']] - Draft statuses kept
 *   out of retrieval. REJECTED is knowledge a human explicitly threw away — feeding it
 *   back to the model undoes the curation. PROMOTED already lives in the global KB, so
 *   including it double-counts once workspace and KB retrieval are combined.
 *   An exclude list (rather than an include list) means any new status defaults to visible.
 * @property {number} [graphMaxDepth=2] - Max hops for graph expansion
 * @property {number} [graphMaxResults=200] - Hard cap on traversal rows. A hub node in
 *   a dense workspace can fan out to thousands of paths; without a cap the query, not
 *   the timeout, decides how long retrieval takes.
 * @property {string[]|null} [graphEdgeTypes] - Edge types to traverse (null = all)
 * @property {Object.<string, number>} [edgeWeights] - Edge type → weight for scoring
 * @property {'rrf'|'linear'|'max'} [fusionMethod='rrf'] - Fusion method
 * @property {number} [rrfK=60] - RRF constant k
 * @property {number} [strategyTimeoutMs=300] - Per-strategy execution timeout.
 *   Per-strategy, not total: strategies inside a phase run in parallel, so phase
 *   time is max(), not sum(). A strategy that overruns yields an empty failed
 *   result and the rest of the retrieval proceeds.
 * @property {number} [fusionPoolSize=50] - How many candidates fusion hands downstream.
 *   This is the working pool for reranking and assembly, NOT the final answer: a
 *   reranker that only ever sees 15 candidates cannot promote the 20th, and an
 *   assembler that drops a long element by token budget has nothing to backfill with.
 * @property {number} [maxElements=15] - Max elements in the final result, applied in
 *   the assembler alongside `tokenBudget`
 * @property {number} [tokenBudget=4000] - Max tokens for the assembled context
 * @property {'natural'|'structured'|'compact'} [assemblyFormat='natural'] - Serialization
 *   style of `assembledContext`
 * @property {boolean} [rerankEnabled=false] - Reorder the fused pool with an LLM before
 *   assembly. Only single-strategy candidates are reordered — a candidate two strategies
 *   agreed on already carries more evidence than one model opinion.
 *
 *   OFF by default because it costs an API round trip: measured at 1392 ms mean /
 *   2886 ms P95, against a 500 ms budget for the whole retrieval. Radix runs before
 *   every chat message, so that is not a trade the default can make. Turn it on for
 *   callers that value ordering over latency — batch analysis, admin tooling,
 *   evaluation runs.
 * @property {number} [rerankMaxCandidates=30] - Cap on candidates sent to the reranker
 * @property {number} [rerankContentLimit=800] - Characters of each candidate the reranker
 *   sees. Equalised across candidates so a long source chunk cannot outrank a short draft
 *   on sheer length.
 * @property {boolean} [includeQueryEmbedding=false] - Include the embedding in the response
 * @property {string[]|null} [strategies] - Specific strategies to use (null = all enabled)
 */

/**
 * Element types Radix can emit.
 * @type {ContextElementType[]}
 */
const ELEMENT_TYPES = Object.freeze([
  'graph_path',
  'text_chunk',
  'entity',
  'relation',
  'rule',
  'concept'
]);

/**
 * Weight applied to an edge type that has no explicit entry in `edgeWeights`.
 * Keeps traversal scoring defined for custom/user-created edge types.
 */
const DEFAULT_EDGE_WEIGHT = 0.3;

/**
 * Edge-type weights covering the full workspace edge inventory
 * (see api/docs/WORKSPACE_REFERENCE.md §4). Higher = stronger relevance signal
 * when expanding the graph away from a seed node.
 */
const DEFAULT_EDGE_WEIGHTS = Object.freeze({
  IMPLEMENTS: 1.0,
  DEPENDS_ON: 0.9,
  PRODUCES: 0.85,
  CONSUMES: 0.85,
  // A draft that contradicts a seed is a signal, not noise: the model must know
  // the sources disagree, otherwise it confidently states one side as fact.
  // Weight sets RELEVANCE (high); presentation is handled separately.
  // TODO R0.5: special serialization for CONFLICTS_WITH edges
  CONFLICTS_WITH: 0.85,
  TRIGGERS: 0.8,
  GOVERNS: 0.8,
  CONTAINS: 0.7,
  REFERENCES: 0.6,
  WORKS_IN: 0.6,
  RELATES_TO: 0.5,
  EXTENDS: 0.5,
  BELONGS_TO: 0.4
});

/**
 * Default retrieval configuration.
 * Threshold 0.82 and RRF k=60 come from the retrieval research baseline.
 * @type {RetrievalConfig}
 */
const DEFAULT_CONFIG = Object.freeze({
  vectorTopK: 20,
  vectorThreshold: 0.82,
  chunkTopK: 5,
  chunkScoreThreshold: 0.78,
  excludeDraftStatuses: Object.freeze(['REJECTED', 'PROMOTED']),
  graphMaxDepth: 2,
  graphMaxResults: 200,
  graphEdgeTypes: null, // all types
  edgeWeights: DEFAULT_EDGE_WEIGHTS,
  fusionMethod: 'rrf',
  rrfK: 60,
  // 800, not 300: a seed strategy makes two network calls (Qdrant + hydration)
  // and a cold process pays connection setup on top. Measured cold seed: 632 ms.
  strategyTimeoutMs: 800,
  fusionPoolSize: 50,
  maxElements: 15,
  tokenBudget: 4000,
  assemblyFormat: 'natural',
  rerankEnabled: false,
  rerankMaxCandidates: 30,
  rerankContentLimit: 800,
  includeQueryEmbedding: false,
  strategies: null // all enabled
});

/**
 * Creates a new ContextElement with required fields validated.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {ContextElementType} params.type
 * @param {string} params.content
 * @param {*} [params.contentRaw]
 * @param {number} params.score
 * @param {StrategyAttribution[]} [params.strategies]
 * @param {ElementProvenance} params.provenance
 * @param {Object} [params.metadata]
 * @returns {ContextElement}
 * @throws {Error} if required fields are missing or invalid
 */
function createContextElement({
  id,
  type,
  content,
  contentRaw = null,
  score,
  strategies = [],
  provenance,
  metadata = {}
}) {
  if (!id) throw new Error('ContextElement requires id');
  if (!type) throw new Error('ContextElement requires type');
  if (typeof content !== 'string') throw new Error('ContextElement requires content string');
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 1) {
    throw new Error('ContextElement requires score in [0, 1]');
  }
  if (!provenance || !provenance.sourceId || !provenance.sourceType) {
    throw new Error('ContextElement requires provenance with sourceId and sourceType');
  }

  return {
    id,
    type,
    content,
    contentRaw,
    score,
    strategies,
    provenance,
    metadata
  };
}

/**
 * Creates a new empty ContextBundle.
 *
 * @param {string} workspaceId
 * @param {string} query
 * @param {Partial<RetrievalConfig>} [config]
 * @returns {ContextBundle}
 */
function createContextBundle(workspaceId, query, config = {}) {
  return {
    bundleId: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    workspaceId,
    query,
    queryEmbedding: null,
    elements: [],
    sections: [],
    strategiesUsed: [],
    timing: {
      totalMs: 0,
      byStrategy: {},
      embeddingMs: 0,
      fusionMs: 0,
      rerankMs: 0,
      assemblyMs: 0
    },
    stats: {
      candidatesFromSeed: 0,
      candidatesFromExpansion: 0,
      afterFusion: 0,
      afterTruncation: 0,
      totalTokens: 0,
      failedStrategies: []
    },
    truncated: false,
    config: mergeConfig(config),
    assembledContext: ''
  };
}

/**
 * Validates a ContextBundle structure.
 *
 * @param {ContextBundle} bundle
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateContextBundle(bundle) {
  const errors = [];

  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['Bundle must be an object'] };
  }

  if (!bundle.bundleId) errors.push('Missing bundleId');
  if (!bundle.workspaceId) errors.push('Missing workspaceId');
  if (typeof bundle.query !== 'string') errors.push('query must be string');

  if (!Array.isArray(bundle.elements)) {
    errors.push('elements must be array');
  } else {
    bundle.elements.forEach((el, idx) => {
      if (!el || typeof el !== 'object') {
        errors.push(`Element ${idx}: not an object`);
        return;
      }
      if (!el.id) errors.push(`Element ${idx}: missing id`);
      if (!el.type) errors.push(`Element ${idx}: missing type`);
      if (!el.provenance) errors.push(`Element ${idx}: missing provenance`);
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Merges a user config with defaults, clamping and validating values.
 * Unknown keys are dropped — the config is a contract, not a bag.
 *
 * @param {Partial<RetrievalConfig>} [userConfig]
 * @returns {RetrievalConfig}
 */
function mergeConfig(userConfig = {}) {
  const merged = { ...DEFAULT_CONFIG };

  if (!userConfig || typeof userConfig !== 'object') return merged;

  if (typeof userConfig.vectorTopK === 'number') {
    merged.vectorTopK = Math.max(1, Math.min(100, userConfig.vectorTopK));
  }
  if (typeof userConfig.vectorThreshold === 'number') {
    merged.vectorThreshold = Math.max(0, Math.min(1, userConfig.vectorThreshold));
  }
  if (typeof userConfig.chunkTopK === 'number') {
    merged.chunkTopK = Math.max(0, Math.min(50, userConfig.chunkTopK));
  }
  if (typeof userConfig.chunkScoreThreshold === 'number') {
    merged.chunkScoreThreshold = Math.max(0, Math.min(1, userConfig.chunkScoreThreshold));
  }
  if (Array.isArray(userConfig.excludeDraftStatuses)) {
    merged.excludeDraftStatuses = userConfig.excludeDraftStatuses;
  }
  if (typeof userConfig.graphMaxDepth === 'number') {
    merged.graphMaxDepth = Math.max(1, Math.min(5, userConfig.graphMaxDepth));
  }
  if (typeof userConfig.graphMaxResults === 'number') {
    merged.graphMaxResults = Math.max(1, Math.min(2000, userConfig.graphMaxResults));
  }
  if (Array.isArray(userConfig.graphEdgeTypes)) {
    merged.graphEdgeTypes = userConfig.graphEdgeTypes;
  }
  if (userConfig.edgeWeights && typeof userConfig.edgeWeights === 'object') {
    merged.edgeWeights = { ...DEFAULT_EDGE_WEIGHTS, ...userConfig.edgeWeights };
  }
  if (['rrf', 'linear', 'max'].includes(userConfig.fusionMethod)) {
    merged.fusionMethod = userConfig.fusionMethod;
  }
  if (typeof userConfig.rrfK === 'number') {
    merged.rrfK = Math.max(1, userConfig.rrfK);
  }
  if (typeof userConfig.strategyTimeoutMs === 'number') {
    merged.strategyTimeoutMs = Math.max(10, Math.min(60000, userConfig.strategyTimeoutMs));
  }
  if (typeof userConfig.maxElements === 'number') {
    merged.maxElements = Math.max(1, Math.min(100, userConfig.maxElements));
  }
  // Resolved after maxElements: the pool can never be smaller than the final
  // answer, or the assembler would be unable to fill it.
  if (typeof userConfig.fusionPoolSize === 'number') {
    merged.fusionPoolSize = Math.min(200, Math.max(merged.maxElements, userConfig.fusionPoolSize));
  } else if (merged.fusionPoolSize < merged.maxElements) {
    merged.fusionPoolSize = merged.maxElements;
  }
  if (typeof userConfig.tokenBudget === 'number') {
    merged.tokenBudget = Math.max(100, userConfig.tokenBudget);
  }
  if (['natural', 'structured', 'compact'].includes(userConfig.assemblyFormat)) {
    merged.assemblyFormat = userConfig.assemblyFormat;
  }
  if (typeof userConfig.rerankEnabled === 'boolean') {
    merged.rerankEnabled = userConfig.rerankEnabled;
  }
  if (typeof userConfig.rerankMaxCandidates === 'number') {
    merged.rerankMaxCandidates = Math.max(2, Math.min(100, userConfig.rerankMaxCandidates));
  }
  if (typeof userConfig.rerankContentLimit === 'number') {
    merged.rerankContentLimit = Math.max(100, Math.min(4000, userConfig.rerankContentLimit));
  }
  if (typeof userConfig.includeQueryEmbedding === 'boolean') {
    merged.includeQueryEmbedding = userConfig.includeQueryEmbedding;
  }
  if (Array.isArray(userConfig.strategies)) {
    merged.strategies = userConfig.strategies;
  }

  return merged;
}

/**
 * Weight of an edge type under a given weight table, with a defined fallback
 * for custom edge types that are not in the table.
 *
 * @param {string} edgeType
 * @param {Object.<string, number>} [weights]
 * @returns {number}
 */
function edgeWeight(edgeType, weights = DEFAULT_EDGE_WEIGHTS) {
  if (!weights || !edgeType) return DEFAULT_EDGE_WEIGHT;

  const direct = weights[edgeType];
  if (typeof direct === 'number') return direct;

  // Workspace edges are stored under one Memgraph label, DRAFT_RELATES_TO, so a
  // type can arrive prefixed. Strip it rather than silently charging the
  // unknown-edge fallback for a relation we do have a weight for.
  if (typeof edgeType === 'string' && edgeType.startsWith('DRAFT_')) {
    const stripped = weights[edgeType.slice('DRAFT_'.length)];
    if (typeof stripped === 'number') return stripped;
  }

  return DEFAULT_EDGE_WEIGHT;
}

module.exports = {
  // Type constants
  ELEMENT_TYPES,

  // Default config
  DEFAULT_CONFIG,
  DEFAULT_EDGE_WEIGHTS,
  DEFAULT_EDGE_WEIGHT,

  // Factory functions
  createContextElement,
  createContextBundle,

  // Utilities
  validateContextBundle,
  mergeConfig,
  edgeWeight
};
