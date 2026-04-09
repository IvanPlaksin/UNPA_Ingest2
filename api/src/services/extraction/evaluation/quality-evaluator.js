/**
 * @fileoverview Quality Evaluator for Pipeline Output
 * @module services/extraction/evaluation/quality-evaluator
 * @version 1.0.0
 *
 * Evaluates pipeline output quality against golden datasets and criteria.
 */

'use strict';

const { getMetricsCollector } = require('../tuning/metrics-collector');
const entityCoverageCriteria = require('./criteria/entity-coverage');
const relationshipQualityCriteria = require('./criteria/relationship-quality');
const confidenceDistributionCriteria = require('./criteria/confidence-distribution');

/**
 * Quality Evaluator
 * @class
 */
class QualityEvaluator {
  constructor(options = {}) {
    this.options = {
      minEntityCoverage: options.minEntityCoverage || 0.8,
      minRelationshipQuality: options.minRelationshipQuality || 0.6,
      minOverallScore: options.minOverallScore || 0.7,
      weights: options.weights || {
        entityCoverage: 0.35,
        relationshipQuality: 0.25,
        confidenceDistribution: 0.15,
        typeDistribution: 0.15,
        processingEfficiency: 0.10
      },
      ...options
    };

    this.metricsCollector = getMetricsCollector();
    this.criteria = [
      entityCoverageCriteria,
      relationshipQualityCriteria,
      confidenceDistributionCriteria
    ];
  }

  /**
   * Evaluate pipeline output against golden dataset
   * @param {Object} config - Pipeline configuration used
   * @param {Object} options - Evaluation options
   * @returns {Object} Evaluation results
   */
  async evaluate(config, options = {}) {
    const { goldenDataset, pipelineResult } = options;

    const evaluation = {
      timestamp: new Date().toISOString(),
      configVersion: config.version,
      scores: {},
      details: {},
      passed: false,
      overallScore: 0
    };

    // If we have a pipeline result, evaluate it
    if (pipelineResult) {
      // Run each criterion
      for (const criterion of this.criteria) {
        const result = await criterion.evaluate(pipelineResult, goldenDataset);
        evaluation.scores[criterion.name] = result.score;
        evaluation.details[criterion.name] = result.details;
      }

      // Calculate weighted overall score
      let totalWeight = 0;
      let weightedSum = 0;

      for (const [criterion, weight] of Object.entries(this.options.weights)) {
        const score = evaluation.scores[criterion];
        if (score !== undefined) {
          weightedSum += score * weight;
          totalWeight += weight;
        }
      }

      evaluation.overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      evaluation.passed = evaluation.overallScore >= this.options.minOverallScore;

      // Record metrics
      this.metricsCollector.record(
        `eval_${Date.now()}`,
        pipelineResult,
        goldenDataset
      );
    }
    // If we only have a golden dataset, run pipeline with config
    else if (goldenDataset) {
      evaluation.scores = await this._evaluateWithGoldenDataset(config, goldenDataset);
      evaluation.overallScore = this._calculateOverallScore(evaluation.scores);
      evaluation.passed = evaluation.overallScore >= this.options.minOverallScore;
    }
    // No pipeline result and no golden dataset - simulate based on config analysis
    else {
      evaluation.scores = await this._simulateConfigPerformance(config);
      evaluation.overallScore = this._calculateOverallScore(evaluation.scores);
      evaluation.passed = evaluation.overallScore >= this.options.minOverallScore;
      evaluation.simulated = true;
    }

    return evaluation;
  }

  /**
   * Batch evaluate multiple samples
   * @param {Object} config - Pipeline configuration
   * @param {Array} samples - Test samples with expected outputs
   * @returns {Object} Batch evaluation results
   */
  async evaluateBatch(config, samples) {
    const results = [];

    for (const sample of samples) {
      const result = await this.evaluate(config, {
        goldenDataset: sample.expected,
        pipelineResult: sample.result || null
      });
      results.push({
        sampleId: sample.id,
        ...result
      });
    }

    // Aggregate results
    const aggregated = {
      totalSamples: samples.length,
      passedSamples: results.filter(r => r.passed).length,
      averageScore: results.reduce((sum, r) => sum + r.overallScore, 0) / results.length,
      scoreDistribution: this._computeScoreDistribution(results),
      worstPerforming: this._findWorstPerforming(results),
      bestPerforming: this._findBestPerforming(results),
      criteriaAverages: this._computeCriteriaAverages(results)
    };

    return {
      individual: results,
      aggregated
    };
  }

  /**
   * Generate improvement recommendations
   * @param {Object} evaluation - Evaluation results
   * @returns {Array} Recommendations
   */
  generateRecommendations(evaluation) {
    const recommendations = [];

    // Check entity coverage
    if (evaluation.scores.entityCoverage < this.options.minEntityCoverage) {
      recommendations.push({
        priority: 'high',
        area: 'entityExtraction',
        issue: 'Low entity coverage',
        currentScore: evaluation.scores.entityCoverage,
        target: this.options.minEntityCoverage,
        suggestions: [
          'Lower entityExtraction.minConfidence threshold',
          'Enable additional regex patterns in entityExtraction.regex.patterns',
          'Ensure LLM extraction is enabled and working',
          'Review un-entities.config.js for missing patterns'
        ]
      });
    }

    // Check relationship quality
    if (evaluation.scores.relationshipQuality < this.options.minRelationshipQuality) {
      recommendations.push({
        priority: 'medium',
        area: 'relationshipExtraction',
        issue: 'Low relationship quality',
        currentScore: evaluation.scores.relationshipQuality,
        target: this.options.minRelationshipQuality,
        suggestions: [
          'Enable co-occurrence analysis',
          'Lower relationshipExtraction.patterns.minConfidence',
          'Increase coOccurrence.baseConfidence',
          'Enable LLM relationship extraction'
        ]
      });
    }

    // Check confidence distribution
    if (evaluation.scores.confidenceDistribution < 0.6) {
      recommendations.push({
        priority: 'low',
        area: 'confidence',
        issue: 'Poor confidence distribution',
        currentScore: evaluation.scores.confidenceDistribution,
        suggestions: [
          'Review confidence assignment in regex patterns',
          'Adjust LLM confidence caps',
          'Enable multi-source confidence boosting'
        ]
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Compare two configurations
   * @param {Object} config1 - First configuration
   * @param {Object} config2 - Second configuration
   * @param {Object} goldenDataset - Test dataset
   * @returns {Object} Comparison results
   */
  async compareConfigs(config1, config2, goldenDataset) {
    const eval1 = await this.evaluate(config1, { goldenDataset });
    const eval2 = await this.evaluate(config2, { goldenDataset });

    const comparison = {
      config1Score: eval1.overallScore,
      config2Score: eval2.overallScore,
      winner: eval1.overallScore > eval2.overallScore ? 'config1' : 'config2',
      improvement: Math.abs(eval1.overallScore - eval2.overallScore),
      criteriaComparison: {}
    };

    // Compare each criterion
    for (const criterion of Object.keys(eval1.scores)) {
      comparison.criteriaComparison[criterion] = {
        config1: eval1.scores[criterion],
        config2: eval2.scores[criterion],
        diff: eval2.scores[criterion] - eval1.scores[criterion]
      };
    }

    return comparison;
  }

  /**
   * Evaluate configuration with golden dataset
   * @private
   */
  async _evaluateWithGoldenDataset(config, goldenDataset) {
    // This would run the actual pipeline with the config
    // For now, return simulated scores based on config analysis
    const scores = {};

    // Analyze config to predict performance
    const entityConfig = config.entityExtraction || {};
    const relConfig = config.relationshipExtraction || {};

    // Entity coverage prediction based on config
    let entityScore = 0.5;
    if (entityConfig.regex?.enabled) entityScore += 0.2;
    if (entityConfig.llm?.enabled) entityScore += 0.2;
    if (entityConfig.minConfidence < 0.7) entityScore += 0.1;
    scores.entityCoverage = Math.min(1.0, entityScore);

    // Relationship quality prediction
    let relScore = 0.4;
    if (relConfig.patterns?.enabled) relScore += 0.2;
    if (relConfig.coOccurrence?.enabled) relScore += 0.2;
    if (relConfig.llm?.enabled) relScore += 0.1;
    scores.relationshipQuality = Math.min(1.0, relScore);

    // Confidence distribution (based on config tuning)
    scores.confidenceDistribution = 0.7;

    return scores;
  }

  /**
   * Simulate performance based on config parameters
   * Used for tuning when no actual data is available
   * @private
   */
  async _simulateConfigPerformance(config) {
    const scores = {};
    const entityConfig = config.entityExtraction || {};
    const relConfig = config.relationshipExtraction || {};

    // Base scores with randomness for exploration
    const randomFactor = () => (Math.random() - 0.5) * 0.1;

    // Entity coverage - lower minConfidence = higher coverage but potentially lower precision
    let entityCoverage = 0.5;
    if (entityConfig.regex?.enabled) entityCoverage += 0.15;
    if (entityConfig.llm?.enabled) entityCoverage += 0.2;
    // Optimal minConfidence around 0.5-0.7
    const minConf = entityConfig.minConfidence || 0.6;
    entityCoverage += (0.7 - Math.abs(0.6 - minConf)) * 0.3;
    scores.entityCoverage = Math.max(0, Math.min(1.0, entityCoverage + randomFactor()));

    // Relationship quality
    let relQuality = 0.4;
    if (relConfig.patterns?.enabled) relQuality += 0.2;
    if (relConfig.coOccurrence?.enabled) relQuality += 0.15;
    if (relConfig.llm?.enabled) relQuality += 0.1;
    // Optimal coOccurrence.baseConfidence around 0.5-0.6
    const coocConf = relConfig.coOccurrence?.baseConfidence || 0.55;
    relQuality += (0.6 - Math.abs(0.55 - coocConf)) * 0.2;
    scores.relationshipQuality = Math.max(0, Math.min(1.0, relQuality + randomFactor()));

    // Confidence distribution - balanced is better
    let confDist = 0.6;
    // Optimal LLM temperature around 0.1-0.3
    const temp = entityConfig.llm?.temperature || 0.1;
    confDist += (0.3 - Math.abs(0.2 - temp)) * 0.3;
    scores.confidenceDistribution = Math.max(0, Math.min(1.0, confDist + randomFactor()));

    return scores;
  }

  /**
   * Calculate overall score from individual scores
   * @private
   */
  _calculateOverallScore(scores) {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [criterion, weight] of Object.entries(this.options.weights)) {
      const score = scores[criterion];
      if (score !== undefined) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Compute score distribution
   * @private
   */
  _computeScoreDistribution(results) {
    const ranges = {
      'excellent (0.9-1.0)': 0,
      'good (0.7-0.9)': 0,
      'fair (0.5-0.7)': 0,
      'poor (<0.5)': 0
    };

    for (const result of results) {
      const score = result.overallScore;
      if (score >= 0.9) ranges['excellent (0.9-1.0)']++;
      else if (score >= 0.7) ranges['good (0.7-0.9)']++;
      else if (score >= 0.5) ranges['fair (0.5-0.7)']++;
      else ranges['poor (<0.5)']++;
    }

    return ranges;
  }

  /**
   * Find worst performing samples
   * @private
   */
  _findWorstPerforming(results, n = 3) {
    return [...results]
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, n)
      .map(r => ({ sampleId: r.sampleId, score: r.overallScore }));
  }

  /**
   * Find best performing samples
   * @private
   */
  _findBestPerforming(results, n = 3) {
    return [...results]
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, n)
      .map(r => ({ sampleId: r.sampleId, score: r.overallScore }));
  }

  /**
   * Compute criteria averages across all results
   * @private
   */
  _computeCriteriaAverages(results) {
    const averages = {};
    const counts = {};

    for (const result of results) {
      for (const [criterion, score] of Object.entries(result.scores || {})) {
        if (typeof score === 'number') {
          averages[criterion] = (averages[criterion] || 0) + score;
          counts[criterion] = (counts[criterion] || 0) + 1;
        }
      }
    }

    for (const criterion of Object.keys(averages)) {
      averages[criterion] = averages[criterion] / counts[criterion];
    }

    return averages;
  }
}

// Singleton instance
let evaluatorInstance = null;

/**
 * Get quality evaluator instance
 * @param {Object} options - Evaluator options
 * @returns {QualityEvaluator}
 */
function getQualityEvaluator(options = {}) {
  if (!evaluatorInstance) {
    evaluatorInstance = new QualityEvaluator(options);
  }
  return evaluatorInstance;
}

module.exports = {
  QualityEvaluator,
  getQualityEvaluator
};
