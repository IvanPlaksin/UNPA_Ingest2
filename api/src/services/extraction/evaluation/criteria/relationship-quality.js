/**
 * @fileoverview Relationship Quality Evaluation Criterion
 * @module services/extraction/evaluation/criteria/relationship-quality
 * @version 1.0.0
 */

'use strict';

const name = 'relationshipQuality';

/**
 * Evaluate relationship extraction quality
 * @param {Object} result - Pipeline result
 * @param {Object} groundTruth - Expected relationships
 * @returns {Object} Evaluation result
 */
async function evaluate(result, groundTruth) {
  const details = {
    extracted: 0,
    expected: 0,
    matched: 0,
    partialMatches: 0,
    missed: [],
    unexpected: [],
    byType: {},
    qualityMetrics: {}
  };

  const extractedRels = result.relationships || [];
  const expectedRels = groundTruth?.relationships || [];

  details.extracted = extractedRels.length;
  details.expected = expectedRels.length;

  // If no ground truth, evaluate based on quality heuristics
  if (expectedRels.length === 0) {
    return evaluateWithoutGroundTruth(extractedRels, result.entities || []);
  }

  // Normalize relationship for comparison
  const normalizeRel = (rel) => {
    const source = (rel.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = (rel.target || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const type = (rel.type || 'RELATED_TO').toUpperCase();
    return `${source}|${target}|${type}`;
  };

  // Create lookup maps
  const expectedMap = new Map();
  for (const rel of expectedRels) {
    const key = normalizeRel(rel);
    expectedMap.set(key, rel);

    const type = rel.type || 'RELATED_TO';
    if (!details.byType[type]) {
      details.byType[type] = { expected: 0, found: 0, partial: 0 };
    }
    details.byType[type].expected++;
  }

  const extractedKeys = new Set(extractedRels.map(normalizeRel));

  // Match relationships
  for (const [key, expected] of expectedMap.entries()) {
    const type = expected.type || 'RELATED_TO';

    if (extractedKeys.has(key)) {
      details.matched++;
      details.byType[type].found++;
    } else {
      // Check for partial match (same entities, different type)
      const partialMatch = extractedRels.find(rel => {
        const s1 = (rel.source || '').toLowerCase();
        const t1 = (rel.target || '').toLowerCase();
        const s2 = (expected.source || '').toLowerCase();
        const t2 = (expected.target || '').toLowerCase();
        return (s1 === s2 && t1 === t2) || (s1 === t2 && t1 === s2);
      });

      if (partialMatch) {
        details.partialMatches++;
        details.byType[type].partial++;
      } else {
        details.missed.push({
          source: expected.source,
          target: expected.target,
          type: expected.type
        });
      }
    }
  }

  // Find unexpected relationships
  for (const rel of extractedRels) {
    const key = normalizeRel(rel);
    if (!expectedMap.has(key)) {
      details.unexpected.push({
        source: rel.source,
        target: rel.target,
        type: rel.type,
        confidence: rel.confidence
      });
    }
  }

  // Calculate scores
  const exactRecall = details.expected > 0 ? details.matched / details.expected : 0;
  const fuzzyRecall = details.expected > 0
    ? (details.matched + 0.5 * details.partialMatches) / details.expected
    : 0;
  const precision = details.extracted > 0 ? details.matched / details.extracted : 0;

  // Combined score
  const score = fuzzyRecall * 0.6 + precision * 0.4;

  return {
    score: Math.min(1.0, score),
    details: {
      ...details,
      exactRecall,
      fuzzyRecall,
      precision,
      f1: precision + exactRecall > 0
        ? 2 * (precision * exactRecall) / (precision + exactRecall)
        : 0
    }
  };
}

/**
 * Evaluate relationship quality without ground truth
 * @param {Array} relationships - Extracted relationships
 * @param {Array} entities - Extracted entities
 * @returns {Object} Evaluation result
 */
function evaluateWithoutGroundTruth(relationships, entities) {
  if (relationships.length === 0) {
    // No relationships might be fine if few entities
    if (entities.length < 2) {
      return { score: 0.7, details: { reason: 'Too few entities for relationships' } };
    }
    return { score: 0.3, details: { reason: 'No relationships extracted' } };
  }

  let score = 0.5;
  const details = {
    relationshipCount: relationships.length,
    entityCount: entities.length,
    qualityIndicators: [],
    typeDistribution: {},
    methodDistribution: {},
    confidenceStats: {}
  };

  // Entity name set for validation
  const entityNames = new Set(entities.map(e => (e.name || '').toLowerCase()));

  // Validate relationships reference known entities
  let validRelationships = 0;
  for (const rel of relationships) {
    const sourceKnown = entityNames.has((rel.source || '').toLowerCase());
    const targetKnown = entityNames.has((rel.target || '').toLowerCase());

    if (sourceKnown && targetKnown) {
      validRelationships++;
    }

    // Track type distribution
    const type = rel.type || 'UNKNOWN';
    details.typeDistribution[type] = (details.typeDistribution[type] || 0) + 1;

    // Track extraction method
    const method = rel.extractionMethod || 'unknown';
    details.methodDistribution[method] = (details.methodDistribution[method] || 0) + 1;
  }

  // Valid relationship ratio
  const validRatio = relationships.length > 0 ? validRelationships / relationships.length : 0;
  if (validRatio >= 0.8) {
    score += 0.15;
    details.qualityIndicators.push('High entity reference validity');
  } else if (validRatio >= 0.5) {
    score += 0.05;
  }

  // Confidence analysis
  const confidences = relationships.map(r => r.confidence || 0);
  if (confidences.length > 0) {
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    details.confidenceStats = {
      avg: avgConfidence,
      min: Math.min(...confidences),
      max: Math.max(...confidences)
    };

    if (avgConfidence >= 0.7) {
      score += 0.10;
      details.qualityIndicators.push('Good average confidence');
    }
  }

  // Type diversity (some diversity is good)
  const typeCount = Object.keys(details.typeDistribution).length;
  if (typeCount >= 2 && typeCount <= 8) {
    score += 0.10;
    details.qualityIndicators.push('Diverse relationship types');
  }

  // Method diversity (multi-method extraction is better)
  const methodCount = Object.keys(details.methodDistribution).length;
  if (methodCount >= 2) {
    score += 0.10;
    details.qualityIndicators.push('Multi-method extraction');
  }

  // Reasonable density
  const maxPossible = entities.length * (entities.length - 1) / 2;
  const density = maxPossible > 0 ? relationships.length / maxPossible : 0;

  if (density >= 0.1 && density <= 0.5) {
    score += 0.05;
    details.qualityIndicators.push('Reasonable graph density');
  }

  details.validRelationshipRatio = validRatio;
  details.graphDensity = density;

  return {
    score: Math.min(1.0, score),
    details
  };
}

module.exports = {
  name,
  evaluate
};
