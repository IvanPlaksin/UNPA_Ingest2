/**
 * Radix Retrieval — Strategy Interface Contract
 *
 * Strategies are pluggable retrieval algorithms. Two types:
 * - 'seed'      — generate initial candidates from the query (vector search, fulltext, ...)
 * - 'expansion' — expand from seed results (graph traversal, PPR, communities)
 *
 * Execution model (orchestrated in R0.6):
 *   1. All seed strategies run in parallel
 *   2. Seeds are merged (union, no ranking yet)
 *   3. All expansion strategies run in parallel with the merged seeds as input
 *   4. All results go to the FusionPolicy for ranking
 *
 * Two levels, not a full DAG — there is no use case for expansion-of-expansion yet.
 * If one appears, a third type is added without breaking this contract.
 *
 * @module services/radix/contracts/strategy.interface
 */

'use strict';

/**
 * @typedef {'seed' | 'expansion'} StrategyType
 */

/**
 * A single retrieval candidate produced by a strategy.
 * Scores are strategy-local — cross-strategy normalization happens in fusion.
 *
 * @typedef {Object} StrategyCandidate
 * @property {string} id - Unique identifier (graph node id or Qdrant point id)
 * @property {string} type - Element type ('entity', 'rule', 'concept', ...)
 * @property {string} content - Human-readable content
 * @property {*} [contentRaw] - Raw/structured content
 * @property {number} score - Strategy-specific score (normalized later)
 * @property {import('./context-bundle').ElementProvenance} provenance
 * @property {Object} metadata - Type-specific metadata
 */

/**
 * @typedef {Object} StrategyResult
 * @property {string} strategyName - Name of the strategy that produced this
 * @property {StrategyType} strategyType - 'seed' or 'expansion'
 * @property {StrategyCandidate[]} candidates - Retrieved candidates
 * @property {number} executionMs - Execution time in milliseconds
 * @property {boolean} success - Whether the strategy completed without error
 * @property {string|null} error - Error message when success === false
 * @property {Object|null} [debug] - Optional debug info (query plan, hop counts, ...)
 */

/**
 * Input handed to a strategy. `seeds` is present only for expansion strategies.
 *
 * @typedef {Object} StrategyContext
 * @property {string} workspaceId - Workspace scope
 * @property {string} query - Original query text
 * @property {number[]} queryEmbedding - Query embedding vector
 * @property {import('./context-bundle').RetrievalConfig} config - Retrieval configuration
 * @property {StrategyCandidate[]} [seeds] - For expansion strategies: merged seed-phase results
 */

/**
 * @typedef {Object} StrategyMetadata
 * @property {string} name - Unique strategy name ('vector-seed', 'k-hop-expansion', ...)
 * @property {StrategyType} type - 'seed' or 'expansion'
 * @property {string} description - Human-readable description
 * @property {string} version - Semver version, for tracking behaviour changes
 * @property {string[]} [requiredServices] - Services this strategy needs (DI validation)
 */

/**
 * One node along an expansion path, together with the edge that was traversed
 * to reach it. The first segment is the seed and has no incoming edge.
 *
 * `nodeName` is carried here (not looked up later) because the assembler
 * serializes paths as text and must not issue a second round of graph queries
 * inside the latency budget.
 *
 * @typedef {Object} PathSegment
 * @property {string} nodeId
 * @property {string} nodeType - Memgraph label ('DraftEntity', 'DraftBusinessRule', ...)
 * @property {string} nodeName - Human-readable name, used for serialization
 * @property {string|null} edgeType - Edge traversed to reach this node; null for the seed
 * @property {'outgoing'|'incoming'|null} edgeDirection - Traversal direction; null for the seed
 */

/**
 * Detail of a contradiction reached over a CONFLICTS_WITH edge.
 *
 * @typedef {Object} ConflictInfo
 * @property {string} withNodeId
 * @property {string} withNodeName
 * @property {string} [conflictType] - 'value' | 'existence' | 'scope'
 */

/**
 * Metadata every EXPANSION strategy must attach to each candidate it produces.
 *
 * The full chain is mandatory, not just the last edge: the assembler renders a
 * path as one statement ("A DEPENDS_ON B GOVERNS C"), which a model reads far
 * better than three disconnected facts, and R2.2 scores path reliability over
 * every hop. A candidate that only remembers where it came from last cannot
 * support either.
 *
 * @typedef {Object} ExpansionMetadata
 * @property {PathSegment[]} expansionPath - Full chain from seed to this candidate
 * @property {number} hops - expansionPath.length - 1
 * @property {string} seedId - expansionPath[0].nodeId
 * @property {string|null} terminalEdgeType - Last edge type; drives conflict handling
 * @property {ConflictInfo} [conflict] - Present when terminalEdgeType === 'CONFLICTS_WITH'
 */

/**
 * Edge type whose candidates the assembler renders as contradictions rather
 * than as plain facts.
 * @type {string}
 */
const CONFLICT_EDGE_TYPE = 'CONFLICTS_WITH';

/**
 * Strategy types the orchestrator knows how to schedule.
 * @type {StrategyType[]}
 */
const STRATEGY_TYPES = Object.freeze(['seed', 'expansion']);

/**
 * Phase order the orchestrator executes. Index = phase number.
 * @type {StrategyType[]}
 */
const STRATEGY_PHASES = Object.freeze(['seed', 'expansion']);

module.exports = {
  STRATEGY_TYPES,
  STRATEGY_PHASES,
  CONFLICT_EDGE_TYPE
};
