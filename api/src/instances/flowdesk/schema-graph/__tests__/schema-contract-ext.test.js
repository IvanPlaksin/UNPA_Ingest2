'use strict';

/**
 * IP-0c test — the contract extension: requiredWhen, optionFilters,
 * altioraFieldId, and the Altiora provenance on metadata.
 *
 * Pure: validates the JSON Schema and the linter without touching Memgraph. The
 * compiler round-trip through the live graph is covered in schema-graph.test.js.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { lintSnapshot } = require('../schema-linter');

const SCHEMA = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'schema-snapshot.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'contracts', 'fixtures');
const FIXTURES = fs.readdirSync(FIXTURE_DIR).filter((f) => /^schema-snapshot\..+\.json$/.test(f));

/** A minimal valid snapshot; `slots` and `metadata` are merged over the defaults. */
function snapshot({ slots, metadata } = {}) {
  return {
    serviceId: 'IT-HW-LAP',
    version: 1,
    phases: ['context', 'detail'],
    metadata: { title: 'Laptop Request', approvalRequired: false, ...metadata },
    slots: slots || [
      { slotId: 'os', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'macOS', label: 'macOS' }] },
    ],
  };
}

describe('IP-0c: backward compatibility', () => {
  test.each(FIXTURES)('%s still validates against the extended schema', (file) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
    const ok = validate(fixture);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  test.each(FIXTURES)('%s lints clean', (file) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
    expect(lintSnapshot(fixture)).toEqual({ ok: true, violations: [] });
  });

  test('the new fields are optional — a snapshot without them is valid', () => {
    expect(validate(snapshot())).toBe(true);
  });
});

describe('IP-0c: requiredWhen', () => {
  test('validates and lints when it references an earlier slot', () => {
    const snap = snapshot({
      slots: [
        { slotId: 'storage', type: 'string', required: true, phase: 'detail' },
        {
          slotId: 'justification',
          type: 'text',
          required: false,
          phase: 'detail',
          requiredWhen: "slots.storage == '2TB'",
          dependsOn: ['storage'],
        },
      ],
    });
    expect(validate(snap)).toBe(true);
    expect(lintSnapshot(snap).ok).toBe(true);
  });

  test('R5 rejects an unparseable requiredWhen', () => {
    const snap = snapshot({
      slots: [{ slotId: 'a', type: 'string', required: false, phase: 'detail', requiredWhen: 'garbage @ 5' }],
    });
    const { ok, violations } = lintSnapshot(snap);
    expect(ok).toBe(false);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'REQUIRED_WHEN_SYNTAX', slotId: 'a' }),
    );
  });

  test('R5 rejects a requiredWhen that looks forward', () => {
    // Obligation settled by an answer that has not been asked for yet is
    // unsettleable — the same defect TREF_EARLY catches for visibility.
    const snap = snapshot({
      slots: [
        { slotId: 'early', type: 'string', required: false, phase: 'detail', requiredWhen: "slots.late == 'x'" },
        { slotId: 'late', type: 'string', required: false, phase: 'detail' },
      ],
    });
    const { ok, violations } = lintSnapshot(snap);
    expect(ok).toBe(false);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'REQUIRED_WHEN_SYNTAX', message: expect.stringMatching(/later phase\/position/) }),
    );
  });

  test('R5 rejects a requiredWhen referencing an unknown slot', () => {
    const snap = snapshot({
      slots: [{ slotId: 'a', type: 'string', required: false, phase: 'detail', requiredWhen: "slots.ghost == 'x'" }],
    });
    expect(lintSnapshot(snap).violations).toContainEqual(
      expect.objectContaining({ rule: 'REQUIRED_WHEN_SYNTAX', message: expect.stringMatching(/unknown slot 'ghost'/) }),
    );
  });
});

describe('IP-0c: optionFilters', () => {
  function withFilter(filter, extraSlots = []) {
    return snapshot({
      slots: [
        { slotId: 'os', type: 'string', required: true, phase: 'detail' },
        ...extraSlots,
        {
          slotId: 'gpu',
          type: 'enum',
          required: true,
          phase: 'detail',
          presentOptions: [
            { value: 'Integrated', label: 'Integrated' },
            { value: 'NVIDIA', label: 'NVIDIA' },
          ],
          dependsOn: ['os'],
          optionFilters: [filter],
        },
      ],
    });
  }

  test('the real Altiora laptop rule validates and lints — filter_options on GPU by OS', () => {
    const snap = withFilter({
      condition: "slots.os == 'macOS Sonoma (v14.x)'",
      include: ['Integrated'],
    });
    expect(validate(snap)).toBe(true);
    expect(lintSnapshot(snap).ok).toBe(true);
  });

  test('exclude is accepted too', () => {
    const snap = withFilter({ condition: "slots.os == 'macOS Sonoma (v14.x)'", exclude: ['NVIDIA'] });
    expect(validate(snap)).toBe(true);
    expect(lintSnapshot(snap).ok).toBe(true);
  });

  test('a filter with neither include nor exclude is rejected by the schema', () => {
    // It would narrow nothing — a filter that filters nothing is a mistake.
    expect(validate(withFilter({ condition: "slots.os == 'macOS'" }))).toBe(false);
  });

  test('a filter without a condition is rejected by the schema', () => {
    expect(validate(withFilter({ include: ['Integrated'] }))).toBe(false);
  });

  test('R6 rejects an unparseable filter condition', () => {
    const { ok, violations } = lintSnapshot(withFilter({ condition: 'garbage @ 5', include: ['Integrated'] }));
    expect(ok).toBe(false);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'OPTION_FILTER_SYNTAX', slotId: 'gpu' }),
    );
  });

  test('R6 rejects a filter condition that looks forward', () => {
    const snap = snapshot({
      slots: [
        {
          slotId: 'gpu',
          type: 'enum',
          required: true,
          phase: 'detail',
          presentOptions: [{ value: 'Integrated', label: 'Integrated' }],
          optionFilters: [{ condition: "slots.later == 'x'", include: ['Integrated'] }],
        },
        { slotId: 'later', type: 'string', required: false, phase: 'detail' },
      ],
    });
    expect(lintSnapshot(snap).violations).toContainEqual(
      expect.objectContaining({ rule: 'OPTION_FILTER_SYNTAX', message: expect.stringMatching(/later phase\/position/) }),
    );
  });

  test('R7 rejects a filter naming an option the slot does not offer', () => {
    const { ok, violations } = lintSnapshot(withFilter({
      condition: "slots.os == 'macOS'",
      include: ['Integrated', 'Quantum'],
    }));
    expect(ok).toBe(false);
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'OPTION_FILTER_VALUES',
        slotId: 'gpu',
        message: expect.stringMatching(/'Quantum'/),
      }),
    );
  });

  test('R7 checks exclude values too', () => {
    expect(lintSnapshot(withFilter({ condition: "slots.os == 'macOS'", exclude: ['Ghost'] })).violations)
      .toContainEqual(expect.objectContaining({ rule: 'OPTION_FILTER_VALUES' }));
  });

  test('R7 stays silent for a resolver-backed enum — it has no static domain', () => {
    const snap = snapshot({
      slots: [
        { slotId: 'os', type: 'string', required: true, phase: 'detail' },
        {
          slotId: 'gpu',
          type: 'enum',
          required: true,
          phase: 'detail',
          resolverRef: 'resolve.catalog',
          optionFilters: [{ condition: "slots.os == 'macOS'", include: ['whatever'] }],
        },
      ],
    });
    expect(lintSnapshot(snap).ok).toBe(true);
  });
});

describe('IP-0c: Altiora provenance', () => {
  test('metadata carries altioraOusId, contentHash and fieldIdMapping', () => {
    const snap = snapshot({
      metadata: {
        altioraOusId: 42,
        contentHash: 'a3f1c2'.repeat(10) + 'abcd',
        fieldIdMapping: { shippingAddress: 'Shipping_Address', os: 'os' },
      },
    });
    expect(validate(snap)).toBe(true);
  });

  test('a slot carries altioraFieldId', () => {
    const snap = snapshot({
      slots: [{
        slotId: 'shippingAddress',
        type: 'text',
        required: false,
        phase: 'detail',
        altioraFieldId: 'Shipping_Address',
      }],
    });
    expect(validate(snap)).toBe(true);
    expect(lintSnapshot(snap).ok).toBe(true);
  });

  test('altioraOusId must be an integer — it is an IDENTITY column', () => {
    expect(validate(snapshot({ metadata: { altioraOusId: 'forty-two' } }))).toBe(false);
    expect(validate(snapshot({ metadata: { altioraOusId: 4.2 } }))).toBe(false);
  });

  test('fieldIdMapping values must be strings', () => {
    expect(validate(snapshot({ metadata: { fieldIdMapping: { os: 42 } } }))).toBe(false);
  });

  test('metadata still rejects unknown properties', () => {
    expect(validate(snapshot({ metadata: { somethingElse: 'x' } }))).toBe(false);
  });

  test('a slot still rejects unknown properties', () => {
    const snap = snapshot({
      slots: [{ slotId: 'os', type: 'string', required: true, phase: 'detail', hidden: true }],
    });
    expect(validate(snap)).toBe(false);
  });
});
