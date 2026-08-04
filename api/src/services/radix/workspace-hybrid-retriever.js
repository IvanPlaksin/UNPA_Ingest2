/**
 * WorkspaceHybridRetriever — the Radix orchestrator.
 *
 * Runs the whole pre-fetch pipeline for one query against one workspace:
 *
 *   validate config → embed query → SEED phase (parallel) → merge seeds
 *   → EXPANSION phase (parallel) → fuse → assemble → ContextBundle
 *
 * Two failure philosophies, deliberately different:
 *
 * - Caller mistakes (no workspaceId, empty query, unknown strategy name, bad
 *   assemblyFormat) THROW, and throw before any retrieval work is paid for.
 * - Infrastructure failures (Qdrant down, Memgraph slow, embedding service
 *   unavailable) DEGRADE. The consumer is a chat assistant: answering without
 *   context is worse than answering with it, but far better than not answering.
 *   `stats.failedStrategies` is how the caller tells the two apart.
 *
 * @module services/radix/workspace-hybrid-retriever
 */

'use strict';

const { createContextBundle, mergeConfig } = require('./contracts/context-bundle');
const { createFusionPolicy } = require('./fusion');
const { createSerializer } = require('./assembly/serializers');
const { ContextAssembler } = require('./assembly/context-assembler');
const { RerankerService } = require('./reranking/reranker.service');
const logger = require('../../utils/logger');

/** Pseudo-strategy name reported when query embedding itself fails. */
const EMBEDDING_STEP = 'query-embedding';

class WorkspaceHybridRetriever {
  /**
   * @param {Object} [dependencies]
   * @param {Map<string, Object>|Object[]} [dependencies.strategies] - Strategy
   *   instances, as a Map keyed by name or a plain array (keyed by `.name`)
   * @param {Object} [dependencies.embeddingService] - Must expose `embed(text)`
   * @param {Object} [dependencies.fusionPolicy] - Overrides the config-derived policy
   * @param {Object} [dependencies.assembler]
   * @param {Object} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.strategyRegistry = this._toRegistry(dependencies.strategies);
    this.embeddingService = dependencies.embeddingService;
    this.fusionPolicy = dependencies.fusionPolicy || null;
    this.assembler = dependencies.assembler || new ContextAssembler(dependencies);
    this.reranker = dependencies.reranker || new RerankerService(dependencies);
    this.logger = dependencies.logger || logger.child('Radix');
  }

  /**
   * Registers a strategy at runtime. Replaces any strategy of the same name.
   * @param {Object} strategy
   * @returns {WorkspaceHybridRetriever} this, for chaining
   */
  registerStrategy(strategy) {
    if (!strategy || !strategy.name) {
      throw new Error('registerStrategy requires a strategy with a name');
    }
    this.strategyRegistry.set(strategy.name, strategy);
    return this;
  }

  /** @returns {string[]} */
  getRegisteredStrategies() {
    return Array.from(this.strategyRegistry.keys());
  }

  /**
   * Runs workspace-scoped retrieval.
   *
   * @param {string} workspaceId
   * @param {string} queryText
   * @param {Partial<import('./contracts/context-bundle').RetrievalConfig>} [config]
   * @returns {Promise<import('./contracts/context-bundle').ContextBundle>}
   */
  async retrieve(workspaceId, queryText, config = {}) {
    if (!workspaceId) throw new Error('retrieve requires workspaceId');
    if (typeof queryText !== 'string' || queryText.trim() === '') {
      throw new Error('retrieve requires a non-empty queryText');
    }

    const mergedConfig = mergeConfig(config);

    // Fail-fast on configuration BEFORE spending any retrieval budget: an
    // unimplemented assemblyFormat or fusion method must not surface only after
    // the vector search and the graph walk have already run.
    createSerializer(mergedConfig.assemblyFormat);
    const fusionPolicy = this.fusionPolicy
      || createFusionPolicy(mergedConfig.fusionMethod, { logger: this.logger });

    const strategies = this._resolveStrategies(mergedConfig.strategies);

    const startTime = Date.now();
    const bundle = createContextBundle(workspaceId, queryText, mergedConfig);

    const embeddingStart = Date.now();
    const { queryEmbedding, embeddingFailed } = await this._embedQuery(queryText);
    bundle.timing.embeddingMs = Date.now() - embeddingStart;

    if (mergedConfig.includeQueryEmbedding) {
      bundle.queryEmbedding = queryEmbedding;
    }

    const context = {
      workspaceId,
      query: queryText,
      queryEmbedding,
      config: mergedConfig
    };

    const seedStrategies = strategies.filter((s) => s.type === 'seed');
    const expansionStrategies = strategies.filter((s) => s.type === 'expansion');

    // Without an embedding, seed strategies would run against a zero vector and
    // return confident nonsense. Skipping them is the honest failure.
    const seedResults = embeddingFailed
      ? seedStrategies.map((s) => this._failedResult(s, 'query embedding unavailable'))
      : await this._runPhase(seedStrategies, context, mergedConfig.strategyTimeoutMs);

    const seeds = seedResults.flatMap((r) => (r.success ? r.candidates : []));

    const expansionResults = await this._runPhase(
      expansionStrategies,
      { ...context, seeds },
      mergedConfig.strategyTimeoutMs
    );

    const allResults = [...seedResults, ...expansionResults];

    const fusionStart = Date.now();
    const fusedCandidates = fusionPolicy.fuse(allResults, mergedConfig);
    bundle.timing.fusionMs = Date.now() - fusionStart;

    // Reranking sits between fusion and assembly: it needs the full pool (which
    // assembly is about to trim) and cannot run earlier, because "corroborated"
    // is only known once the strategies have been fused.
    const reranked = await this.reranker.rerank(queryText, fusedCandidates, mergedConfig);
    bundle.timing.rerankMs = reranked.ms;
    bundle.reranked = reranked.reranked;

    this.assembler.assemble(bundle, reranked.candidates);

    bundle.timing.byStrategy = Object.fromEntries(
      allResults.map((r) => [r.strategyName, r.executionMs])
    );
    bundle.timing.totalMs = Date.now() - startTime;

    bundle.stats.candidatesFromSeed = this._countCandidates(seedResults);
    bundle.stats.candidatesFromExpansion = this._countCandidates(expansionResults);
    bundle.stats.failedStrategies = allResults.filter((r) => !r.success).map((r) => r.strategyName);
    if (embeddingFailed) {
      bundle.stats.failedStrategies.unshift(EMBEDDING_STEP);
    }

    // "Used" means "contributed something" — a strategy that ran cleanly and
    // found nothing did not shape this answer and should not claim credit.
    bundle.strategiesUsed = allResults
      .filter((r) => r.success && r.candidates.length > 0)
      .map((r) => r.strategyName);

    if (bundle.stats.failedStrategies.length > 0) {
      this.logger.warn('[Radix] retrieval completed with failures', {
        workspaceId,
        failed: bundle.stats.failedStrategies,
        elements: bundle.elements.length
      });
    }

    return bundle;
  }

  /**
   * @param {string} queryText
   * @returns {Promise<{queryEmbedding: number[], embeddingFailed: boolean}>}
   * @private
   */
  async _embedQuery(queryText) {
    if (!this.embeddingService || typeof this.embeddingService.embed !== 'function') {
      this.logger.error('[Radix] no embedding service configured');
      return { queryEmbedding: [], embeddingFailed: true };
    }

    try {
      const result = await this.embeddingService.embed(queryText);
      const embedding = Array.isArray(result) ? result : result && result.embedding;

      // EmbeddingService returns a ZERO VECTOR plus an `error` field instead of
      // throwing. Passing that through would search the collection with a
      // meaningless vector and return plausible-looking garbage.
      if ((result && result.error) || !Array.isArray(embedding) || embedding.length === 0) {
        this.logger.error('[Radix] query embedding failed', {
          error: (result && result.error) || 'empty embedding'
        });
        return { queryEmbedding: [], embeddingFailed: true };
      }

      return { queryEmbedding: embedding, embeddingFailed: false };
    } catch (error) {
      this.logger.error('[Radix] query embedding threw', { message: error.message });
      return { queryEmbedding: [], embeddingFailed: true };
    }
  }

  /**
   * Runs one phase: every strategy in parallel, each under its own timeout.
   * Phase wall-clock is max(strategy), not the sum — that is what keeps the
   * whole retrieval inside the latency budget.
   *
   * @param {Object[]} strategies
   * @param {Object} context
   * @param {number} timeoutMs
   * @returns {Promise<import('./contracts/strategy.interface').StrategyResult[]>}
   * @private
   */
  async _runPhase(strategies, context, timeoutMs) {
    if (strategies.length === 0) return [];
    return Promise.all(strategies.map((s) => this._executeWithTimeout(s, context, timeoutMs)));
  }

  /**
   * @param {Object} strategy
   * @param {Object} context
   * @param {number} timeoutMs
   * @returns {Promise<import('./contracts/strategy.interface').StrategyResult>}
   * @private
   */
  _executeWithTimeout(strategy, context, timeoutMs) {
    let timer = null;

    const timeout = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve(this._failedResult(strategy, 'timeout', timeoutMs)),
        timeoutMs
      );
    });

    // clearTimeout matters: without it a fast strategy still leaves a pending
    // timer holding the event loop open for the rest of the budget.
    return Promise.race([strategy.execute(context), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * @param {Object} strategy
   * @param {string} error
   * @param {number} [executionMs=0]
   * @returns {import('./contracts/strategy.interface').StrategyResult}
   * @private
   */
  _failedResult(strategy, error, executionMs = 0) {
    return {
      strategyName: strategy.name,
      strategyType: strategy.type,
      candidates: [],
      executionMs,
      success: false,
      error,
      debug: null
    };
  }

  /**
   * @param {import('./contracts/strategy.interface').StrategyResult[]} results
   * @returns {number}
   * @private
   */
  _countCandidates(results) {
    return results.reduce((sum, r) => sum + (r.candidates ? r.candidates.length : 0), 0);
  }

  /**
   * @param {string[]|null} names
   * @returns {Object[]}
   * @private
   */
  _resolveStrategies(names) {
    if (!names) return Array.from(this.strategyRegistry.values());

    return names.map((name) => {
      const strategy = this.strategyRegistry.get(name);
      if (!strategy) {
        throw new Error(`Unknown strategy: ${name}`);
      }
      return strategy;
    });
  }

  /**
   * Accepts a Map or a plain array of instances — an array is the natural shape
   * in tests and at wiring time, and the name is already on the instance.
   *
   * @param {Map|Object[]|undefined} strategies
   * @returns {Map<string, Object>}
   * @private
   */
  _toRegistry(strategies) {
    if (!strategies) return new Map();
    if (strategies instanceof Map) return new Map(strategies);
    if (Array.isArray(strategies)) return new Map(strategies.map((s) => [s.name, s]));
    throw new Error('dependencies.strategies must be a Map or an array of strategies');
  }
}

module.exports = { WorkspaceHybridRetriever, EMBEDDING_STEP };
