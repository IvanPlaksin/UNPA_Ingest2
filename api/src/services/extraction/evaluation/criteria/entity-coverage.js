/**
 * @fileoverview Entity Coverage Evaluation Criterion
 * @module services/extraction/evaluation/criteria/entity-coverage
 * @version 1.0.0
 */

'use strict';

const name = 'entityCoverage';

/**
 * Evaluate entity coverage against ground truth
 * @param {Object} result - Pipeline result
 * @param {Object} groundTruth - Expected entities
 * @returns {Object} Evaluation result
 */
async function evaluate(result, groundTruth) {
  const details = {
    extracted: 0,
    expected: 0,
    matched: 0,
    missed: [],
    unexpected: [],
    byType: {}
  };

  const extractedEntities = result.entities || [];
  const expectedEntities = groundTruth?.entities || [];

  details.extracted = extractedEntities.length;
  details.expected = expectedEntities.length;

  // If no ground truth, score based on extraction quality indicators
  if (expectedEntities.length === 0) {
    return evaluateWithoutGroundTruth(extractedEntities);
  }

  // Normalize for comparison
  const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const expectedSet = new Set(expectedEntities.map(e => normalize(e.name)));
  const extractedSet = new Set(extractedEntities.map(e => normalize(e.name)));

  // Calculate matches
  for (const expected of expectedEntities) {
    const normalizedExpected = normalize(expected.name);
    const type = expected.type || 'UNKNOWN';

    if (!details.byType[type]) {
      details.byType[type] = { expected: 0, found: 0 };
    }
    details.byType[type].expected++;

    if (extractedSet.has(normalizedExpected)) {
      details.matched++;
      details.byType[type].found++;
    } else {
      details.missed.push({
        name: expected.name,
        type: expected.type
      });
    }
  }

  // Find unexpected extractions
  for (const extracted of extractedEntities) {
    const normalizedExtracted = normalize(extracted.name);
    if (!expectedSet.has(normalizedExtracted)) {
      details.unexpected.push({
        name: extracted.name,
        type: extracted.type,
        confidence: extracted.confidence
      });
    }
  }

  // Calculate coverage score
  const recall = details.expected > 0 ? details.matched / details.expected : 0;
  const precision = details.extracted > 0 ? details.matched / details.extracted : 0;

  // Use F1-like score weighted toward recall (coverage)
  const score = precision + recall > 0
    ? (1.5 * precision * recall) / (0.5 * precision + recall) // F0.5 favors recall
    : 0;

  return {
    score: Math.min(1.0, score),
    details: {
      ...details,
      precision,
      recall,
      f1: precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0
    }
  };
}

/**
 * Evaluate entity extraction quality without ground truth
 * Uses heuristics based on extraction patterns
 * @param {Array} entities - Extracted entities
 * @returns {Object} Evaluation result
 */
function evaluateWithoutGroundTruth(entities) {
  if (entities.length === 0) {
    return { score: 0, details: { reason: 'No entities extracted' } };
  }

  let score = 0.5; // Base score
  const details = {
    entityCount: entities.length,
    confidenceStats: {},
    sourceDistribution: {},
    typeDistribution: {},
    qualityIndicators: []
  };

  // Confidence analysis
  const confidences = entities.map(e => e.confidence || 0);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  details.confidenceStats = {
    avg: avgConfidence,
    min: Math.min(...confidences),
    max: Math.max(...confidences)
  };

  // Higher average confidence is better
  if (avgConfidence >= 0.8) {
    score += 0.15;
    details.qualityIndicators.push('High average confidence');
  } else if (avgConfidence >= 0.7) {
    score += 0.10;
  }

  // Source distribution (multi-source is better)
  for (const entity of entities) {
    const source = entity.source || 'unknown';
    details.sourceDistribution[source] = (details.sourceDistribution[source] || 0) + 1;
  }

  const sourceCount = Object.keys(details.sourceDistribution).length;
  if (sourceCount >= 2) {
    score += 0.10;
    details.qualityIndicators.push('Multi-source extraction');
  }

  // Type distribution (diversity is good)
  for (const entity of entities) {
    const type = entity.type || 'UNKNOWN';
    details.typeDistribution[type] = (details.typeDistribution[type] || 0) + 1;
  }

  const typeCount = Object.keys(details.typeDistribution).length;
  if (typeCount >= 3) {
    score += 0.10;
    details.qualityIndicators.push('Diverse entity types');
  }

  // Reasonable entity count (not too few, not too many)
  if (entities.length >= 3 && entities.length <= 50) {
    score += 0.10;
    details.qualityIndicators.push('Reasonable entity count');
  }

  // Check for context quality
  const entitiesWithContext = entities.filter(e => e.context && e.context.length > 10);
  if (entitiesWithContext.length >= entities.length * 0.5) {
    score += 0.05;
    details.qualityIndicators.push('Good context coverage');
  }

  return {
    score: Math.min(1.0, score),
    details
  };
}

module.exports = {
  name,
  evaluate
};
