'use strict';

/**
 * Section grouping (Altiora sectionId) + conditional "Other (please specify)"
 * materialization. Verifies slots carry their form section, that a sectionId link
 * to a choice field and the Other-option heuristic both gate a specify slot, and
 * that nothing is synthesized when no specify field exists.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { materializeSchema } = require('../altiora-schema-materializer');
const { evalTref } = require('../../contracts/tref-parser');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSnapshot = ajv.compile(require('../../contracts/schema-snapshot.schema.json'));

const mat = (fields, rules = []) => materializeSchema({
  schemaJson: { fields, rules }, serviceCode: 'EO-HR-SA-SS-ISP', ousId: 59, title: 'T',
});

describe('section grouping', () => {
  it('carries sectionId → section slug + label onto member slots', () => {
    const { snapshot } = mat([
      { id: 'sec1', label: 'Travel details', type: 'section' },
      { id: 'f1', label: 'Destination', type: 'text', required: true, sectionId: 'sec1' },
      { id: 'f2', label: 'Purpose', type: 'textarea', required: true, sectionId: 'sec1' },
      { id: 'sec2', label: 'Approval', type: 'section' },
      { id: 'f3', label: 'Approver', type: 'text', sectionId: 'sec2' },
    ]);
    expect(validateSnapshot(snapshot)).toBe(true);
    const bySlot = Object.fromEntries(snapshot.slots.map((s) => [s.promptHint, s]));
    expect(bySlot.Destination.section).toBe(bySlot.Purpose.section); // same section slug
    expect(bySlot.Destination.sectionLabel).toBe('Travel details');
    expect(bySlot.Approver.sectionLabel).toBe('Approval');
    expect(bySlot.Destination.section).not.toBe(bySlot.Approver.section);
  });

  it('leaves section-less inputs ungrouped', () => {
    const { snapshot } = mat([{ id: 'f1', label: 'Free', type: 'text' }]);
    expect(snapshot.slots[0].section).toBeUndefined();
  });
});

describe('Other (please specify) — explicit sectionId → choice link', () => {
  it('gates the linked slot on the choice\'s "Other" value (single-select)', () => {
    const { snapshot } = mat([
      { id: 'choice', label: 'Funding Type', type: 'select', required: true,
        options: ['XB', 'Trust Fund', 'Other (please specify)'] },
      // convention: this field's sectionId points at the CHOICE field, not a section
      { id: 'spec', label: 'Specify funding', type: 'text', required: true, sectionId: 'choice' },
    ]);
    expect(validateSnapshot(snapshot)).toBe(true);
    const spec = snapshot.slots.find((s) => s.promptHint === 'Specify funding');
    expect(spec.required).toBe(false);
    expect(spec.trefCondition).toContain('Other (please specify)');
    expect(spec.requiredWhen).toContain('Other (please specify)');
    // The gate evaluates correctly against draft state.
    expect(evalTref(spec.trefCondition, { slots: { fundingType: 'Other (please specify)' } })).toBe(true);
    expect(evalTref(spec.trefCondition, { slots: { fundingType: 'XB' } })).toBe(false);
    expect(spec.dependsOn).toContain('fundingType');
  });

  it('uses contains for a multi-select parent', () => {
    const { snapshot } = mat([
      { id: 'choice', label: 'Docs', type: 'checklist', options: ['A', 'B', 'Other'] },
      { id: 'spec', label: 'Specify other', type: 'text', sectionId: 'choice' },
    ]);
    const spec = snapshot.slots.find((s) => s.promptHint === 'Specify other');
    expect(spec.trefCondition).toContain('contains');
    expect(evalTref(spec.trefCondition, { slots: { docs: ['A', 'Other'] } })).toBe(true);
    expect(evalTref(spec.trefCondition, { slots: { docs: ['A', 'B'] } })).toBe(false);
  });
});

describe('Other (please specify) — heuristic within a section', () => {
  it('gates a free-text "specify" sibling in the same section', () => {
    const { snapshot } = mat([
      { id: 'sec', label: 'Funding', type: 'section' },
      { id: 'choice', label: 'Funding Type', type: 'select', required: true,
        options: ['XB', 'Trust Fund', 'Other'], sectionId: 'sec' },
      { id: 'spec', label: 'If other, please specify', type: 'text', sectionId: 'sec' },
    ]);
    expect(validateSnapshot(snapshot)).toBe(true);
    const spec = snapshot.slots.find((s) => s.promptHint === 'If other, please specify');
    expect(spec.required).toBe(false);
    expect(spec.requiredWhen).toContain("== 'Other'");
    expect(evalTref(spec.trefCondition, { slots: { fundingType: 'Other' } })).toBe(true);
  });

  it('does NOT gate and does NOT synthesize when there is no specify sibling', () => {
    const { snapshot } = mat([
      { id: 'sec', label: 'Funding', type: 'section' },
      { id: 'choice', label: 'Funding Type', type: 'select', options: ['XB', 'Other'], sectionId: 'sec' },
      { id: 'other', label: 'WBSE code', type: 'text', sectionId: 'sec' }, // not a specify field
    ]);
    // exactly two input slots, none conditional, nothing new created
    expect(snapshot.slots).toHaveLength(2);
    expect(snapshot.slots.every((s) => !s.trefCondition)).toBe(true);
  });

  it('respects FLOWDESK_OTHER_SPECIFY_HEURISTIC=0 (disabled)', () => {
    const prev = process.env.FLOWDESK_OTHER_SPECIFY_HEURISTIC;
    process.env.FLOWDESK_OTHER_SPECIFY_HEURISTIC = '0';
    try {
      const { snapshot } = mat([
        { id: 'sec', label: 'Funding', type: 'section' },
        { id: 'choice', label: 'Funding Type', type: 'select', options: ['XB', 'Other'], sectionId: 'sec' },
        { id: 'spec', label: 'Please specify', type: 'text', sectionId: 'sec' },
      ]);
      const spec = snapshot.slots.find((s) => s.promptHint === 'Please specify');
      expect(spec.trefCondition).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.FLOWDESK_OTHER_SPECIFY_HEURISTIC;
      else process.env.FLOWDESK_OTHER_SPECIFY_HEURISTIC = prev;
    }
  });
});
