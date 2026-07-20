'use strict';

/**
 * Contract 1 test — SchemaSnapshot.
 *
 * Validates the golden fixtures (Hardware, Badge, Workspace) against the
 * SchemaSnapshot JSON Schema, and asserts the invariants the compiler (C1)
 * and interpreter (C4) rely on:
 *   - every slot.phase is declared in snapshot.phases
 *   - slotIds are unique
 *   - dependsOn references existing slots
 *   - enum slots carry presentOptions
 *   - negative cases are rejected (fail-closed)
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const CONTRACT_DIR = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(CONTRACT_DIR, 'fixtures');

const schema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'schema-snapshot.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const FIXTURES = ['hardware', 'badge', 'workspace'];

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `schema-snapshot.${name}.json`), 'utf8'));
}

describe('Contract 1: SchemaSnapshot golden fixtures', () => {
  test.each(FIXTURES)('%s fixture validates against the schema', (name) => {
    const fixture = loadFixture(name);
    const ok = validate(fixture);
    if (!ok) {
      // Surface ajv errors for a readable failure
      throw new Error(`Schema validation failed for ${name}:\n${JSON.stringify(validate.errors, null, 2)}`);
    }
    expect(ok).toBe(true);
  });

  describe.each(FIXTURES)('%s fixture invariants', (name) => {
    const fixture = loadFixture(name);

    test('every slot.phase is declared in phases', () => {
      for (const slot of fixture.slots) {
        expect(fixture.phases).toContain(slot.phase);
      }
    });

    test('slotIds are unique', () => {
      const ids = fixture.slots.map((s) => s.slotId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('dependsOn references existing slots', () => {
      const ids = new Set(fixture.slots.map((s) => s.slotId));
      for (const slot of fixture.slots) {
        for (const dep of slot.dependsOn || []) {
          expect(ids).toContain(dep);
        }
      }
    });

    test('enum slots carry non-empty presentOptions', () => {
      for (const slot of fixture.slots) {
        if (slot.type === 'enum') {
          expect(Array.isArray(slot.presentOptions)).toBe(true);
          expect(slot.presentOptions.length).toBeGreaterThan(0);
        }
      }
    });

    test('at least one slot per fixture is required', () => {
      expect(fixture.slots.some((s) => s.required)).toBe(true);
    });
  });

  describe('negative cases are rejected (fail-closed)', () => {
    test('enum slot without presentOptions is invalid', () => {
      const bad = loadFixture('hardware');
      const i = bad.slots.findIndex((s) => s.type === 'enum');
      bad.slots[i] = { ...bad.slots[i] };
      delete bad.slots[i].presentOptions;
      expect(validate(bad)).toBe(false);
    });

    test('unknown top-level property is invalid', () => {
      const bad = loadFixture('badge');
      bad.unexpected = true;
      expect(validate(bad)).toBe(false);
    });

    test('missing required metadata.approvalRequired is invalid', () => {
      const bad = loadFixture('workspace');
      bad.metadata = { ...bad.metadata };
      delete bad.metadata.approvalRequired;
      expect(validate(bad)).toBe(false);
    });

    test('malformed serviceId is invalid', () => {
      const bad = loadFixture('hardware');
      bad.serviceId = 'not a code';
      expect(validate(bad)).toBe(false);
    });
  });
});
