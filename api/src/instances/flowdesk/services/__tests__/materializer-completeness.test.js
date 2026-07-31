'use strict';

/**
 * SCH-001 — the snapshot is a translation of the Altiora schema, not a selection
 * from it.
 *
 * The materializer used to read a layout field for its side effect (a `section`
 * became a grouping label) and then discard it. Measured against the live catalogue
 * that cost nothing — 72 of 73 schemas translate field-for-field — so the gap was
 * invisible and would have stayed invisible until Altiora added a divider, a
 * paragraph of guidance, or a `label` its own form autofills from a dictionary. We
 * would then hand the wizard a request built from a schema we had only partly read.
 *
 * Presentation fields stay OUT of `slots` on purpose: a slot is a question, and a
 * paragraph of static text in the queue is a paragraph the assistant reads aloud.
 */

const { materializeSchema } = require('../altiora-schema-materializer');

const base = (fields) => ({
  serviceCode: 'EO-TEST-001', ousId: 999, title: 'Test', version: 1,
  // The materializer reads the Altiora payload, not a field list.
  schemaJson: { fields },
});

const materialize = (fields) => materializeSchema(base(fields)).snapshot;

describe('every field of the source reaches the snapshot', () => {
  const FIELDS = [
    { id: 'f_sec', type: 'section', label: 'Your request' },
    { id: 'f_txt', type: 'text', label: 'Subject', required: true, sectionId: 'f_sec' },
    { id: 'f_div', type: 'divider' },
    { id: 'f_note', type: 'paragraph', label: 'Please attach the signed form.', sectionId: 'f_sec' },
    { id: 'f_date', type: 'date', label: 'When', required: false },
  ];

  test('inputs become slots and presentation fields are kept beside them', () => {
    const s = materialize(FIELDS);
    expect(s.slots.map((x) => x.altioraFieldId).sort()).toEqual(['f_date', 'f_txt']);
    expect(s.presentation.map((x) => x.fieldId).sort()).toEqual(['f_div', 'f_note', 'f_sec']);
  });

  test('nothing is lost — the counts reconcile', () => {
    const s = materialize(FIELDS);
    expect(s.metadata.sourceFieldCount).toBe(FIELDS.length);
    expect(s.metadata.translatedFieldCount).toBe(FIELDS.length);
  });

  test('a presentation field is NOT a question', () => {
    // The reason this is kept out of `slots` rather than flagged inside it: every
    // queue in the interpreter reads `slots`, and a flag is something each of them
    // would have to remember to check.
    const s = materialize(FIELDS);
    expect(s.slots.some((x) => x.altioraFieldId === 'f_note')).toBe(false);
  });

  test('the text a paragraph carries is kept, because the wizard will show it', () => {
    const s = materialize(FIELDS);
    expect(s.presentation.find((x) => x.fieldId === 'f_note').label)
      .toBe('Please attach the signed form.');
  });

  test('a presentation field keeps the section it belongs to', () => {
    const s = materialize(FIELDS);
    expect(s.presentation.find((x) => x.fieldId === 'f_note').sectionLabel).toBe('Your request');
  });

  test('a dictionary on a presentation field is carried — Altiora autofills those too', () => {
    // `label` is in Altiora's own DICT_AUTOFILL_FIELD_TYPES: its form resolves the
    // text from a dictionary and displays it. Dropping the reference would leave us
    // unable to reconcile what we send with what the user will read.
    const s = materialize([
      { id: 'f_lab', type: 'label', label: 'Grade', dictionaryEntityId: 'intg:abc' },
      { id: 'f_txt', type: 'text', label: 'Subject', required: true },
    ]);
    expect(s.presentation[0].dictionaryEntityId).toBe('intg:abc');
  });

  test('a schema of only inputs carries no presentation key at all', () => {
    const s = materialize([{ id: 'f1', type: 'text', label: 'Subject', required: true }]);
    expect(s.presentation).toBeUndefined();
    expect(s.metadata.translatedFieldCount).toBe(1);
  });

  test('the counts still reconcile when every field is presentation', () => {
    const s = materialize([{ id: 'f_sec', type: 'section', label: 'Only a heading' }]);
    expect(s.metadata.sourceFieldCount).toBe(1);
    expect(s.metadata.translatedFieldCount).toBe(1);
    expect(s.slots).toHaveLength(0);
  });
});
