/**
 * Integration test: SR_HardwareRequest STRUCTURAL + CONSTRAINT → Form pipeline
 */

const { createStructuralGraph, createConstraintGraph } = require('../../db/seeds/flowdesk-sr-hardware-request.seed');
const { structuralToJsonSchema } = require('../../compilers/structural-to-jsonschema');
const { constraintCompiler } = require('../../compilers/constraint-compiler');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('SR_HardwareRequest Integration', () => {
  let structural, constraint, jsonSchema, frontendBundle, validate;

  beforeAll(() => {
    structural = createStructuralGraph();
    constraint = createConstraintGraph(structural.graphId);
    const baseSchema = structuralToJsonSchema.compile(structural);
    jsonSchema = constraintCompiler.compileToJsonSchema(constraint, baseSchema);
    frontendBundle = constraintCompiler.compileForFrontend(constraint, structural);

    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(jsonSchema);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STRUCTURAL GRAPH VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('STRUCTURAL graph', () => {
    test('has correct type metadata', () => {
      expect(structural.graphType).toBe('STRUCTURAL');
      expect(structural.graphDimension).toBe('DATA');
      expect(structural.namespace).toBe('FLOWDESK');
    });

    test('has all required fields', () => {
      const names = structural.nodes.filter(n => n.nodeType !== 'ROOT').map(n => n.name);
      expect(names).toContain('requestorName');
      expect(names).toContain('requestorEmail');
      expect(names).toContain('forWhom');
      expect(names).toContain('beneficiaryName');
      expect(names).toContain('deliveryLocation');
      expect(names).toContain('equipmentType');
      expect(names).toContain('quantity');
      expect(names).toContain('priority');
      expect(names).toContain('justification');
      expect(names).toContain('specialRequirements');
    });

    test('has i18n labels (en + fr)', () => {
      const forWhom = structural.nodes.find(n => n.name === 'forWhom');
      expect(forWhom.label.en).toBeDefined();
      expect(forWhom.label.fr).toBeDefined();

      const justification = structural.nodes.find(n => n.name === 'justification');
      expect(justification.label.en).toBe('Business Justification');
      expect(justification.label.fr).toBe('Justification');
    });

    test('has UN duty stations in deliveryLocation enum', () => {
      const delivery = structural.nodes.find(n => n.name === 'deliveryLocation');
      expect(delivery.enumValues).toContain('UNHQ_NY');
      expect(delivery.enumValues).toContain('UNOG_Geneva');
      expect(delivery.enumValues).toContain('OTHER');
    });

    test('has uiHints on fields', () => {
      const requestorName = structural.nodes.find(n => n.name === 'requestorName');
      expect(requestorName.uiHints.readonly).toBe(true);
      expect(requestorName.uiHints.width).toBe('half');

      const forWhom = structural.nodes.find(n => n.name === 'forWhom');
      expect(forWhom.uiHints.widget).toBe('radio');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CONSTRAINT GRAPH VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('CONSTRAINT rules', () => {
    test('has correct type metadata', () => {
      expect(constraint.graphType).toBe('CONSTRAINT');
      expect(constraint.graphDimension).toBe('GOVERNANCE');
      expect(constraint.structuralGraphId).toBe(structural.graphId);
    });

    test('has required fields in JSON Schema', () => {
      expect(jsonSchema.required).toContain('forWhom');
      expect(jsonSchema.required).toContain('equipmentType');
      expect(jsonSchema.required).toContain('priority');
      expect(jsonSchema.required).toContain('justification');
    });

    test('has justification length constraints', () => {
      expect(jsonSchema.properties.justification.minLength).toBe(50);
      expect(jsonSchema.properties.justification.maxLength).toBe(2000);
    });

    test('has quantity range', () => {
      expect(jsonSchema.properties.quantity.minimum).toBe(1);
      expect(jsonSchema.properties.quantity.maximum).toBe(10);
    });

    test('has asset tag pattern', () => {
      expect(jsonSchema.properties.currentEquipmentAssetTag.pattern).toBe('^[A-Z]{2}-[0-9]{5}$');
    });

    test('has For-Whom visibility rules', () => {
      const vis = frontendBundle.visibilityRules;
      expect(vis.beneficiaryName).toBeDefined();
      expect(vis.beneficiaryName.condition.field).toBe('forWhom');
      expect(vis.beneficiaryName.condition.value).toBe('other_staff');

      expect(vis.beneficiaryIndex).toBeDefined();
      expect(vis.beneficiaryEmail).toBeDefined();
      expect(vis.deliveryLocation).toBeDefined();
      expect(vis.otherLocationDetails).toBeDefined();
      expect(vis.otherEquipmentDescription).toBeDefined();
    });

    test('generates Zod schema with cross-field refinement', () => {
      const zod = frontendBundle.zodSchema;
      expect(zod).toContain('z.object');
      expect(zod).toContain('.refine');
    });

    test('has i18n error messages', () => {
      const msgs = frontendBundle.errorMessages;
      expect(msgs.justification?.MIN_LENGTH?.en).toContain('50 characters');
      expect(msgs.justification?.MIN_LENGTH?.fr).toContain('50 caracteres');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AJV FORM VALIDATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('Form validation', () => {
    test('accepts valid self_current request', () => {
      expect(validate({
        requestorName: 'John Smith',
        requestorEmail: 'john.smith@un.org',
        requestorIndex: 'JS12345',
        requestorDutyStation: 'UNHQ New York',
        forWhom: 'self_current',
        equipmentType: 'laptop',
        quantity: 1,
        priority: 'medium',
        justification: 'My current laptop is 5 years old and no longer meets the minimum specifications for running required UN software applications efficiently.',
      })).toBe(true);
    });

    test('accepts valid other_staff request with beneficiary', () => {
      expect(validate({
        requestorName: 'Jane Doe',
        requestorEmail: 'jane.doe@un.org',
        forWhom: 'other_staff',
        beneficiaryName: 'Bob Wilson',
        beneficiaryIndex: 'BW67890',
        beneficiaryEmail: 'bob.wilson@un.org',
        deliveryLocation: 'UNOG_Geneva',
        equipmentType: 'monitor',
        quantity: 2,
        priority: 'low',
        justification: 'Replacing outdated monitors for the Geneva team. Current monitors are 8 years old and have significant color degradation.',
      })).toBe(true);
    });

    test('accepts self_different with delivery location', () => {
      expect(validate({
        forWhom: 'self_different',
        deliveryLocation: 'UNON_Nairobi',
        equipmentType: 'headset',
        quantity: 1,
        priority: 'medium',
        justification: 'Transferring to Nairobi office next month and need equipment at the new location for day-one productivity.',
      })).toBe(true);
    });

    test('rejects missing required fields', () => {
      expect(validate({ requestorName: 'Test' })).toBe(false);
      const missingFields = validate.errors
        .filter(e => e.keyword === 'required')
        .map(e => e.params.missingProperty);
      expect(missingFields).toContain('forWhom');
      expect(missingFields).toContain('equipmentType');
    });

    test('rejects short justification', () => {
      expect(validate({
        forWhom: 'self_current',
        equipmentType: 'keyboard',
        priority: 'low',
        justification: 'Too short',
      })).toBe(false);
      expect(validate.errors.some(e => e.keyword === 'minLength')).toBe(true);
    });

    test('rejects quantity > 10', () => {
      expect(validate({
        forWhom: 'self_current',
        equipmentType: 'mouse',
        quantity: 15,
        priority: 'low',
        justification: 'Need mice for the entire team in the New York office for the upcoming workstation refresh.',
      })).toBe(false);
      expect(validate.errors.some(e => e.keyword === 'maximum')).toBe(true);
    });

    test('rejects invalid asset tag format', () => {
      expect(validate({
        forWhom: 'self_current',
        equipmentType: 'laptop',
        priority: 'medium',
        justification: 'Replacing old equipment that has reached end-of-life and is no longer supported by vendor.',
        currentEquipmentAssetTag: 'INVALID',
      })).toBe(false);
      expect(validate.errors.some(e => e.keyword === 'pattern')).toBe(true);
    });

    test('accepts valid asset tag NY-12345', () => {
      expect(validate({
        forWhom: 'self_current',
        equipmentType: 'laptop',
        priority: 'medium',
        justification: 'Replacing old equipment that has reached end-of-life and is no longer supported by the vendor.',
        currentEquipmentAssetTag: 'NY-12345',
      })).toBe(true);
    });

    test('rejects invalid email format', () => {
      expect(validate({
        forWhom: 'self_current',
        requestorEmail: 'not-an-email',
        equipmentType: 'laptop',
        priority: 'medium',
        justification: 'Test justification that is sufficiently long to meet the fifty character minimum requirement.',
      })).toBe(false);
      expect(validate.errors.some(e => e.keyword === 'format')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FULL PIPELINE: JSON SCHEMA + FRONTEND BUNDLE
  // ═══════════════════════════════════════════════════════════════════════

  describe('Full compilation pipeline', () => {
    test('JSON Schema has all properties', () => {
      const propNames = Object.keys(jsonSchema.properties);
      expect(propNames.length).toBeGreaterThanOrEqual(16);
    });

    test('frontend bundle has all sections', () => {
      expect(frontendBundle.zodSchema).toBeDefined();
      expect(frontendBundle.visibilityRules).toBeDefined();
      expect(frontendBundle.computedFields).toBeDefined();
      expect(frontendBundle.asyncValidations).toBeDefined();
      expect(frontendBundle.errorMessages).toBeDefined();
    });

    test('i18n compilation works for French', () => {
      const frSchema = structuralToJsonSchema.compile(structural, { locale: 'fr' });
      expect(frSchema.properties.forWhom.title).toBe('Pour qui est cette demande?');
      expect(frSchema.properties.justification.title).toBe('Justification');
    });
  });
});
