'use strict';

// Aggregable: relations that commonly appear multiple times between the same node pair
// (from different documents or agreements). Collapsed into badge when > 3 per pair.
const AGGREGABLE_RELATION_TYPES = new Set([
  'IMPLEMENTS', 'REQUIRES', 'AUTHORED_BY', 'FUNDED_BY',
  'REFERENCES', 'SUPPORTS', 'COOPERATES_WITH', 'MENTIONS', 'RELATED_TO',
]);

// Semantic: structural/governance relations — typically one per pair, shown individually
const SEMANTIC_RELATION_TYPES = new Set([
  'GOVERNS', 'MANDATES', 'OVERSEES', 'ESTABLISHED_BY', 'ESTABLISHES',
  'DEFINES', 'REPORTS_TO', 'PART_OF', 'CHAIRED_BY',
]);

function isAggregable(relType) {
  return AGGREGABLE_RELATION_TYPES.has(relType);
}

function groupEdgesByCategory(edges) {
  const semantic = edges.filter(e => !isAggregable(e.relType));
  const frequency = edges.filter(e => isAggregable(e.relType));
  return { semantic, frequency };
}

module.exports = { AGGREGABLE_RELATION_TYPES, SEMANTIC_RELATION_TYPES, isAggregable, groupEdgesByCategory };
