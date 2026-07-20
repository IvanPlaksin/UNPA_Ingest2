import { describe, it, expect } from 'vitest';
import { isAffectedByStale, groupSlotsByPhase, displayValue } from '../draft-view';

const schema = {
  phases: ['context', 'detail'],
  slots: [
    { slotId: 'a', phase: 'context', dependsOn: [] },
    { slotId: 'b', phase: 'detail', dependsOn: ['a'] },
    { slotId: 'c', phase: 'detail', dependsOn: ['b'] },
  ],
};

describe('F8 RULE-078 transitive stale chain', () => {
  it('stale root affects the whole dependsOn chain', () => {
    const slots = { a: { stale: true }, b: {}, c: {} };
    expect(isAffectedByStale('a', slots, schema)).toBe(true);
    expect(isAffectedByStale('b', slots, schema)).toBe(true); // depends on a
    expect(isAffectedByStale('c', slots, schema)).toBe(true); // depends on b→a
  });

  it('mid-chain stale affects downstream only', () => {
    const slots = { a: {}, b: { stale: true }, c: {} };
    expect(isAffectedByStale('a', slots, schema)).toBe(false);
    expect(isAffectedByStale('b', slots, schema)).toBe(true);
    expect(isAffectedByStale('c', slots, schema)).toBe(true);
  });

  it('no stale → nothing affected', () => {
    const slots = { a: {}, b: {}, c: {} };
    expect(['a', 'b', 'c'].some((id) => isAffectedByStale(id, slots, schema))).toBe(false);
  });

  it('handles cyclic dependsOn without infinite loop', () => {
    const cyc = { phases: ['x'], slots: [{ slotId: 'p', phase: 'x', dependsOn: ['q'] }, { slotId: 'q', phase: 'x', dependsOn: ['p'] }] };
    expect(isAffectedByStale('p', { p: {}, q: {} }, cyc)).toBe(false);
  });
});

describe('F8 grouping + display', () => {
  it('groups slots by phase in order, drops empty phases', () => {
    const groups = groupSlotsByPhase(schema);
    expect(groups.map((g) => g.phase)).toEqual(['context', 'detail']);
    expect(groups[1].slots.map((s) => s.slotId)).toEqual(['b', 'c']);
  });

  it('displayValue renders objects and blanks', () => {
    expect(displayValue({ name: 'Geneva' })).toBe('Geneva');
    expect(displayValue({ mode: 'self' })).toBe('self');
    expect(displayValue('')).toBeNull();
    expect(displayValue('laptop')).toBe('laptop');
  });
});
