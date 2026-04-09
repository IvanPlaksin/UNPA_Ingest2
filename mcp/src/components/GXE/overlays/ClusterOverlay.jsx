/**
 * ClusterOverlay — SVG overlay for cluster boundaries on ReactFlow canvas.
 * Migrated from Nexus/Overlay/ClusterOverlay (CONS-18).
 * Self-contained: clusters passed as prop, no nexusStore.
 */
import React, { memo, useMemo, useEffect, useState } from 'react';

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#f97316',
  '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899',
];

/* ── Convex hull (Graham scan) ───────────────────────────── */

function convexHull(points) {
  if (points.length < 3) return points;
  const start = points.reduce((min, p) =>
    p.y > min.y || (p.y === min.y && p.x < min.x) ? p : min
  );
  const sorted = points
    .filter(p => p !== start)
    .sort((a, b) => {
      const aa = Math.atan2(a.y - start.y, a.x - start.x);
      const ab = Math.atan2(b.y - start.y, b.x - start.x);
      return aa - ab;
    });
  const hull = [start];
  for (const pt of sorted) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) > 0) break;
      hull.pop();
    }
    hull.push(pt);
  }
  return hull;
}

function expandHull(pts, pad) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d + pad) / d;
    return { x: cx + dx * f, y: cy + dy * f };
  });
}

function smoothPath(pts) {
  if (pts.length < 3) return '';
  const closed = [...pts, pts[0], pts[1]];
  const parts = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < closed.length - 1; i++) {
    const p0 = closed[i - 1], p1 = closed[i], p2 = closed[i + 1];
    const cx1 = (p0.x + p1.x) / 2, cy1 = (p0.y + p1.y) / 2;
    const cx2 = (p1.x + p2.x) / 2, cy2 = (p1.y + p2.y) / 2;
    parts.push(`Q ${p1.x} ${p1.y} ${cx2} ${cy2}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/* ── Component ───────────────────────────────────────────── */

const ClusterOverlay = memo(({ clusters = [], nodes = [], viewport, reactFlowInstance }) => {
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      const el = document.querySelector('.react-flow');
      if (el) setDims({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Build node screen positions
  const nodePos = useMemo(() => {
    const map = {};
    for (const n of nodes) {
      const cx = n.position.x + (n.width || 150) / 2;
      const cy = n.position.y + (n.height || 50) / 2;
      if (reactFlowInstance?.flowToScreenPosition) {
        map[n.id] = reactFlowInstance.flowToScreenPosition({ x: cx, y: cy });
      } else {
        const { x: vx, y: vy, zoom } = viewport || { x: 0, y: 0, zoom: 1 };
        map[n.id] = { x: cx * zoom + vx, y: cy * zoom + vy };
      }
    }
    return map;
  }, [nodes, viewport, reactFlowInstance]);

  // Build hull shapes
  const shapes = useMemo(() => {
    return clusters.map((cluster, i) => {
      const ids = cluster.nodeIds || [];
      const pts = ids.map(id => nodePos[id]).filter(Boolean);
      if (pts.length < 3) return null;
      const hull = expandHull(convexHull(pts), 30);
      const color = cluster.color || COLORS[i % COLORS.length];
      // Label position: top-left of hull
      const labelPt = hull.reduce((best, p) => (p.y < best.y ? p : best), hull[0]);
      return { id: cluster.id || i, name: cluster.name || '', hull, color, labelPt, path: smoothPath(hull) };
    }).filter(Boolean);
  }, [clusters, nodePos]);

  if (shapes.length === 0) return null;

  return (
    <svg
      width={dims.w}
      height={dims.h}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      <defs>
        {shapes.map(s => (
          <linearGradient key={`g-${s.id}`} id={`cg-${s.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.08} />
          </linearGradient>
        ))}
      </defs>
      {shapes.map(s => (
        <g key={s.id}>
          <path
            d={s.path}
            fill={`url(#cg-${s.id})`}
            stroke={s.color}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeDasharray="6 3"
          />
          {s.name && (
            <text
              x={s.labelPt.x}
              y={s.labelPt.y - 8}
              fill={s.color}
              fontSize={11}
              fontWeight={600}
              opacity={0.7}
            >
              {s.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
});

ClusterOverlay.displayName = 'ClusterOverlay';
export default ClusterOverlay;
