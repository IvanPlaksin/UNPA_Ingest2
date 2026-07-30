'use strict';

/**
 * I-4a — Altiora SchemaJson → SchemaSnapshot.
 *
 * REAL_SCHEMA is the verbatim form of Altiora dev ousId 59
 * (EO-HR-SA-SS-ISP), captured from the live API — it is the golden input, so the
 * mapper is tested against what Altiora actually emits rather than a guess.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  materializeSchema, camelSlotId, mapType, quoteLiteral, conditionsToTref, lovDescriptorOf,
} = require('../altiora-schema-materializer');
const { evalTref } = require('../../contracts/tref-parser');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSnapshot = ajv.compile(require('../../contracts/schema-snapshot.schema.json'));

// ── verbatim live sample (ousId 59) ──
const REAL_SCHEMA = {
  tabs: [],
  fields: [
    { id: 'field_1781818686087', label: 'Details of Request / Enquiry', type: 'section', required: false },
    { id: 'field_1781818874087', label: 'Subject / Tile', type: 'text', required: true, sectionId: 'field_1781818686087', colSpan: 2 },
    { id: 'field_1781818885795', label: ' Description/additional notes', type: 'textarea', required: true, sectionId: 'field_1781818686087', placeholder: 'Please describe your request or enquiry in detail' },
    { id: 'field_1781818913149', label: 'Reference / ticket number (if follow-up)', type: 'text', required: false, sectionId: 'field_1781818686087' },
    { id: 'field_1781818915129', label: 'Date of previous submission (if any)', type: 'date', required: false, sectionId: 'field_1781818686087' },
    { id: 'field_1781818948791', label: 'Supporting Documents', type: 'section', required: false },
    { id: 'field_1781818964641', label: 'Are supporting documents attached?', type: 'options_group', required: true, options: ['Yes - please list below', 'No'], sectionId: 'field_1781818948791' },
    { id: 'field_1781819024511', label: 'If yes, list documents attached', type: 'textarea', required: false, sectionId: 'field_1781818948791', hidden: true },
  ],
  rules: [
    {
      id: 'rule_1781819056868', name: 'Show list docs', enabled: true,
      trigger: { field: 'field_1781818964641', event: 'change' },
      conditions: { logic: 'AND', checks: [{ field: 'field_1781818964641', operator: 'equals', value: 'Yes - please list below' }] },
      actions: [{ type: 'show_field', targetField: 'field_1781819024511' }],
    },
  ],
};

const base = { serviceCode: 'EO-HR-SA-SS-ISP', ousId: 59, title: 'Internal Support', approvalRequired: false };

describe('I-4a: helpers', () => {
  test('camelSlotId → schema pattern ^[a-z][a-zA-Z0-9]*$, unique', () => {
    const used = new Set();
    expect(camelSlotId('Subject / Tile', 'f1', used)).toBe('subjectTile');
    expect(camelSlotId(' Description/additional notes', 'f2', used)).toBe('descriptionAdditionalNotes');
    expect(camelSlotId('Subject / Tile', 'f3', used)).toBe('subjectTile2'); // collision
    expect(camelSlotId('', 'field_99', used)).toMatch(/^[a-z][a-zA-Z0-9]*$/); // empty label → id fallback
    expect(camelSlotId('123 numeric first', 'f4', used)).toMatch(/^[a-z][a-zA-Z0-9]*$/);
  });

  test('mapType covers the real types + falls back sanely', () => {
    expect(mapType({ type: 'text' })).toBe('string');
    expect(mapType({ type: 'textarea' })).toBe('text');
    expect(mapType({ type: 'date' })).toBe('date');
    expect(mapType({ type: 'options_group' })).toBe('enum');
    expect(mapType({ type: 'number' })).toBe('number');
    expect(mapType({ type: 'weird', options: ['a'] })).toBe('enum'); // unknown but has options
    expect(mapType({ type: 'weird' })).toBe('string');
  });

  test('quoteLiteral handles apostrophes (tref has no escapes) and refuses the impossible', () => {
    expect(quoteLiteral('plain')).toBe("'plain'");
    expect(quoteLiteral("Driver's license")).toBe('"Driver\'s license"'); // falls back to double
    expect(quoteLiteral(`he said "hi" to O'Brien`)).toBeNull(); // both kinds → unencodable
    expect(quoteLiteral(5)).toBe('5');
    expect(quoteLiteral(true)).toBe('true');
  });

  test('conditionsToTref honours AND/OR and refuses partial conditions', () => {
    const m = new Map([['fa', 'alpha'], ['fb', 'beta']]);
    expect(conditionsToTref({ logic: 'AND', checks: [{ field: 'fa', operator: 'equals', value: 'x' }] }, m))
      .toBe("slots.alpha == 'x'");
    expect(conditionsToTref({ logic: 'OR', checks: [{ field: 'fa', operator: 'equals', value: 'x' }, { field: 'fb', operator: 'not_equals', value: 'y' }] }, m))
      .toBe("(slots.alpha == 'x') || (slots.beta != 'y')");
    // a check on a field we never materialized ⇒ drop the whole rule, never half of it
    expect(conditionsToTref({ checks: [{ field: 'unknown', operator: 'equals', value: 'x' }] }, m)).toBeNull();
  });
});

describe('I-4a: materializeSchema on the REAL ousId-59 form', () => {
  const { snapshot, warnings } = materializeSchema({ ...base, schemaJson: REAL_SCHEMA, contentHash: 'abc' });

  test('validates against the SchemaSnapshot contract', () => {
    const ok = validateSnapshot(snapshot);
    if (!ok) throw new Error(JSON.stringify(validateSnapshot.errors, null, 1));
    expect(ok).toBe(true);
    expect(warnings).toEqual([]);
  });

  test('drops layout sections — they are not questions', () => {
    expect(snapshot.slots).toHaveLength(6); // 8 fields − 2 sections
    expect(snapshot.slots.map((s) => s.altioraFieldId)).not.toContain('field_1781818686087');
  });

  test('maps types + options from the real field set', () => {
    const by = Object.fromEntries(snapshot.slots.map((s) => [s.slotId, s]));
    expect(by.subjectTile.type).toBe('string');
    expect(by.descriptionAdditionalNotes.type).toBe('text');
    expect(by.dateOfPreviousSubmissionIfAny.type).toBe('date');
    expect(by.areSupportingDocumentsAttached.type).toBe('enum');
    expect(by.areSupportingDocumentsAttached.presentOptions).toEqual([
      { value: 'Yes - please list below', label: 'Yes - please list below' },
      { value: 'No', label: 'No' },
    ]);
  });

  test('preserves Altiora ids for I-7 FormDataJson (both directions)', () => {
    expect(snapshot.metadata.altioraOusId).toBe(59);
    expect(snapshot.metadata.contentHash).toBe('abc');
    expect(snapshot.metadata.fieldIdMapping.subjectTile).toBe('field_1781818874087');
    for (const s of snapshot.slots) {
      expect(snapshot.metadata.fieldIdMapping[s.slotId]).toBe(s.altioraFieldId);
    }
  });

  test('compiles the show_field rule into a tref that actually evaluates', () => {
    const target = snapshot.slots.find((s) => s.slotId === 'ifYesListDocumentsAttached');
    const cond = "slots.areSupportingDocumentsAttached == 'Yes - please list below'";
    expect(target.trefCondition).toBe(cond);
    // rule-revealed ⇒ required-when-shown (ratified), so the interpreter asks it
    expect(target.requiredWhen).toBe(cond);
    expect(target.required).toBe(false);
    expect(evalTref(target.trefCondition, { slots: { areSupportingDocumentsAttached: 'Yes - please list below' } })).toBe(true);
    expect(evalTref(target.trefCondition, { slots: { areSupportingDocumentsAttached: 'No' } })).toBe(false);
  });

  test('single phase, author order preserved (ratified: order = fields[] index)', () => {
    expect(snapshot.phases).toEqual(['detail']);
    expect(snapshot.slots.every((s) => s.phase === 'detail')).toBe(true);
    expect(snapshot.slots[0].slotId).toBe('subjectTile');
  });
});

describe('I-4a: rule actions beyond show_field', () => {
  const form = (rules, extra = {}) => ({
    fields: [
      { id: 'a', label: 'Trigger', type: 'options_group', required: true, options: ['yes', 'no'] },
      { id: 'b', label: 'Target', type: 'text', required: true, ...extra },
    ],
    rules,
  });
  const rule = (actions, op = 'equals', value = 'yes') => ([{
    id: 'r1', enabled: true,
    conditions: { logic: 'AND', checks: [{ field: 'a', operator: op, value }] },
    actions,
  }]);

  test('require_field → requiredWhen, and the slot stops being unconditionally required', () => {
    const { snapshot } = materializeSchema({ ...base, schemaJson: form(rule([{ type: 'require_field', targetField: 'b' }])) });
    const t = snapshot.slots.find((s) => s.slotId === 'target');
    expect(t.requiredWhen).toBe("slots.trigger == 'yes'");
    expect(t.required).toBe(false);
  });

  test('hide_field → negated condition', () => {
    const { snapshot } = materializeSchema({ ...base, schemaJson: form(rule([{ type: 'hide_field', targetField: 'b' }])) });
    const t = snapshot.slots.find((s) => s.slotId === 'target');
    expect(t.trefCondition).toBe("!(slots.trigger == 'yes')");
    expect(evalTref(t.trefCondition, { slots: { trigger: 'no' } })).toBe(true);
  });

  test('filter_options → optionFilters entry', () => {
    const { snapshot } = materializeSchema({ ...base, schemaJson: form(rule([{ type: 'filter_options', targetField: 'b', include: ['x', 'y'] }])) });
    const t = snapshot.slots.find((s) => s.slotId === 'target');
    expect(t.optionFilters).toEqual([{ condition: "slots.trigger == 'yes'", include: ['x', 'y'] }]);
  });

  test('two show rules on one target OR-combine', () => {
    const rules = [
      { id: 'r1', enabled: true, conditions: { checks: [{ field: 'a', operator: 'equals', value: 'yes' }] }, actions: [{ type: 'show_field', targetField: 'b' }] },
      { id: 'r2', enabled: true, conditions: { checks: [{ field: 'a', operator: 'equals', value: 'maybe' }] }, actions: [{ type: 'show_field', targetField: 'b' }] },
    ];
    const { snapshot } = materializeSchema({ ...base, schemaJson: form(rules) });
    const t = snapshot.slots.find((s) => s.slotId === 'target');
    expect(evalTref(t.trefCondition, { slots: { trigger: 'maybe' } })).toBe(true);
    expect(evalTref(t.trefCondition, { slots: { trigger: 'no' } })).toBe(false);
  });

  test('disabled rules and unsupported actions are ignored (with a warning)', () => {
    const off = [{ id: 'r0', enabled: false, conditions: { checks: [{ field: 'a', operator: 'equals', value: 'yes' }] }, actions: [{ type: 'show_field', targetField: 'b' }] }];
    expect(materializeSchema({ ...base, schemaJson: form(off) }).snapshot.slots.find((s) => s.slotId === 'target').trefCondition).toBeUndefined();

    const weird = materializeSchema({ ...base, schemaJson: form(rule([{ type: 'set_colour', targetField: 'b' }])) });
    expect(weird.warnings.join()).toMatch(/unsupported action/);
  });

  test('unencodable literal ⇒ rule skipped with a warning, never a broken tref', () => {
    const res = materializeSchema({ ...base, schemaJson: form(rule([{ type: 'show_field', targetField: 'b' }], 'equals', `O'Brien said "hi"`)) });
    expect(res.snapshot.slots.find((s) => s.slotId === 'target').trefCondition).toBeUndefined();
    expect(res.warnings.join()).toMatch(/not expressible/);
  });

  test('hidden with no reveal rule ⇒ permanently inactive, flagged', () => {
    const res = materializeSchema({ ...base, schemaJson: form([], { hidden: true }) });
    const t = res.snapshot.slots.find((s) => s.slotId === 'target');
    expect(evalTref(t.trefCondition, { slots: {} })).toBe(false);
    expect(res.warnings.join()).toMatch(/permanently inactive/);
  });

  test('enum with no options AND no dictionary reference ⇒ degraded to free text, flagged', () => {
    const res = materializeSchema({ ...base, schemaJson: { fields: [{ id: 'l', label: 'Country', type: 'lookup', required: true }], rules: [] } });
    const t = res.snapshot.slots.find((s) => s.slotId === 'country');
    expect(t.type).toBe('string'); // no way to resolve options → usable free-text, never a choiceless enum
    expect(t.lov).toBeUndefined();
    expect(res.warnings.join()).toMatch(/no dictionary reference/);
  });
});

describe('I-4b: LOV descriptor capture (materializer stays pure)', () => {
  const ajv2 = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv2);
  const validate = ajv2.compile(require('../../contracts/schema-snapshot.schema.json'));

  // A real dictionary-backed field, shaped like Altiora dev ousId 1 (EO-HR-PM-CMP).
  const dutyStation = {
    id: 'field_1779178482902', label: 'Duty Station', type: 'select', required: true,
    dictionaryEntityId: 'entity-dbo-lk_dutystations',
    dictionaryFieldId: 'fld-entity-dbo-lk_dutystations-name',
    dictionaryDisplayFields: [],
    dictionaryValueField: 'fld-entity-dbo-lk_dutystations-name',
    dictionaryFilters: [],
  };

  test('dictionary-backed select → type:string (pre-bake) + durable lov descriptor, no warning', () => {
    const { snapshot, warnings } = materializeSchema({ ...base, schemaJson: { fields: [dutyStation], rules: [] } });
    const s = snapshot.slots.find((x) => x.slotId === 'dutyStation');
    expect(s.type).toBe('string'); // held as free text until baked
    expect(s.presentOptions).toBeUndefined();
    expect(s.lov).toEqual({
      entityId: 'entity-dbo-lk_dutystations',
      displayFieldIds: ['fld-entity-dbo-lk_dutystations-name'], // fell back from empty dictionaryDisplayFields
      valueFieldId: 'fld-entity-dbo-lk_dutystations-name',
    });
    expect(warnings).toEqual([]); // a resolvable LOV is not a warning
  });

  test('the pre-baked snapshot is contract-valid (a string slot carrying lov)', () => {
    const { snapshot } = materializeSchema({ ...base, schemaJson: { fields: [dutyStation], rules: [] } });
    const ok = validate(snapshot);
    if (!ok) throw new Error(JSON.stringify(validate.errors, null, 1));
    expect(ok).toBe(true);
  });

  test('static-option select is a plain enum (no lov)', () => {
    const grade = { id: 'g', label: 'Grade', type: 'select', required: true, options: ['P-1', 'P-2'] };
    const { snapshot } = materializeSchema({ ...base, schemaJson: { fields: [grade], rules: [] } });
    const s = snapshot.slots.find((x) => x.slotId === 'grade');
    expect(s.type).toBe('enum');
    expect(s.lov).toBeUndefined();
    expect(s.presentOptions).toEqual([{ value: 'P-1', label: 'P-1' }, { value: 'P-2', label: 'P-2' }]);
  });

  test('lovDescriptorOf: multi display fields, explicit value field, and mapped filters', () => {
    const lov = lovDescriptorOf({
      dictionaryEntityId: 'intg:abc',
      dictionaryDisplayFields: ['fld-first', 'fld-last'],
      dictionaryValueField: 'fld-id',
      dictionaryFilters: [{ fieldId: 'fld-active', operator: 'eq', value: 'true' }],
    });
    expect(lov).toEqual({
      entityId: 'intg:abc',
      displayFieldIds: ['fld-first', 'fld-last'],
      valueFieldId: 'fld-id',
      filters: [{ fieldId: 'fld-active', operator: 'eq', value: 'true' }],
    });
  });

  test('lovDescriptorOf: no entity id or no display field ⇒ null (not a usable LOV)', () => {
    expect(lovDescriptorOf({ label: 'x' })).toBeNull();
    expect(lovDescriptorOf({ dictionaryEntityId: 'e', dictionaryDisplayFields: [] })).toBeNull();
  });
});

// ── TASK-PROMPT-005: description/placeholder → helpText ──────────────────────
// The audit (TASK-PROMPT-002) established these are the ONLY constraint-like
// attributes Altiora authors — no min/max/regex exist upstream — so carrying them
// faithfully (and filtering the form builder's machine artifacts) is the whole win.
describe('TASK-PROMPT-005: helpText materialization', () => {
  const one = (field) => materializeSchema({
    ...base,
    schemaJson: { fields: [{ id: 'f1', label: 'Justification', type: 'textarea', required: true, ...field }], rules: [] },
  }).snapshot.slots[0];

  test('description only → helpText = description', () => {
    expect(one({ description: 'A detailed written justification is mandatory above 364 days.' }).helpText)
      .toBe('A detailed written justification is mandatory above 364 days.');
  });

  test('placeholder only → helpText = placeholder', () => {
    expect(one({ placeholder: 'Please describe your request in detail' }).helpText)
      .toBe('Please describe your request in detail');
  });

  test('both → merged with a labelled example', () => {
    expect(one({ description: 'Explain why the extension is needed.', placeholder: 'e.g. project X continues' }).helpText)
      .toBe('Explain why the extension is needed.\n\nExample: e.g. project X continues');
  });

  test('neither → helpText not set', () => {
    expect(one({}).helpText).toBeUndefined();
  });

  test('auto-generated description is filtered out (machine artifact, not user help)', () => {
    // Real case: ousId 1 dutyStation carries "Auto-generated field for LK_DutyStations.Name".
    expect(one({ description: 'Auto-generated field for LK_DutyStations.Name' }).helpText).toBeUndefined();
  });

  test('auto-generated description + real placeholder → only the placeholder survives', () => {
    expect(one({ description: 'Auto-generated field for LK_DutyStations.Name', placeholder: 'Start typing a city' }).helpText)
      .toBe('Start typing a city');
  });

  test('whitespace-only → helpText not set; surrounding whitespace is trimmed', () => {
    expect(one({ description: '   \n  ' }).helpText).toBeUndefined();
    expect(one({ description: '  Trim me.  ' }).helpText).toBe('Trim me.');
  });

  test('a slot carrying helpText still satisfies the SchemaSnapshot contract', () => {
    const { snapshot } = materializeSchema({
      ...base,
      schemaJson: { fields: [{ id: 'f1', label: 'Justification', type: 'textarea', required: true, description: 'Why?', placeholder: 'because…' }], rules: [] },
    });
    expect(validateSnapshot(snapshot)).toBe(true);
  });
});

// ── P1-13: checklist/multiselect keep their multi-value semantics ────────────
describe('P1-13: multi-select enum materialization', () => {
  const one = (field) => materializeSchema({
    ...base,
    schemaJson: { fields: [{ id: 'f1', label: 'Supporting documents', required: false, options: ['TOR provided', 'DOA approval'], ...field }], rules: [] },
  }).snapshot.slots[0];

  test('checklist → enum + multi:true (option domain preserved)', () => {
    const slot = one({ type: 'checklist' });
    expect(slot.type).toBe('enum');
    expect(slot.multi).toBe(true);
    expect(slot.presentOptions.map((o) => o.value)).toEqual(['TOR provided', 'DOA approval']);
  });

  test('multiselect → enum + multi:true', () => {
    expect(one({ type: 'multiselect' }).multi).toBe(true);
  });

  test('single-valued siblings stay single (no multi flag)', () => {
    for (const type of ['select', 'radio', 'options_group', 'dropdown']) {
      const slot = one({ type });
      expect(slot.type).toBe('enum');
      expect(slot.multi).toBeUndefined();
    }
  });

  test('a multi slot is contract-valid', () => {
    const { snapshot } = materializeSchema({
      ...base,
      schemaJson: { fields: [{ id: 'f1', label: 'Docs', type: 'checklist', required: false, options: ['a', 'b'] }], rules: [] },
    });
    expect(validateSnapshot(snapshot)).toBe(true);
  });

  // Altiora's DynamicForm renders `checklistMultiple:false` as radios and stores a
  // plain scalar — so such a checklist is single-select despite its type.
  test('checklistMultiple:false → single-select (no multi flag)', () => {
    const slot = one({ type: 'checklist', checklistMultiple: false });
    expect(slot.type).toBe('enum');
    expect(slot.multi).toBeUndefined();
  });

  test('checklistMultiple:true (or absent) → multi', () => {
    expect(one({ type: 'checklist', checklistMultiple: true }).multi).toBe(true);
    expect(one({ type: 'checklist' }).multi).toBe(true);
  });

  test('a checklist with NO options degrades to free text and carries no multi flag', () => {
    const slot = one({ type: 'checklist', options: [] });
    expect(slot.type).toBe('string');
    expect(slot.multi).toBeUndefined();
  });
});

// ── P1-12: cascade dictionary (runtime-resolved, fail-closed) ────────────────
describe('P1-12: cascade dictionary materialization', () => {
  const tree = (fieldRef, op = 'eq', logic = 'AND', srcType = 'form_field') => ({
    type: 'group', logic, items: [{
      type: 'filter', dictionaryFieldId: 'intg:col-index', operator: op,
      valueSource: { type: srcType, fieldId: fieldRef },
    }],
  });
  // A realistic pair: an index number, and a name that resolves from it.
  const form = (nameField) => ({
    fields: [
      { id: 'f_idx', label: 'Index Number', type: 'text', required: true },
      { id: 'f_name', label: 'Staff Member Full Name', type: 'text', required: true, ...nameField },
    ],
    rules: [],
  });
  const run = (nameField) => materializeSchema({ ...base, schemaJson: form(nameField) });
  const nameSlot = (res) => res.snapshot.slots.find((s) => s.slotId === 'staffMemberFullName');

  test('a text field with a form_field-filtered dictionary gets a dictRef', () => {
    const res = run({ dictionaryEntityId: 'intg:staff', dictionaryFieldId: 'intg:col-name', dictionaryFilterTree: tree('f_idx') });
    const slot = nameSlot(res);
    expect(slot.type).toBe('string'); // stays a normal slot type — dictRef is orthogonal
    expect(slot.dictRef).toMatchObject({ entityId: 'intg:staff', displayFieldIds: ['intg:col-name'] });
    expect(slot.dictRef.filters).toEqual([{ fieldId: 'intg:col-index', operator: 'eq', slotId: 'indexNumber' }]);
  });

  test('the cascade dependency becomes an ordering dependsOn', () => {
    const slot = nameSlot(run({ dictionaryEntityId: 'intg:staff', dictionaryFieldId: 'intg:col-name', dictionaryFilterTree: tree('f_idx') }));
    expect(slot.dependsOn).toContain('indexNumber');
  });

  test('a date field also carries a dictRef (autofill is not enum-only)', () => {
    const res = materializeSchema({
      ...base,
      schemaJson: {
        fields: [
          { id: 'f_idx', label: 'Index Number', type: 'text', required: true },
          { id: 'f_exp', label: 'Current Appointment Expiry', type: 'date', required: true, dictionaryEntityId: 'intg:staff', dictionaryFieldId: 'intg:col-exp', dictionaryFilterTree: tree('f_idx') },
        ],
        rules: [],
      },
    });
    const slot = res.snapshot.slots.find((s) => s.slotId === 'currentAppointmentExpiry');
    expect(slot.type).toBe('date');
    expect(slot.dictRef.filters[0].slotId).toBe('indexNumber');
  });

  test('a snapshot carrying dictRef is contract-valid', () => {
    const res = run({ dictionaryEntityId: 'intg:staff', dictionaryFieldId: 'intg:col-name', dictionaryFilterTree: tree('f_idx') });
    expect(validateSnapshot(res.snapshot)).toBe(true);
  });

  // ── fail-closed cases: better manual entry than a silently weakened filter ──
  test.each([
    ['an unsupported operator', { op: 'contains' }],
    ['an OR group', { logic: 'OR' }],
    ['a current_user source', { srcType: 'current_user' }],
    ['a reference to a field that was not materialized', { fieldRef: 'f_missing' }],
  ])('drops the descriptor for %s', (_label, { op = 'eq', logic = 'AND', srcType = 'form_field', fieldRef = 'f_idx' }) => {
    const res = run({ dictionaryEntityId: 'intg:staff', dictionaryFieldId: 'intg:col-name', dictionaryFilterTree: tree(fieldRef, op, logic, srcType) });
    expect(nameSlot(res).dictRef).toBeUndefined();
  });

  test('a dictionary WITHOUT a field dependency stays the existing baked-lov case', () => {
    // static/unfiltered select → no dictRef; the enum LOV path is untouched.
    const res = materializeSchema({
      ...base,
      schemaJson: { fields: [{ id: 'f_ds', label: 'Duty Station', type: 'select', required: true, dictionaryEntityId: 'entity-dbo-lk_dutystations', dictionaryFieldId: 'fld-name' }], rules: [] },
    });
    const slot = res.snapshot.slots[0];
    expect(slot.dictRef).toBeUndefined();
    expect(slot.lov).toBeDefined();
  });
});
