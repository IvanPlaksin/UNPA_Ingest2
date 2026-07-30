/**
 * HYB-011 — where the nodes of the live prompt graph go on screen.
 *
 * The EVOLUTIO graph has **no edges**: 22 nodes, `edgeCount: 0`. Order comes from
 * `priority`, not from a chain. So the spec's "hierarchical layout along the flow of
 * compilation" has no flow to follow, and a force simulation would arrange 22
 * unconnected nodes into a meaningless cloud.
 *
 * What the graph IS is a set of rules with types and priorities, so that is what the
 * layout shows — ratified 2026-07-30:
 *
 *   Narrative     (top)          what the assistant IS
 *   Thesis        (middle)       what it should do, left→right by priority
 *   Persona       (lower left)   how it should sound
 *   Constraint    (lower right)  what it may never do; immutable ones last
 *
 * Vertical position is the node's TYPE, horizontal is its PRIORITY — which reads as
 * "narrative → theses → persona and limits", the order the compiled prompt is
 * actually assembled in. Nothing here invents structure the graph does not have; a
 * flowchart of unconnected rules would be a picture pretending to be a diagram.
 *
 * Pure: takes nodes, returns nodes with positions. No ReactFlow, no store.
 */

/** Vertical bands, in compilation order. Anything unrecognised sits with the theses. */
const BAND = { Narrative: 0, Thesis: 1, Persona: 2, Constraint: 2 };
const BAND_Y = [40, 220, 620];
const COL_W = 300;
const ROW_H = 130;
/** Persona and Constraint share a band; each gets half the width. */
const SPLIT_X = { Persona: 0, Constraint: 1 };

const typeOf = (n) => (n.data && (n.data.nodeType || n.data.type)) || n.type || 'Thesis';
const priorityOf = (n) => {
  const p = (n.data && n.data.priority);
  return typeof p === 'number' ? p : 100;
};
const isImmutable = (n) => !!(n.data && n.data.immutable);

/**
 * @param {Array} nodes  editor nodes (data.nodeType / data.priority / data.immutable)
 * @param {{perRow?: number}} [opts]
 * @returns {Array} the same nodes with `position` set
 */
export function layoutByPriority(nodes, opts = {}) {
  const perRow = opts.perRow || 4;
  const bands = new Map(); // band index -> nodes, already ordered

  for (const n of nodes || []) {
    const t = typeOf(n);
    const b = BAND[t] ?? 1;
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(n);
  }

  const out = [];
  for (const [band, list] of bands) {
    // Priority first (lower = earlier in the prompt), then immutable constraints
    // last within their group, then title for a stable order between equals — the
    // layout must not shuffle when nothing changed.
    const ordered = [...list].sort((a, b2) => priorityOf(a) - priorityOf(b2)
      || Number(isImmutable(a)) - Number(isImmutable(b2))
      || String((a.data && a.data.title) || a.id).localeCompare(String((b2.data && b2.data.title) || b2.id)));

    // In the shared bottom band, Persona and Constraint occupy their own halves.
    const groups = band === 2
      ? [['Persona', ordered.filter((n) => typeOf(n) === 'Persona')], ['Constraint', ordered.filter((n) => typeOf(n) !== 'Persona')]]
      : [[null, ordered]];

    for (const [kind, group] of groups) {
      const xOffset = kind ? SPLIT_X[kind] * (perRow * COL_W) / 2 : 0;
      group.forEach((n, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        out.push({
          ...n,
          position: {
            x: 60 + xOffset + col * COL_W,
            y: (BAND_Y[band] ?? BAND_Y[1]) + row * ROW_H,
          },
        });
      });
    }
  }

  // Anything the bands did not claim (an unexpected shape) keeps its own position
  // rather than being dropped — losing a node off-screen is worse than a stray one.
  const placed = new Set(out.map((n) => n.id));
  for (const n of nodes || []) if (!placed.has(n.id)) out.push(n);
  return out;
}

export { typeOf as nodeTypeOf, priorityOf as nodePriorityOf };
