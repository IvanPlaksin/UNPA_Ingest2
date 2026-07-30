'use strict';

/**
 * The chat walks the fields in the SOURCE FORM's order.
 *
 * Reported defect: once optional fields started being asked, they arrived first.
 * Cause: the next-slot pick filtered the pool down to slots whose dependencies were
 * already filled, so any dependency-free slot overtook an earlier one that was merely
 * waiting — and optional fields almost never carry a dependency. Shape taken from the
 * real EO-HR-SA-EXT form, where five required fields wait on the index number.
 */

const { chooseNextSlot } = require('../interpreter-engine');

const slot = (slotId, required, dependsOn = []) => ({ slotId, type: 'string', required, phase: 'detail', dependsOn });
const SNAPSHOT = {
  phases: ['detail'],
  slots: [
    slot('indexNumber', true),
    slot('staffMemberFullName', true, ['indexNumber']),
    slot('grade', true, ['indexNumber']),
    slot('comments', false),
    slot('typeOfExtension', true),
    slot('ifOtherPleaseSpecify', false),
  ],
};
const draftOf = (filled) => ({ slots: Object.fromEntries(filled.map((id) => [id, { value: 'x' }])) });

/** Walk the form the way advance() does, answering each slot as it is asked. */
function askOrder(snapshot) {
  const filled = [];
  const order = [];
  for (let i = 0; i < snapshot.slots.length; i++) {
    const draft = draftOf(filled);
    const remaining = snapshot.slots.filter((s) => !filled.includes(s.slotId));
    const next = chooseNextSlot(remaining, draft, snapshot);
    if (!next) break;
    order.push(next.slotId);
    filled.push(next.slotId);
  }
  return order;
}

describe('slots are asked in the source form order', () => {
  test('optional fields do not overtake earlier required ones that await a dependency', () => {
    expect(askOrder(SNAPSHOT)).toEqual(SNAPSHOT.slots.map((s) => s.slotId));
  });

  test('the very first pick is the first field of the form, not the first dependency-free one', () => {
    const next = chooseNextSlot(SNAPSHOT.slots, draftOf([]), SNAPSHOT);
    expect(next.slotId).toBe('indexNumber');
  });

  test('a slot whose dependency is already filled keeps its place', () => {
    const remaining = SNAPSHOT.slots.filter((s) => s.slotId !== 'indexNumber');
    expect(chooseNextSlot(remaining, draftOf(['indexNumber']), SNAPSHOT).slotId).toBe('staffMemberFullName');
  });

  test('a dependency that will never be asked does not stall the queue', () => {
    // grade waits on a slot that is neither filled nor pending — it must not block.
    const orphan = { phases: ['detail'], slots: [slot('grade', true, ['goneAway']), slot('comments', false)] };
    expect(chooseNextSlot(orphan.slots, draftOf([]), orphan).slotId).toBe('grade');
  });
});
