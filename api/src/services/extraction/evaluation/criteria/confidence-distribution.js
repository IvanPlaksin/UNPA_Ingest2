/**
 * @fileoverview Confidence Distribution Evaluation Criterion
 * @module services/extraction/evaluation/criteria/confidence-distribution
 * @version 1.0.0
 */

'use strict';

const name = 'confidenceDistribution';

/**
 * Evaluate confidence distribution quality
 * A good distribution should be:
 * - Not too clustered at one value (indicates proper calibration)
 * - Skewed toward higher values (but not all 1.0)
 * - Have reasonable variance
 *
 * @param {Object} result - Pipeline result
 * @param {Object} groundTruth - Expected results (optional)
 * @returns {Object} Evaluation result
 */
async function evaluate(result, groundTruth) {
  const entities = result.entities || [];
  const relationships = result.relationships || [];

  if (entities.length === 0 && relationships.length === 0) {
    return {
      score: 0,
      details: { reason: 'No entities or relationships to evaluate' }
    };
  }

  const details = {
    entityConfidence: null,
    relationshipConfidence: null,
    overall: null,
    qualityIndicators: []
  };

  // Collect all confidences
  const entityConfs = entities.map(e => e.confidence || 0);
  const relConfs = relationships.map(r => r.confidence || 0);
  const allConfs = [...entityConfs, ...relConfs];

  // Evaluate entity confidences
  if (entityConfs.length > 0) {
    details.entityConfidence = evaluateDistribution(entityConfs, 'entity');
  }

  // Evaluate relationship confidences
  if (relConfs.length > 0) {
    details.relationshipConfidence = evaluateDistribution(relConfs, 'relationship');
  }

  // Overall evaluation
  details.overall = evaluateDistribution(allConfs, 'overall');

  // Calculate score
  let score = details.overall.score;

  // Bonus for consistent calibration between entities and relationships
  if (details.entityConfidence && details.relationshipConfidence) {
    const meanDiff = Math.abs(
      details.entityConfidence.stats.mean - details.relationshipConfidence.stats.mean
    );
    if (meanDiff < 0.15) {
      score += 0.05;
      details.qualityIndicators.push('Consistent calibration across types');
    }
  }

  // Check for good differentiation (not all same value)
  if (details.overall.stats.std > 0.05) {
    score += 0.05;
    details.qualityIndicators.push('Good confidence differentiation');
  }

  // Validate against ground truth if available
  if (groundTruth) {
    const calibrationScore = await evaluateCalibration(result, groundTruth);
    if (calibrationScore > 0.7) {
      score += 0.1;
      details.qualityIndicators.push('Well-calibrated against ground truth');
    }
    details.calibrationScore = calibrationScore;
  }

  return {
    score: Math.min(1.0, score),
    details
  };
}

/**
 * Evaluate a single distribution
 * @param {Array} values - Confidence values
 * @param {string} type - Distribution type name
 * @returns {Object} Distribution evaluation
 */
function evaluateDistribution(values, type) {
  if (values.length === 0) {
    return { score: 0, stats: {}, histogram: {} };
  }

  // Calculate statistics
  const stats = calculateStats(values);

  // Build histogram
  const bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const histogram = {};
  for (let i = 0; i < bins.length; i++) {
    const label = i === 0 ? `<${bins[0]}` : `${bins[i - 1]}-${bins[i]}`;
    histogram[label] = 0;
  }

  for (const value of values) {
    if (value < 0.5) {
      histogram['<0.5']++;
    } else if (value < 0.6) {
      histogram['0.5-0.6']++;
    } else if (value < 0.7) {
      histogram['0.6-0.7']++;
    } else if (value < 0.8) {
      histogram['0.7-0.8']++;
    } else if (value < 0.9) {
      histogram['0.8-0.9']++;
    } else {
      histogram['0.9-1.0']++;
    }
  }

  // Score the distribution
  let score = 0.5;

  // Good mean (0.7-0.85 is ideal)
  if (stats.mean >= 0.7 && stats.mean <= 0.85) {
    score += 0.2;
  } else if (stats.mean >= 0.6 && stats.mean <= 0.9) {
    score += 0.1;
  }

  // Reasonable variance (not too tight, not too spread)
  if (stats.std >= 0.05 && stats.std <= 0.2) {
    score += 0.15;
  } else if (stats.std >= 0.02 && stats.std <= 0.3) {
    score += 0.05;
  }

  // Not too many low confidence values
  const lowConfRatio = (histogram['<0.5'] || 0) / values.length;
  if (lowConfRatio < 0.1) {
    score += 0.1;
  }

  // Not all clustered at maximum
  const maxConfRatio = (histogram['0.9-1.0'] || 0) / values.length;
  if (maxConfRatio < 0.5) {
    score += 0.05;
  }

  return {
    score: Math.min(1.0, score),
    stats,
    histogram,
    type
  };
}

/**
 * Calculate basic statistics
 * @param {Array} values - Numeric values
 * @returns {Object} Statistics
 */
function calculateStats(values) {
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const std = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);

  const median = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)];

  return {
    mean: Math.round(mean * 1000) / 1000,
    std: Math.round(std * 1000) / 1000,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Math.round(median * 1000) / 1000,
    count: values.length
  };
}

/**
 * Evaluate calibration against ground truth
 * Checks if confidence scores correlate with actual correctness
 * @param {Object} result - Pipeline result
 * @param {Object} groundTruth - Expected results
 * @returns {number} Calibration score
 */
async function evaluateCalibration(result, groundTruth) {
  const entities = result.entities || [];
  const expectedEntities = groundTruth?.entities || [];

  if (entities.length === 0 || expectedEntities.length === 0) {
    return 0.5; // Neutral
  }

  // Create set of expected entity names
  const expectedNames = new Set(
    expectedEntities.map(e => (e.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  );

  // Group entities by confidence bins and check correctness
  const bins = [
    { min: 0.9, max: 1.0, correct: 0, total: 0 },
    { min: 0.8, max: 0.9, correct: 0, total: 0 },
    { min: 0.7, max: 0.8, correct: 0, total: 0 },
    { min: 0.6, max: 0.7, correct: 0, total: 0 },
    { min: 0, max: 0.6, correct: 0, total: 0 }
  ];

  for (const entity of entities) {
    const conf = entity.confidence || 0;
    const normalized = (entity.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isCorrect = expectedNames.has(normalized);

    for (const bin of bins) {
      if (conf >= bin.min && conf < bin.max) {
        bin.total++;
        if (isCorrect) bin.correct++;
        break;
      }
    }
  }

  // Calculate calibration error
  // Perfect calibration: high confidence bins have higher accuracy
  let calibrationError = 0;
  let validBins = 0;

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    if (bin.total < 3) continue; // Skip bins with too few samples

    const actualAccuracy = bin.correct / bin.total;
    const expectedAccuracy = (bin.min + bin.max) / 2; // Expected accuracy = confidence

    calibrationError += Math.abs(actualAccuracy - expectedAccuracy);
    validBins++;
  }

  if (validBins === 0) {
    return 0.5;
  }

  const avgError = calibrationError / validBins;

  // Convert error to score (lower error = higher score)
  return Math.max(0, 1 - avgError * 2);
}

module.exports = {
  name,
  evaluate
};
