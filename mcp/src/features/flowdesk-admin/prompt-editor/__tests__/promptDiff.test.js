import { describe, it, expect } from 'vitest';

import { diffLines, condense, diffNodes } from '../promptDiff';

/**
 * HYB-011d — the diff an operator uses to answer one question: did this change what
 * the model receives? The node view can say "yes, I reworded that rule" while the
 * compiled view says "and it made no difference" — so both are tested, including the
 * case where they disagree.
 */

describe('diffLines', () => {
  it('marks what was removed and what took its place', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc');
    expect(d.filter((x) => x.type === 'del').map((x) => x.text)).toEqual(['b']);
    expect(d.filter((x) => x.type === 'add').map((x) => x.text)).toEqual(['B']);
    expect(d.filter((x) => x.type === 'same').map((x) => x.text)).toEqual(['a', 'c']);
  });

  it('identical text produces no changes at all', () => {
    expect(diffLines('one\ntwo', 'one\ntwo').every((x) => x.type === 'same')).toBe(true);
  });

  it('an insertion is an insertion, not a rewrite of everything after it', () => {
    const d = diffLines('a\nc', 'a\nb\nc');
    expect(d.filter((x) => x.type !== 'same')).toEqual([{ type: 'add', text: 'b' }]);
  });

  it('handles an empty side', () => {
    expect(diffLines('', 'x').filter((x) => x.type === 'add').length).toBe(1);
    expect(diffLines('x', '').filter((x) => x.type === 'del').length).toBe(1);
  });
});

describe('condense', () => {
  it('collapses the untouched middle and says how much it hid', () => {
    const before = ['h1', ...Array.from({ length: 20 }, (_, i) => `line ${i}`), 'tail'].join('\n');
    const after = before.replace('line 10', 'LINE TEN');

    const out = condense(diffLines(before, after), 1);

    expect(out.some((x) => x.type === 'gap' && /unchanged line/.test(x.text))).toBe(true);
    expect(out.some((x) => x.type === 'add' && x.text === 'LINE TEN')).toBe(true);
    expect(out.length).toBeLessThan(12);
  });
});

describe('diffNodes', () => {
  const thesis = (id, text, over = {}) => ({ nodeId: id, type: 'Thesis', title: id, assertion: text, ...over });

  it('reports added and removed nodes', () => {
    const d = diffNodes([thesis('a', 'x')], [thesis('a', 'x'), thesis('b', 'y')]);
    expect(d.added.map((n) => n.id)).toEqual(['b']);
    expect(d.removed).toEqual([]);
  });

  it('says WHAT changed about a node, not just that it changed', () => {
    const d = diffNodes([thesis('a', 'old')], [thesis('a', 'new', { status: 'RETIRED' })]);
    expect(d.changed[0].fields.sort()).toEqual(['status', 'text']);
    expect(d.changed[0].before).toBe('old');
    expect(d.changed[0].after).toBe('new');
  });

  it('reads the content out of whichever field the node type uses', () => {
    const before = [{ nodeId: 'n', type: 'Narrative', narrative: 'a story' }];
    const after = [{ nodeId: 'n', type: 'Narrative', narrative: 'a different story' }];
    expect(diffNodes(before, after).changed[0].fields).toEqual(['text']);
  });

  it('a node reworded in a field the compiler ignores still reads as changed here — which is the point', () => {
    // `text` on a Thesis is carried but never compiled. The node view must show the
    // edit; the compiled view is what shows it made no difference.
    const d = diffNodes([thesis('a', 'same', { text: 'old' })], [thesis('a', 'same', { text: 'new' })]);
    expect(d.changed).toEqual([]); // content (assertion) did not move…
    // …and the compiled prompt is identical, which is the honest answer.
    expect(diffLines('same', 'same').every((x) => x.type === 'same')).toBe(true);
  });

  it('works on legacy rule nodes too', () => {
    const before = [{ id: 'rule-a', data: { key: 'a', title: 'A', text: 'one' } }];
    const after = [{ id: 'rule-a', data: { key: 'a', title: 'A', text: 'two' } }];
    expect(diffNodes(before, after).changed[0].fields).toEqual(['text']);
  });
});
