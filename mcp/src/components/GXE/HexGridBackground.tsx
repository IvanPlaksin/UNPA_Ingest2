/**
 * HexGridBackground.tsx — SVG hex grid overlay for ReactFlow (Step 3.1 v2)
 *
 * Renders a flat-top hexagonal grid synchronized with ReactFlow viewport.
 * Background hexagons are unfilled with light gray borders.
 * Occupied cells show a subtle indigo fill, routing cells show heatmap.
 */

import React, { useMemo } from 'react';
import { useViewport } from 'reactflow';
import {
  HexCoord,
  HexGridConfig,
  hex,
  hexToPixel,
  hexKey,
  pixelToHex,
} from '../../utils/hex-coords';
import type { DebugRoadMap } from '../../utils/hex-road-map';

// ── Grid Colors ──────────────────────────────────────────────────────────

const GRID_COLORS = {
  stroke: '#8b949e',          // light gray edges (full mode)
  strokeMinimal: '#6e7681',   // light gray edges (minimal mode)
  occupiedFill: 'rgba(99, 102, 241, 0.08)',
  debugText: '#8b949e',
};

// ── Types ────────────────────────────────────────────────────────────────

interface HexGridBackgroundProps {
  config: HexGridConfig;
  style?: 'minimal' | 'full' | 'debug';
  occupiedCells?: Set<string>;
  routingHeatmap?: Map<string, number>;
  visible?: boolean;
  debugRoadMap?: DebugRoadMap | null;
  showDebugRoadMap?: boolean;
}

// ── Hex path generator (flat-top, matching HexNode geometry) ─────────────

function hexagonPathD(coord: HexCoord, config: HexGridConfig): string {
  const center = hexToPixel(coord, config);
  const size = config.hexSize;
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const px = center.x + size * Math.cos(angle);
    const py = center.y + size * Math.sin(angle);
    pts.push(`${i === 0 ? 'M' : 'L'} ${px},${py}`);
  }
  return pts.join(' ') + ' Z';
}

// ── HexGridBackground ────────────────────────────────────────────────────

const HexGridBackground: React.FC<HexGridBackgroundProps> = ({
  config,
  style: gridStyle = 'minimal',
  occupiedCells,
  routingHeatmap,
  visible = true,
  debugRoadMap,
  showDebugRoadMap = false,
}) => {
  const { x, y, zoom } = useViewport();

  const visibleHexes = useMemo(() => {
    if (!visible) return [];

    const viewportWidth = (typeof window !== 'undefined' ? window.innerWidth : 1920) / zoom;
    const viewportHeight = (typeof window !== 'undefined' ? window.innerHeight : 1080) / zoom;

    const worldLeft = -x / zoom;
    const worldTop = -y / zoom;
    const worldRight = worldLeft + viewportWidth;
    const worldBottom = worldTop + viewportHeight;

    const topLeftHex = pixelToHex({ x: worldLeft, y: worldTop }, config);
    const bottomRightHex = pixelToHex({ x: worldRight, y: worldBottom }, config);

    const margin = 2;
    const hexes: HexCoord[] = [];
    const MAX_VISIBLE_CELLS = 500;

    const qMin = topLeftHex.q - margin;
    const qMax = bottomRightHex.q + margin;
    const rMin = topLeftHex.r - margin;
    const rMax = bottomRightHex.r + margin;

    if ((qMax - qMin) * (rMax - rMin) > MAX_VISIBLE_CELLS) {
      return [];
    }

    for (let q = qMin; q <= qMax; q++) {
      for (let r = rMin; r <= rMax; r++) {
        hexes.push(hex(q, r));
      }
    }

    return hexes;
  }, [x, y, zoom, config, visible]);

  // Batch paths by fill type for performance
  const { emptyPaths, occupiedPaths, routingPaths, debugLabels } = useMemo(() => {
    const empty: string[] = [];
    const occupied: string[] = [];
    const routing: Array<{ d: string; fill: string }> = [];
    const labels: Array<{ cx: number; cy: number; text: string }> = [];

    for (const hc of visibleHexes) {
      const key = hexKey(hc);
      const d = hexagonPathD(hc, config);

      const isOcc = occupiedCells?.has(key);
      const occ = routingHeatmap?.get(key);

      if (isOcc) {
        occupied.push(d);
      } else if (occ !== undefined && occ > 0) {
        // Subtle heatmap — low opacity to avoid visual noise over routing lines
        let fill: string;
        if (occ < 0.5) fill = `rgba(6, 182, 212, ${occ * 0.05})`;
        else if (occ < 0.8) fill = `rgba(234, 179, 8, ${occ * 0.05})`;
        else fill = `rgba(239, 68, 68, ${occ * 0.08})`;
        routing.push({ d, fill });
      } else {
        empty.push(d);
      }

      if (gridStyle === 'debug') {
        const center = hexToPixel(hc, config);
        labels.push({ cx: center.x, cy: center.y, text: `${hc.q},${hc.r}` });
      }
    }

    return {
      emptyPaths: empty.join(' '),
      occupiedPaths: occupied.join(' '),
      routingPaths: routing,
      debugLabels: labels,
    };
  }, [visibleHexes, config, occupiedCells, routingHeatmap, gridStyle]);

  if (!visible || visibleHexes.length === 0) return null;

  const strokeColor = gridStyle === 'minimal' ? GRID_COLORS.strokeMinimal : GRID_COLORS.stroke;
  const strokeOpacity = gridStyle === 'minimal' ? 0.35 : 0.55;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        overflow: 'visible',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {/* Empty cells — unfilled with light gray border */}
        {emptyPaths && (
          <path
            d={emptyPaths}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1}
            strokeOpacity={strokeOpacity}
          />
        )}

        {/* Occupied cells — subtle indigo fill */}
        {occupiedPaths && (
          <path
            d={occupiedPaths}
            fill={GRID_COLORS.occupiedFill}
            stroke={strokeColor}
            strokeWidth={1}
            strokeOpacity={strokeOpacity + 0.1}
          />
        )}

        {/* Routing cells — heatmap fill */}
        {routingPaths.map((rp, i) => (
          <path
            key={i}
            d={rp.d}
            fill={rp.fill}
            stroke={strokeColor}
            strokeWidth={1}
            strokeOpacity={strokeOpacity}
          />
        ))}

        {/* Debug labels */}
        {debugLabels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.cx}
            y={lbl.cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={GRID_COLORS.debugText}
            fontSize={10}
          >
            {lbl.text}
          </text>
        ))}

        {/* Road Map debug overlay */}
        {showDebugRoadMap && debugRoadMap && (
          <g className="debug-road-map" opacity={0.7}>
            {/* Edges — thin gray lines */}
            {debugRoadMap.edges.map((e, i) => (
              <line
                key={i}
                x1={e.from.x} y1={e.from.y}
                x2={e.to.x}   y2={e.to.y}
                stroke="#4b5563"
                strokeWidth={0.4}
                opacity={0.4}
              />
            ))}
            {/* Vertices — colored by type */}
            {debugRoadMap.vertices.map((v, i) => {
              const color =
                v.type === 'rail-corner' ? '#ef4444' :
                v.type === 'landing-pt'  ? '#3b82f6' :
                v.type === 'face-port'   ? '#22c55e' :
                v.type === 'mid-face'    ? '#f59e0b' : '#9ca3af';
              const r = v.type === 'rail-corner' ? 2.5 : 1.5;
              return (
                <circle key={i} cx={v.x} cy={v.y} r={r} fill={color} opacity={0.8} />
              );
            })}
          </g>
        )}
      </g>
    </svg>
  );
};

HexGridBackground.displayName = 'HexGridBackground';

export default HexGridBackground;
export { HexGridBackground, GRID_COLORS };
export type { HexGridBackgroundProps };
