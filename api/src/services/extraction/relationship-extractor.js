/**
 * Relationship Extractor
 * Extracts relationships between entities using pattern matching and co-occurrence analysis
 *
 * @module services/extraction/relationship-extractor
 */

'use strict';

// Pipeline Configuration for tunable parameters
const {
  DEFAULT_CONFIG,
  getParameter
} = require('./config/pipeline-config');

/**
 * Get configuration value with fallback
 * @param {string} path - Configuration path
 * @param {*} defaultValue - Fallback value
 * @returns {*} Configuration value
 */
function getConfigValue(path, defaultValue) {
  const value = getParameter(DEFAULT_CONFIG, path);
  return value !== undefined ? value : defaultValue;
}

/**
 * Dependency patterns for relationship extraction
 * Each pattern captures (source, target) pairs with a relationship type
 */
const DEPENDENCY_PATTERNS = [
  // Usage relationships
  { pattern: /\b(\w+)\s+(?:uses?|utilizes?|employs?)\s+(\w+)/gi, type: 'USES', confidence: 0.85 },
  { pattern: /\b(\w+)\s+(?:relies?\s+on|depends?\s+on)\s+(\w+)/gi, type: 'DEPENDS_ON', confidence: 0.85 },

  // Integration relationships
  { pattern: /\b(\w+)\s+(?:via|through|over|using)\s+(\w+)/gi, type: 'INTEGRATES_WITH', confidence: 0.75 },
  { pattern: /\b(\w+)\s+(?:connects?\s+to|integrates?\s+with|communicates?\s+with)\s+(\w+)/gi, type: 'CONNECTS_TO', confidence: 0.85 },

  // Role/purpose relationships
  { pattern: /\b(\w+)\s+(?:serves?\s+as|acts?\s+as|functions?\s+as)\s+(?:the\s+)?(\w+)/gi, type: 'IS_A', confidence: 0.80 },
  { pattern: /\b(\w+)\s+(?:is\s+(?:a|the))\s+(\w+)/gi, type: 'IS_A', confidence: 0.70 },

  // Provision relationships
  { pattern: /\b(\w+)\s+(?:provides?|offers?|enables?|delivers?)\s+(\w+)/gi, type: 'PROVIDES', confidence: 0.80 },
  { pattern: /\b(\w+)\s+(?:handles?|manages?|processes?|performs?)\s+(\w+)/gi, type: 'HANDLES', confidence: 0.80 },

  // Storage relationships
  { pattern: /\b(\w+)\s+(?:stores?|persists?|saves?|caches?)\s+(?:in\s+)?(\w+)/gi, type: 'STORES_IN', confidence: 0.80 },
  { pattern: /\b(\w+)\s+(?:stored\s+in|persisted\s+(?:in|to))\s+(\w+)/gi, type: 'STORED_IN', confidence: 0.80 },

  // Data flow relationships
  { pattern: /\b(\w+)\s+(?:sends?\s+(?:data\s+)?to|writes?\s+to|outputs?\s+to)\s+(\w+)/gi, type: 'WRITES_TO', confidence: 0.75 },
  { pattern: /\b(\w+)\s+(?:reads?\s+from|receives?\s+from|gets?\s+from)\s+(\w+)/gi, type: 'READS_FROM', confidence: 0.75 },

  // Compositional relationships
  { pattern: /\b(\w+)\s+(?:contains?|includes?|has)\s+(\w+)/gi, type: 'CONTAINS', confidence: 0.70 },
  { pattern: /\b(\w+)\s+(?:is\s+part\s+of|belongs?\s+to)\s+(\w+)/gi, type: 'PART_OF', confidence: 0.75 },

  // Generation relationships
  { pattern: /\b(\w+)\s+(?:generates?|creates?|produces?|builds?)\s+(\w+)/gi, type: 'GENERATES', confidence: 0.80 },

  // Communication/call relationships
  { pattern: /\b(\w+)\s+(?:calls?|invokes?|triggers?)\s+(\w+)/gi, type: 'CALLS', confidence: 0.80 },
];

/**
 * Preposition patterns for "X for Y" style relationships
 */
const PREPOSITION_PATTERNS = [
  { pattern: /\b(\w+)\s+for\s+(\w+(?:\s+\w+)?)\b/gi, type: 'FOR_PURPOSE', confidence: 0.65 },
  { pattern: /\b(\w+)\s+as\s+(?:the\s+)?(\w+(?:\s+\w+)?)\b/gi, type: 'AS_ROLE', confidence: 0.70 },
];

/**
 * Extract relationships from text and entities
 * @param {string} text - Source text
 * @param {Array} entities - Extracted entities
 * @param {Object} options - Extraction options
 * @returns {Array} Extracted relationships
 */
function extractRelationships(text, entities, options = {}) {
  if (!text || !entities || entities.length < 2) {
    return [];
  }

  // Use config values with option overrides
  const {
    includeCoOccurrence = getConfigValue('relationshipExtraction.coOccurrence.enabled', true),
    minConfidence = getConfigValue('relationshipExtraction.patterns.minConfidence', 0.5),
    maxRelationships = getConfigValue('relationshipExtraction.maxRelationships', 50)
  } = options;

  const relationships = [];
  const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
  const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]));

  // 1. Pattern-based extraction
  const patternRelationships = extractPatternRelationships(text, entities, entityNames);
  relationships.push(...patternRelationships);

  // 2. Co-occurrence extraction (entities in same sentence)
  if (includeCoOccurrence) {
    const coOccurrenceRelationships = extractCoOccurrenceRelationships(text, entities);
    relationships.push(...coOccurrenceRelationships);
  }

  // 3. Preposition-based extraction
  const prepositionRelationships = extractPrepositionRelationships(text, entities, entityNames);
  relationships.push(...prepositionRelationships);

  // Deduplicate and filter
  const deduplicated = deduplicateRelationships(relationships);
  const filtered = deduplicated
    .filter(r => r.confidence >= minConfidence)
    .slice(0, maxRelationships);

  return filtered;
}

/**
 * Extract relationships using dependency patterns
 * @private
 */
function extractPatternRelationships(text, entities, entityNames) {
  const relationships = [];

  for (const { pattern, type, confidence } of DEPENDENCY_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [fullMatch, rawSource, rawTarget] = match;

      // Check if either source or target is a known entity
      const sourceNorm = rawSource.toLowerCase();
      const targetNorm = rawTarget.toLowerCase();

      const sourceIsEntity = entityNames.has(sourceNorm);
      const targetIsEntity = entityNames.has(targetNorm);

      // At least one should be a known entity
      if (sourceIsEntity || targetIsEntity) {
        const source = normalizeEntityName(rawSource, entities);
        const target = normalizeEntityName(rawTarget, entities);

        // Avoid self-relationships
        if (source.toLowerCase() !== target.toLowerCase()) {
          relationships.push({
            source,
            target,
            type,
            confidence: sourceIsEntity && targetIsEntity ? confidence : confidence * 0.8,
            evidence: fullMatch.trim(),
            extractionMethod: 'pattern'
          });
        }
      }
    }
  }

  return relationships;
}

/**
 * Extract relationships based on co-occurrence in sentences
 * @private
 */
function extractCoOccurrenceRelationships(text, entities) {
  const relationships = [];

  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();

    // Find entities mentioned in this sentence
    const foundEntities = entities.filter(e =>
      sentenceLower.includes(e.name.toLowerCase())
    );

    // Create RELATED_TO relationships between entities in same sentence
    if (foundEntities.length >= 2) {
      for (let i = 0; i < foundEntities.length - 1; i++) {
        for (let j = i + 1; j < foundEntities.length; j++) {
          const e1 = foundEntities[i];
          const e2 = foundEntities[j];

          // Calculate confidence based on sentence length and entity distance
          // Use config values for tunable parameters
          const baseConfidence = getConfigValue('relationshipExtraction.coOccurrence.baseConfidence', 0.55);
          const distanceBonusMax = getConfigValue('relationshipExtraction.coOccurrence.distanceBonus', 0.15);
          const distanceBonus = Math.max(0, distanceBonusMax - (sentence.length / 1000));

          relationships.push({
            source: e1.name,
            sourceType: e1.type,
            target: e2.name,
            targetType: e2.type,
            type: 'RELATED_TO',
            confidence: Math.min(baseConfidence + distanceBonus, getConfigValue('relationshipExtraction.coOccurrence.maxConfidence', 0.70)),
            evidence: sentence.trim().substring(0, 120) + (sentence.length > 120 ? '...' : ''),
            extractionMethod: 'co-occurrence'
          });
        }
      }
    }
  }

  return relationships;
}

/**
 * Extract relationships using preposition patterns
 * @private
 */
function extractPrepositionRelationships(text, entities, entityNames) {
  const relationships = [];

  for (const { pattern, type, confidence } of PREPOSITION_PATTERNS) {
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [fullMatch, rawSource, rawTarget] = match;

      const sourceNorm = rawSource.toLowerCase();

      // Only include if source is a known entity
      if (entityNames.has(sourceNorm)) {
        const source = normalizeEntityName(rawSource, entities);

        relationships.push({
          source,
          target: rawTarget.trim(),
          type,
          confidence,
          evidence: fullMatch.trim(),
          extractionMethod: 'preposition'
        });
      }
    }
  }

  return relationships;
}

/**
 * Normalize entity name to canonical form
 * @private
 */
function normalizeEntityName(name, entities) {
  const found = entities.find(e =>
    e.name.toLowerCase() === name.toLowerCase()
  );
  return found ? found.name : name;
}

/**
 * Remove duplicate relationships, keeping highest confidence
 * @private
 */
function deduplicateRelationships(relationships) {
  const map = new Map();

  for (const rel of relationships) {
    // Create bidirectional key for RELATED_TO
    let key;
    if (rel.type === 'RELATED_TO') {
      const sorted = [rel.source, rel.target].sort();
      key = `${sorted[0]}|${sorted[1]}|${rel.type}`;
    } else {
      key = `${rel.source}|${rel.target}|${rel.type}`;
    }

    const existing = map.get(key);
    if (!existing || rel.confidence > existing.confidence) {
      map.set(key, rel);
    }
  }

  return Array.from(map.values());
}

/**
 * Merge relationships from multiple sources
 * @param {Array} relationships1 - First set of relationships
 * @param {Array} relationships2 - Second set of relationships
 * @returns {Array} Merged relationships
 */
function mergeRelationships(relationships1, relationships2) {
  const all = [...(relationships1 || []), ...(relationships2 || [])];
  return deduplicateRelationships(all);
}

/**
 * Get relationship statistics
 * @param {Array} relationships - Relationships to analyze
 * @returns {Object} Statistics
 */
function getRelationshipStats(relationships) {
  if (!relationships || relationships.length === 0) {
    return { count: 0 };
  }

  const byType = {};
  const byMethod = {};

  for (const rel of relationships) {
    byType[rel.type] = (byType[rel.type] || 0) + 1;
    byMethod[rel.extractionMethod] = (byMethod[rel.extractionMethod] || 0) + 1;
  }

  return {
    count: relationships.length,
    byType,
    byMethod,
    avgConfidence: (relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length).toFixed(3)
  };
}

module.exports = {
  extractRelationships,
  mergeRelationships,
  getRelationshipStats,
  DEPENDENCY_PATTERNS,
  PREPOSITION_PATTERNS
};
