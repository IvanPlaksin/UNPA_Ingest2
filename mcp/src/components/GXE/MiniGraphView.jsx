/**
 * MiniGraphView
 *
 * Compact ReactFlow viewer for graph previews. Read-only with basic navigation.
 */

import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Typography } from '@mui/material';

// Node type colors
const NODE_COLORS = {
  entity:       '#238636',
  attribute:    '#1f6feb',
  relationship: '#a371f7',
  rule:         '#f85149',
  calculation:  '#f0883e',
  enumeration:  '#3fb950',
  state:        '#a5d6ff',
  procedure:    '#d29922',
  table:        '#8b949e',
  column:       '#6e7681',
  anomaly:      '#da3633',
  default:      '#30363d',
};

function MiniNode({ data }) {
  const bgColor = data._color || NODE_COLORS.default;

  return (
    <Box sx={{
      px: 1.5,
      py: 0.75,
      bgcolor: bgColor,
      borderRadius: 1,
      border: '1px solid rgba(255,255,255,0.1)',
      minWidth: 80,
      textAlign: 'center',
    }}>
      <Typography sx={{
        color: 'white',
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 140,
      }}>
        {data.label || 'node'}
      </Typography>
      {data.subLabel && (
        <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>
          {data.subLabel}
        </Typography>
      )}
    </Box>
  );
}

const nodeTypes = { miniNode: MiniNode };

// Simple grid layout for nodes without positions
function calculatePosition(index, total) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  return { x: col * 200 + 50, y: row * 100 + 50 };
}

export default function MiniGraphView({ nodes, edges, graphType }) {
  // Transform nodes for ReactFlow
  const rfNodes = useMemo(() => {
    if (!nodes) return [];
    return nodes.map((node, index) => {
      const nodeType = node.type || 'default';
      return {
        id: node.id || `n-${index}`,
        type: 'miniNode',
        position: node.position || calculatePosition(index, nodes.length),
        data: {
          label: node.data?.label || node.data?.name || node.data?.entityName || node.id || `node-${index}`,
          subLabel: node.data?.entityType || node.data?.category || nodeType,
          _color: NODE_COLORS[nodeType] || NODE_COLORS.default,
          ...node.data,
        },
      };
    });
  }, [nodes]);

  // Transform edges for ReactFlow
  const rfEdges = useMemo(() => {
    if (!edges) return [];
    return edges.map((edge, index) => ({
      id: edge.id || `e-${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label || edge.data?.label,
      type: 'smoothstep',
      animated: edge.type === 'implicit' || edge.type === 'inferred',
      style: {
        stroke: edge.type === 'implicit' ? '#a855f7' : '#30363d',
        strokeWidth: 1.5,
      },
      labelStyle: {
        fill: '#8b949e',
        fontSize: 10,
      },
    }));
  }, [edges]);

  const [nodesState, , onNodesChange] = useNodesState(rfNodes);
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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
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
          nodeColor={() => '#58a6ff'}
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
