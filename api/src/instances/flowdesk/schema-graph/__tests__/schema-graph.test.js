'use strict';

/**
 * C1 test — schema-graph compiler + linter.
 *
 * Requires a live Memgraph (bolt://localhost:7687). Seeds the 3 service graphs
 * from the golden fixtures, compiles them back, and asserts exact round-trip.
 * Then validates against the SchemaSnapshot schema, runs the live linter clean,
 * and checks lintSnapshot catches the 4 negative cases.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { seedAll, seedService, purge, loadFixture, FIXTURES } = require('../seed-schema-graphs');
const { compile, SchemaCompileError } = require('../schema-compiler');
const { lintSnapshot, lintGraph } = require('../schema-linter');
const { close } = require('../driver');
const { materializeSchema } = require('../../services/altiora-schema-materializer');

const SCHEMA = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'schema-snapshot.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSnapshot = ajv.compile(SCHEMA);

// Read the serviceId off the fixture rather than a hand-kept map. The seed
// auto-discovers fixtures, so a map would silently pass `undefined` to compile()
// for any fixture someone forgot to register — defeating the drop-in property.
const serviceIdOf = (name) => loadFixture(name).serviceId;

// Seeding is UNWIND-batched and index-backed (BACKLOG-0055) — ~4s for all
// fixtures, down from ~65s — so the original budget is comfortable again.
jest.setTimeout(60000);

beforeAll(async () => { await seedAll(); });
afterAll(async () => { await close(); });

describe('C1: compiler round-trips golden fixtures', () => {
  test.each(FIXTURES)('%s: compiled graph deep-equals the fixture', async (name) => {
    const compiled = await compile(serviceIdOf(name));
    const fixture = loadFixture(name);
    expect(compiled).toEqual(fixture);
  });

  test.each(FIXTURES)('%s: compiled snapshot validates against schema', async (name) => {
    const compiled = await compile(serviceIdOf(name));
    const ok = validateSnapshot(compiled);
    if (!ok) throw new Error(JSON.stringify(validateSnapshot.errors, null, 2));
    expect(ok).toBe(true);
  });

  test('unknown service compiles to null', async () => {
    expect(await compile('NO-SUCH-SVC')).toBeNull();
  });
});

describe('Convergence: a materializer snapshot round-trips through seed + compile', () => {
  // End-to-end proof that the canonical materializer's (I-4a) output isn't merely
  // contract-valid but fully graph-round-trippable — the seed persists every field
  // (optionFilters, requiredWhen, dependsOn, altioraFieldId, fieldIdMapping,
  // altioraOusId, contentHash) and the compiler reproduces it deep-equal. This is
  // the join between the materializer and the graph model that a pure validate+lint
  // test cannot cover, and it exercises the topological-order merge (a hidden field
  // revealed by a later field is reordered ahead of it).
  const RT_SID = 'IT-HW-RT';
  const laptopForm = {
    fields: [
      { id: 'os', label: 'OS', type: 'select', required: true, options: ['Windows 11 Enterprise (LTSB)', 'macOS Sonoma (v14.x)'] },
      { id: 'storage', label: 'Storage', type: 'select', required: true, options: ['512GB', '2TB NVMe SSD (Executive Approval Required)'] },
      { id: 'gpu', label: 'Graphics', type: 'select', required: true, options: ['Integrated Internal Graphics', 'NVIDIA RTX Discrete'] },
      { id: 'delivery', label: 'Delivery', type: 'select', required: true, options: ['IT Desk Pickup', 'Ship to Home Address'] },
      { id: 'shippingAddress', label: 'Shipping Address', type: 'textarea', required: true, hidden: true },
      { id: 'justification', label: 'Business Justification', type: 'textarea', required: false },
    ],
    rules: [
      // Real Altiora shape: filter_options carries include/exclude directly on the action.
      { id: 'r_addr', enabled: true, conditions: { logic: 'AND', checks: [{ field: 'delivery', operator: 'equals', value: 'Ship to Home Address' }] }, actions: [{ type: 'show_field', targetField: 'shippingAddress' }] },
      { id: 'r_just', enabled: true, conditions: { logic: 'AND', checks: [{ field: 'storage', operator: 'equals', value: '2TB NVMe SSD (Executive Approval Required)' }] }, actions: [{ type: 'set_required', targetField: 'justification' }] },
      { id: 'r_gpu', enabled: true, conditions: { logic: 'AND', checks: [{ field: 'os', operator: 'equals', value: 'macOS Sonoma (v14.x)' }] }, actions: [{ type: 'filter_options', targetField: 'gpu', include: ['Integrated Internal Graphics'] }] },
    ],
  };

  afterAll(async () => { await purge(RT_SID); });

  test('materialize → seedService → compile deep-equals the snapshot', async () => {
    const { snapshot, warnings } = materializeSchema({
      schemaJson: laptopForm, serviceCode: RT_SID, title: 'Laptop (round-trip)', approvalRequired: true, ousId: 77, contentHash: 'deadbeef', version: 1,
    });
    expect(warnings).toEqual([]);
    expect(lintSnapshot(snapshot).ok).toBe(true);

    await seedService(snapshot);
    const compiled = await compile(RT_SID);
    expect(compiled).toEqual(snapshot);
  });
});

describe('C1: live linter passes on seeded graphs', () => {
  test.each(FIXTURES)('%s: lintGraph clean', async (name) => {
    const res = await lintGraph(serviceIdOf(name));
    expect(res.violations).toEqual([]);
    expect(res.ok).toBe(true);
  });

  test.each(FIXTURES)('%s: lintSnapshot clean', async (name) => {
    const compiled = await compile(serviceIdOf(name));
    expect(lintSnapshot(compiled).ok).toBe(true);
  });
});

describe('IP-0c: the compiler refuses a graph carrying a broken condition', () => {
  // A snapshot whose condition cannot parse is not merely imperfect: the runtime
  // evaluator throws on it, mid-turn. Emitting it would defer a certain failure
  // to the worst possible moment, so compilation refuses instead.
  const BAD = { serviceId: 'IT-XX-BAD', version: 1, phases: ['detail'], metadata: { title: 'Bad', approvalRequired: false } };

  afterEach(async () => { await purge(BAD.serviceId); });

  async function seedWithSlot(slot) {
    await seedService({ ...BAD, slots: [slot] });
  }

  test('invalid trefCondition → SchemaCompileError naming the slot and field', async () => {
    await seedWithSlot({ slotId: 'a', type: 'string', required: false, phase: 'detail', trefCondition: 'garbage @ 5' });
    await expect(compile(BAD.serviceId)).rejects.toThrow(SchemaCompileError);
    await expect(compile(BAD.serviceId)).rejects.toThrow(/IT-XX-BAD\.a: invalid trefCondition/);
  });

  test('invalid requiredWhen → SchemaCompileError', async () => {
    await seedWithSlot({ slotId: 'a', type: 'string', required: false, phase: 'detail', requiredWhen: 'garbage @ 5' });
    await expect(compile(BAD.serviceId)).rejects.toThrow(/invalid requiredWhen/);
  });

  test('invalid optionFilters condition → SchemaCompileError', async () => {
    await seedWithSlot({
      slotId: 'a',
      type: 'enum',
      required: false,
      phase: 'detail',
      presentOptions: [{ value: 'x', label: 'x' }],
      optionFilters: [{ condition: 'garbage @ 5', include: ['x'] }],
    });
    await expect(compile(BAD.serviceId)).rejects.toThrow(/invalid optionFilters\.condition/);
  });
});

describe('C1: linter catches 4 negatives (lintSnapshot)', () => {
  const base = { serviceId: 'IT-XX-TST', version: 1, phases: ['context', 'routing', 'detail'], metadata: { title: 'T', approvalRequired: false } };

  test('N1 dependsOn cycle', () => {
    const snap = { ...base, slots: [
      { slotId: 'a', type: 'string', required: true, phase: 'context', dependsOn: ['b'] },
      { slotId: 'b', type: 'string', required: true, phase: 'context', dependsOn: ['a'] },
    ] };
    const r = lintSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'ACYCLIC')).toBe(true);
  });

  test('N2 tref references a later-phase slot', () => {
    const snap = { ...base, slots: [
      { slotId: 'early', type: 'string', required: true, phase: 'context', trefCondition: "slots.late == 'x'" },
      { slotId: 'late', type: 'string', required: false, phase: 'detail' },
    ] };
    const r = lintSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'TREF_EARLY')).toBe(true);
  });

  test('N3 dead required (depends on later slot)', () => {
    const snap = { ...base, slots: [
      { slotId: 'first', type: 'string', required: true, phase: 'context', dependsOn: ['second'] },
      { slotId: 'second', type: 'string', required: false, phase: 'detail' },
    ] };
    const r = lintSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'REQUIRED_REACHABLE')).toBe(true);
  });

  test('N4 enum without domain (no options, no resolver)', () => {
    const snap = { ...base, slots: [
      { slotId: 'kind', type: 'enum', required: true, phase: 'detail' },
    ] };
    const r = lintSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'ENUM_DOMAIN')).toBe(true);
  });
});
