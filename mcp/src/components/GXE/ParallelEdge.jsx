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
  // Only use ELK route if endpoints still match current node positions
  // (within tolerance). If nodes have moved (drag, repulsion, AI layout),
  // the absolute ELK coordinates are stale — fall through to Mode B/C.
  if (data?.elkRoute?.length >= 2) {
    const points = data.elkRoute;
    const first = points[0];
    const last = points[points.length - 1];
    const tolerance = 30; // px — allows minor rounding but catches real moves

    const sourceMatch =
      Math.abs(first.x - sourceX) < tolerance &&
      Math.abs(first.y - sourceY) < tolerance;
    const targetMatch =
      Math.abs(last.x - targetX) < tolerance &&
      Math.abs(last.y - targetY) < tolerance;

    if (sourceMatch && targetMatch) {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
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
                  fontSize: 12,
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
    // Stale elkRoute — fall through to smoothstep routing
  }

  // ── Mode A2: Obstacle-avoiding route (computed reactively) ────
  // Only use if endpoints still match current positions (route becomes stale during drag)
  if (data?.obstacleRoute?.length >= 2) {
    const points = data.obstacleRoute;
    const first = points[0];
    const last = points[points.length - 1];
    const tol = 50;

    const srcOk = Math.abs(first.x - sourceX) < tol && Math.abs(first.y - sourceY) < tol;
    const tgtOk = Math.abs(last.x - targetX) < tol && Math.abs(last.y - targetY) < tol;

    if (srcOk && tgtOk) {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
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
                  fontSize: 12,
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
    // Stale obstacleRoute — fall through to smoothstep
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
              fontSize: 12,
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
