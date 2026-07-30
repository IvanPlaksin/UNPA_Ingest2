'use strict';

/**
 * TASK-FLOWDESK-BUG-002 — the derived quality flags are a contract with the
 * operator: a flag shown in the admin UI must be one the data can actually
 * produce, and the session list's `flagged=true` filter must select exactly the
 * sessions the view marks as negative. `negative_csat` broke both — it was
 * derived from ChatSession.rating, which nothing writes, and it was absent from
 * the filter, so a flagged session could be missing from the negative feed.
 */

const fs = require('fs');
const path = require('path');

const admin = require('../chat-admin.service');

const SOURCE = fs.readFileSync(path.join(__dirname, '../chat-admin.service.js'), 'utf8');
const LIVE_FLAGS = ['repair_heavy', 'out_of_scope_loop', 'error_turns'];

describe('derived quality flags', () => {
  test('each live flag fires from a field the telemetry actually writes', () => {
    expect(admin.sessionView({ repairSession: 3 }).flags).toEqual(['repair_heavy']);
    expect(admin.sessionView({ outOfScopeTurns: 2 }).flags).toEqual(['out_of_scope_loop']);
    expect(admin.sessionView({ errorTurns: 1 }).flags).toEqual(['error_turns']);
  });

  test('a clean session carries no flags and is not negative', () => {
    const v = admin.sessionView({ outcome: 'completed', repairSession: 1, outOfScopeTurns: 0, errorTurns: 0 });
    expect(v.flags).toEqual([]);
    expect(v.negative).toBe(false);
  });

  test('a bad outcome is negative even without flags', () => {
    for (const outcome of admin.BAD_OUTCOMES) {
      expect(admin.sessionView({ outcome }).negative).toBe(true);
    }
  });

  test('a rating value produces no flag — nothing collects CSAT', () => {
    // Were rating ever written, this would be the place to reinstate the flag.
    expect(admin.sessionView({ rating: 1 }).flags).toEqual([]);
    expect(admin.sessionView({ rating: 1 }).negative).toBe(false);
  });

  test('rating is not read anywhere in the admin service', () => {
    expect(SOURCE).not.toMatch(/\bs\.rating\b/);
  });

  test('every derived flag has a matching condition in the flagged=true filter', () => {
    // The filter selects on the same fields the flags derive from; a flag with no
    // counterpart there would mark sessions the negative feed cannot return.
    const filter = SOURCE.slice(SOURCE.indexOf('f.flagged ==='), SOURCE.indexOf('const where ='));
    expect(filter).toContain('s.repairSession');
    expect(filter).toContain('s.outOfScopeTurns');
    expect(filter).toContain('s.errorTurns');
    expect(filter).not.toContain('rating');
  });

  test('the flag vocabulary is exactly the live set', () => {
    const all = new Set([
      ...admin.sessionView({ repairSession: 9, outOfScopeTurns: 9, errorTurns: 9, rating: 1 }).flags,
    ]);
    expect([...all].sort()).toEqual([...LIVE_FLAGS].sort());
  });
});
