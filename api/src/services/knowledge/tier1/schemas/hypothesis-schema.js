'use strict';

const HYPOTHESIS_TYPES = {
  IDENTITY: {
    description: 'Two entities may be the same entity',
    auto_resolvable: true,
    typical_resolution: 'MERGE or KEEP_SEPARATE',
    default_confidence: 0.5,
    default_expires_days: 30,
  },
  RELATION: {
    description: 'A relationship may exist between entities',
    auto_resolvable: true,
    typical_resolution: 'CREATE_EDGE or REJECT',
    default_confidence: 0.5,
    default_expires_days: 14,
  },
  POLARITY_CONFLICT: {
    description: 'Both AFFIRMED and NEGATED edges exist for same relationship',
    auto_resolvable: false,
    typical_resolution: 'Human review required',
    default_confidence: 0.5,
    default_expires_days: null,
  },
  TEMPORAL_OVERLAP: {
    description: 'Conflicting temporal validity for same relationship',
    auto_resolvable: true,
    typical_resolution: 'Adjust valid_from/valid_to bounds',
    default_confidence: 0.5,
    default_expires_days: 7,
  },
  PROVENANCE_CONFLICT: {
    description: 'Sources disagree on a fact',
    auto_resolvable: true,
    typical_resolution: 'Use Admiralty Code to arbitrate',
    default_confidence: 0.5,
    default_expires_days: 14,
  },
  STRUCTURAL_CONFLICT: {
    description: 'Graph structure violation (e.g., cycle where acyclic expected)',
    auto_resolvable: false,
    typical_resolution: 'Restructure or flag as exception',
    default_confidence: 0.5,
    default_expires_days: null,
  },
  EXISTENCE: {
    description: 'Entity may no longer be valid (all supporting edges retracted)',
    auto_resolvable: true,
    typical_resolution: 'Archive entity if no new evidence after N days',
    default_confidence: 0.3,
    default_expires_days: 30,
  },
  FACET_ACTIVATION: {
    description: 'Entity may have additional facet based on topology',
    auto_resolvable: true,
    typical_resolution: 'Activate facet if threshold met',
    default_confidence: 0.6,
    default_expires_days: 7,
  },
  DECAY_RECOVERY: {
    description: 'Fact confidence has decayed below threshold, needs reconfirmation',
    auto_resolvable: false,
    typical_resolution: 'Find new evidence or archive',
    default_confidence: 0.3,
    default_expires_days: 90,
  },
  IMPLICIT_RETRACTION_VS_TEMPORAL_CHANGE: {
    description: 'Unclear if new info retracts old or represents temporal change',
    auto_resolvable: false,
    typical_resolution: 'Human disambiguation',
    default_confidence: 0.5,
    default_expires_days: null,
  },
};

const HYPOTHESIS_STATUSES = ['OPEN', 'CONFIRMED', 'FALSIFIED', 'SUPERSEDED', 'DEFERRED', 'EXPIRED'];

const RESOLUTION_METHODS = ['AUTO', 'AGENT', 'HUMAN', 'TIMEOUT'];

const HYPOTHESIS_SCHEMA = {
  id:                 { type: 'uuid',            required: true },
  namespace:          { type: 'string',          required: true },
  type:               { type: 'enum',            values: Object.keys(HYPOTHESIS_TYPES), required: true },
  status:             { type: 'enum',            values: HYPOTHESIS_STATUSES, default: 'OPEN', required: true },
  statement:          { type: 'string',          required: true },
  context:            { type: 'json',            required: false },
  confidence:         { type: 'float',           min: 0.0, max: 1.0, default: 0.5 },
  prior_confidence:   { type: 'float',           min: 0.0, max: 1.0, default: 0.5 },
  resolved_at:        { type: 'datetime',        default: null },
  resolved_by:        { type: 'enum',            values: RESOLUTION_METHODS, default: null },
  resolution_reason:  { type: 'string',          default: null },
  resolution_action:  { type: 'json',            default: null },
  created_at:         { type: 'datetime',        required: true },
  updated_at:         { type: 'datetime',        required: true },
  expires_at:         { type: 'datetime',        default: null },
  subject_nodes:      { type: 'array<string>',   default: [] },
  subject_edges:      { type: 'array<string>',   default: [] },
};

const EVIDENCE_SCHEMA = {
  diagnostic_value: { type: 'float', min: 0.0, max: 1.0, default: 0.5 },
  admiralty:        { type: 'string', default: null },
  eliminates:       { type: 'boolean', default: false },
  added_at:         { type: 'datetime', required: true },
};

module.exports = {
  HYPOTHESIS_TYPES,
  HYPOTHESIS_STATUSES,
  RESOLUTION_METHODS,
  HYPOTHESIS_SCHEMA,
  EVIDENCE_SCHEMA,
};
