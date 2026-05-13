'use strict';

const INFERENCE_TYPES = {
  TRANSITIVE:          { description: 'A→B, B→C implies A→C' },
  SYMMETRIC:           { description: 'A→B implies B→A' },
  INVERSE:             { description: 'A→B implies B→A with different relation type' },
  COMPOSITION:         { description: 'Multiple relations compose into new relation' },
  AGGREGATION:         { description: 'Multiple instances aggregate into summary fact' },
  TEMPORAL_INFERENCE:  { description: 'Temporal patterns imply facts' },
};

// Properties added to derived edges (on top of Tier 0 EDGE_SCHEMA)
const INFERENCE_EDGE_PROPERTIES = {
  derived:             { type: 'boolean',  default: true,  required: true },
  inference_type:      { type: 'enum',     values: Object.keys(INFERENCE_TYPES), required: true },
  inference_rule_id:   { type: 'string',   required: true },
  inference_rule_name: { type: 'string',   required: false },
  premise_edge_ids:    { type: 'array<string>', default: [], required: true },
  derived_confidence:  { type: 'float',    min: 0.0, max: 1.0, required: true },
  premise_dependent:   { type: 'boolean',  default: true },
  derived_at:          { type: 'datetime', required: true },
  last_revalidated:    { type: 'datetime', default: null },
};

// :InferenceRule node schema
const INFERENCE_RULE_SCHEMA = {
  id:                  { type: 'uuid',     required: true },
  namespace:           { type: 'string',   required: true },
  name:                { type: 'string',   required: true },
  description:         { type: 'string',   required: true },
  type:                { type: 'enum',     values: Object.keys(INFERENCE_TYPES), required: true },
  // pattern: JSON — from/to/relType for premises and conclusion
  pattern:             { type: 'json',     required: true },
  confidence_modifier: { type: 'float',    default: 0.9 },
  enabled:             { type: 'boolean',  default: true },
  priority:            { type: 'integer',  default: 100 },
  created_at:          { type: 'datetime', required: true },
  created_by:          { type: 'string',   required: true },
};

module.exports = { INFERENCE_TYPES, INFERENCE_EDGE_PROPERTIES, INFERENCE_RULE_SCHEMA };
