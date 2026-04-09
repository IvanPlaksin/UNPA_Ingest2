/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSTRAINT GRAPH SCHEMA
 *
 * A CONSTRAINT graph defines validation rules for a STRUCTURAL graph.
 * Linked via CONSTRAINS relationship: (CONSTRAINT)-[:CONSTRAINS]->(STRUCTURAL)
 *
 * Compiles to:
 *   - JSON Schema (AJV backend validation)
 *   - Zod schema string (frontend validation)
 *   - Visibility rules (conditional field display)
 *   - Computed defaults (auto-fill)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// RULE TYPES
// ────────────────────────────────────────────────────────────────────────────

const ConstraintRuleType = {
  // Field-level rules
  REQUIRED: 'REQUIRED',
  MIN_LENGTH: 'MIN_LENGTH',
  MAX_LENGTH: 'MAX_LENGTH',
  PATTERN: 'PATTERN',
  MIN: 'MIN',
  MAX: 'MAX',
  EMAIL: 'EMAIL',
  URL: 'URL',

  // Cross-field rules
  EQUALS: 'EQUALS',
  NOT_EQUALS: 'NOT_EQUALS',
  GREATER_THAN: 'GREATER_THAN',
  LESS_THAN: 'LESS_THAN',
  DEPENDS_ON: 'DEPENDS_ON',

  // Conditional rules
  REQUIRED_IF: 'REQUIRED_IF',
  VISIBLE_IF: 'VISIBLE_IF',
  DISABLED_IF: 'DISABLED_IF',

  // Computed
  COMPUTED: 'COMPUTED',
  DEFAULT_FROM: 'DEFAULT_FROM',

  // Async
  ASYNC_VALIDATE: 'ASYNC_VALIDATE',
  UNIQUE: 'UNIQUE',
  EXISTS: 'EXISTS',

  // Aggregate
  AT_LEAST_ONE: 'AT_LEAST_ONE',
  EXACTLY_ONE: 'EXACTLY_ONE',
  CUSTOM: 'CUSTOM',
};

const ConstraintSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
};

const ConstraintEdgeType = {
  APPLIES_TO: 'APPLIES_TO',
  DEPENDS_ON: 'DEPENDS_ON',
  REFERENCES: 'REFERENCES',
};

// ────────────────────────────────────────────────────────────────────────────
// BUILDER
// ────────────────────────────────────────────────────────────────────────────

class ConstraintGraphBuilder {
  constructor(name, structuralGraphId, options = {}) {
    this.graphId = options.graphId || `constraint_${name}_${Date.now()}`;
    this.name = name;
    this.structuralGraphId = structuralGraphId;
    this.namespace = options.namespace || 'CORE';
    this.nodes = [];
    this.edges = [];
    this._nodeCounter = 0;
  }

  _generateNodeId() {
    return `rule_${++this._nodeCounter}`;
  }

  _addRule(ruleData) {
    const nodeId = ruleData.nodeId || this._generateNodeId();
    this.nodes.push({ ...ruleData, nodeId });
    return nodeId;
  }

  required(fieldName, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.REQUIRED,
      targetField: fieldName,
      errorMessage: options.errorMessage || { en: `${fieldName} is required` },
      severity: options.severity || ConstraintSeverity.ERROR,
    });
    return this;
  }

  minLength(fieldName, length, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.MIN_LENGTH,
      targetField: fieldName,
      value: length,
      errorMessage: options.errorMessage || { en: `${fieldName} must be at least ${length} characters` },
      severity: options.severity || ConstraintSeverity.ERROR,
    });
    return this;
  }

  maxLength(fieldName, length, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.MAX_LENGTH,
      targetField: fieldName,
      value: length,
      errorMessage: options.errorMessage || { en: `${fieldName} must be at most ${length} characters` },
    });
    return this;
  }

  pattern(fieldName, regex, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.PATTERN,
      targetField: fieldName,
      pattern: regex,
      errorMessage: options.errorMessage || { en: `${fieldName} format is invalid` },
    });
    return this;
  }

  range(fieldName, min, max, options = {}) {
    if (min !== undefined) {
      this._addRule({
        ruleType: ConstraintRuleType.MIN,
        targetField: fieldName,
        value: min,
        errorMessage: options.minErrorMessage || { en: `${fieldName} must be at least ${min}` },
      });
    }
    if (max !== undefined) {
      this._addRule({
        ruleType: ConstraintRuleType.MAX,
        targetField: fieldName,
        value: max,
        errorMessage: options.maxErrorMessage || { en: `${fieldName} must be at most ${max}` },
      });
    }
    return this;
  }

  requiredIf(fieldName, condition, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.REQUIRED_IF,
      targetField: fieldName,
      condition: this._normalizeCondition(condition),
      errorMessage: options.errorMessage || { en: `${fieldName} is required` },
    });
    return this;
  }

  visibleIf(fieldName, condition) {
    this._addRule({
      ruleType: ConstraintRuleType.VISIBLE_IF,
      targetField: fieldName,
      condition: this._normalizeCondition(condition),
      frontendOnly: true,
    });
    return this;
  }

  disabledIf(fieldName, condition) {
    this._addRule({
      ruleType: ConstraintRuleType.DISABLED_IF,
      targetField: fieldName,
      condition: this._normalizeCondition(condition),
      frontendOnly: true,
    });
    return this;
  }

  computed(fieldName, expression, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.COMPUTED,
      targetField: fieldName,
      expression,
      frontendOnly: options.frontendOnly !== false,
    });
    return this;
  }

  compare(field1, operator, field2, options = {}) {
    const ruleTypeMap = {
      '===': ConstraintRuleType.EQUALS,
      '!==': ConstraintRuleType.NOT_EQUALS,
      '>': ConstraintRuleType.GREATER_THAN,
      '<': ConstraintRuleType.LESS_THAN,
    };

    this._addRule({
      ruleType: ruleTypeMap[operator] || ConstraintRuleType.CUSTOM,
      targetField: field1,
      targetFields: [field1, field2],
      expression: `${field1} ${operator} ${field2}`,
      errorMessage: options.errorMessage || { en: `${field1} must be ${operator} ${field2}` },
    });
    return this;
  }

  atLeastOne(fields, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.AT_LEAST_ONE,
      targetFields: fields,
      errorMessage: options.errorMessage || { en: `At least one of ${fields.join(', ')} is required` },
    });
    return this;
  }

  asyncValidate(fieldName, config, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.ASYNC_VALIDATE,
      targetField: fieldName,
      asyncConfig: {
        endpoint: config.endpoint,
        method: config.method || 'GET',
        debounceMs: config.debounceMs || 300,
        timeout: config.timeout || 5000,
      },
      backendOnly: false,
      errorMessage: options.errorMessage || { en: `${fieldName} validation failed` },
    });
    return this;
  }

  unique(fieldName, config, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.UNIQUE,
      targetField: fieldName,
      asyncConfig: {
        endpoint: config.endpoint,
        method: 'GET',
        debounceMs: config.debounceMs || 500,
        timeout: config.timeout || 5000,
      },
      backendOnly: true,
      errorMessage: options.errorMessage || { en: `${fieldName} must be unique` },
    });
    return this;
  }

  custom(targetFields, expression, options = {}) {
    this._addRule({
      ruleType: ConstraintRuleType.CUSTOM,
      targetFields: Array.isArray(targetFields) ? targetFields : [targetFields],
      expression,
      errorMessage: options.errorMessage || { en: 'Validation failed' },
    });
    return this;
  }

  _normalizeCondition(condition) {
    if (typeof condition === 'object' && !condition.operator) {
      const [field, value] = Object.entries(condition)[0];
      return { field, operator: 'eq', value };
    }
    return condition;
  }

  build() {
    return {
      graphId: this.graphId,
      graphType: 'CONSTRAINT',
      graphSubType: null,
      graphDimension: 'GOVERNANCE',
      namespace: this.namespace,
      name: this.name,
      structuralGraphId: this.structuralGraphId,
      nodes: this.nodes,
      edges: this.edges,
    };
  }
}

module.exports = {
  ConstraintRuleType,
  ConstraintSeverity,
  ConstraintEdgeType,
  ConstraintGraphBuilder,
};
