/**
 * Base class for all Radix retrieval strategies.
 *
 * Provides:
 * - Automatic timing measurement
 * - Error containment — a failing strategy yields an empty result, it does not
 *   abort the whole retrieval (partial context beats no context)
 * - Structured logging through the project logger
 * - Context validation before execution
 *
 * Subclasses must implement:
 * - the `metadata` getter (name, type, description, version)
 * - `_execute(context)`
 *
 * @module services/radix/strategies/base-strategy
 */

'use strict';

const { STRATEGY_TYPES } = require('../contracts/strategy.interface');
const logger = require('../../../utils/logger');

/**
 * @typedef {import('../contracts/strategy.interface').StrategyContext} StrategyContext
 * @typedef {import('../contracts/strategy.interface').StrategyResult} StrategyResult
 * @typedef {import('../contracts/strategy.interface').StrategyMetadata} StrategyMetadata
 * @typedef {import('../contracts/strategy.interface').StrategyCandidate} StrategyCandidate
 */

class BaseStrategy {
  /**
   * @param {Object} [dependencies] - Injected services
   * @param {Object} [dependencies.logger] - Logger override (defaults to the project logger)
   * @param {Object} [options] - Strategy-specific options
   */
  constructor(dependencies = {}, options = {}) {
    this.dependencies = dependencies;
    this.options = options;
    this.logger = dependencies.logger || logger.child('Radix');

    // Validate metadata at construction — a misconfigured strategy must fail at
    // wiring time, not halfway through a user's retrieval.
    const meta = this.metadata;
    if (!meta || !meta.name || !meta.type) {
      throw new Error('Strategy must define metadata with name and type');
    }
    if (!STRATEGY_TYPES.includes(meta.type)) {
      throw new Error(
        `Invalid strategy type: ${meta.type}. Must be one of: ${STRATEGY_TYPES.join(', ')}`
      );
    }
  }

  /**
   * Strategy metadata. MUST be overridden by the subclass.
   * @returns {StrategyMetadata}
   */
  get metadata() {
    throw new Error('Subclass must implement metadata getter');
  }

  /** @returns {string} */
  get name() { return this.metadata.name; }

  /** @returns {import('../contracts/strategy.interface').StrategyType} */
  get type() { return this.metadata.type; }

  /**
   * Main entry point. Wraps `_execute` with timing, validation and error containment.
   *
   * @param {StrategyContext} context
   * @returns {Promise<StrategyResult>}
   */
  async execute(context) {
    const startTime = Date.now();

    const validationError = this._validateContext(context);
    if (validationError) {
      return this._errorResult(validationError, Date.now() - startTime);
    }

    try {
      this._logDebug('execute:start', {
        workspaceId: context.workspaceId,
        queryLength: context.query.length,
        seedCount: Array.isArray(context.seeds) ? context.seeds.length : undefined
      });

      const raw = await this._execute(context);

      // A subclass may return a bare candidate array, or {candidates, debug} when
      // it has execution detail worth surfacing (hop counts, query plan).
      const candidates = Array.isArray(raw) ? raw : (raw && raw.candidates) || [];
      const debug = Array.isArray(raw) ? null : (raw && raw.debug) || null;

      if (!Array.isArray(candidates)) {
        throw new Error('_execute must return an array of candidates or {candidates, debug}');
      }

      const executionMs = Date.now() - startTime;

      this._logDebug('execute:complete', {
        candidateCount: candidates.length,
        executionMs
      });

      return {
        strategyName: this.name,
        strategyType: this.type,
        candidates,
        executionMs,
        success: true,
        error: null,
        debug
      };
    } catch (error) {
      const executionMs = Date.now() - startTime;
      this._logError('execute:error', error);
      return this._errorResult(error.message, executionMs);
    }
  }

  /**
   * Strategy-specific execution logic. MUST be overridden by the subclass.
   *
   * @param {StrategyContext} context
   * @returns {Promise<StrategyCandidate[]|{candidates: StrategyCandidate[], debug?: Object}>}
   * @protected
   */
  async _execute(context) { // eslint-disable-line no-unused-vars
    throw new Error('Subclass must implement _execute method');
  }

  /**
   * Validates the context before execution.
   *
   * @param {StrategyContext} context
   * @returns {string|null} Error message, or null when valid
   * @protected
   */
  _validateContext(context) {
    if (!context) {
      return 'Context is required';
    }
    if (!context.workspaceId) {
      return 'workspaceId is required';
    }
    if (typeof context.query !== 'string' || context.query.trim() === '') {
      return 'query must be non-empty string';
    }
    if (!context.config) {
      return 'config is required';
    }

    if (this.type === 'seed') {
      if (!Array.isArray(context.queryEmbedding) || context.queryEmbedding.length === 0) {
        return 'queryEmbedding is required for seed strategies';
      }
    }

    if (this.type === 'expansion') {
      // An empty seeds array is valid — expansion simply returns nothing.
      if (!Array.isArray(context.seeds)) {
        return 'seeds array is required for expansion strategies';
      }
    }

    return null;
  }

  /**
   * Builds a failed StrategyResult.
   *
   * @param {string} errorMessage
   * @param {number} executionMs
   * @returns {StrategyResult}
   * @protected
   */
  _errorResult(errorMessage, executionMs) {
    return {
      strategyName: this.name,
      strategyType: this.type,
      candidates: [],
      executionMs,
      success: false,
      error: errorMessage,
      debug: null
    };
  }

  /**
   * Builds a candidate with a validated shape.
   * Subclasses use this so every candidate reaching fusion is well-formed.
   *
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.type
   * @param {string} params.content
   * @param {*} [params.contentRaw]
   * @param {number} params.score
   * @param {import('../contracts/context-bundle').ElementProvenance} params.provenance
   * @param {Object} [params.metadata]
   * @returns {StrategyCandidate}
   * @protected
   */
  _createCandidate({ id, type, content, contentRaw = null, score, provenance, metadata = {} }) {
    if (!id) throw new Error('Candidate requires id');
    if (!type) throw new Error('Candidate requires type');
    if (typeof content !== 'string') throw new Error('Candidate requires content string');
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error('Candidate requires finite numeric score');
    }
    if (!provenance || !provenance.sourceId || !provenance.sourceType) {
      throw new Error('Candidate requires provenance with sourceId and sourceType');
    }

    return { id, type, content, contentRaw, score, provenance, metadata };
  }

  /**
   * Structured debug logging. The project logger is level-gated (LOG_LEVEL),
   * so this is a no-op in production unless debug is explicitly enabled.
   * @protected
   */
  _logDebug(event, data = {}) {
    if (typeof this.logger.debug === 'function') {
      this.logger.debug(`[Radix:${this.name}] ${event}`, data);
    }
  }

  /** @protected */
  _logError(event, error) {
    if (typeof this.logger.error === 'function') {
      this.logger.error(`[Radix:${this.name}] ${event}`, {
        message: error.message,
        stack: error.stack
      });
    }
  }
}

/**
 * Configurable strategy used to test the base class, the orchestrator and the
 * fusion policy without touching Qdrant or Memgraph.
 */
class MockStrategy extends BaseStrategy {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [options]
   * @param {StrategyMetadata} [options.metadata] - Metadata override
   * @param {StrategyCandidate[]} [options.candidates] - Candidates to return
   * @param {number} [options.delayMs] - Artificial delay
   * @param {Error} [options.throwError] - Error to throw (tests error containment)
   * @param {Object} [options.debug] - Debug payload to surface
   */
  constructor(dependencies = {}, options = {}) {
    super(dependencies, options);
  }

  /**
   * Reads from `this.options`, which the base constructor assigns before it
   * validates metadata — so this getter is safe during `super()`.
   * @returns {StrategyMetadata}
   */
  get metadata() {
    return this.options.metadata || {
      name: 'mock-strategy',
      type: 'seed',
      description: 'Mock strategy for testing',
      version: '1.0.0'
    };
  }

  async _execute(context) { // eslint-disable-line no-unused-vars
    const { delayMs = 0, throwError = null, candidates = [], debug = null } = this.options;

    if (delayMs > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        // When the orchestrator's timeout wins the race, nothing ever awaits
        // this promise again — an un-unref'd timer would keep the process (and
        // the jest worker) alive for the rest of the delay.
        if (typeof timer.unref === 'function') timer.unref();
      });
    }
    if (throwError) {
      throw throwError;
    }

    return debug ? { candidates, debug } : candidates;
  }
}

module.exports = {
  BaseStrategy,
  MockStrategy
};
