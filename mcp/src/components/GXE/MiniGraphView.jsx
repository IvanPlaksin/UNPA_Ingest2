/**
 * MiniGraphView
 *
 * ReactFlow viewer for graph previews matching GXE editor styling.
 * Rich palette per node type, dagre layout, glow effects, handles.
 */

import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Typography } from '@mui/material';
import dagre from 'dagre';

// GXE-style palette per node type
const PALETTE = {
  entity:       { bg: '#1e293b', border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.5)' },
  attribute:    { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd', glow: 'rgba(59,130,246,.5)' },
  relationship: { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe', glow: 'rgba(168,85,247,.5)' },
  rule:         { bg: '#2e1a1a', border: '#ef4444', text: '#fca5a5', glow: 'rgba(239,68,68,.5)' },
  calculation:  { bg: '#2e2a1a', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,.5)' },
  enumeration:  { bg: '#1a2e1a', border: '#10b981', text: '#86efac', glow: 'rgba(16,185,129,.5)' },
  state:        { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9', glow: 'rgba(6,182,212,.5)' },
  procedure:    { bg: '#2e2a1a', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,.5)' },
  table:        { bg: '#1e293b', border: '#64748b', text: '#94a3b8', glow: 'rgba(100,116,139,.5)' },
  column:       { bg: '#1e293b', border: '#475569', text: '#94a3b8', glow: 'rgba(71,85,105,.5)' },
  anomaly:      { bg: '#2e1a1a', border: '#ef4444', text: '#fca5a5', glow: 'rgba(239,68,68,.5)' },
  lifecycle:    { bg: '#2e1a2e', border: '#ec4899', text: '#f9a8d4', glow: 'rgba(236,72,153,.5)' },
  master:       { bg: '#1a2e1a', border: '#84cc16', text: '#bef264', glow: 'rgba(132,204,22,.5)' },
  transaction:  { bg: '#1e1e2e', border: '#6366f1', text: '#a5b4fc', glow: 'rgba(99,102,241,.5)' },
  reference:    { bg: '#1a2e2e', border: '#14b8a6', text: '#5eead4', glow: 'rgba(20,184,166,.5)' },
  default:      { bg: '#1e293b', border: '#64748b', text: '#94a3b8', glow: 'rgba(100,116,139,.5)' },
};

function getNodePalette(type) {
  if (!type) return PALETTE.default;
  const key = type.toLowerCase().replace(/[^a-z]/g, '');
  return PALETTE[key] || PALETTE.default;
}

// Dagre layout
function applyDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  nodes.forEach(n => g.setNode(n.id, { width: 180, height: 60 }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 90, y: pos.y - 30 } };
  });
}

// Rich node component matching GXE style
function GxeNode({ data, selected }) {
  const c = data._palette || PALETTE.default;
  const typeBadge = data._nodeType || data.subLabel || '';

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: c.border, width: 7, height: 7, border: 'none' }} />

      <div style={{
        backgroundColor: c.bg,
        border: `2px solid ${c.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
        maxWidth: 220,
        boxShadow: selected ? `0 0 20px ${c.glow}` : `0 0 8px ${c.glow.replace('.5)', '.15)')}`,
        transition: 'all 0.2s ease',
      }}>
        {/* Type badge */}
        {typeBadge && (
          <div style={{ marginBottom: 4 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: `${c.border}25`,
              color: c.text,
            }}>
              {typeBadge}
            </span>
          </div>
        )}

        {/* Node name */}
        <div style={{
          fontWeight: 500,
          color: '#fff',
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {data.label || 'node'}
        </div>

        {/* Extra info */}
        {data.extraInfo && (
          <div style={{ fontSize: 11, color: c.text, opacity: 0.8, marginTop: 3 }}>
            {data.extraInfo}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 7, height: 7, border: 'none' }} />
    </>
  );
}

const nodeTypes = { gxeNode: GxeNode };

export default function MiniGraphView({ nodes, edges, graphType }) {
  // Transform nodes for ReactFlow
  const rfNodes = useMemo(() => {
    if (!nodes) return [];
    return nodes.map((node, index) => {
      const nodeType = node.type || node.data?.entityType || node.data?.category || 'default';
      const pal = getNodePalette(nodeType);
      return {
        id: node.id || `n-${index}`,
        type: 'gxeNode',
        position: node.position || { x: 0, y: 0 },
        data: {
          label: node.data?.label || node.data?.name || node.data?.entityName || node.id || `node-${index}`,
          subLabel: node.data?.entityType || node.data?.category || nodeType,
          _nodeType: nodeType !== 'default' ? nodeType : '',
          _palette: pal,
          extraInfo: node.data?.tableName || node.data?.description?.substring(0, 40) || '',
          ...node.data,
        },
      };
    });
  }, [nodes]);

  // Transform edges for ReactFlow
  const rfEdges = useMemo(() => {
    if (!edges) return [];
    return edges.map((edge, index) => {
      const isInferred = edge.type === 'implicit' || edge.type === 'inferred';
      return {
        id: edge.id || `e-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.label || edge.data?.label || edge.data?.relationType,
        type: 'smoothstep',
        animated: isInferred,
        markerEnd: { type: MarkerType.ArrowClosed, color: isInferred ? '#a855f7' : '#475569' },
        style: {
          stroke: isInferred ? '#a855f7' : '#475569',
          strokeWidth: 1.5,
        },
        labelStyle: {
          fill: '#94a3b8',
          fontSize: 12,
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: '#0d1117',
          fillOpacity: 0.85,
        },
      };
    });
  }, [edges]);

  // Apply dagre layout (only if nodes have no pre-existing positions)
  const layoutNodes = useMemo(() => {
    if (!rfNodes.length) return rfNodes;
    const hasPositions = rfNodes.some(n => n.position.x !== 0 || n.position.y !== 0);
    if (hasPositions) return rfNodes;
    return applyDagreLayout(rfNodes, rfEdges);
  }, [rfNodes, rfEdges]);

  const [nodesState, , onNodesChange] = useNodesState(layoutNodes);
  const [edgesState, , onEdgesChange] = useEdgesState(rfEdges);

  if (!nodes || nodes.length === 0) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#0d1117',
        borderRadius: 2,
        border: '1px solid #30363d',
      }}>
        <Typography color="#8b949e">No nodes in this graph</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: '100%',
      bgcolor: '#0d1117',
      borderRadius: 2,
      border: '1px solid #30363d',
      overflow: 'hidden',
    }}>
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#21262d" gap={16} />
        <Controls
          showInteractive={false}
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
          }}
        />
        <MiniMap
          nodeColor={(n) => n.data?._palette?.border || '#64748b'}
          maskColor="rgba(0,0,0,0.8)"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
          }}
        />
      </ReactFlow>
    </Box>
  );
}
