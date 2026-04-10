/**
 * WorkspaceCanvas (WS2-004)
 *
 * Visual draft graph editor for a single WorkSpace.
 * Loads nodes/edges from the WorkSpace graph endpoint, lets the user
 * drag/connect/edit them, and saves back to the same endpoint.
 *
 * Features:
 *   - Drag nodes from a palette to create new drafts
 *   - Connect nodes to create draft edges
 *   - Move nodes to update their persisted position
 *   - Save → PUT /workspaces/:id/graph (with optional checkpoint)
 *   - Auto-layout (dagre TB) for fresh graphs without positions
 *   - Node inspector (click → side panel)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box, Button, Stack, Typography, Paper, IconButton, Chip, TextField,
  CircularProgress, Alert, Tooltip, Divider, Snackbar
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  AutoFixHigh as LayoutIcon,
  PhotoCamera as CheckpointIcon,
  Delete as DeleteIcon,
  MenuBook as CatalogIcon
} from '@mui/icons-material';
import dagre from 'dagre';
import UnifiedToolCatalog from '../Catalog/UnifiedToolCatalog';
import {
  getWorkspaceGraph,
  saveWorkspaceGraph,
  createGraphVersion
} from '../../services/workspace.service';
import VersionsDropdown from './canvas/VersionsDropdown';
import VersionDiffDialog from './canvas/VersionDiffDialog';
import EdgeInspector from './canvas/EdgeInspector';

/* ───────── Draft type palette ───────── */

const DRAFT_TYPE_OPTIONS = [
  { type: 'entity',        label: 'Entity',        color: '#4CAF50' },
  { type: 'business_rule', label: 'Business Rule', color: '#2196F3' },
  { type: 'workflow',      label: 'Workflow',      color: '#9C27B0' },
  { type: 'calculation',   label: 'Calculation',   color: '#FF9800' },
  { type: 'concept',       label: 'Concept',       color: '#00BCD4' },
  { type: 'policy',        label: 'Policy',        color: '#F44336' },
  { type: 'schema',        label: 'Schema',        color: '#607D8B' },
  { type: 'requirement',   label: 'Requirement',   color: '#795548' },
  { type: 'decision',      label: 'Decision',      color: '#FF5722' },
];

const TYPE_COLORS = Object.fromEntries(DRAFT_TYPE_OPTIONS.map(o => [o.type, o.color]));

/* ───────── Custom Node ───────── */

const WorkspaceDraftNode = ({ data, selected }) => {
  const color = TYPE_COLORS[data?.draftType] || '#9E9E9E';
  return (
    <Box
      sx={{
        minWidth: 180,
        maxWidth: 240,
        bgcolor: 'background.paper',
        border: 2,
        borderColor: selected ? 'primary.main' : color,
        borderRadius: 1,
        boxShadow: selected ? 4 : 1,
        overflow: 'hidden'
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <Box sx={{ bgcolor: color, color: 'white', px: 1, py: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
          {data?.draftType || 'node'}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
          {data?.label || '(unnamed)'}
        </Typography>
        {data?.description && (
          <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.25 }}>
            {data.description}
          </Typography>
        )}
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
          {data?.status && (
            <Chip size="small" label={data.status} sx={{ height: 16, fontSize: '0.6rem' }} />
          )}
          {typeof data?.confidence === 'number' && (
            <Chip
              size="small"
              label={`${Math.round(data.confidence * 100)}%`}
              sx={{ height: 16, fontSize: '0.6rem' }}
              color={data.confidence > 0.7 ? 'success' : data.confidence > 0.4 ? 'warning' : 'default'}
            />
          )}
        </Stack>
      </Box>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </Box>
  );
};

const nodeTypes = { workspaceDraft: WorkspaceDraftNode };

/* ───────── Auto-layout (dagre TB) ───────── */

function applyDagreLayout(nodes, edges, direction = 'TB') {
  if (!nodes || nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 60 });

  nodes.forEach(n => g.setNode(n.id, { width: 220, height: 100 }));
  edges.forEach(e => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  });
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 110, y: pos.y - 50 } };
  });
}

/* ───────── Node Inspector ───────── */

const NodeInspector = ({ node, onChange, onDelete, onClose }) => {
  if (!node) return null;
  const [draft, setDraft] = useState({
    label: node.data?.label || '',
    description: node.data?.description || '',
    confidence: node.data?.confidence ?? 0.5,
  });

  // Reset on node change
  useEffect(() => {
    setDraft({
      label: node.data?.label || '',
      description: node.data?.description || '',
      confidence: node.data?.confidence ?? 0.5,
    });
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    onChange(node.id, draft);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete node "${node.data?.label || node.id}"?\n\nAll connected edges will also be removed.`)) {
      onDelete?.(node.id);
    }
  };

  return (
    <Paper sx={{ p: 2, width: 280, position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Node Inspector
        </Typography>
        <IconButton size="small" onClick={onClose}>×</IconButton>
      </Stack>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" color="text.secondary">
        ID: {node.id.slice(0, 8)}…
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Type: {node.data?.draftType}
      </Typography>
      <TextField
        label="Label"
        size="small"
        fullWidth
        value={draft.label}
        onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
        sx={{ mb: 1 }}
      />
      <TextField
        label="Description"
        size="small"
        fullWidth
        multiline
        rows={3}
        value={draft.description}
        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
        sx={{ mb: 1 }}
      />
      <TextField
        label="Confidence"
        size="small"
        type="number"
        inputProps={{ step: 0.05, min: 0, max: 1 }}
        fullWidth
        value={draft.confidence}
        onChange={e => setDraft(d => ({ ...d, confidence: parseFloat(e.target.value) || 0 }))}
        sx={{ mb: 1.5 }}
      />
      <Stack direction="row" spacing={0.5}>
        <Button size="small" variant="contained" fullWidth onClick={apply}>
          Apply
        </Button>
        <Tooltip title="Delete node">
          <IconButton size="small" color="error" onClick={handleDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1, fontSize: '0.65rem', textAlign: 'center' }}>
        Tip: select a node and press Delete
      </Typography>
    </Paper>
  );
};

/* ───────── Palette ───────── */

const NodePalette = () => {
  const onDragStart = (event, draftType) => {
    event.dataTransfer.setData('application/workspace-draft-type', draftType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Paper sx={{ p: 1.5, width: 180 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
        DRAG TO ADD
      </Typography>
      <Stack spacing={0.5}>
        {DRAFT_TYPE_OPTIONS.map(opt => (
          <Box
            key={opt.type}
            draggable
            onDragStart={e => onDragStart(e, opt.type)}
            sx={{
              px: 1,
              py: 0.75,
              borderRadius: 1,
              border: 2,
              borderColor: opt.color,
              cursor: 'grab',
              bgcolor: 'background.paper',
              fontSize: '0.75rem',
              fontWeight: 600,
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            {opt.label}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
};

/* ───────── Main Canvas (inner — needs ReactFlowProvider) ───────── */

const CanvasInner = ({ workspaceId }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [stats, setStats] = useState(null);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffVersions, setDiffVersions] = useState([]);
  const [toast, setToast] = useState(null); // { message, severity }
  const [versionsBumpKey, setVersionsBumpKey] = useState(0);
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);

  // Load
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getWorkspaceGraph(workspaceId);
      const data = resp?.data || { nodes: [], edges: [] };
      let n = data.nodes || [];
      let e = (data.edges || []).map(edge => ({
        ...edge,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed }
      }));
      // Auto-layout if all positions are (0,0)
      const noPositions = n.length > 0 && n.every(node => !node.position || (node.position.x === 0 && node.position.y === 0));
      if (noPositions) n = applyDagreLayout(n, e);
      setNodes(n);
      setEdges(e);
    } catch (err) {
      setError(err.message || 'Failed to load workspace graph');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, setNodes, setEdges]);

  useEffect(() => { load(); }, [load]);

  // Save
  const save = useCallback(async (createCheckpoint = false) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: 'workspaceDraft',
          position: n.position,
          data: n.data
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || e.data?.relationType,
          data: e.data
        })),
        createCheckpoint,
        checkpointNote: createCheckpoint ? 'Manual checkpoint from canvas' : 'Canvas save'
      };
      const resp = await saveWorkspaceGraph(workspaceId, payload);
      setStats(resp?.data?.stats);
      // Reload to get back canonical IDs (created nodes had temp ids)
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workspaceId, nodes, edges, load]);

  // Manual checkpoint (without save)
  const checkpoint = useCallback(async () => {
    try {
      await createGraphVersion(workspaceId, { note: 'Manual checkpoint from canvas', createdBy: 'user' });
    } catch (err) {
      setError(err.message || 'Checkpoint failed');
    }
  }, [workspaceId]);

  // Connect handler
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      label: 'RELATES_TO',
      data: { relationType: 'RELATES_TO', confidence: 0.8 },
      markerEnd: { type: MarkerType.ArrowClosed }
    }, eds));
  }, [setEdges]);

  // Drop from palette
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    if (!reactFlowInstance.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = reactFlowInstance.current.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    });

    // Try unified format first (application/json from UnifiedToolCatalog)
    let draftType = null;
    let label = null;
    try {
      const json = event.dataTransfer.getData('application/json');
      if (json) {
        const data = JSON.parse(json);
        if (data.source === 'workspace' && data.draftType) {
          draftType = data.draftType;
          label = data.label || `New ${draftType}`;
        }
      }
    } catch { /* not JSON — try legacy format */ }

    // Fallback: legacy NodePalette format
    if (!draftType) {
      draftType = event.dataTransfer.getData('application/workspace-draft-type');
      label = draftType ? `New ${draftType}` : null;
    }

    if (!draftType) return;

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newNode = {
      id: tempId,
      type: 'workspaceDraft',
      position,
      data: {
        label,
        draftType,
        status: 'DRAFT',
        confidence: 0.5,
        description: ''
      }
    };
    setNodes(nds => nds.concat(newNode));
  }, [setNodes]);

  // Click → select
  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  // Apply inspector changes
  const updateNodeData = useCallback((id, partial) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...partial } } : n));
  }, [setNodes]);

  // Delete node + cascade-delete all connected edges
  const deleteNodeById = useCallback((id) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  // Apply edge inspector changes
  const updateEdgeData = useCallback((id, partial) => {
    setEdges(eds => eds.map(e => e.id === id ? { ...e, ...partial } : e));
    // Reflect changes in the open inspector immediately
    setSelectedEdge(prev => (prev && prev.id === id ? { ...prev, ...partial } : prev));
  }, [setEdges]);

  const deleteEdgeById = useCallback((id) => {
    setEdges(eds => eds.filter(e => e.id !== id));
    setSelectedEdge(null);
  }, [setEdges]);

  // Re-layout
  const autoLayout = useCallback(() => {
    setNodes(nds => applyDagreLayout(nds, edges));
  }, [edges, setNodes]);

  // After version restore — reload canvas and toast
  const handleVersionRestored = useCallback(async (data) => {
    await load();
    setVersionsBumpKey(k => k + 1);
    setToast({
      message: `Restored to v#${data?.restoredFromVersionNumber} (${data?.restored?.nodes ?? 0} nodes, ${data?.restored?.edges ?? 0} edges)`,
      severity: 'success'
    });
  }, [load]);

  const handleOpenDiff = useCallback((versions) => {
    setDiffVersions(versions);
    setDiffDialogOpen(true);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      overflow: 'hidden'
    }}>
      {/* Unified Catalog sidebar — collapsible */}
      {catalogOpen && (
        <Box sx={{
          width: 320, flexShrink: 0, borderRight: 1, borderColor: 'divider',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <UnifiedToolCatalog
            mode="workspace"
            workspaceId={workspaceId}
            floating={false}
            showAI={true}
            onClose={() => setCatalogOpen(false)}
            selectedNodes={nodes.filter(n => n.selected).map(n => ({ id: n.id, name: n.data?.label, type: n.data?.draftType }))}
            onToolDragStart={(item, e) => {
              // No-op — drag is handled by the unified catalog internally
            }}
            onPatternReplace={async (match) => {
              if (!window.confirm(`Replace subgraph with catalog entry "${match.catalogName}" (${Math.round(match.score * 100)}% match)?`)) return;
              try {
                const resp = await fetch('/api/v1/graph-catalog/patterns/execute-replacement', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    workspaceId,
                    subgraphId: match.subgraphId,
                    catalogEntryId: match.catalogEntryId,
                    confirm: true
                  })
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                await load();
                setToast({ message: `Replaced with "${match.catalogName}"`, severity: 'success' });
              } catch (err) {
                setToast({ message: `Replace failed: ${err.message}`, severity: 'error' });
              }
            }}
          />
        </Box>
      )}

      {/* Canvas */}
      <Box sx={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }} ref={reactFlowWrapper}>
        {error && (
          <Alert severity="error" sx={{ position: 'absolute', top: 12, left: 12, zIndex: 5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Toolbar */}
        <Paper sx={{ position: 'absolute', top: 12, left: 12, zIndex: 5, p: 0.5 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title="Save graph">
              <span>
                <IconButton size="small" onClick={() => save(false)} disabled={saving}>
                  {saving ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Save + checkpoint">
              <span>
                <IconButton size="small" onClick={() => save(true)} disabled={saving}>
                  <CheckpointIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Reload from server">
              <IconButton size="small" onClick={load}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Auto-layout">
              <IconButton size="small" onClick={autoLayout}>
                <LayoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={catalogOpen ? 'Hide catalog' : 'Show catalog (drag nodes to canvas)'}>
              <IconButton
                size="small"
                onClick={() => setCatalogOpen(v => !v)}
                sx={{ color: catalogOpen ? 'primary.main' : 'text.secondary' }}
              >
                <CatalogIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <VersionsDropdown
              key={versionsBumpKey}
              workspaceId={workspaceId}
              onRestored={handleVersionRestored}
              onCompare={handleOpenDiff}
            />
            {stats && (
              <Chip
                size="small"
                label={`+${stats.createdNodes}/${stats.updatedNodes}/-${stats.deletedNodes}`}
                color="success"
                sx={{ ml: 1 }}
              />
            )}
          </Stack>
        </Paper>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onInit={(instance) => { reactFlowInstance.current = instance; }}
          deleteKeyCode={['Delete', 'Backspace']}
          onNodesDelete={(deleted) => {
            // Cascade: also remove edges connected to deleted nodes
            const ids = new Set(deleted.map(n => n.id));
            setEdges(eds => eds.filter(e => !ids.has(e.source) && !ids.has(e.target)));
            if (selectedNode && ids.has(selectedNode.id)) setSelectedNode(null);
          }}
          onEdgesDelete={(deleted) => {
            const ids = new Set(deleted.map(e => e.id));
            if (selectedEdge && ids.has(selectedEdge.id)) setSelectedEdge(null);
          }}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>

        <NodeInspector
          node={selectedNode}
          onChange={updateNodeData}
          onDelete={deleteNodeById}
          onClose={() => setSelectedNode(null)}
        />

        <EdgeInspector
          edge={selectedEdge}
          onChange={updateEdgeData}
          onDelete={deleteEdgeById}
          onClose={() => setSelectedEdge(null)}
        />

        <VersionDiffDialog
          open={diffDialogOpen}
          onClose={() => setDiffDialogOpen(false)}
          workspaceId={workspaceId}
          versions={diffVersions}
        />

        <Snackbar
          open={!!toast}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {toast && (
            <Alert
              onClose={() => setToast(null)}
              severity={toast.severity}
              variant="filled"
              sx={{ width: '100%' }}
            >
              {toast.message}
            </Alert>
          )}
        </Snackbar>
      </Box>
    </Box>
  );
};

/* ───────── Wrapper with ReactFlowProvider ───────── */

const WorkspaceCanvas = ({ workspaceId }) => {
  return (
    <ReactFlowProvider>
      <CanvasInner workspaceId={workspaceId} />
    </ReactFlowProvider>
  );
};

export default WorkspaceCanvas;
