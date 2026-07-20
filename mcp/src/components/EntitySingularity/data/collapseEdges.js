/**
 * collapseParallelEdges — merges all parallel (same source→target) edges into
 * one combined edge that carries the sum of individual weights plus references
 * to the originals.
 *
 * Directionality is preserved: A→B and B→A are kept as separate merged edges.
 */
export function collapseParallelEdges(links) {
    const edgeMap = new Map();

    for (const link of links) {
        const src = typeof link.source === 'object' ? link.source.id : link.source;
        const tgt = typeof link.target === 'object' ? link.target.id : link.target;
        const key = `${src}||${tgt}`;

        if (edgeMap.has(key)) {
            const m = edgeMap.get(key);
            m.weight += (link.weight || 1);
            m.mergedEdges.push(link);
        } else {
            edgeMap.set(key, {
                source: src,
                target: tgt,
                type: link.type || 'RELATED_TO',
                weight: link.weight || 1,
                mergedEdges: [link],
                // Keep first edge's supplemental metadata
                context: link.context || null,
                confidence: link.confidence ?? null,
                documentId: link.documentId || null,
                sourceNode: link.sourceNode || null,
                targetNode: link.targetNode || null,
            });
        }
    }

    return [...edgeMap.values()].map(e => ({
        ...e,
        isMerged: e.mergedEdges.length > 1,
    }));
}

// ── Weight-to-visual mapping ──────────────────────────────────────────────────

// Tiers control LINE THICKNESS only. Color is assigned via weightToColor().
// Opacity increases slightly with weight to reinforce the "hot" sensation.
export const WEIGHT_TIERS = [
    { threshold: 1,        linewidth: 1.0, opacity: 0.50 },
    { threshold: 3,        linewidth: 1.5, opacity: 0.65 },
    { threshold: 6,        linewidth: 2.5, opacity: 0.78 },
    { threshold: 12,       linewidth: 3.5, opacity: 0.90 },
    { threshold: Infinity, linewidth: 5.5, opacity: 1.00 },
];

export function getTierIndex(weight) {
    for (let i = 0; i < WEIGHT_TIERS.length; i++) {
        if (weight <= WEIGHT_TIERS[i].threshold) return i;
    }
    return WEIGHT_TIERS.length - 1;
}

/**
 * Continuous gray → gold gradient, with optional weight-based dimming.
 *
 * t = 0 (cold, low weight)  → #3d3d3d (dark gray)
 * t = 1 (hot,  high weight) → #FFD700 (gold)
 *
 * weightFade (0..1) — controls how much low-weight edges are dimmed:
 *   0 = no dimming (all edges at full brightness)
 *   1 = full dimming (low-weight edges near black, high-weight fully bright)
 *
 * Returns [r, g, b] in 0..1 range suitable for Three.js vertex colors.
 */
export function weightToColor(weight, maxWeight, weightFade = 0) {
    // Normalise so that weight=1 always maps to t=0 regardless of maxWeight.
    const t = maxWeight > 1
        ? Math.max(0, Math.min((weight - 1) / (maxWeight - 1), 1))
        : 1;

    // Cold anchor: #3d3d3d
    const cr = 0.239, cg = 0.239, cb = 0.239;
    // Hot anchor: #FFD700
    const hr = 1.000, hg = 0.843, hb = 0.000;

    let r = cr + t * (hr - cr);
    let g = cg + t * (hg - cg);
    let b = cb + t * (hb - cb);

    // Weight-based brightness dimming: lerp(1-weightFade, 1.0, t)
    // Low weight (t≈0) → dim by (1-weightFade); high weight (t≈1) → full brightness
    if (weightFade > 0) {
        const dim = (1 - weightFade) + t * weightFade;
        r *= dim;
        g *= dim;
        b *= dim;
    }

    return [r, g, b];
}
