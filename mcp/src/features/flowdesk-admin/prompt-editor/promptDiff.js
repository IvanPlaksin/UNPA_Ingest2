/**
 * HYB-011d — what actually changes for the model between two versions.
 *
 * An operator comparing versions wants two different answers, and the second one
 * matters more:
 *
 *   - WHICH NODES moved (added, removed, reworded) — the edit they think they made;
 *   - WHAT THE COMPILED PROMPT looks like before and after — the edit the model
 *     receives. These are not the same thing. A node can be reworded and contribute
 *     nothing (retired, filtered, wrong language), and a node can be left alone while
 *     its compiled position changes because something above it moved. Only the second
 *     view can be trusted to answer "did this change the prompt".
 *
 * Pure and dependency-free: a diff is arithmetic, and a library would be a dependency
 * for thirty lines.
 */

/**
 * Line diff via the classic LCS table. Small inputs (a prompt is a few hundred
 * lines), so the quadratic table is the right trade for exactness.
 *
 * @param {string} before
 * @param {string} after
 * @returns {Array<{type:'same'|'add'|'del', text:string}>}
 */
export function diffLines(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i += 1; }
    else { out.push({ type: 'add', text: b[j] }); j += 1; }
  }
  while (i < a.length) { out.push({ type: 'del', text: a[i] }); i += 1; }
  while (j < b.length) { out.push({ type: 'add', text: b[j] }); j += 1; }
  return out;
}

/**
 * Drop the long stretches of unchanged lines, keeping a little context — a prompt is
 * mostly unchanged between two versions, and a diff that shows all of it hides the
 * part being looked at.
 */
export function condense(diff, context = 2) {
  const keep = new Array(diff.length).fill(false);
  diff.forEach((d, i) => {
    if (d.type === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k += 1) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  diff.forEach((d, i) => {
    if (keep[i]) {
      if (skipped) { out.push({ type: 'gap', text: `… ${skipped} unchanged line${skipped === 1 ? '' : 's'} …` }); skipped = 0; }
      out.push(d);
    } else skipped += 1;
  });
  if (skipped) out.push({ type: 'gap', text: `… ${skipped} unchanged line${skipped === 1 ? '' : 's'} …` });
  return out;
}

const contentOf = (n) => n.assertion ?? n.narrative ?? n.persona ?? n.rule ?? n.text ?? (n.data && n.data.text) ?? '';
const idOf = (n) => n.nodeId || (n.data && n.data.key) || n.id;

/**
 * Node-level differences between two graphs, in either ontology.
 *
 * @returns {{added:Array, removed:Array, changed:Array}} `changed` carries what moved
 *   — the text, the status, or the type — because "changed" alone tells an operator
 *   nothing about whether the model will notice.
 */
export function diffNodes(beforeNodes, afterNodes) {
  const before = new Map((beforeNodes || []).map((n) => [idOf(n), n]));
  const after = new Map((afterNodes || []).map((n) => [idOf(n), n]));

  const added = [...after.keys()].filter((k) => !before.has(k)).map((k) => ({ id: k, title: after.get(k).title || k }));
  const removed = [...before.keys()].filter((k) => !after.has(k)).map((k) => ({ id: k, title: before.get(k).title || k }));
  const changed = [];

  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) continue;
    const fields = [];
    if (contentOf(b) !== contentOf(a)) fields.push('text');
    if ((b.status || 'ACTIVE') !== (a.status || 'ACTIVE')) fields.push('status');
    if (b.type !== a.type) fields.push('type');
    if ((b.title || '') !== (a.title || '')) fields.push('title');
    if (fields.length) {
      changed.push({ id: k, title: a.title || k, fields, before: contentOf(b), after: contentOf(a) });
    }
  }

  return { added, removed, changed };
}
