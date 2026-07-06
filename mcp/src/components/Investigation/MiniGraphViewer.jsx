/**
 * MiniGraphViewer — investigation graph, matching EntityGraph2D style.
 *
 * Fixes vs v1:
 *   - Proper ReactFlow Handle components (edges now connect correctly)
 *   - Dark theme (EntityGraph2D palette)
 *   - Multi-path coloring: each path gets its own color + toggle chips
 *   - Parallel edges: quadratic bezier with perpendicular offset
 *   - Info panel on node/edge click (context, description, confidence)
 *   - Dagre positions preserved on path-toggle (no re-layout flicker)
 *
 * Props:
 *   entities      [{id, name, type, namespace, description, mentionCount, isBridge?}]
 *   relationships [{sourceId, targetId, relType, confidence, context}]
 *   paths         [{nodeIds, hopCount?, pathStrength?}]  — per-path highlighting
 *   centerNodeId  string?
 */
import React, { useEffect, useMemo, useState, useRef, useCallback, memo } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  ReactFlowProvider, useNodesState, useEdgesState,
  MarkerType, BaseEdge, EdgeLabelRenderer,
  getBezierPath, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import {
  Box, Typography, Chip, CircularProgress, Tooltip,
  Stack, IconButton, Paper,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';

// ─── Per-path colors (matching EntityGraph2D highlight palette) ───────────────
const PATH_COLORS = [
  { stroke: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'Amber' },   // gold — primary
  { stroke: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  label: 'Blue' },
  { stroke: '#10B981', bg: 'rgba(16,185,129,0.12)',  label: 'Emerald' },
  { stroke: '#EC4899', bg: 'rgba(236,72,153,0.12)',  label: 'Pink' },
  { stroke: '#8B5CF6', bg: 'rgba(139,92,246,0.12)',  label: 'Violet' },
];

// ─── Dark palette (matches EntityGraph2D PALETTE) ─────────────────────────────
const PALETTE = {
  ACTOR:        { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd' },
  ORGANIZATION: { bg: '#1e293b', border: '#7c3aed', text: '#c4b5fd' },
  PERSON:       { bg: '#1a2e1a', border: '#22c55e', text: '#86efac' },
  CONCEPT:      { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9' },
  DOCUMENT:     { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd' },
  EVENT:        { bg: '#2e2a1a', border: '#eab308', text: '#fde047' },
  PROCESS:      { bg: '#1a2035', border: '#0891b2', text: '#67e8f9' },
  TECHNOLOGY:   { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe' },
  POLICY:       { bg: '#2e1a1a', border: '#ef4444', text: '#fca5a5' },
  SYSTEM:       { bg: '#1a2e2e', border: '#0891b2', text: '#67e8f9' },
  default:      { bg: '#1e293b', border: '#94A3B8', text: '#CBD5E1' },
};
const pc = (type) => PALETTE[(type || '').toUpperCase()] || PALETTE.default;

// ─── Custom node (with proper Handle components) ──────────────────────────────
const GraphNode = memo(({ data }) => {
  const c = data.pathColor
    ? { bg: '#1e293b', border: data.pathColor, text: data.pathColor }
    : data.isBridge
    ? { bg: '#2e2a1a', border: '#F59E0B', text: '#FDE047' }
    : data.isCenterNode
    ? { bg: '#1e3a5f', border: '#3B82F6', text: '#93c5fd' }
    : pc(data.type);

  const tooltipContent = [
    data.namespace && `Namespace: ${data.namespace}`,
    data.mentionCount > 0 && `Mentions: ${data.mentionCount}`,
    data.description && `\n${data.description.slice(0, 200)}`,
  ].filter(Boolean).join('\n');

  return (
    <Tooltip title={tooltipContent || ''} placement="top" arrow>
      <Box sx={{ position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 7, height: 7, background: c.border, border: 'none', borderRadius: '50%' }}
        />
        <Box sx={{
          bgcolor: c.bg,
          border: `2px solid ${c.border}`,
          borderRadius: 1.5,
          px: 1.25,
          py: 0.6,
          minWidth: 100,
          maxWidth: 180,
          cursor: 'pointer',
          boxShadow: data.pathColor
            ? `0 0 8px ${data.pathColor}55`
            : data.isBridge
            ? '0 0 8px #F59E0B55'
            : data.isCenterNode
            ? '0 0 10px #3B82F655'
            : 'none',
        }}>
          <Typography sx={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: c.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}>
            {data.label}
          </Typography>
          {data.type && (
            <Typography sx={{ fontSize: '0.55rem', color: c.border, lineHeight: 1.1, mt: 0.15, opacity: 0.85 }}>
              {data.type}
            </Typography>
          )}
          {data.namespace && (
            <Typography sx={{ fontSize: '0.5rem', color: '#475569', lineHeight: 1, mt: 0.1 }}>
              {data.namespace}
            </Typography>
          )}
          {data.isBridge && (
            <Typography sx={{ fontSize: '0.5rem', color: '#F59E0B', lineHeight: 1, mt: 0.15, fontWeight: 700 }}>
              BRIDGE
            </Typography>
          )}
        </Box>
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 7, height: 7, background: c.border, border: 'none', borderRadius: '50%' }}
        />
      </Box>
    </Tooltip>
  );
});

// ─── Parallel edge with quadratic bezier offset ───────────────────────────────
const GraphEdge = memo(({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, selected }) => {
  const offset = data?.curvatureOffset ?? 0;

  let edgePath, labelX, labelY;

  if (offset === 0) {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX, sourceY, sourcePosition: Position.Right,
      targetX, targetY, targetPosition: Position.Left,
    });
  } else {
    // Quadratic bezier with perpendicular offset for parallel edges
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;   // perpendicular unit vector
    const py = dx / len;
    const cx = (sourceX + targetX) / 2 + px * offset;
    const cy = (sourceY + targetY) / 2 + py * offset;
    edgePath = `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`;
    // Quadratic bezier at t=0.5
    labelX = (sourceX + 2 * cx + targetX) / 4;
    labelY = (sourceY + 2 * cy + targetY) / 4;
  }

  const color = data?.color || '#7c3aed';
  const isPath = !!data?.isPathEdge;
  const strokeWidth = selected ? 2.8 : isPath ? 2.2 : 1.2;
  const opacity = selected ? 1 : isPath ? 0.95 : 0.6;

  const tooltipLabel = data?.context
    ? `"${data.context.slice(0, 250)}"`
    : data?.relType?.replace(/_/g, ' ') || '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth, opacity }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <Tooltip title={tooltipLabel} placement="top" arrow>
            <Box
              sx={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: data?.context ? 'auto' : 'none',
                bgcolor: '#0d1117cc',
                border: `1px solid ${color}44`,
                borderRadius: 0.75,
                px: 0.6,
                py: 0.15,
                cursor: data?.context ? 'help' : 'default',
              }}
            >
              <Typography sx={{
                fontSize: '0.52rem',
                color,
                fontWeight: 600,
                lineHeight: 1.2,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                {(data.label || '').replace(/_/g, ' ')}
              </Typography>
              {data?.confidence != null && (
                <Typography sx={{ fontSize: '0.46rem', color: '#64748B', lineHeight: 1 }}>
                  {Math.round(data.confidence * 100)}%
                </Typography>
              )}
            </Box>
          </Tooltip>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const NODE_TYPES = { graphNode: GraphNode };
const EDGE_TYPES = { graphEdge: GraphEdge };

// ─── Dagre layout (LR, unique pairs only) ─────────────────────────────────────
function applyDagre(rfNodes, uniquePairs) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 130, edgesep: 30 });
  rfNodes.forEach(n => g.setNode(n.id, { width: n.width || 180, height: n.height || 54 }));
  uniquePairs.forEach(([src, tgt]) => g.setEdge(src, tgt));
  dagre.layout(g);
  return rfNodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: (pos?.x || 0) - (n.width || 180) / 2, y: (pos?.y || 0) - (n.height || 54) / 2 } };
  });
}

// ─── Info panel (clicked node or edge) ───────────────────────────────────────
function InfoPanel({ selected, onClose }) {
  if (!selected) return null;
  const { type: selType, data } = selected;
  const c = selType === 'node' ? pc(data.type) : { border: data.color || '#7c3aed' };

  return (
    <Paper elevation={12} sx={{
      position: 'absolute',
      top: 8, right: 8,
      zIndex: 10,
      width: 230,
      bgcolor: '#0d1117',
      border: `1px solid ${c.border}55`,
      borderRadius: 1.5,
      overflow: 'hidden',
      pointerEvents: 'all',
    }}>
      <Box sx={{ bgcolor: '#161b22', px: 1.5, py: 0.75, display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.63rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, fontWeight: 700 }}>
          {selType === 'node' ? 'Entity Details' : 'Relationship'}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: '#64748B', p: 0.25, '&:hover': { color: '#94A3B8' } }}>
          <CloseIcon size={12} />
        </IconButton>
      </Box>
      <Box sx={{ px: 1.5, py: 1 }}>
        {selType === 'node' ? (
          <>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#E2E8F0', mb: 0.5, lineHeight: 1.3 }}>
              {data.label}
            </Typography>
            {data.type && (
              <Chip label={data.type} size="small" sx={{ fontSize: '0.58rem', height: 16, mb: 0.6, bgcolor: c.border + '28', color: c.border, border: `1px solid ${c.border}44` }} />
            )}
            {data.namespace && (
              <Typography sx={{ fontSize: '0.68rem', color: '#64748B', mb: 0.4 }}>
                Namespace: <strong style={{ color: '#94A3B8' }}>{data.namespace}</strong>
              </Typography>
            )}
            {data.mentionCount > 0 && (
              <Typography sx={{ fontSize: '0.68rem', color: '#64748B', mb: 0.4 }}>
                Mentions: <strong style={{ color: '#94A3B8' }}>{data.mentionCount}</strong>
              </Typography>
            )}
            {data.description && (
              <Box sx={{ mt: 0.5, p: 0.75, bgcolor: '#161b22', borderRadius: 1, borderLeft: `3px solid ${c.border}` }}>
                <Typography sx={{ fontSize: '0.72rem', color: '#CBD5E1', lineHeight: 1.6, fontStyle: 'italic' }}>
                  {data.description.slice(0, 280)}
                  {data.description.length > 280 ? '…' : ''}
                </Typography>
              </Box>
            )}
          </>
        ) : (
          <>
            <Chip
              label={(data.relType || 'RELATED').replace(/_/g, ' ')}
              size="small"
              sx={{ fontSize: '0.63rem', height: 18, mb: 0.75, bgcolor: (data.color || '#7c3aed') + '28', color: data.color || '#7c3aed', fontWeight: 700 }}
            />
            {data.confidence != null && (
              <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8', mb: 0.4 }}>
                Confidence: <strong style={{ color: '#E2E8F0' }}>{Math.round(data.confidence * 100)}%</strong>
              </Typography>
            )}
            {data.context ? (
              <Box sx={{ p: 0.75, bgcolor: '#161b22', borderRadius: 1, borderLeft: `3px solid ${data.color || '#7c3aed'}` }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{data.context.slice(0, 300)}{data.context.length > 300 ? '…' : ''}"
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.68rem', color: '#475569', fontStyle: 'italic' }}>No context available</Typography>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}

// ─── Path selector chips ──────────────────────────────────────────────────────
function PathSelector({ paths, activePaths, onToggle }) {
  if (!paths || paths.length < 2) return null;
  return (
    <Box sx={{ position: 'absolute', bottom: 10, left: 8, zIndex: 10 }}>
      <Typography sx={{ fontSize: '0.56rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, mb: 0.4 }}>
        Paths
      </Typography>
      <Stack spacing={0.4}>
        {paths.map((path, i) => {
          const col = PATH_COLORS[i % PATH_COLORS.length];
          const isActive = activePaths.has(i);
          const hops = path.hopCount ?? ((path.nodeIds?.length || 1) - 1);
          return (
            <Box
              key={i}
              onClick={() => onToggle(i)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                bgcolor: isActive ? col.bg : '#161b22',
                border: `1px solid ${col.stroke}${isActive ? '99' : '44'}`,
                borderRadius: 1, px: 0.85, py: 0.35,
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.45,
                transition: 'all 0.15s',
                '&:hover': { opacity: 1 },
              }}
            >
              <Box sx={{ width: 14, height: 3, bgcolor: col.stroke, borderRadius: 1, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.6rem', color: col.stroke, fontWeight: 700 }}>
                Path {i + 1} · {hops} hop{hops !== 1 ? 's' : ''}
              </Typography>
              {path.pathStrength != null && (
                <Typography sx={{ fontSize: '0.56rem', color: '#475569' }}>
                  {Math.round(path.pathStrength * 100)}%
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// ─── Graph inner (inside ReactFlowProvider) ───────────────────────────────────
function GraphInner({ entities, relationships, paths, centerNodeId, onNodeSelect, onEdgeSelect }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [ready, setReady] = useState(false);

  const [activePaths, setActivePaths] = useState(() => new Set((paths || []).map((_, i) => i)));

  const togglePath = useCallback((i) => {
    setActivePaths(prev => {
      const next = new Set(prev);
      if (next.has(i) && next.size > 1) next.delete(i);  // keep at least one active
      else next.add(i);
      return next;
    });
  }, []);

  // Compute path highlight maps from active paths
  const { pathNodeMap, pathEdgeMap } = useMemo(() => {
    const nodeMap = new Map();   // nodeId → pathColor
    const edgeMap = new Map();   // "src|tgt" → pathColor
    (paths || []).forEach((path, pi) => {
      if (!activePaths.has(pi)) return;
      const col = PATH_COLORS[pi % PATH_COLORS.length].stroke;
      (path.nodeIds || []).forEach(id => { if (!nodeMap.has(id)) nodeMap.set(id, col); });
      for (let i = 0; i < (path.nodeIds || []).length - 1; i++) {
        const a = path.nodeIds[i], b = path.nodeIds[i + 1];
        if (!edgeMap.has(`${a}|${b}`)) edgeMap.set(`${a}|${b}`, col);
        if (!edgeMap.has(`${b}|${a}`)) edgeMap.set(`${b}|${a}`, col);
      }
    });
    return { pathNodeMap: nodeMap, pathEdgeMap: edgeMap };
  }, [paths, activePaths]);

  // Stored dagre positions (preserved across color updates)
  const dagrePositions = useRef({});

  // Build layout (only when topology changes)
  useEffect(() => {
    if (!entities?.length) return;
    setReady(false);

    // Build base RF nodes (positions come from dagrePositions cache)
    const rfNodes = entities.map(e => {
      const id = e.id || e.entityId;
      return {
        id,
        type: 'graphNode',
        position: dagrePositions.current[id] || { x: 0, y: 0 },
        width: 180, height: 54,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: e.name || id,
          type: e.type || 'ACTOR',
          namespace: e.namespace,
          description: e.description,
          mentionCount: e.mentionCount || 0,
          isBridge: e.isBridge || false,
          isCenterNode: id === centerNodeId,
          pathColor: pathNodeMap.get(id) || null,
        },
      };
    });

    // Group relationships by pair for curvature assignment
    const pairGroups = {};
    relationships.forEach((r, idx) => {
      const src = r.sourceId || r.fromId || r.fromEntityId;
      const tgt = r.targetId || r.toId   || r.toEntityId;
      if (!src || !tgt) return;
      const key = `${src}|||${tgt}`;
      if (!pairGroups[key]) pairGroups[key] = [];
      pairGroups[key].push({ r, src, tgt, idx });
    });

    const CURVE_OFFSETS = [0, 55, -55, 100, -100, 145, -145];

    const rfEdges = [];
    const uniquePairs = [];
    const seenPairs = new Set();

    Object.entries(pairGroups).forEach(([key, group]) => {
      group.forEach(({ r, src, tgt, idx }, groupIdx) => {
        const pairKey = `${src}|${tgt}`;
        if (!seenPairs.has(`${src}::${tgt}`)) {
          seenPairs.add(`${src}::${tgt}`);
          uniquePairs.push([src, tgt]);
        }
        const pathColor = pathEdgeMap.get(pairKey) || pathEdgeMap.get(`${tgt}|${src}`);
        const isPathEdge = !!pathColor;
        const edgeColor = pathColor || '#7c3aed';
        const curvatureOffset = CURVE_OFFSETS[groupIdx % CURVE_OFFSETS.length] || 0;

        rfEdges.push({
          id: `e${idx}-${src}-${tgt}-${groupIdx}`,
          source: src,
          target: tgt,
          type: 'graphEdge',
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: edgeColor },
          data: {
            label: r.relType || 'RELATED',
            relType: r.relType,
            context: r.context,
            confidence: r.confidence,
            color: edgeColor,
            isPathEdge,
            curvatureOffset,
            sourceId: src,
            targetId: tgt,
          },
        });
      });
    });

    // Apply dagre only if positions not yet cached
    const needsLayout = rfNodes.some(n => !dagrePositions.current[n.id]);
    const finalNodes = needsLayout ? applyDagre(rfNodes, uniquePairs) : rfNodes;
    if (needsLayout) {
      finalNodes.forEach(n => { dagrePositions.current[n.id] = n.position; });
    }

    setNodes(finalNodes);
    setEdges(rfEdges);
    setTimeout(() => setReady(true), 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, relationships, centerNodeId]);

  // Recolor only when path selection changes (no layout re-run)
  useEffect(() => {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: { ...n.data, pathColor: pathNodeMap.get(n.id) || null },
    })));
    setEdges(prev => prev.map(e => {
      const fwd = `${e.data.sourceId}|${e.data.targetId}`;
      const bwd = `${e.data.targetId}|${e.data.sourceId}`;
      const pathColor = pathEdgeMap.get(fwd) || pathEdgeMap.get(bwd);
      const color = pathColor || '#7c3aed';
      const isPathEdge = !!pathColor;
      return {
        ...e,
        markerEnd: { ...e.markerEnd, color },
        data: { ...e.data, color, isPathEdge },
      };
    }));
  }, [pathNodeMap, pathEdgeMap]);

  const handleNodeClick = useCallback((_, node) => {
    onNodeSelect({ type: 'node', data: node.data });
  }, [onNodeSelect]);

  const handleEdgeClick = useCallback((_, edge) => {
    onEdgeSelect({ type: 'edge', data: edge.data });
  }, [onEdgeSelect]);

  if (!ready && !nodes.length) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d1117' }}>
        <CircularProgress size={22} sx={{ color: '#3B82F6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#21262d" gap={18} size={1} />
        <Controls style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6 }} />
        <MiniMap
          nodeColor={n => {
            if (n.data?.pathColor) return n.data.pathColor;
            if (n.data?.isBridge) return '#F59E0B';
            return pc(n.data?.type)?.border || '#94A3B8';
          }}
          maskColor="rgba(13,17,23,0.8)"
          style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, width: 110, height: 65 }}
        />
      </ReactFlow>
      <PathSelector paths={paths} activePaths={activePaths} onToggle={togglePath} />
    </Box>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MiniGraphViewer({ entities, relationships, paths = [], centerNodeId }) {
  const [selected, setSelected] = useState(null);

  if (!entities?.length) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d1117', opacity: 0.4 }}>
        <Typography variant="body2" sx={{ color: '#94A3B8' }}>No graph data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', position: 'relative', bgcolor: '#0d1117' }}>
      <ReactFlowProvider>
        <GraphInner
          entities={entities}
          relationships={relationships}
          paths={paths}
          centerNodeId={centerNodeId}
          onNodeSelect={setSelected}
          onEdgeSelect={setSelected}
        />
      </ReactFlowProvider>
      <InfoPanel selected={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
