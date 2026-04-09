/**
 * @fileoverview AI Tuning Agent for Pipeline Optimization
 * @module services/extraction/tuning/tuning-agent
 * @version 1.0.0
 *
 * Self-tuning AI agent that automatically optimizes pipeline parameters
 * based on evaluation metrics and golden dataset performance.
 */

'use strict';

const { EventEmitter } = require('events');
const { getConfigLoader } = require('../config/config-loader');
const { PARAMETER_METADATA, getParameter, setParameter } = require('../config/pipeline-config');
const { validateConfig } = require('../config/parameter-schema');

/**
 * Tuning session states
 */
const SESSION_STATES = {
  IDLE: 'idle',
  RUNNING: 'running',
  EVALUATING: 'evaluating',
  OPTIMIZING: 'optimizing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Optimization strategies
 */
const OPTIMIZATION_STRATEGIES = {
  GRID_SEARCH: 'grid_search',
  BAYESIAN: 'bayesian',
  RANDOM_SEARCH: 'random_search',
  GRADIENT_FREE: 'gradient_free'
};

/**
 * AI Tuning Agent
 * @class
 * @extends EventEmitter
 */
class TuningAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxIterations: options.maxIterations || 50,
      convergenceThreshold: options.convergenceThreshold || 0.001,
      earlyStoppingPatience: options.earlyStoppingPatience || 5,
      strategy: options.strategy || OPTIMIZATION_STRATEGIES.BAYESIAN,
      targetMetric: options.targetMetric || 'f1_score',
      minimizeMetric: options.minimizeMetric || false,
      parallelEvaluations: options.parallelEvaluations || 1,
      ...options
    };

    this.session = null;
    this.configLoader = getConfigLoader();
    this.evaluator = null; // Will be injected
    this.metricsCollector = null; // Will be injected
  }

  /**
   * Set evaluator service
   * @param {Object} evaluator - Quality evaluator instance
   */
  setEvaluator(evaluator) {
    this.evaluator = evaluator;
  }

  /**
   * Set metrics collector
   * @param {Object} collector - Metrics collector instance
   */
  setMetricsCollector(collector) {
    this.metricsCollector = collector;
  }

  /**
   * Start a new tuning session
   * @param {Object} options - Session options
   * @returns {Object} Session info
   */
  async startSession(options = {}) {
    // Only block if session is actively running
    if (this.session?.state === SESSION_STATES.RUNNING ||
        this.session?.state === SESSION_STATES.EVALUATING ||
        this.session?.state === SESSION_STATES.OPTIMIZING) {
      throw new Error('A tuning session is already running');
    }

    // Reset any completed/failed/paused session
    this.session = null;

    const sessionId = `tuning_${Date.now()}`;

    this.session = {
      id: sessionId,
      state: SESSION_STATES.IDLE,
      startTime: new Date().toISOString(),
      endTime: null,
      iteration: 0,
      maxIterations: options.maxIterations || this.options.maxIterations,
      targetMetric: options.targetMetric || this.options.targetMetric,
      strategy: options.strategy || this.options.strategy,

      // Configuration tracking
      initialConfig: JSON.parse(JSON.stringify(this.configLoader.getCurrent())),
      currentConfig: JSON.parse(JSON.stringify(this.configLoader.getCurrent())),
      bestConfig: null,
      bestScore: this.options.minimizeMetric ? Infinity : -Infinity,

      // History
      history: [],
      parameterHistory: {},

      // Convergence tracking
      noImprovementCount: 0,
      convergenceThreshold: options.convergenceThreshold || this.options.convergenceThreshold,
      earlyStoppingPatience: options.earlyStoppingPatience || this.options.earlyStoppingPatience,

      // Parameters to tune
      tunableParameters: options.parameters || this._getDefaultTunableParameters(),

      // Golden dataset (if provided)
      goldenDataset: options.goldenDataset || null
    };

    this.emit('session:started', { sessionId, config: this.session.initialConfig });
    return this.session;
  }

  /**
   * Run one tuning iteration
   * @returns {Object} Iteration result
   */
  async iterate() {
    if (!this.session) {
      throw new Error('No active tuning session');
    }

    if (this.session.state === SESSION_STATES.COMPLETED) {
      return { completed: true, reason: 'Session already completed' };
    }

    this.session.state = SESSION_STATES.RUNNING;
    this.session.iteration++;

    const iterationStart = Date.now();
    const result = {
      iteration: this.session.iteration,
      timestamp: new Date().toISOString(),
      parameterChanges: [],
      metrics: null,
      score: null,
      improved: false
    };

    try {
      // Step 1: Generate parameter candidates
      const candidates = await this._generateCandidates();
      result.parameterChanges = candidates;

      // Step 2: Apply changes to config
      let testConfig = JSON.parse(JSON.stringify(this.session.currentConfig));
      for (const change of candidates) {
        testConfig = setParameter(testConfig, change.path, change.newValue);
      }

      // Step 3: Validate configuration
      const validation = validateConfig(testConfig);
      if (!validation.valid) {
        this.emit('iteration:invalid', { iteration: this.session.iteration, errors: validation.errors });
        return { ...result, error: 'Invalid configuration', errors: validation.errors };
      }

      // Step 4: Evaluate configuration
      this.session.state = SESSION_STATES.EVALUATING;
      const metrics = await this._evaluateConfig(testConfig);
      result.metrics = metrics;

      // Step 5: Calculate score
      const score = this._calculateScore(metrics);
      result.score = score;

      // Step 6: Check for improvement
      const improved = this._isImprovement(score);
      result.improved = improved;

      if (improved) {
        this.session.bestConfig = JSON.parse(JSON.stringify(testConfig));
        this.session.bestScore = score;
        this.session.currentConfig = testConfig;
        this.session.noImprovementCount = 0;

        // Apply to actual config
        await this.configLoader.update(testConfig, false);

        this.emit('iteration:improved', {
          iteration: this.session.iteration,
          score,
          previousBest: this.session.bestScore
        });
      } else {
        this.session.noImprovementCount++;
      }

      // Step 7: Record history
      result.duration = Date.now() - iterationStart;
      this.session.history.push(result);
      this._updateParameterHistory(candidates, score, improved);

      // Step 8: Check stopping conditions
      if (this._shouldStop()) {
        this.session.state = SESSION_STATES.COMPLETED;
        this.session.endTime = new Date().toISOString();
        await this._finalizeSession();
        return { ...result, completed: true, reason: this._getStopReason() };
      }

      this.session.state = SESSION_STATES.IDLE;
      this.emit('iteration:completed', result);

      return result;

    } catch (error) {
      this.session.state = SESSION_STATES.FAILED;
      this.emit('iteration:error', { iteration: this.session.iteration, error: error.message });
      throw error;
    }
  }

  /**
   * Run automatic tuning until convergence
   * @param {Object} options - Run options
   * @returns {Object} Final results
   */
  async runAutomatic(options = {}) {
    if (!this.session) {
      await this.startSession(options);
    }

    const results = [];

    while (this.session.state !== SESSION_STATES.COMPLETED &&
           this.session.state !== SESSION_STATES.FAILED) {
      const result = await this.iterate();
      results.push(result);

      if (result.completed) break;

      // Optional delay between iterations
      if (options.iterationDelay) {
        await this._sleep(options.iterationDelay);
      }
    }

    return {
      sessionId: this.session.id,
      iterations: results.length,
      finalScore: this.session.bestScore,
      bestConfig: this.session.bestConfig,
      history: results,
      summary: this._generateSummary()
    };
  }

  /**
   * Pause current session
   */
  pause() {
    if (this.session && this.session.state === SESSION_STATES.RUNNING) {
      this.session.state = SESSION_STATES.PAUSED;
      this.emit('session:paused', { sessionId: this.session.id });
    }
  }

  /**
   * Resume paused session
   */
  resume() {
    if (this.session && this.session.state === SESSION_STATES.PAUSED) {
      this.session.state = SESSION_STATES.IDLE;
      this.emit('session:resumed', { sessionId: this.session.id });
    }
  }

  /**
   * Stop current session
   * @param {boolean} applyBest - Whether to apply best config
   */
  async stop(applyBest = true) {
    if (!this.session) return;

    this.session.state = SESSION_STATES.COMPLETED;
    this.session.endTime = new Date().toISOString();

    if (applyBest && this.session.bestConfig) {
      await this.configLoader.update(this.session.bestConfig, true);
    }

    await this._finalizeSession();
    this.emit('session:stopped', { sessionId: this.session.id, appliedBest: applyBest });
  }

  /**
   * Get current session status
   * @returns {Object} Session status
   */
  getStatus() {
    if (!this.session) {
      return { active: false };
    }

    return {
      active: true,
      sessionId: this.session.id,
      state: this.session.state,
      iteration: this.session.iteration,
      maxIterations: this.session.maxIterations,
      bestScore: this.session.bestScore,
      noImprovementCount: this.session.noImprovementCount,
      elapsedTime: this.session.startTime
        ? Date.now() - new Date(this.session.startTime).getTime()
        : 0
    };
  }

  /**
   * Get session history
   * @returns {Array} History entries
   */
  getHistory() {
    return this.session?.history || [];
  }

  /**
   * Export session results
   * @returns {Object} Exportable session data
   */
  exportSession() {
    if (!this.session) {
      throw new Error('No active session');
    }

    return {
      id: this.session.id,
      startTime: this.session.startTime,
      endTime: this.session.endTime,
      state: this.session.state,
      iterations: this.session.iteration,
      targetMetric: this.session.targetMetric,
      strategy: this.session.strategy,
      initialConfig: this.session.initialConfig,
      bestConfig: this.session.bestConfig,
      bestScore: this.session.bestScore,
      history: this.session.history,
      parameterHistory: this.session.parameterHistory,
      summary: this._generateSummary()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate parameter candidates based on strategy
   * @private
   */
  async _generateCandidates() {
    const candidates = [];
    const strategy = this.session.strategy;

    for (const param of this.session.tunableParameters) {
      const meta = PARAMETER_METADATA[param.path] || param;
      const currentValue = getParameter(this.session.currentConfig, param.path);

      let newValue;

      switch (strategy) {
        case OPTIMIZATION_STRATEGIES.GRID_SEARCH:
          newValue = this._gridSearchValue(param.path, meta, currentValue);
          break;
        case OPTIMIZATION_STRATEGIES.RANDOM_SEARCH:
          newValue = this._randomSearchValue(meta);
          break;
        case OPTIMIZATION_STRATEGIES.BAYESIAN:
          newValue = await this._bayesianValue(param.path, meta, currentValue);
          break;
        default:
          newValue = this._randomSearchValue(meta);
      }

      if (newValue !== currentValue) {
        candidates.push({
          path: param.path,
          oldValue: currentValue,
          newValue
        });
      }
    }

    // Limit number of simultaneous changes
    return candidates.slice(0, Math.min(3, candidates.length));
  }

  /**
   * Grid search value generation
   * @private
   */
  _gridSearchValue(path, meta, currentValue) {
    const step = meta.step || 0.1;
    const history = this.session.parameterHistory[path] || { tried: new Set() };

    // Generate grid points
    const points = [];
    for (let v = meta.min; v <= meta.max; v += step) {
      const rounded = Math.round(v * 1000) / 1000;
      if (!history.tried.has(rounded)) {
        points.push(rounded);
      }
    }

    // Return next untried point
    return points.length > 0 ? points[0] : currentValue;
  }

  /**
   * Random search value generation
   * @private
   */
  _randomSearchValue(meta) {
    if (meta.type === 'int') {
      return Math.floor(Math.random() * (meta.max - meta.min + 1)) + meta.min;
    }
    return Math.random() * (meta.max - meta.min) + meta.min;
  }

  /**
   * Bayesian optimization value generation
   * Uses history to suggest promising values
   * @private
   */
  async _bayesianValue(path, meta, currentValue) {
    const history = this.session.parameterHistory[path];

    if (!history || history.values.length < 3) {
      // Not enough data, use random with bias toward center
      const center = (meta.max + meta.min) / 2;
      const range = (meta.max - meta.min) / 4;
      return Math.max(meta.min, Math.min(meta.max,
        center + (Math.random() - 0.5) * 2 * range
      ));
    }

    // Find best performing values
    const sortedByScore = [...history.values]
      .sort((a, b) => b.score - a.score);

    const bestValue = sortedByScore[0].value;
    const secondBest = sortedByScore[1]?.value || bestValue;

    // Explore around best values
    const explorationNoise = (meta.max - meta.min) * 0.1 * Math.random();
    const direction = Math.random() > 0.5 ? 1 : -1;

    let newValue = bestValue + direction * explorationNoise;

    // Occasionally jump toward second best for exploration
    if (Math.random() < 0.2) {
      newValue = (bestValue + secondBest) / 2 + (Math.random() - 0.5) * explorationNoise;
    }

    return Math.max(meta.min, Math.min(meta.max, newValue));
  }

  /**
   * Evaluate configuration using evaluator
   * @private
   */
  async _evaluateConfig(config) {
    if (!this.evaluator) {
      // Mock evaluation for testing
      return {
        entityCoverage: 0.7 + Math.random() * 0.2,
        relationshipQuality: 0.6 + Math.random() * 0.2,
        precision: 0.7 + Math.random() * 0.2,
        recall: 0.6 + Math.random() * 0.3,
        f1_score: 0.65 + Math.random() * 0.25
      };
    }

    // Use actual evaluator with golden dataset
    const evaluation = await this.evaluator.evaluate(config, {
      goldenDataset: this.session.goldenDataset
    });

    // Extract scores from evaluation result
    // QualityEvaluator returns { scores: {...}, overallScore: ..., ... }
    const metrics = evaluation.scores || {};

    // Add overall score as f1_score for backward compatibility
    if (evaluation.overallScore !== undefined) {
      metrics.f1_score = evaluation.overallScore;
    }

    return metrics;
  }

  /**
   * Calculate overall score from metrics
   * @private
   */
  _calculateScore(metrics) {
    const targetMetric = this.session.targetMetric;

    if (metrics[targetMetric] !== undefined) {
      return metrics[targetMetric];
    }

    // Weighted combination if target not available
    const weights = {
      entityCoverage: 0.3,
      relationshipQuality: 0.2,
      precision: 0.2,
      recall: 0.15,
      f1_score: 0.15
    };

    let score = 0;
    let totalWeight = 0;

    for (const [metric, weight] of Object.entries(weights)) {
      if (metrics[metric] !== undefined) {
        score += metrics[metric] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Check if score is an improvement
   * @private
   */
  _isImprovement(score) {
    if (this.options.minimizeMetric) {
      return score < this.session.bestScore - this.session.convergenceThreshold;
    }
    return score > this.session.bestScore + this.session.convergenceThreshold;
  }

  /**
   * Check if tuning should stop
   * @private
   */
  _shouldStop() {
    // Max iterations reached
    if (this.session.iteration >= this.session.maxIterations) {
      return true;
    }

    // Early stopping
    if (this.session.noImprovementCount >= this.session.earlyStoppingPatience) {
      return true;
    }

    // Perfect score
    if (!this.options.minimizeMetric && this.session.bestScore >= 0.99) {
      return true;
    }

    return false;
  }

  /**
   * Get reason for stopping
   * @private
   */
  _getStopReason() {
    if (this.session.iteration >= this.session.maxIterations) {
      return 'max_iterations_reached';
    }
    if (this.session.noImprovementCount >= this.session.earlyStoppingPatience) {
      return 'early_stopping';
    }
    if (this.session.bestScore >= 0.99) {
      return 'optimal_score';
    }
    return 'unknown';
  }

  /**
   * Update parameter history
   * @private
   */
  _updateParameterHistory(changes, score, improved) {
    for (const change of changes) {
      if (!this.session.parameterHistory[change.path]) {
        this.session.parameterHistory[change.path] = {
          values: [],
          tried: new Set()
        };
      }

      const history = this.session.parameterHistory[change.path];
      history.values.push({
        value: change.newValue,
        score,
        improved,
        iteration: this.session.iteration
      });
      history.tried.add(change.newValue);
    }
  }

  /**
   * Finalize session and save results
   * @private
   */
  async _finalizeSession() {
    // Save best config as profile
    if (this.session.bestConfig) {
      await this.configLoader.saveProfile(
        `tuned_${this.session.id}`,
        this.session.bestConfig
      );
    }

    // Save session snapshot
    await this.configLoader.saveSnapshot(`Tuning session ${this.session.id}`);

    this.emit('session:completed', {
      sessionId: this.session.id,
      bestScore: this.session.bestScore,
      iterations: this.session.iteration
    });
  }

  /**
   * Generate session summary
   * @private
   */
  _generateSummary() {
    if (!this.session) return null;

    const history = this.session.history;
    const improvements = history.filter(h => h.improved).length;

    return {
      totalIterations: this.session.iteration,
      improvements,
      improvementRate: this.session.iteration > 0
        ? (improvements / this.session.iteration * 100).toFixed(1) + '%'
        : '0%',
      initialScore: history[0]?.score || null,
      finalScore: this.session.bestScore,
      scoreImprovement: history[0]?.score
        ? ((this.session.bestScore - history[0].score) * 100).toFixed(2) + '%'
        : 'N/A',
      mostImpactfulParameters: this._findMostImpactfulParameters(),
      averageIterationTime: history.length > 0
        ? Math.round(history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length)
        : 0
    };
  }

  /**
   * Find parameters that had most impact
   * @private
   */
  _findMostImpactfulParameters() {
    const impacts = [];

    for (const [path, history] of Object.entries(this.session.parameterHistory || {})) {
      const improvements = history.values.filter(v => v.improved);
      if (improvements.length > 0) {
        impacts.push({
          path,
          improvements: improvements.length,
          avgScoreWhenImproved: improvements.reduce((sum, v) => sum + v.score, 0) / improvements.length
        });
      }
    }

    return impacts
      .sort((a, b) => b.improvements - a.improvements)
      .slice(0, 5);
  }

  /**
   * Get default tunable parameters
   * @private
   */
  _getDefaultTunableParameters() {
    return Object.entries(PARAMETER_METADATA).map(([path, meta]) => ({
      path,
      ...meta
    }));
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let agentInstance = null;

/**
 * Get tuning agent instance
 * @param {Object} options - Agent options
 * @returns {TuningAgent}
 */
function getTuningAgent(options = {}) {
  if (!agentInstance) {
    agentInstance = new TuningAgent(options);
  }
  return agentInstance;
}

module.exports = {
  TuningAgent,
  getTuningAgent,
  SESSION_STATES,
  OPTIMIZATION_STRATEGIES
};
