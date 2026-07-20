/**
 * PromptEditorTab (P6) — the system-prompt graph editor: a ReactFlow canvas where
 * one rule = one node, with versioned save/load (graph-catalog), validate,
 * sandbox-test, apply-live, and an embedded Claude Code AI assistant that can
 * read real sessions (MCP) and propose rule changes.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box, Stack, Button, Typography, Tabs, Tab, Menu, MenuItem, TextField,
  IconButton, Tooltip, Chip, Divider, CircularProgress,
} from '@mui/material';
import {
  Plus, Save, History, Undo2, Redo2, RotateCcw, Settings2, Sparkles, FlaskConical,
} from 'lucide-react';
import { useRulesStore, CATEGORIES, CATEGORY_COLOR } from './rulesStore';
import RuleNode from './RuleNode';
import RulePropertiesPanel from './RulePropertiesPanel';
import AssistantPanel from './AssistantPanel';
import TestApplyPanel from './TestApplyPanel';
import {
  promptDefaultGraph, promptListGraphs, promptGetGraph, promptSaveGraph, promptGetVersions, promptApply,
} from '../api/adminClient';
import { Loading } from '../components/common';

const nodeTypes = { ruleNode: RuleNode };

function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelected, addRule } = useRulesStore();
  const rf = useReactFlow();
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const category = e.dataTransfer.getData('application/rule-category');
    if (!category) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addRule({ category, title: `New ${category} rule` }, pos);
  }, [rf, addRule]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)}
      onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      nodeTypes={nodeTypes} fitView snapToGrid snapGrid={[16, 16]} minZoom={0.2}
    >
      <Background gap={16} />
      <Controls />
      <MiniMap nodeColor={(n) => CATEGORY_COLOR[n.data?.category] || '#64748b'} pannable zoomable />
    </ReactFlow>
  );
}

function Palette() {
  const addRule = useRulesStore((s) => s.addRule);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      {CATEGORIES.map((c) => (
        <Chip key={c} size="small" label={c} clickable
          onClick={() => addRule({ category: c, title: `New ${c} rule` })}
          draggable onDragStart={(e) => e.dataTransfer.setData('application/rule-category', c)}
          sx={{ bgcolor: CATEGORY_COLOR[c], color: '#0f172a', fontWeight: 600, '&:hover': { opacity: 0.85 } }} />
      ))}
    </Stack>
  );
}

function PromptEditorInner() {
  const store = useRulesStore();
  const [rightTab, setRightTab] = useState('properties');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versionsAnchor, setVersionsAnchor] = useState(null);
  const [versions, setVersions] = useState([]);
  const [graphsAnchor, setGraphsAnchor] = useState(null);
  const [graphs, setGraphs] = useState([]);

  // Load: last saved CHAT_PROMPT graph, or the starter default.
  useEffect(() => {
    (async () => {
      try {
        const list = await promptListGraphs();
        if (Array.isArray(list) && list.length) {
          const g = await promptGetGraph(list[0].id || list[0].entryId);
          store.loadGraph({ nodes: g.nodes, edges: g.edges, entryId: g.id || g.entryId || list[0].id, name: g.name, version: g.currentVersion || g.versionNumber });
        } else {
          const d = await promptDefaultGraph();
          store.loadGraph({ nodes: d.nodes, edges: d.edges, name: 'Chat System Prompt (starter)' });
        }
      } catch {
        try { const d = await promptDefaultGraph(); store.loadGraph({ nodes: d.nodes, edges: d.edges }); } catch { /* offline */ }
      } finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line

  const save = async () => {
    setSaving(true);
    try {
      const g = store.toGraph();
      const res = await promptSaveGraph({ entryId: store.entryId || undefined, name: store.graphName, nodes: g.nodes, edges: g.edges, changelog: 'editor save' });
      store.setSaved({ entryId: res.id || res.entryId || store.entryId, version: res.currentVersion || res.versionNumber, name: res.name });
    } catch (e) { console.error('save failed', e); } finally { setSaving(false); }
  };

  const openVersions = async (e) => {
    setVersionsAnchor(e.currentTarget);
    if (store.entryId) { try { setVersions(await promptGetVersions(store.entryId)); } catch { setVersions([]); } }
  };
  const loadVersion = async (v) => {
    setVersionsAnchor(null);
    const g = await promptGetGraph(store.entryId, v.versionNumber);
    store.loadGraph({ nodes: g.nodes, edges: g.edges, entryId: store.entryId, name: g.name, version: v.versionNumber });
  };
  const openGraphs = async (e) => { setGraphsAnchor(e.currentTarget); try { setGraphs(await promptListGraphs()); } catch { setGraphs([]); } };
  const loadGraph = async (item) => {
    setGraphsAnchor(null);
    const g = await promptGetGraph(item.id || item.entryId);
    store.loadGraph({ nodes: g.nodes, edges: g.edges, entryId: item.id || item.entryId, name: g.name, version: g.currentVersion });
  };
  const loadDefault = async () => { const d = await promptDefaultGraph(); store.loadGraph({ nodes: d.nodes, edges: d.edges, entryId: null, name: 'Chat System Prompt (starter)' }); };

  if (loading) return <Loading label="Loading prompt graph…" />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560 }}>
      {/* Toolbar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <TextField size="small" value={store.graphName} onChange={(e) => store.setName(e.target.value)} sx={{ width: 220 }} />
        {store.dirty && <Chip size="small" color="warning" variant="outlined" label="unsaved" />}
        <Button size="small" variant="contained" startIcon={saving ? <CircularProgress size={13} /> : <Save size={14} />} onClick={save}>Save version</Button>
        <Button size="small" variant="outlined" startIcon={<History size={14} />} onClick={openVersions} disabled={!store.entryId}>Versions</Button>
        <Button size="small" variant="text" onClick={openGraphs}>Open…</Button>
        <Button size="small" variant="text" startIcon={<RotateCcw size={13} />} onClick={loadDefault}>Load starter</Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Undo"><span><IconButton size="small" onClick={store.undo}><Undo2 size={16} /></IconButton></span></Tooltip>
        <Tooltip title="Redo"><span><IconButton size="small" onClick={store.redo}><Redo2 size={16} /></IconButton></span></Tooltip>
      </Stack>

      {/* Palette */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Add rule (click or drag onto canvas):</Typography>
        <Palette />
      </Box>

      {/* Body: canvas + right panel */}
      <Box sx={{ flex: 1, display: 'flex', gap: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Canvas />
        </Box>
        <Box sx={{ width: 380, border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} variant="fullWidth" sx={{ minHeight: 38, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="properties" icon={<Settings2 size={14} />} iconPosition="start" label="Rule" sx={{ minHeight: 38, py: 0 }} />
            <Tab value="assistant" icon={<Sparkles size={14} />} iconPosition="start" label="AI" sx={{ minHeight: 38, py: 0 }} />
            <Tab value="test" icon={<FlaskConical size={14} />} iconPosition="start" label="Test & apply" sx={{ minHeight: 38, py: 0 }} />
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {rightTab === 'properties' && <Box sx={{ height: '100%', overflow: 'auto' }}><RulePropertiesPanel /></Box>}
            {rightTab === 'assistant' && <AssistantPanel />}
            {rightTab === 'test' && <TestApplyPanel />}
          </Box>
        </Box>
      </Box>

      <Menu anchorEl={versionsAnchor} open={!!versionsAnchor} onClose={() => setVersionsAnchor(null)}>
        {versions.length === 0 && <MenuItem disabled>No versions</MenuItem>}
        {versions.map((v) => (
          <MenuItem key={v.versionNumber} onClick={() => loadVersion(v)}>
            v{v.versionNumber}{v.isProduction ? ' ● active' : ''} — {v.changelog || ''} <Typography variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>{(v.createdAt || '').slice(0, 16)}</Typography>
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={graphsAnchor} open={!!graphsAnchor} onClose={() => setGraphsAnchor(null)}>
        {graphs.length === 0 && <MenuItem disabled>No saved prompt graphs</MenuItem>}
        {graphs.map((g) => <MenuItem key={g.id || g.entryId} onClick={() => loadGraph(g)}>{g.name} <Typography variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>v{g.currentVersion || g.version || 1}</Typography></MenuItem>)}
      </Menu>
    </Box>
  );
}

export default function PromptEditorTab() {
  return (
    <ReactFlowProvider>
      <PromptEditorInner />
    </ReactFlowProvider>
  );
}
