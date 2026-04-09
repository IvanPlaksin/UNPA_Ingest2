/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG Edge Component
 * Custom React Flow edge for AOPEG graph editor - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow';
import { Zap } from 'lucide-react';
import { AOPEGEdgeData } from '../../types/aopeg.types';

export const AOPEGEdge: React.FC<EdgeProps<AOPEGEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}) => {
  // Check for ELK-computed bend points (orthogonal routing)
  const elkRoute = data?.elkRoute;
  const hasElkRoute = elkRoute && elkRoute.length > 1;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (hasElkRoute) {
    // Polyline through ELK bend points (orthogonal routing)
    edgePath = elkRoute
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`)
      .join(' ');

    // Label at midpoint of the polyline
    const midIndex = Math.floor(elkRoute.length / 2);
    labelX = elkRoute[midIndex].x;
    labelY = elkRoute[midIndex].y;
  } else {
    // Fallback: standard Bezier curve
    const [path, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  const hasCondition = data?.condition && data.condition.type !== 'always';
  const hasDataMapping = data?.dataMapping && data.dataMapping.length > 0;
  const wasTaken = data?.wasTaken;
  const isEvaluating = data?.isEvaluating;

  // Determine edge style based on state - Dark Theme Colors
  let strokeColor = '#6e7681'; // default muted gray
  let strokeWidth = 2;
  let strokeDasharray: string | undefined;
  let animated = false;
  let glowFilter = '';

  if (isEvaluating) {
    strokeColor = '#f59e0b'; // amber
    strokeWidth = 2.5;
    animated = true;
    glowFilter = 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))';
  } else if (wasTaken) {
    strokeColor = '#22c55e'; // green
    strokeWidth = 2.5;
    glowFilter = 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))';
  } else if (selected) {
    strokeColor = '#3b82f6'; // blue
    strokeWidth = 2.5;
    glowFilter = 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))';
  } else if (hasCondition) {
    strokeDasharray = '6,4';
    strokeColor = '#f59e0b'; // amber for conditional
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          filter: glowFilter,
        }}
        className={animated ? 'animate-pulse' : ''}
      />

      <EdgeLabelRenderer>
        {/* Main Label */}
        {data?.label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`
              px-2 py-1 rounded text-xs font-medium border
              ${selected
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : wasTaken
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-[#2d333b] text-[#8b949e] border-[#30363d]'
              }
              shadow-lg
            `}
          >
            {data.label}
          </div>
        )}

        {/* Condition Indicator */}
        {hasCondition && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -150%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs shadow-lg"
            title={`Condition: ${data?.condition?.type}`}
          >
            <Zap className="w-3 h-3" />
            {data?.condition?.type}
          </div>
        )}

        {/* Data Mapping Indicator */}
        {hasDataMapping && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, 50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded text-xs shadow-lg"
            title={`${data?.dataMapping?.length} mapping(s)`}
          >
            📦 {data?.dataMapping?.length}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export default AOPEGEdge;
