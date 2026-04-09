/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORM SCHEMA BUILDER TESTS
 * Unit tests for fieldToSchema() and schema building logic.
 * Uses mock memgraph service for graph queries.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { FormSchemaBuilder, FIELD_TYPE_MAP } = require('../form-schema-builder');
const { FormDefinitionService } = require('../form-definition.service');

// ────────────────────────────────────────────────────────────────────────────
// MOCK
// ────────────────────────────────────────────────────────────────────────────

function makeField(overrides = {}) {
  return {
    id: 'field-1',
    name: 'test_field',
    type: 'text',
    label: 'Test Field',
    required: false,
    placeholder: 'Enter value',
    defaultValue: null,
    order: 0,
    validations: [],
    conditions: [],
    dataSourceId: null,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS: fieldToSchema
// ────────────────────────────────────────────────────────────────────────────

describe('FormSchemaBuilder', () => {
  const builder = new FormSchemaBuilder({});

  describe('fieldToSchema()', () => {
    test('maps text field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'text' }));
      expect(schema.type).toBe('string');
      expect(schema.title).toBe('Test Field');
    });

    test('maps number field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'number' }));
      expect(schema.type).toBe('number');
    });

    test('maps boolean field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'boolean' }));
      expect(schema.type).toBe('boolean');
    });

    test('maps date field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'date' }));
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('date');
    });

    test('maps select field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'select' }));
      expect(schema.type).toBe('string');
    });

    test('maps multiselect field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'multiselect' }));
      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('string');
    });

    test('maps file field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'file' }));
      expect(schema.contentEncoding).toBe('base64');
    });

    test('maps table field', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'table' }));
      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('object');
    });

    test('includes placeholder as description', () => {
      const schema = builder.fieldToSchema(makeField({ placeholder: 'Enter name' }));
      expect(schema.description).toBe('Enter name');
    });

    test('includes default value', () => {
      const schema = builder.fieldToSchema(makeField({ defaultValue: 'hello' }));
      expect(schema.default).toBe('hello');
    });

    test('includes $formField metadata', () => {
      const schema = builder.fieldToSchema(makeField({ id: 'f1', type: 'text', order: 3 }));
      expect(schema.$formField).toBeDefined();
      expect(schema.$formField.fieldId).toBe('f1');
      expect(schema.$formField.fieldType).toBe('text');
      expect(schema.$formField.order).toBe(3);
    });

    test('unknown type defaults to string', () => {
      const schema = builder.fieldToSchema(makeField({ type: 'custom_unknown' }));
      expect(schema.type).toBe('string');
    });
  });

  describe('validation rules → JSON Schema', () => {
    test('REGEX → pattern', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [{ ruleType: 'REGEX', expression: '^[A-Z]{2}-\\d{4}$', message: 'Invalid format' }],
      }));
      expect(schema.pattern).toBe('^[A-Z]{2}-\\d{4}$');
    });

    test('RANGE → minimum/maximum', () => {
      const schema = builder.fieldToSchema(makeField({
        type: 'number',
        validations: [{ ruleType: 'RANGE', expression: '1-100', message: 'Out of range' }],
      }));
      expect(schema.minimum).toBe(1);
      expect(schema.maximum).toBe(100);
    });

    test('LENGTH → minLength/maxLength', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [{ ruleType: 'LENGTH', expression: '3-50', message: 'Wrong length' }],
      }));
      expect(schema.minLength).toBe(3);
      expect(schema.maxLength).toBe(50);
    });

    test('ENUM → enum array (JSON)', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [{ ruleType: 'ENUM', expression: '["active","inactive","pending"]', message: '' }],
      }));
      expect(schema.enum).toEqual(['active', 'inactive', 'pending']);
    });

    test('ENUM → enum array (CSV fallback)', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [{ ruleType: 'ENUM', expression: 'red, green, blue', message: '' }],
      }));
      expect(schema.enum).toEqual(['red', 'green', 'blue']);
    });

    test('EXPRESSION → $validations array', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [{
          ruleType: 'EXPRESSION',
          expression: "size(value) >= 3",
          engine: 'PREDICATE',
          message: 'Too short',
        }],
      }));
      expect(schema.$validations).toHaveLength(1);
      expect(schema.$validations[0].expression).toBe('size(value) >= 3');
      expect(schema.$validations[0].engine).toBe('PREDICATE');
    });

    test('multiple validations applied together', () => {
      const schema = builder.fieldToSchema(makeField({
        validations: [
          { ruleType: 'LENGTH', expression: '1-100', message: '' },
          { ruleType: 'REGEX', expression: '^[A-Z]', message: '' },
          { ruleType: 'EXPRESSION', expression: "!value.contains('test')", engine: 'PREDICATE', message: 'No test' },
        ],
      }));
      expect(schema.minLength).toBe(1);
      expect(schema.maxLength).toBe(100);
      expect(schema.pattern).toBe('^[A-Z]');
      expect(schema.$validations).toHaveLength(1);
    });
  });

  describe('display conditions', () => {
    test('included in $formField metadata', () => {
      const schema = builder.fieldToSchema(makeField({
        conditions: [
          { id: 'c1', expression: "type == 'laptop'", engine: 'PREDICATE', effect: 'SHOW' },
        ],
      }));
      expect(schema.$formField.conditions).toHaveLength(1);
      expect(schema.$formField.conditions[0].expression).toBe("type == 'laptop'");
      expect(schema.$formField.conditions[0].effect).toBe('SHOW');
    });
  });

  describe('_parseRange()', () => {
    test('parses "min-max"', () => {
      expect(builder._parseRange('1-100')).toEqual({ min: 1, max: 100 });
    });

    test('parses ">=N"', () => {
      expect(builder._parseRange('>=5')).toEqual({ min: 5, max: null });
    });

    test('parses "<=N"', () => {
      expect(builder._parseRange('<=50')).toEqual({ min: null, max: 50 });
    });

    test('returns null for empty', () => {
      expect(builder._parseRange('')).toEqual({ min: null, max: null });
      expect(builder._parseRange(null)).toEqual({ min: null, max: null });
    });

    test('handles floats', () => {
      expect(builder._parseRange('0.5-99.9')).toEqual({ min: 0.5, max: 99.9 });
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TESTS: FormDefinitionService validation
// ────────────────────────────────────────────────────────────────────────────

describe('FormDefinitionService', () => {
  describe('validateFormData()', () => {
    const svc = new FormDefinitionService({});

    test('valid form passes', () => {
      const result = svc.validateFormData({
        name: 'Test Form',
        sections: [{
          title: 'Section 1',
          fields: [{ name: 'field1', type: 'text' }],
        }],
      });
      expect(result.valid).toBe(true);
    });

    test('requires name', () => {
      const result = svc.validateFormData({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    test('requires field name', () => {
      const result = svc.validateFormData({
        name: 'Test',
        sections: [{ fields: [{ type: 'text' }] }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('name is required');
    });

    test('requires field type', () => {
      const result = svc.validateFormData({
        name: 'Test',
        sections: [{ fields: [{ name: 'f1' }] }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('type is required');
    });

    test('form without sections is valid', () => {
      const result = svc.validateFormData({ name: 'Empty Form' });
      expect(result.valid).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TESTS: FIELD_TYPE_MAP completeness
// ────────────────────────────────────────────────────────────────────────────

describe('FIELD_TYPE_MAP', () => {
  test('covers all required field types', () => {
    const required = ['text', 'number', 'boolean', 'date', 'select', 'multiselect', 'file', 'autocomplete', 'table'];
    for (const type of required) {
      expect(FIELD_TYPE_MAP[type]).toBeDefined();
    }
  });
});
