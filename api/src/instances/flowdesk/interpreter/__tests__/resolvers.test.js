'use strict';

/**
 * F9.1c test — RESOLVERS logic over the mock directory.
 */

const { resolveBeneficiary, resolveLocation, resolveAuthor, resolveApproverFor, runResolverForSlot } = require('../resolvers');
const directory = require('../../services/directory');

describe('F9.1c: resolveBeneficiary', () => {
  test('query "Иванова" → default U002 (other)', async () => {
    const r = await resolveBeneficiary({ query: 'Иванова' }, directory);
    expect(r.mode).toBe('other');
    expect(r.defaultValue.userId).toBe('U002');
    expect(r.needsInput).toBe(false);
  });

  test('self hint → current user U001', async () => {
    const r = await resolveBeneficiary({ mode: 'self' }, directory);
    expect(r.mode).toBe('self');
    expect(r.defaultValue.userId).toBe('U001');
    expect(r.alternatives).toEqual([]);
  });

  test('free-text "для себя" → self', async () => {
    const r = await resolveBeneficiary('заявка для себя', directory);
    expect(r.mode).toBe('self');
    expect(r.defaultValue.userId).toBe('U001');
  });

  test('unknown name → needsInput', async () => {
    const r = await resolveBeneficiary({ query: 'Незнакомец' }, directory);
    expect(r.defaultValue).toBeNull();
    expect(r.needsInput).toBe(true);
  });

  test('ambiguous — multiple matches surface as alternatives', async () => {
    // 'un.org' matches every user's email → 4 alternatives behind the default
    const r = await resolveBeneficiary({ query: 'un.org' }, directory);
    expect(r.matches.length).toBe(5);
    expect(r.alternatives.length).toBe(4);
  });
});

describe('F9.1c: resolveLocation', () => {
  test('self → default = current user location + 10 alternatives', async () => {
    const me = await directory.getCurrentUser();
    const r = await resolveLocation(me, directory);
    expect(r.defaultValue.code).toBe('NY-HQ');
    expect(r.alternatives).toHaveLength(10);
  });

  test('other beneficiary → default = beneficiary location', async () => {
    const bene = (await directory.resolveUser('Иванова'))[0]; // U002 Geneva
    const r = await resolveLocation(bene, directory);
    expect(r.defaultValue.code).toBe('GVA');
  });

  test('no beneficiary → falls back to current user location', async () => {
    const r = await resolveLocation(null, directory);
    expect(r.defaultValue.code).toBe('NY-HQ');
  });
});

describe('F9.2b: resolveAuthor', () => {
  test('no hint → defaults to current signed-in user (self)', async () => {
    const r = await resolveAuthor(null, directory);
    expect(r.mode).toBe('self');
    expect(r.defaultValue.userId).toBe('U001');
  });
  test('name hint → resolves that user', async () => {
    const r = await resolveAuthor('Иванова', directory);
    expect(r.defaultValue.userId).toBe('U002');
  });
});

describe('F9.2b: resolveApproverFor (administrative affiliation)', () => {
  test('beneficiary U002 → approver = their manager U005 + alternatives', async () => {
    const bene = (await directory.resolveUser('Иванова'))[0];
    const r = await resolveApproverFor({ slots: { beneficiary: { value: bene } } }, directory);
    expect(r.defaultValue.userId).toBe('U005');
    expect(r.alternatives.some((u) => u.userId === 'U005')).toBe(false); // default excluded
    expect(r.alternatives.every((u) => u.role === 'manager' || u.role === 'director')).toBe(true);
  });

  test('falls back to author when no beneficiary', async () => {
    const author = (await directory.resolveUser('Хассан'))[0]; // U003 → manager U001
    const r = await resolveApproverFor({ slots: { author: { value: author } } }, directory);
    expect(r.defaultValue.userId).toBe('U001');
  });

  test('director beneficiary → no default (needsInput), user picks', async () => {
    const dir4 = await directory.getUser('U004');
    const r = await resolveApproverFor({ slots: { beneficiary: { value: dir4 } } }, directory);
    expect(r.defaultValue).toBeNull();
    expect(r.needsInput).toBe(true);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
});

describe('F9.1c: runResolverForSlot', () => {
  test('user slot resolves from the hint', async () => {
    const draft = { slots: { beneficiary: { hint: { query: 'Петров' } } } };
    const resolved = await runResolverForSlot({ slotId: 'beneficiary', resolverRef: 'resolver:user' }, draft, directory);
    expect(resolved.source).toBe('resolver:user');
    expect(resolved.defaultValue.userId).toBe('U001');
  });

  test('location slot uses beneficiary value for default', async () => {
    const bene = (await directory.resolveUser('Иванова'))[0];
    const draft = { slots: { beneficiary: { value: bene } } };
    const resolved = await runResolverForSlot({ slotId: 'location', resolverRef: 'resolver:location' }, draft, directory);
    expect(resolved.defaultValue.code).toBe('GVA');
    expect(resolved.alternatives).toHaveLength(10);
  });

  test('author slot → current user by default', async () => {
    const resolved = await runResolverForSlot({ slotId: 'author', resolverRef: 'resolver:author' }, { slots: {} }, directory);
    expect(resolved.source).toBe('resolver:author');
    expect(resolved.defaultValue.userId).toBe('U001');
  });

  test('approver slot → manager of beneficiary', async () => {
    const bene = (await directory.resolveUser('Иванова'))[0];
    const resolved = await runResolverForSlot({ slotId: 'approver', resolverRef: 'resolver:approver' }, { slots: { beneficiary: { value: bene } } }, directory);
    expect(resolved.defaultValue.userId).toBe('U005');
  });

  test('non-resolver slot → null', async () => {
    expect(await runResolverForSlot({ slotId: 'x' }, { slots: {} }, directory)).toBeNull();
  });
});
