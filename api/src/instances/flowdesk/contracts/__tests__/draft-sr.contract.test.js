'use strict';

/**
 * Contract 2 test — DraftSR.
 *
 * Exercises the reference reducer over the Hardware SchemaSnapshot fixture:
 *   create → patch (fill) → patch (stale cascade) → re-fill → submit.
 * Also asserts the four ratified invariants and that every intermediate draft
 * validates against draft-sr.schema.json.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const reducer = require('../draft-sr.reducer');

const CONTRACT_DIR = path.join(__dirname, '..');
const draftSchema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'draft-sr.schema.json'), 'utf8'));
const hardware = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateDraft = ajv.compile(draftSchema);

// Deterministic injected clock + ref generator (no Date.now/random in reducer).
let clock = Date.parse('2026-07-14T08:00:00.000Z');
const tick = (ms = 1000) => (clock += ms);
const makeRef = (draft, prefix = 'SR') => `${prefix}-${draft.serviceId}-${draft.sessionId.slice(0, 6)}`;

function assertValidDraft(draft) {
  const ok = validateDraft(draft);
  if (!ok) throw new Error('DraftSR schema invalid:\n' + JSON.stringify(validateDraft.errors, null, 2));
}

describe('Contract 2: DraftSR reducer over Hardware fixture', () => {
  test('full flow: create → fill → stale cascade → re-fill → submit', () => {
    // 1. create
    let draft = reducer.createDraft({
      sessionId: 'sess-abc123',
      serviceId: hardware.serviceId,
      schemaVersion: hardware.version,
      beneficiary: { mode: 'other', userId: 'u-77' },
      now: clock,
    });
    assertValidDraft(draft);
    expect(draft.status).toBe('draft');

    // 2. fill context + detail slots (Hardware requires approverComment because approvalRequired=true)
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'author', value: { userId: 'u-1' }, provenance: 'context' },
      { op: 'set', slotId: 'beneficiary', value: 'u-77', provenance: 'context' },
      { op: 'set', slotId: 'location', value: { id: 'loc-genf', name: 'Geneva' }, provenance: 'resolved' },
      { op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' },
      { op: 'set', slotId: 'justification', value: 'New hire onboarding', provenance: 'user_edited' },
      { op: 'set', slotId: 'approver', value: { userId: 'U005' }, provenance: 'resolved' },
      { op: 'set', slotId: 'approverComment', value: 'Budget approved by PM', provenance: 'user_edited' },
    ], hardware, tick());
    assertValidDraft(draft);

    // all required filled, none stale → submit should pass
    let v = reducer.validateForSubmit(draft, hardware);
    expect(v.ok).toBe(true);

    // 3. stale cascade — change assetType; justification dependsOn assetType, approverComment dependsOn justification
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'assetType', value: 'laptop_engineering', provenance: 'user_edited' },
    ], hardware, tick());
    assertValidDraft(draft);
    expect(draft.slots.assetType.stale).toBe(false);      // the changed slot itself is fresh
    expect(draft.slots.justification.stale).toBe(true);   // depends on assetType → stale

    // I4: submit refuses while a required slot is stale
    v = reducer.validateForSubmit(draft, hardware);
    expect(v.ok).toBe(false);
    expect(v.stale).toContain('justification');

    // 4. re-fill the stale slot. justification has no dependents in the schema
    //    (approverComment dependsOn approver, not justification), so nothing cascades.
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'justification', value: 'Engineering workload', provenance: 'user_edited' },
    ], hardware, tick());
    expect(draft.slots.justification.stale).toBe(false);
    expect(draft.slots.approverComment.stale).toBe(false);

    const res = reducer.submit(draft, hardware, { now: tick(), makeRef });
    expect(res.ok).toBe(true);
    expect(res.srNumber).toBe('SR-IT-HW-LAP-sess-a');
    expect(res.draft.status).toBe('submitted');
    assertValidDraft(res.draft);
  });

  test('I1: user_edited is never overwritten by extracted', () => {
    let draft = reducer.createDraft({ sessionId: 's1', serviceId: hardware.serviceId, schemaVersion: 1, now: clock });
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'justification', value: 'human text', provenance: 'user_edited' },
    ], hardware, tick());
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'justification', value: 'machine text', provenance: 'extracted' },
    ], hardware, tick());

    expect(draft.slots.justification.value).toBe('human text');   // unchanged
    expect(draft.slots.justification.provenance).toBe('user_edited');
    const last = draft.patches[draft.patches.length - 1];
    expect(last.rejected).toBe(true);
  });

  test('I1b: resolved/context/extracted CAN be overwritten by user_edited', () => {
    let draft = reducer.createDraft({ sessionId: 's2', serviceId: hardware.serviceId, schemaVersion: 1, now: clock });
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' },
    ], hardware, tick());
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'assetType', value: 'desktop', provenance: 'user_edited' },
    ], hardware, tick());
    expect(draft.slots.assetType.value).toBe('desktop');
    expect(draft.slots.assetType.provenance).toBe('user_edited');
  });

  test('I3: TTL refreshes on every applied patch', () => {
    const t0 = clock;
    let draft = reducer.createDraft({ sessionId: 's3', serviceId: hardware.serviceId, schemaVersion: 1, now: t0, ttlMs: 1000 });
    const created = draft.expiresAt;
    const later = tick(5000);
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'assetType', value: 'monitor', provenance: 'extracted' },
    ], hardware, later, 1000);
    expect(Date.parse(draft.expiresAt)).toBe(later + 1000);
    expect(draft.expiresAt).not.toBe(created);
  });

  test('tref-aware required: Badge validUntil only required when badgeType != permanent', () => {
    const badge = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'fixtures', 'schema-snapshot.badge.json'), 'utf8'));
    let draft = reducer.createDraft({ sessionId: 's4', serviceId: badge.serviceId, schemaVersion: 1, now: clock });
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'beneficiary', value: 'u-1', provenance: 'context' },
      { op: 'set', slotId: 'facility', value: { id: 'f1' }, provenance: 'resolved' },
      { op: 'set', slotId: 'badgeType', value: 'permanent', provenance: 'user_edited' },
    ], badge, tick());
    // permanent → validUntil NOT required
    expect(reducer.validateForSubmit(draft, badge).ok).toBe(true);

    // switch to temporary → validUntil becomes required (and missing)
    draft = reducer.applyPatches(draft, [
      { op: 'set', slotId: 'badgeType', value: 'temporary', provenance: 'user_edited' },
    ], badge, tick());
    const v = reducer.validateForSubmit(draft, badge);
    expect(v.ok).toBe(false);
    expect(v.missing).toContain('validUntil');
  });
});
