import React, { useMemo } from 'react';
import { useNodes, useViewport } from 'reactflow';
import { PALETTE } from './EntityGraph2D';

/* ── Andrew's Monotone Chain convex hull ────────────────────────────────── */

function convexHull(pts) {
    if (pts.length < 3) return pts;
    const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (O, A, B) =>
        (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0)
            upper.pop();
        upper.push(sorted[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/* Push each hull vertex outward from centroid by `px` flow-pixels */
function expandHull(hull, px) {
    if (hull.length < 3) return hull;
    const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
    return hull.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return [x + (dx / len) * px, y + (dy / len) * px];
    });
}

/* ── HullOverlay ─────────────────────────────────────────────────────────── */

/**
 * Renders semi-transparent convex hull polygons grouped by entity type.
 * Must be rendered inside ReactFlow's provider tree to access useNodes/useViewport.
 */
export default function HullOverlay() {
    const nodes             = useNodes();
    const { x: vpX, y: vpY, zoom } = useViewport();

    const groups = useMemo(() => {
        const byType = {};
        nodes.forEach(n => {
            if (!n.position) return;
            const type = (n.data?.type || 'DEFAULT').toUpperCase();
            (byType[type] = byType[type] || []).push(n);
        });

        return Object.entries(byType).flatMap(([type, ns]) => {
            if (ns.length < 2) return [];

            // Collect all four corners of each node as hull input
            const pts = ns.flatMap(({ position: { x, y }, width: w = 200, height: h = 70 }) =>
                [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
            );

            const hull = convexHull(pts);
            if (hull.length < 3) return [];

            const expanded = expandHull(hull, 22);
            const color    = (PALETTE[type] || PALETTE.default).border;
            const cx       = expanded.reduce((s, p) => s + p[0], 0) / expanded.length;
            const cy       = expanded.reduce((s, p) => s + p[1], 0) / expanded.length;

            return [{ type, hull: expanded, color, cx, cy, count: ns.length }];
        });
    }, [nodes]);

    if (!groups.length) return null;

    // Convert flow coordinates → screen coordinates
    const fl = ([x, y]) => [x * zoom + vpX, y * zoom + vpY];

    return (
        <svg style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 0,
        }}>
            {groups.map(({ type, hull, color, cx, cy }) => {
                const screenPts = hull.map(fl);
                const [scx, scy] = fl([cx, cy]);
                const pts = screenPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

                return (
                    <React.Fragment key={type}>
                        <polygon
                            points={pts}
                            fill={`${color}15`}
                            stroke={`${color}50`}
                            strokeWidth={1.5}
                            strokeDasharray="6 3"
                            strokeLinejoin="round"
                        />
                        <text
                            x={scx.toFixed(1)}
                            y={scy.toFixed(1)}
                            fill={`${color}60`}
                            fontSize={11}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{
                                userSelect: 'none',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                            }}
                        >
                            {type}
                        </text>
                    </React.Fragment>
                );
            })}
        </svg>
    );
}
