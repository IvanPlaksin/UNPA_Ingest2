/**
 * HexEdge.tsx — PCB-style ReactFlow edge type (Step 4.2)
 *
 * Renders polyline segments from HexRoute with glow, parallel offset,
 * dash animation for running status, and label positioning.
 */

import React, { memo, useMemo } from 'react';
import { getBezierPath, EdgeLabelRenderer } from 'reactflow';
import type { EdgeProps } from 'reactflow';
import type { HexRoute, RouteSegment } from '../../utils/hex-router';

// ── Types ────────────────────────────────────────────────────────────────

export type HexEdgeStatus = 'idle' | 'running' | 'done' | 'error' | 'highlighted';

export interface HexEdgeData {
  route?: HexRoute;
  status?: HexEdgeStatus;
  label?: string;
  trackIndex?: number;
  trackTotal?: number;
  trackSpacing?: number;
}

// ── Style constants ──────────────────────────────────────────────────────

const EDGE_COLORS: Record<HexEdgeStatus, string> = {
  idle: '#a1a1aa',
  running: '#fbbf24',
  done: '#4ade80',
  error: '#f87171',
  highlighted: '#facc15',
};

const EDGE_WIDTHS: Record<HexEdgeStatus, number> = {
  idle: 2.5,
  running: 3,
  done: 2.5,
  error: 3,
  highlighted: 3.5,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function applyPerpendicularOffset(
  seg: RouteSegment,
  offset: number,
): RouteSegment {
  if (offset === 0) return seg;

  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return seg;

  const perpX = -dy / len;
  const perpY = dx / len;

  return {
    from: { x: seg.from.x + perpX * offset, y: seg.from.y + perpY * offset },
    to:   { x: seg.to.x + perpX * offset,   y: seg.to.y + perpY * offset },
    angle: seg.angle,
  };
}

function buildPCBPath(
  segments: RouteSegment[],
  parallelOffset: number,
): { pathD: string; labelPos: { x: number; y: number } } {
  if (segments.length === 0) {
    return { pathD: '', labelPos: { x: 0, y: 0 } };
  }

  const offset = segments.map(s => applyPerpendicularOffset(s, parallelOffset));
  const parts: string[] = [];

  for (let i = 0; i < offset.length; i++) {
    const s = offset[i];
    if (i === 0) parts.push(`M ${s.from.x.toFixed(2)},${s.from.y.toFixed(2)}`);
    parts.push(`L ${s.to.x.toFixed(2)},${s.to.y.toFixed(2)}`);
  }

  const mid = offset[Math.floor(offset.length / 2)];
  const labelPos = {
    x: (mid.from.x + mid.to.x) / 2,
    y: (mid.from.y + mid.to.y) / 2,
  };

  return { pathD: parts.join(' '), labelPos };
}

// ── Component ────────────────────────────────────────────────────────────

const HexEdge: React.FC<EdgeProps<HexEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
}) => {
  const {
    route,
    status: rawStatus,
    label,
    trackIndex = 0,
    trackTotal = 1,
    trackSpacing = 12,
  } = data || {};

  // Diagnostic: check what data HexEdge receives (logs each edge once)
  if (typeof window !== 'undefined') {
    const logKey = `__hexEdge_${id}`;
    if (!(window as any)[logKey]) {
      (window as any)[logKey] = true;
      console.log('[HEX-EDGE-RENDER]', {
        id,
        hasRoute: !!route,
        segmentCount: route?.segments?.length,
        isValid: route?.isValid,
        usingFallback: !route || !route.segments || route.segments.length === 0,
        firstSegAngle: route?.segments?.[0]?.angle,
        pathType: route?.segments?.length ? 'polyline' : 'bezier-fallback',
      });
    }
  }

  const status: HexEdgeStatus = selected ? 'highlighted' : (rawStatus || 'idle');
  const color = EDGE_COLORS[status];
  const strokeWidth = EDGE_WIDTHS[status];

  const parallelOffset = useMemo(() => {
    if (trackTotal <= 1) return 0;
    return (trackIndex - (trackTotal - 1) / 2) * trackSpacing;
  }, [trackIndex, trackTotal, trackSpacing]);

  const { pathD, labelPos } = useMemo(() => {
    if (route && route.segments.length > 0) {
      return buildPCBPath(route.segments, parallelOffset);
    }
    // Fallback bezier
    const [path, lx, ly] = getBezierPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
    });
    return { pathD: path, labelPos: { x: lx, y: ly } };
  }, [route, parallelOffset, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const dashStyle = status === 'running'
    ? { strokeDasharray: '8 4', animation: 'hexEdgeDash 0.5s linear infinite' }
    : {};

  const glowRadius = status === 'idle' ? 2 : 4;

  return (
    <>
      {/* Glow filter definition */}
      <defs>
        <filter id={`hex-glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main edge path */}
      <path
        id={id}
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#hex-glow-${id})`}
        style={{ ...dashStyle, ...(style as React.CSSProperties) }}
        className="react-flow__edge-path"
      />

      {/* Invalid route overlay */}
      {route && !route.isValid && (
        <path
          d={pathD}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
      )}

      {/* Label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-0.5 rounded text-xs"
            // Inline styles for dark theme (no Tailwind bg dependency)
            // eslint-disable-next-line react/no-unknown-property
            {...{
              style: {
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
                pointerEvents: 'all',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 13,
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#f0f6fc',
              },
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Keyframe for dash animation (injected once) */}
      <style>{`
        @keyframes hexEdgeDash {
          to { stroke-dashoffset: -12; }
        }
      `}</style>
    </>
  );
};

export default memo(HexEdge);
