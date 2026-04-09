/**
 * Schema Validation Executor — validates data against JSON schemas
 * and GXE action type rules. Provides field-level error reporting
 * and configurable strictness levels.
 */

const { BaseExecutor } = require('../../plugin-base');

// Known GXE action types
const GXE_ACTION_TYPES = [
  'ADD_NODE', 'REMOVE_NODE', 'UPDATE_NODE',
  'ADD_EDGE', 'REMOVE_EDGE',
  'INSERT_BETWEEN',
  'CREATE_SUBGRAPH', 'EXTRACT_SUBGRAPH',
  'BATCH', 'EXECUTE_GRAPH',
];

// Required fields per action type
const ACTION_REQUIRED_FIELDS = {
  ADD_NODE: ['node'],
  REMOVE_NODE: ['nodeId'],
  UPDATE_NODE: ['nodeId'],
  ADD_EDGE: ['source', 'target'],
  REMOVE_EDGE: ['edgeId'],
  INSERT_BETWEEN: ['node', 'insertAfter', 'insertBefore'],
  CREATE_SUBGRAPH: ['parentNodeId', 'nodes'],
  EXTRACT_SUBGRAPH: ['nodeIds'],
  BATCH: ['actions'],
  EXECUTE_GRAPH: [],
};

// ADD_NODE sub-field requirements
const ADD_NODE_REQUIRED = ['id', 'type'];

class SchemaValidateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'validation.schema';
    this.displayName = 'Schema Validation';
    this.description = 'Validates data against JSON schemas and GXE action types with field-level error reporting';
    this.domain = 'validation';

    this.parameterSchema = {
      type: 'object',
      properties: {
        data: { type: 'any', description: 'Data to validate' },
        context: { type: 'object', description: 'Validation context', default: {} },
        actionTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed action types (default: all GXE action types)',
          default: GXE_ACTION_TYPES,
        },
        schema: { type: 'object', description: 'JSON schema definition for validation' },
        customRules: {
          type: 'array',
          items: { type: 'object' },
          description: 'Custom validation rules: [{ field, rule, message }]',
          default: [],
        },
        strictMode: { type: 'boolean', description: 'Enable strict validation', default: true },
      },
      required: ['data'],
    };
  }

  async execute(parameters, context) {
    const data = this.getRequiredParam(parameters, 'data');
    const allowedActionTypes = this.getParam(parameters, 'actionTypes', GXE_ACTION_TYPES);
    const schema = this.getParam(parameters, 'schema', null);
    const customRules = this.getParam(parameters, 'customRules', []);
    const strictMode = this.getParam(parameters, 'strictMode', true);

    const errors = [];
    const warnings = [];

    // Null / undefined check
    if (data === null || data === undefined) {
      errors.push({ field: 'data', code: 'NULL_DATA', message: 'Data is null or undefined', severity: 'error' });
      return this.success(
        { valid: false, errors, warnings },
        { validationType: 'null_check' },
        0.0,
      );
    }

    // If data is an array, validate each item
    const items = Array.isArray(data) ? data : [data];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const prefix = Array.isArray(data) ? `[${i}]` : '';

      // 1. GXE Action type validation
      if (item.type && typeof item.type === 'string') {
        this._validateActionType(item, allowedActionTypes, errors, warnings, prefix, strictMode);
      }

      // 2. JSON schema validation
      if (schema) {
        this._validateJsonSchema(item, schema, errors, warnings, prefix);
      }

      // 3. Custom rules
      for (const rule of customRules) {
        this._evaluateCustomRule(item, rule, errors, warnings, prefix);
      }
    }

    const valid = errors.length === 0;

    return this.success(
      { valid, errors, warnings },
      {
        validationType: schema ? 'schema+action' : 'action',
        itemCount: items.length,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
      valid ? 1.0 : 0.0,
    );
  }

  /**
   * Validate GXE action type and required fields.
   */
  _validateActionType(item, allowedTypes, errors, warnings, prefix, strictMode) {
    const type = item.type;

    if (!allowedTypes.includes(type)) {
      errors.push({
        field: `${prefix}type`,
        code: 'UNKNOWN_ACTION_TYPE',
        message: `Unknown action type: "${type}". Allowed: ${allowedTypes.join(', ')}`,
        severity: 'error',
      });
      return;
    }

    // Check required fields for this action type
    const requiredFields = ACTION_REQUIRED_FIELDS[type] || [];
    for (const field of requiredFields) {
      // Handle alternative field patterns (e.g., nodeId OR node.id for REMOVE_NODE)
      if (field === 'nodeId' && !item.nodeId && !item.node?.id) {
        errors.push({
          field: `${prefix}${field}`,
          code: 'MISSING_REQUIRED_FIELD',
          message: `${type} requires "${field}" or "node.id"`,
          severity: 'error',
        });
      } else if (field === 'edgeId' && !item.edgeId && (!item.source || !item.target)) {
        errors.push({
          field: `${prefix}${field}`,
          code: 'MISSING_REQUIRED_FIELD',
          message: `${type} requires "${field}" or "source" + "target"`,
          severity: 'error',
        });
      } else if (field !== 'nodeId' && field !== 'edgeId' && !(field in item)) {
        errors.push({
          field: `${prefix}${field}`,
          code: 'MISSING_REQUIRED_FIELD',
          message: `${type} requires field "${field}"`,
          severity: 'error',
        });
      }
    }

    // ADD_NODE: validate node sub-fields
    if (type === 'ADD_NODE' && item.node) {
      for (const subField of ADD_NODE_REQUIRED) {
        if (!(subField in item.node)) {
          errors.push({
            field: `${prefix}node.${subField}`,
            code: 'MISSING_NODE_FIELD',
            message: `ADD_NODE node requires "${subField}"`,
            severity: 'error',
          });
        }
      }
    }

    // BATCH: recursive validation
    if (type === 'BATCH' && Array.isArray(item.actions)) {
      for (let i = 0; i < item.actions.length; i++) {
        this._validateActionType(
          item.actions[i], allowedTypes, errors, warnings,
          `${prefix}actions[${i}].`, strictMode,
        );
      }
    }

    // Strict mode: warn about unknown fields
    if (strictMode) {
      const knownFields = new Set(['type', ...requiredFields,
        'node', 'nodeId', 'updates', 'source', 'target', 'edgeId',
        'sourceHandle', 'targetHandle', 'label', 'actions',
        'insertAfter', 'insertBefore', 'parentNodeId', 'nodes', 'nodeIds',
        'inputData', 'config',
      ]);
      for (const key of Object.keys(item)) {
        if (!knownFields.has(key)) {
          warnings.push({
            field: `${prefix}${key}`,
            code: 'UNKNOWN_FIELD',
            message: `Unknown field "${key}" on ${type} action`,
            severity: 'warning',
          });
        }
      }
    }
  }

  /**
   * Validate data against a JSON schema (lightweight implementation).
   */
  _validateJsonSchema(data, schema, errors, warnings, prefix) {
    // Required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push({
            field: `${prefix}${field}`,
            code: 'SCHEMA_REQUIRED',
            message: `Required field "${field}" is missing`,
            severity: 'error',
          });
        }
      }
    }

    // Property type checking
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (!(key in data)) continue;

        const value = data[key];
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        // Type check
        if (prop.type && prop.type !== 'any') {
          if (actualType !== prop.type) {
            errors.push({
              field: `${prefix}${key}`,
              code: 'SCHEMA_TYPE_MISMATCH',
              message: `Field "${key}": expected ${prop.type}, got ${actualType}`,
              severity: 'error',
            });
          }
        }

        // Enum check
        if (prop.enum && !prop.enum.includes(value)) {
          errors.push({
            field: `${prefix}${key}`,
            code: 'SCHEMA_ENUM_MISMATCH',
            message: `Field "${key}": value "${value}" not in [${prop.enum.join(', ')}]`,
            severity: 'error',
          });
        }

        // Min/max length for strings
        if (prop.minLength && typeof value === 'string' && value.length < prop.minLength) {
          errors.push({
            field: `${prefix}${key}`,
            code: 'SCHEMA_MIN_LENGTH',
            message: `Field "${key}": length ${value.length} < minLength ${prop.minLength}`,
            severity: 'error',
          });
        }

        // Min/max for numbers
        if (prop.minimum !== undefined && typeof value === 'number' && value < prop.minimum) {
          errors.push({
            field: `${prefix}${key}`,
            code: 'SCHEMA_MIN_VALUE',
            message: `Field "${key}": value ${value} < minimum ${prop.minimum}`,
            severity: 'error',
          });
        }

        // Items validation for arrays
        if (prop.items && Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            if (prop.items.type && typeof value[i] !== prop.items.type) {
              errors.push({
                field: `${prefix}${key}[${i}]`,
                code: 'SCHEMA_ITEM_TYPE',
                message: `Array item ${key}[${i}]: expected ${prop.items.type}, got ${typeof value[i]}`,
                severity: 'error',
              });
            }
          }
        }
      }
    }
  }

  /**
   * Evaluate a custom validation rule.
   */
  _evaluateCustomRule(data, rule, errors, warnings, prefix) {
    if (!rule.field || !rule.rule) return;

    const value = this._getNestedValue(data, rule.field);

    switch (rule.rule) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          errors.push({
            field: `${prefix}${rule.field}`,
            code: 'CUSTOM_REQUIRED',
            message: rule.message || `Field "${rule.field}" is required`,
            severity: 'error',
          });
        }
        break;

      case 'regex': {
        if (typeof value === 'string' && rule.pattern) {
          const re = new RegExp(rule.pattern);
          if (!re.test(value)) {
            errors.push({
              field: `${prefix}${rule.field}`,
              code: 'CUSTOM_REGEX',
              message: rule.message || `Field "${rule.field}" does not match pattern "${rule.pattern}"`,
              severity: 'error',
            });
          }
        }
        break;
      }

      case 'in': {
        if (rule.values && !rule.values.includes(value)) {
          errors.push({
            field: `${prefix}${rule.field}`,
            code: 'CUSTOM_IN',
            message: rule.message || `Field "${rule.field}" must be one of: ${rule.values.join(', ')}`,
            severity: 'error',
          });
        }
        break;
      }
    }
  }

  /**
   * Get nested value from object by dot-path.
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}

module.exports = { SchemaValidateExecutor };
