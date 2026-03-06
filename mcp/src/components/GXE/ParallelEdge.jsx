/**
 * ParallelEdge — Custom ReactFlow edge that separates overlapping parallel edges.
 *
 * Three rendering modes:
 *   A) ELK polyline  — if data.elkRoute exists, render ELK-computed bend points
 *   B) Offset path   — if data.parallelOffset !== 0, shift source/target perpendicular
 *   C) Standard      — fallback to normal path (no offset, no ELK)
 *
 * Path function is selected by data.edgePathType:
 *   'smoothstep' (default) | 'default' (bezier) | 'step' | 'straight'
 */

import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
} from 'reactflow';

const ParallelEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  label,
  style,
}) => {
  // ── Mode A: ELK-routed polyline ──────────────────────────────
  if (data?.elkRoute?.length >= 2) {
    const points = data.elkRoute;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    // Label at midpoint of route
    const mid = points[Math.floor(points.length / 2)];

    return (
      <>
        <BaseEdge id={id} path={d} markerEnd={markerEnd} style={style} />
        {label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${mid.x}px,${mid.y}px)`,
                fontSize: 10,
                pointerEvents: 'all',
              }}
              className="bg-[#161b22] px-1 rounded text-gray-400 border border-[#30363d]"
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  // ── Mode B/C: Offset or standard ─────────────────────────────
  const offset = data?.parallelOffset || 0;
  let sx = sourceX, sy = sourceY, tx = targetX, ty = targetY;

  if (offset !== 0) {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular unit vector
    const px = -dy / len;
    const py = dx / len;
    sx += px * offset;
    sy += py * offset;
    tx += px * offset;
    ty += py * offset;
  }

  const pathType = data?.edgePathType || 'smoothstep';
  const pathArgs = {
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
  };

  let edgePath, labelX, labelY;

  switch (pathType) {
    case 'default':
      [edgePath, labelX, labelY] = getBezierPath(pathArgs);
      break;
    case 'straight':
      [edgePath, labelX, labelY] = getStraightPath(pathArgs);
      break;
    case 'step':
      [edgePath, labelX, labelY] = getSmoothStepPath({ ...pathArgs, borderRadius: 0 });
      break;
    case 'smoothstep':
    default:
      [edgePath, labelX, labelY] = getSmoothStepPath(pathArgs);
      break;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              pointerEvents: 'all',
            }}
            className="bg-[#161b22] px-1 rounded text-gray-400 border border-[#30363d]"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default ParallelEdge;
