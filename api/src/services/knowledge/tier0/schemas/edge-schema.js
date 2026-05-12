'use strict';

const EDGE_SCHEMA = {
  // === POLARITY ===
  polarity: {
    type: 'enum',
    values: ['AFFIRMED', 'NEGATED'],
    default: 'AFFIRMED',
    required: true,
  },
  polarity_confidence: {
    type: 'float',
    min: 0.0,
    max: 1.0,
    default: 1.0,
    required: false,
  },

  // === TEMPORAL VALIDITY (real-world time) ===
  valid_from: {
    type: 'datetime',
    default: null,
    required: false,
  },
  valid_to: {
    type: 'datetime',
    default: null,
    required: false,
  },
  valid_from_grain: {
    type: 'enum',
    values: ['EXACT', 'DAY', 'MONTH', 'YEAR', null],
    default: null,
    required: false,
  },
  valid_to_grain: {
    type: 'enum',
    values: ['EXACT', 'DAY', 'MONTH', 'YEAR', null],
    default: null,
    required: false,
  },

  // === TRANSACTION TIME (system time) ===
  recorded_at: {
    type: 'datetime',
    default: 'NOW',
    required: true,
  },
  superseded_at: {
    type: 'datetime',
    default: null,
    required: false,
  },

  // === STATUS & RETRACTION ===
  status: {
    type: 'enum',
    values: ['ACTIVE', 'RETRACTED', 'SUPERSEDED'],
    default: 'ACTIVE',
    required: true,
  },
  retracted_at: {
    type: 'datetime',
    default: null,
    required: false,
  },
  retracted_by_quantum: {
    type: 'string',
    default: null,
    required: false,
  },
  retraction_reason: {
    type: 'string',
    default: null,
    required: false,
  },

  // === PROVENANCE ===
  source_quanta: {
    type: 'array<string>',
    default: [],
    required: true,
  },
  weight_original: {
    type: 'float',
    min: 0.0,
    max: 1.0,
    default: 1.0,
    required: false,
  },
  weight_effective: {
    type: 'float',
    min: 0.0,
    max: 1.0,
    default: 1.0,
    required: false,
  },
  last_reinforced: {
    type: 'datetime',
    default: null,
    required: false,
  },
  admiralty_combined: {
    type: 'string',
    default: null,
    required: false,
  },
};

// Five real-world temporal patterns
const TEMPORAL_PATTERNS = {
  CURRENT_FACT:   { label: 'CURRENT_FACT',   description: 'Fact still true — valid_to is null' },
  HISTORICAL_FACT:{ label: 'HISTORICAL_FACT', description: 'Fact no longer true — valid_to in the past' },
  FUTURE_FACT:    { label: 'FUTURE_FACT',     description: 'Fact will become true — valid_from in the future' },
  POINT_IN_TIME:  { label: 'POINT_IN_TIME',   description: 'Single-moment event — valid_from equals valid_to' },
  INDEFINITE:     { label: 'INDEFINITE',      description: 'No temporal bounds — always assumed true' },
};

function inferTemporalPattern(valid_from, valid_to) {
  const now = new Date();
  const from = valid_from ? new Date(valid_from) : null;
  const to   = valid_to   ? new Date(valid_to)   : null;

  if (!from && !to) return TEMPORAL_PATTERNS.INDEFINITE;
  if (from && to && Math.abs(from - to) < 1000) return TEMPORAL_PATTERNS.POINT_IN_TIME;
  if (from && from > now && !to) return TEMPORAL_PATTERNS.FUTURE_FACT;
  if (to && to <= now)           return TEMPORAL_PATTERNS.HISTORICAL_FACT;
  return TEMPORAL_PATTERNS.CURRENT_FACT;
}

// Build a defaults object for a new edge (omit node-specific fields)
function buildDefaults() {
  const now = new Date().toISOString();
  return {
    polarity:            'AFFIRMED',
    polarity_confidence: 1.0,
    valid_from:          null,
    valid_to:            null,
    valid_from_grain:    null,
    valid_to_grain:      null,
    recorded_at:         now,
    superseded_at:       null,
    status:              'ACTIVE',
    retracted_at:        null,
    retracted_by_quantum:null,
    retraction_reason:   null,
    source_quanta:       [],
    weight_original:     1.0,
    weight_effective:    1.0,
    last_reinforced:     null,
    admiralty_combined:  null,
  };
}

// Validate a properties object against EDGE_SCHEMA; return array of error strings
function validateProperties(props) {
  const errors = [];

  for (const [key, schema] of Object.entries(EDGE_SCHEMA)) {
    const val = props[key];
    const missing = val === undefined || val === null;

    if (schema.required && missing && schema.default === undefined) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }
    if (missing) continue;

    if (schema.type === 'enum' && schema.values) {
      if (!schema.values.includes(val)) {
        errors.push(`${key}: invalid value '${val}', must be one of ${schema.values.filter(v => v !== null).join(', ')}`);
      }
    } else if (schema.type === 'float') {
      const n = Number(val);
      if (isNaN(n)) {
        errors.push(`${key}: expected float, got '${val}'`);
      } else {
        if (schema.min !== undefined && n < schema.min) errors.push(`${key}: ${n} < min ${schema.min}`);
        if (schema.max !== undefined && n > schema.max) errors.push(`${key}: ${n} > max ${schema.max}`);
      }
    }
  }

  // T0-005: grain must match value presence (both directions)
  if (props.valid_from != null && !props.valid_from_grain)
    errors.push('valid_from_grain must be set when valid_from is set');
  if (props.valid_from == null && props.valid_from_grain != null)
    errors.push('valid_from_grain must be null when valid_from is null');
  if (props.valid_to != null && !props.valid_to_grain)
    errors.push('valid_to_grain must be set when valid_to is set');
  if (props.valid_to == null && props.valid_to_grain != null)
    errors.push('valid_to_grain must be null when valid_to is null');

  // T0-004: RETRACTED edges must have retracted_at + retraction_reason
  if (props.status === 'RETRACTED') {
    if (!props.retracted_at)       errors.push('RETRACTED edge missing retracted_at');
    if (!props.retraction_reason)  errors.push('RETRACTED edge missing retraction_reason');
  }

  // T0-008: SUPERSEDED edges must have superseded_at
  if (props.status === 'SUPERSEDED' && !props.superseded_at) {
    errors.push('SUPERSEDED edge missing superseded_at');
  }

  return errors;
}

module.exports = {
  EDGE_SCHEMA,
  TEMPORAL_PATTERNS,
  inferTemporalPattern,
  buildDefaults,
  validateProperties,
};
