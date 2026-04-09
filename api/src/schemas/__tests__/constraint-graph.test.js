/**
 * Tests for CONSTRAINT graph schema, builder, and compiler.
 */

const { ConstraintGraphBuilder, ConstraintRuleType } = require('../constraint-graph.schema');
const { StructuralGraphBuilder, FieldDataType } = require('../structural-graph.schema');
const { constraintCompiler } = require('../../compilers/constraint-compiler');
const { structuralToJsonSchema } = require('../../compilers/structural-to-jsonschema');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// ── Test STRUCTURAL base ──────────────────────────────────────────────────

function createTestStructural() {
  return new StructuralGraphBuilder('TestForm')
    .addField('firstName', FieldDataType.STRING)
    .addField('lastName', FieldDataType.STRING)
    .addField('email', FieldDataType.EMAIL)
    .addField('age', FieldDataType.INTEGER)
    .addField('password', FieldDataType.STRING)
    .addField('confirmPassword', FieldDataType.STRING)
    .addField('phone', FieldDataType.STRING)
    .addField('alternatePhone', FieldDataType.STRING)
    .addEnum('role', ['user', 'admin', 'moderator'])
    .build();
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ConstraintGraphBuilder', () => {
  test('creates required rules', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .required('firstName')
      .required('email')
      .build();

    expect(c.graphType).toBe('CONSTRAINT');
    expect(c.graphDimension).toBe('GOVERNANCE');
    expect(c.structuralGraphId).toBe(s.graphId);
    expect(c.nodes.length).toBe(2);
    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.REQUIRED);
  });

  test('creates minLength/maxLength rules', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .minLength('password', 8)
      .maxLength('password', 100)
      .build();

    const min = c.nodes.find(n => n.ruleType === ConstraintRuleType.MIN_LENGTH);
    const max = c.nodes.find(n => n.ruleType === ConstraintRuleType.MAX_LENGTH);
    expect(min.value).toBe(8);
    expect(max.value).toBe(100);
  });

  test('creates pattern rule', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .pattern('phone', '^\\+?[0-9]{7,15}$')
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.PATTERN);
    expect(c.nodes[0].pattern).toBe('^\\+?[0-9]{7,15}$');
  });

  test('creates range rules', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .range('age', 18, 120)
      .build();

    expect(c.nodes.length).toBe(2); // MIN + MAX
    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.MIN);
    expect(c.nodes[0].value).toBe(18);
    expect(c.nodes[1].ruleType).toBe(ConstraintRuleType.MAX);
    expect(c.nodes[1].value).toBe(120);
  });

  test('creates conditional required rule', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .requiredIf('phone', { role: 'admin' })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.REQUIRED_IF);
    expect(c.nodes[0].condition.field).toBe('role');
    expect(c.nodes[0].condition.value).toBe('admin');
  });

  test('creates visibility rule', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .visibleIf('alternatePhone', { phone: '' })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.VISIBLE_IF);
    expect(c.nodes[0].frontendOnly).toBe(true);
  });

  test('creates disabled rule', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .disabledIf('email', { role: 'user' })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.DISABLED_IF);
    expect(c.nodes[0].frontendOnly).toBe(true);
  });

  test('creates cross-field comparison', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .compare('password', '===', 'confirmPassword', {
        errorMessage: { en: 'Passwords must match' },
      })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.EQUALS);
    expect(c.nodes[0].targetFields).toContain('password');
    expect(c.nodes[0].targetFields).toContain('confirmPassword');
  });

  test('creates atLeastOne rule', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .atLeastOne(['phone', 'alternatePhone', 'email'])
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.AT_LEAST_ONE);
    expect(c.nodes[0].targetFields.length).toBe(3);
  });

  test('creates computed field', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .computed('fullName', 'firstName + " " + lastName')
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.COMPUTED);
    expect(c.nodes[0].expression).toBe('firstName + " " + lastName');
  });

  test('creates async validation', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .asyncValidate('email', { endpoint: '/api/check-email', debounceMs: 500 })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.ASYNC_VALIDATE);
    expect(c.nodes[0].asyncConfig.endpoint).toBe('/api/check-email');
    expect(c.nodes[0].asyncConfig.debounceMs).toBe(500);
  });

  test('creates unique constraint', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .unique('email', { endpoint: '/api/check-unique' })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.UNIQUE);
    expect(c.nodes[0].backendOnly).toBe(true);
  });

  test('creates custom validation', () => {
    const s = createTestStructural();
    const c = new ConstraintGraphBuilder('Test', s.graphId)
      .custom(['age', 'role'], 'age >= 21 || role !== "admin"', {
        errorMessage: { en: 'Admins must be at least 21' },
      })
      .build();

    expect(c.nodes[0].ruleType).toBe(ConstraintRuleType.CUSTOM);
    expect(c.nodes[0].targetFields).toEqual(['age', 'role']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPILER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ConstraintCompiler', () => {
  test('compiles to JSON Schema with required fields', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('firstName')
      .required('email')
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const result = constraintCompiler.compileToJsonSchema(constraint, base);

    expect(result.required).toContain('firstName');
    expect(result.required).toContain('email');
  });

  test('compiles to JSON Schema with length constraints', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .minLength('password', 8)
      .maxLength('password', 100)
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const result = constraintCompiler.compileToJsonSchema(constraint, base);

    expect(result.properties.password.minLength).toBe(8);
    expect(result.properties.password.maxLength).toBe(100);
  });

  test('compiles to JSON Schema with numeric range', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .range('age', 18, 120)
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const result = constraintCompiler.compileToJsonSchema(constraint, base);

    expect(result.properties.age.minimum).toBe(18);
    expect(result.properties.age.maximum).toBe(120);
  });

  test('compiles to JSON Schema with pattern', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .pattern('phone', '^\\+[0-9]+$')
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const result = constraintCompiler.compileToJsonSchema(constraint, base);

    expect(result.properties.phone.pattern).toBe('^\\+[0-9]+$');
  });

  test('compiles to Zod schema string', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('firstName')
      .minLength('firstName', 2)
      .maxLength('firstName', 50)
      .build();

    const zod = constraintCompiler.compileToZod(constraint, structural);

    expect(zod).toContain('z.object');
    expect(zod).toContain('firstName');
    expect(zod).toContain('.min(2');
    expect(zod).toContain('.max(50');
  });

  test('compiles Zod with cross-field refinement', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .compare('password', '===', 'confirmPassword', {
        errorMessage: { en: 'Passwords must match' },
      })
      .build();

    const zod = constraintCompiler.compileToZod(constraint, structural);

    expect(zod).toContain('.refine');
    expect(zod).toContain('Passwords must match');
  });

  test('compiles visibility rules', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .visibleIf('alternatePhone', { role: 'admin' })
      .disabledIf('email', { role: 'user' })
      .build();

    const vis = constraintCompiler.compileVisibilityRules(constraint);

    expect(vis.alternatePhone.type).toBe('visibility');
    expect(vis.alternatePhone.condition.field).toBe('role');
    expect(vis.email.type).toBe('disabled');
  });

  test('compiles computed fields with dependencies', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .computed('fullName', 'firstName + " " + lastName')
      .build();

    const computed = constraintCompiler.compileComputedFields(constraint);

    expect(computed.fullName.expression).toBe('firstName + " " + lastName');
    expect(computed.fullName.dependencies).toContain('firstName');
    expect(computed.fullName.dependencies).toContain('lastName');
  });

  test('compiles full frontend bundle', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('firstName')
      .minLength('password', 8)
      .visibleIf('phone', { role: 'admin' })
      .computed('fullName', 'firstName + " " + lastName')
      .build();

    const bundle = constraintCompiler.compileForFrontend(constraint, structural);

    expect(bundle.zodSchema).toContain('z.object');
    expect(Object.keys(bundle.visibilityRules)).toContain('phone');
    expect(Object.keys(bundle.computedFields)).toContain('fullName');
    expect(bundle.errorMessages).toBeDefined();
  });

  test('compiles backend bundle', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('email')
      .unique('email', { endpoint: '/api/check' })
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const bundle = constraintCompiler.compileForBackend(constraint, base);

    expect(bundle.jsonSchema.required).toContain('email');
    expect(bundle.asyncValidations.length).toBe(1);
    expect(bundle.asyncValidations[0].type).toBe(ConstraintRuleType.UNIQUE);
  });

  test('extracts async validation rules', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .asyncValidate('email', { endpoint: '/api/validate-email', debounceMs: 300 })
      .unique('phone', { endpoint: '/api/check-phone' })
      .build();

    const bundle = constraintCompiler.compileForFrontend(constraint, structural);

    expect(bundle.asyncValidations.length).toBe(2);
    expect(bundle.asyncValidations[0].config.endpoint).toBe('/api/validate-email');
    expect(bundle.asyncValidations[1].type).toBe(ConstraintRuleType.UNIQUE);
  });

  test('extracts error messages per field per rule', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('firstName', { errorMessage: { en: 'Name is required', fr: 'Le nom est obligatoire' } })
      .minLength('firstName', 2, { errorMessage: { en: 'Too short' } })
      .build();

    const bundle = constraintCompiler.compileForFrontend(constraint, structural);

    expect(bundle.errorMessages.firstName[ConstraintRuleType.REQUIRED].en).toBe('Name is required');
    expect(bundle.errorMessages.firstName[ConstraintRuleType.REQUIRED].fr).toBe('Le nom est obligatoire');
    expect(bundle.errorMessages.firstName[ConstraintRuleType.MIN_LENGTH].en).toBe('Too short');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AJV INTEGRATION: STRUCTURAL + CONSTRAINT → VALIDATED DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('AJV Integration: STRUCTURAL + CONSTRAINT', () => {
  let ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
  });

  test('STRUCTURAL base + CONSTRAINT required = enforced', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .required('firstName')
      .required('email')
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const schema = constraintCompiler.compileToJsonSchema(constraint, base);
    const validate = ajv.compile(schema);

    expect(validate({ firstName: 'Alice', email: 'alice@un.org' })).toBe(true);
    expect(validate({ email: 'alice@un.org' })).toBe(false); // missing firstName
    expect(validate({ firstName: 'Alice' })).toBe(false);     // missing email
  });

  test('STRUCTURAL base + CONSTRAINT length = enforced', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .minLength('password', 8)
      .maxLength('password', 20)
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const schema = constraintCompiler.compileToJsonSchema(constraint, base);
    const validate = ajv.compile(schema);

    expect(validate({ password: 'abcdefgh' })).toBe(true);     // 8 chars = OK
    expect(validate({ password: 'short' })).toBe(false);         // 5 chars < 8
    expect(validate({ password: 'a'.repeat(25) })).toBe(false);  // 25 > 20
  });

  test('STRUCTURAL base + CONSTRAINT range = enforced', () => {
    const structural = createTestStructural();
    const constraint = new ConstraintGraphBuilder('Test', structural.graphId)
      .range('age', 18, 120)
      .build();

    const base = structuralToJsonSchema.compile(structural);
    const schema = constraintCompiler.compileToJsonSchema(constraint, base);
    const validate = ajv.compile(schema);

    expect(validate({ age: 25 })).toBe(true);
    expect(validate({ age: 15 })).toBe(false);  // < 18
    expect(validate({ age: 150 })).toBe(false);  // > 120
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REALISTIC UN FORM TEST
// ═══════════════════════════════════════════════════════════════════════════

describe('Realistic UN Service Request Form', () => {
  test('FlowDesk Hardware Request: STRUCTURAL + CONSTRAINT pipeline', () => {
    // STRUCTURAL
    const structural = new StructuralGraphBuilder('SR_HardwareRequest', { namespace: 'FLOWDESK' })
      .addField('requestorName', FieldDataType.STRING, { label: { en: 'Requestor Name' } })
      .addField('requestorEmail', FieldDataType.EMAIL)
      .addField('requestorIndex', FieldDataType.STRING, { label: { en: 'Staff Index' } })
      .addEnum('requestFor', ['self', 'other'], { label: { en: 'Request For' } })
      .addField('beneficiaryIndex', FieldDataType.STRING)
      .addEnum('equipmentType', ['laptop', 'monitor', 'keyboard', 'mouse', 'headset', 'other'])
      .addField('otherEquipmentDescription', FieldDataType.TEXT)
      .addField('justification', FieldDataType.TEXT)
      .addEnum('priority', ['low', 'medium', 'high', 'critical'])
      .addField('estimatedCost', FieldDataType.NUMBER)
      .build();

    // CONSTRAINT
    const constraint = new ConstraintGraphBuilder('SR_HardwareRequest_Constraints', structural.graphId, { namespace: 'FLOWDESK' })
      .required('requestorName')
      .required('requestorEmail')
      .required('requestFor')
      .required('equipmentType')
      .required('justification')
      .required('priority')
      .requiredIf('beneficiaryIndex', { requestFor: 'other' })
      .requiredIf('otherEquipmentDescription', { equipmentType: 'other' })
      .visibleIf('beneficiaryIndex', { requestFor: 'other' })
      .visibleIf('otherEquipmentDescription', { equipmentType: 'other' })
      .minLength('justification', 50, {
        errorMessage: { en: 'Justification must be at least 50 characters', fr: 'La justification doit comporter au moins 50 caracteres' },
      })
      .maxLength('justification', 2000)
      .range('estimatedCost', 0, 50000)
      .build();

    // Compile
    const baseSchema = structuralToJsonSchema.compile(structural);
    const constrainedSchema = constraintCompiler.compileToJsonSchema(constraint, baseSchema);
    const frontendBundle = constraintCompiler.compileForFrontend(constraint, structural);

    // Verify JSON Schema
    expect(constrainedSchema.required).toContain('requestorName');
    expect(constrainedSchema.required).toContain('requestorEmail');
    expect(constrainedSchema.required).toContain('equipmentType');
    expect(constrainedSchema.properties.justification.minLength).toBe(50);
    expect(constrainedSchema.properties.justification.maxLength).toBe(2000);
    expect(constrainedSchema.properties.estimatedCost.minimum).toBe(0);
    expect(constrainedSchema.properties.estimatedCost.maximum).toBe(50000);

    // Verify visibility
    expect(frontendBundle.visibilityRules.beneficiaryIndex).toBeDefined();
    expect(frontendBundle.visibilityRules.beneficiaryIndex.condition.field).toBe('requestFor');
    expect(frontendBundle.visibilityRules.beneficiaryIndex.condition.value).toBe('other');

    expect(frontendBundle.visibilityRules.otherEquipmentDescription).toBeDefined();
    expect(frontendBundle.visibilityRules.otherEquipmentDescription.condition.field).toBe('equipmentType');

    // Verify Zod
    expect(frontendBundle.zodSchema).toContain('z.object');
    expect(frontendBundle.zodSchema).toContain('requestorName');

    // Verify error messages
    expect(frontendBundle.errorMessages.justification[ConstraintRuleType.MIN_LENGTH].en)
      .toBe('Justification must be at least 50 characters');
    expect(frontendBundle.errorMessages.justification[ConstraintRuleType.MIN_LENGTH].fr)
      .toBe('La justification doit comporter au moins 50 caracteres');
  });
});
