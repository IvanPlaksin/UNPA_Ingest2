/**
 * Radix — Workspace-Scoped Hybrid Retrieval Subsystem
 *
 * Radix answers one question: "given this text, what does workspace X already
 * know that is relevant?" — combining
 *   - vector search   (semantic similarity via the per-workspace Qdrant collection)
 *   - graph traversal (structural relationships via Memgraph)
 *   - fusion/ranking  (RRF, later reranking)
 *   - context assembly (prompt-ready serialization)
 *
 * It is the pre-fetch phase that runs BEFORE a message reaches the LLM.
 *
 * This module is the public API — all consumers (AI Assistant, REST, MCP) use it.
 * The global-KB retriever (`services/retrieval/hybrid-search.js`) is a separate,
 * unrelated path over `embeddings_unified` and is intentionally left untouched.
 *
 * @module services/radix
 */

'use strict';

const contracts = require('./contracts/context-bundle');
const strategyContracts = require('./contracts/strategy.interface');
const { WorkspaceHybridRetriever } = require('./workspace-hybrid-retriever');
const {
  BaseStrategy,
  MockStrategy,
  VectorSeedStrategy,
  createDefaultStrategies
} = require('./strategies');
const { createFusionPolicy } = require('./fusion');
const { ContextAssembler } = require('./assembly/context-assembler');

/**
 * Query-side embedding adapter over the SAME service that indexed the drafts.
 *
 * This parity is not optional. `draft.service._indexInQdrant` embeds with
 * `tei.service.getEmbedding`; embedding a query with any other model produces
 * vectors in a different space, and the cosine scores that come back are
 * meaningless numbers that still look perfectly plausible. Wiring the query path
 * to the indexing service is what keeps the two in the same space.
 *
 * Returns the `{embedding}` shape the orchestrator expects.
 *
 * @returns {{embed: (text: string) => Promise<{embedding: number[]}>}}
 */
function createTeiEmbeddingAdapter() {
  const tei = require('../tei.service');
  return {
    async embed(text) {
      const embedding = await tei.getEmbedding(text);
      return { embedding };
    }
  };
}

/**
 * Builds a retriever wired with the production strategy registry.
 *
 * @param {Object} [dependencies] - qdrantService, memgraphService, embeddingService, logger
 * @returns {WorkspaceHybridRetriever}
 */
function createRadixRetriever(dependencies = {}) {
  const resolved = {
    ...dependencies,
    embeddingService: dependencies.embeddingService || createTeiEmbeddingAdapter(),
    memgraphService: dependencies.memgraphService || require('../memgraph.service')
  };
  return new WorkspaceHybridRetriever({
    ...resolved,
    strategies: dependencies.strategies || createDefaultStrategies(resolved)
  });
}

module.exports = {
  WorkspaceHybridRetriever,
  // Kept as an alias: the plan names the facade RadixRetriever, the file names
  // it after what it does. Same class either way.
  RadixRetriever: WorkspaceHybridRetriever,
  createRadixRetriever,

  BaseStrategy,
  MockStrategy,
  VectorSeedStrategy,
  createDefaultStrategies,
  createTeiEmbeddingAdapter,
  createFusionPolicy,
  ContextAssembler,

  contracts,
  strategyContracts
};
