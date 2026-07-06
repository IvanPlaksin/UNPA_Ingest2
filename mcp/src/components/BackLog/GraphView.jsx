/**
 * GraphView — ReactFlow visualization of task relationships
 * Shows: HAS_SUBTASK (parent→child), DEPENDS_ON edges
 */
import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box, Chip, Stack, Typography, Paper,
  ToggleButtonGroup, ToggleButton, FormControlLabel, Switch
} from '@mui/material';
import { AccountTree, Link as LinkIcon, Layers } from '@mui/icons-material';

const STATUS_COLORS = {
  PROPOSED: '#9e9e9e', APPROVED: '#2196f3', IN_PROGRESS: '#1976d2',
  BLOCKED: '#f44336', REVIEW: '#ff9800', DONE: '#4caf50',
  REJECTED: '#d32f2f', CANCELLED: '#757575'
};
const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f', P1_HIGH: '#f57c00', P2_MEDIUM: '#1976d2', P3_LOW: '#757575'
};

function TaskNode({ data }) {
  const { task, onClick } = data;
  return (
    <Paper
      elevation={2}
      onClick={() => onClick?.(task)}
      sx={{
        p: 1.5, minWidth: 180, maxWidth: 220, cursor: 'pointer',
        borderLeft: `4px solid ${PRIORITY_COLORS[task.priority] || '#ccc'}`,
        '&:hover': { bgcolor: 'action.hover' }
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" fontFamily="monospace" color="text.secondary">{task.backlogId}</Typography>
          <Chip label={task.status} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: STATUS_COLORS[task.status], color: '#fff' }} />
        </Stack>
        <Typography variant="body2" noWrap fontWeight={600}>{task.title}</Typography>
        <Stack direction="row" spacing={0.5}>
          <Chip label={task.taskType} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
          {task.effort && <Chip label={task.effort} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
        </Stack>
      </Stack>
    </Paper>
  );
}

const nodeTypes = { task: TaskNode };

export default function GraphView({ tasks, onTaskClick }) {
  const [edgeType, setEdgeType] = useState('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [layoutDir, setLayoutDir] = useState('TB');

  const { initNodes, initEdges } = useMemo(() => {
    const visible = showCompleted ? tasks : tasks.filter(t => !['DONE', 'CANCELLED', 'REJECTED'].includes(t.status));
    const taskMap = new Map(visible.map(t => [t.backlogId, t]));

    // Group by level for positioning
    const levels = new Map();
    visible.forEach(t => {
      const lvl = t.level || 1;
      if (!levels.has(lvl)) levels.set(lvl, []);
      levels.get(lvl).push(t);
    });

    const xGap = layoutDir === 'TB' ? 250 : 300;
    const yGap = layoutDir === 'TB' ? 140 : 160;

    const nodes = [];
    levels.forEach((lvlTasks, lvl) => {
      lvlTasks.forEach((task, idx) => {
        nodes.push({
          id: task.backlogId,
          type: 'task',
          position: {
            x: layoutDir === 'TB' ? idx * xGap : (lvl - 1) * xGap,
            y: layoutDir === 'TB' ? (lvl - 1) * yGap : idx * yGap
          },
          data: { task, onClick: onTaskClick }
        });
      });
    });

    const edges = [];
    visible.forEach(task => {
      // HAS_SUBTASK: parent → child
      if ((edgeType === 'all' || edgeType === 'hierarchy') && task.parentId && taskMap.has(task.parentId)) {
        edges.push({
          id: `sub-${task.parentId}-${task.backlogId}`,
          source: task.parentId,
          target: task.backlogId,
          type: 'smoothstep',
          style: { stroke: '#4caf50', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#4caf50' },
          label: 'subtask',
          labelStyle: { fontSize: 12 }
        });
      }
      // DEPENDS_ON
      if ((edgeType === 'all' || edgeType === 'dependency') && task.dependencies?.length > 0) {
        task.dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            const blocked = task.status === 'BLOCKED';
            edges.push({
              id: `dep-${task.backlogId}-${depId}`,
              source: depId,
              target: task.backlogId,
              type: 'smoothstep',
              animated: blocked,
              style: { stroke: blocked ? '#f44336' : '#ff9800', strokeWidth: 2, strokeDasharray: '5,5' },
              markerEnd: { type: MarkerType.ArrowClosed, color: blocked ? '#f44336' : '#ff9800' },
              label: 'depends',
              labelStyle: { fontSize: 12 }
            });
          }
        });
      }
    });

    return { initNodes: nodes, initEdges: edges };
  }, [tasks, edgeType, showCompleted, layoutDir, onTaskClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => { setNodes(initNodes); setEdges(initEdges); }, [initNodes, initEdges, setNodes, setEdges]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Controls bar */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <ToggleButtonGroup size="small" value={edgeType} exclusive onChange={(_, v) => v && setEdgeType(v)}>
          <ToggleButton value="all"><Layers fontSize="small" sx={{ mr: 0.5 }} />All</ToggleButton>
          <ToggleButton value="hierarchy"><AccountTree fontSize="small" sx={{ mr: 0.5 }} />Hierarchy</ToggleButton>
          <ToggleButton value="dependency"><LinkIcon fontSize="small" sx={{ mr: 0.5 }} />Deps</ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small" value={layoutDir} exclusive onChange={(_, v) => v && setLayoutDir(v)}>
          <ToggleButton value="TB">Vertical</ToggleButton>
          <ToggleButton value="LR">Horizontal</ToggleButton>
        </ToggleButtonGroup>

        <FormControlLabel
          control={<Switch size="small" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />}
          label={<Typography variant="body2">Completed</Typography>}
        />

        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1}>
          <Chip size="small" sx={{ bgcolor: '#4caf50', color: '#fff' }} label="subtask" />
          <Chip size="small" sx={{ bgcolor: '#ff9800', color: '#fff' }} label="depends" />
        </Stack>
      </Stack>

      {/* ReactFlow canvas */}
      <Box sx={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(n) => STATUS_COLORS[n.data?.task?.status] || '#ccc'}
            maskColor="rgba(0,0,0,0.1)"
          />
        </ReactFlow>
      </Box>
    </Box>
  );
}
