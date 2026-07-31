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
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import {
  Plus, Save, History, Undo2, Redo2, RotateCcw, Settings2, Sparkles, FlaskConical, Layers, Eye,
} from 'lucide-react';
import { useRulesStore, CATEGORIES, CATEGORY_COLOR, CANVAS_MODES } from './rulesStore';
import { shortCondition } from './conditionText';
import RuleNode from './RuleNode';
import RulePropertiesPanel from './RulePropertiesPanel';
import RuleExplorer from './RuleExplorer';
import HybridContextPanel from './HybridContextPanel';
import AssistantPanel from './AssistantPanel';
import TestApplyPanel from './TestApplyPanel';
import ContextPreviewPanel from './ContextPreviewPanel';
import GraphSelector from './GraphSelector';
import EdgePropertiesPanel from './EdgePropertiesPanel';
import BuildTools from './BuildTools';
import {
  promptDefaultGraph, promptListGraphs, promptGetGraph, promptSaveGraph, promptGetVersions, promptApply,
  promptCoverage,
} from '../api/adminClient';
import { Loading } from '../components/common';
import { useTourAnchor } from '@guided-ux/tour/react';

const nodeTypes = { ruleNode: RuleNode };

function Canvas() {
  // TOUR-003 — the canvas is the thing four of the five prompt-editor tours point at,
  // and it had no anchor: a step aimed here would have attached to nothing and been
  // skipped, which reads as a tour that silently loses steps.
  const canvasRef = useTourAnchor('editor.canvas', {
    label: 'The rules canvas', route: '/flowdesk-admin/prompt',
  });
  const { nodes, onNodesChange, onEdgesChange, onConnect, setSelected, addRule } = useRulesStore();
  const selectedId = useRulesStore((s) => s.selectedId);
  const selectedEdgeId = useRulesStore((s) => s.selectedEdgeId);
  const setSelectedEdge = useRulesStore((s) => s.setSelectedEdge);
  const removeConnection = useRulesStore((s) => s.removeConnection);
  const canvasMode = useRulesStore((s) => s.canvasMode);
  const storeEdges = useRulesStore((s) => s.edges);
  const coverageByNode = useRulesStore((s) => s.coverageByNode);
  const visibleEdges = useRulesStore((s) => s.visibleEdges);
  const conditionOf = useRulesStore((s) => s.conditionOf);
  const rf = useReactFlow();

  // EC-010 — the canvas draws a VIEW of the graph, not the graph. Condition and
  // coverage are derived here rather than stored on the node, so there is no second
  // copy to fall out of step with the edges that define them.
  const viewNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      _mode: canvasMode,
      _condition: shortCondition(conditionOf(n.id)),
      _coverage: coverageByNode ? coverageByNode[n.id] : null,
    },
  })), [nodes, canvasMode, storeEdges, coverageByNode]); // eslint-disable-line react-hooks/exhaustive-deps
  const edges = useMemo(() => {
    const list = visibleEdges();
    return list.map((e) => (e.id === selectedEdgeId
      ? { ...e, selected: true, style: { ...e.style, strokeWidth: 3 } }
      : e));
  }, [storeEdges, canvasMode, selectedEdgeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // PE-001: selecting in the list (or arriving from a session by deep link) has to
  // move the canvas. Otherwise the properties panel changes, the canvas does not, and
  // the two views appear to disagree about which rule is open.
  useEffect(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n || !n.position) return;
    rf.setCenter(n.position.x + 110, n.position.y + 40, { zoom: Math.max(rf.getZoom(), 0.7), duration: 300 });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete removes the selected connection. ReactFlow's own deleteKeyCode would also
  // delete NODES, and a rule vanishing from a stray keypress is not recoverable by
  // anything the operator would think to try.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (!selectedEdgeId) return;
      e.preventDefault();
      removeConnection(selectedEdgeId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdgeId, removeConnection]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const category = e.dataTransfer.getData('application/rule-category');
    if (!category) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addRule({ category, title: `New ${category} rule` }, pos);
  }, [rf, addRule]);

  return (
    <Box ref={canvasRef} sx={{ width: '100%', height: '100%' }}>
    <ReactFlow
      nodes={viewNodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => { setSelected(null); setSelectedEdge(null); }}
      onEdgeClick={(_, e) => setSelectedEdge(e.id)}
      deleteKeyCode={null}
      connectionRadius={30}
      defaultEdgeOptions={{ markerEnd: { type: 'arrowclosed' } }}
      onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      nodeTypes={nodeTypes} fitView snapToGrid snapGrid={[16, 16]} minZoom={0.2}
    >
      <Background gap={16} />
      <Controls />
      {/* Only worth the corner of the canvas once there is more graph than screen. */}
      {nodes.length > 20 && (
        <MiniMap nodeColor={(n) => CATEGORY_COLOR[n.data?.category] || '#64748b'} pannable zoomable />
      )}
    </ReactFlow>
    </Box>
  );
}

/**
 * EC-010 — what the canvas is showing. Four modes, because "the graph" answers four
 * different questions and drawing all of them at once answers none.
 *
 * Coverage fetches, the other three are free. That is why it is a button rather than
 * a state the editor keeps warm: recomputing nine compiles on every keystroke would
 * make typing in a rule stutter.
 */
const MODE_LABEL = {
  clean: 'Clean',
  structure: 'Structure',
  conflicts: 'Conflicts',
  coverage: 'Coverage',
};
const MODE_HELP = {
  clean: 'Bands by type and priority — the order the compiler emits in. No connections drawn.',
  structure: 'Refines, depends on, illustrates.',
  conflicts: 'Only the conflicts, so they can be resolved one at a time.',
  coverage: 'How many of the nine contexts each rule reaches. A rule reaching none is dead weight.',
};

function CanvasModes() {
  const mode = useRulesStore((s) => s.canvasMode);
  const setCanvasMode = useRulesStore((s) => s.setCanvasMode);
  const setCoverage = useRulesStore((s) => s.setCoverage);
  const isEvolutio = useRulesStore((s) => s.isEvolutio);
  const toGraph = useRulesStore((s) => s.toGraph);
  const edgeCounts = useRulesStore((s) => s.edgeCounts);
  const storeEdges = useRulesStore((s) => s.edges);
  const [busy, setBusy] = useState(false);
  const counts = useMemo(() => edgeCounts(), [storeEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEvolutio) return null;

  const pick = async (m) => {
    setCanvasMode(m);
    if (m !== 'coverage') return;
    setBusy(true);
    try {
      setCoverage(await promptCoverage(toGraph()));
    } catch {
      // Offline: the mode still switches, the nodes simply carry no count rather
      // than a stale one from a graph that has since been edited.
      setCoverage(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {CANVAS_MODES.map((m) => {
        // A mode that would draw nothing says so on its face. Switching to Structure
        // and seeing an unchanged canvas reads as a broken button, not as "this graph
        // has no relations yet".
        const n = counts[m];
        const empty = (m === 'structure' || m === 'conflicts') && n === 0;
        return (
          <Tooltip key={m} title={empty ? `${MODE_HELP[m]} — none in this graph yet.` : MODE_HELP[m]}>
            <Chip
              size="small" clickable
              label={n > 0 && m !== 'clean' && m !== 'coverage' ? `${MODE_LABEL[m]} ${n}` : MODE_LABEL[m]}
              variant={mode === m ? 'filled' : 'outlined'}
              color={mode === m ? 'primary' : 'default'}
              onClick={() => pick(m)}
              sx={{ height: 22, fontSize: 11, opacity: empty ? 0.5 : 1 }}
            />
          </Tooltip>
        );
      })}
      {busy && <CircularProgress size={12} />}
    </Stack>
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
          store.loadGraph({
            nodes: g.nodes, edges: g.edges, entryId: g.id || g.entryId || list[0].id, name: g.name,
            version: g.currentVersion || g.versionNumber, namespace: g.namespace, isLiveForAgent: g.isLiveForAgent,
          });
        } else {
          const d = await promptDefaultGraph();
          store.loadGraph({ nodes: d.nodes, edges: d.edges, name: 'Chat System Prompt (starter)' });
        }
      } catch {
        try { const d = await promptDefaultGraph(); store.loadGraph({ nodes: d.nodes, edges: d.edges }); } catch { /* offline */ }
      } finally {
        setLoading(false);
        // PE-006 deep link: the session drawer sends the operator here from a turn
        // that went wrong, naming the rule that was in force. Arriving at a canvas of
        // 22 identical boxes with no idea which one was meant would waste the whole
        // journey, so the node is selected on arrival.
        try {
          const wanted = new URLSearchParams(window.location.search).get('node');
          // getState, not the closed-over `store`: this runs after the graph loaded,
          // and the store captured at mount still holds the empty node list.
          const live = useRulesStore.getState();
          if (wanted && live.nodes.some((n) => n.id === wanted)) live.setSelected(wanted);
        } catch { /* no query string is the normal case */ }
      }
    })();
  }, []); // eslint-disable-line

  // PE-002: saving asks WHY, and refuses a new rule that never said why it exists.
  const saveRef = useTourAnchor('editor.save', { label: 'Save version', route: '/flowdesk-admin/prompt' });
  const [saveDialog, setSaveDialog] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const missing = store.missingRationale ? store.missingRationale() : [];

  const openSave = () => { setChangeReason(''); setSaveDialog(true); };

  const save = async () => {
    if (missing.length) {
      // Blocked, and it names WHICH rule — "some rule is missing something" on a
      // 22-node canvas is a message that costs more time than it saves.
      store.setSelected(missing[0].id);
      return;
    }
    setSaving(true);
    try {
      const g = store.toGraph();
      const res = await promptSaveGraph({
        entryId: store.entryId || undefined, name: store.graphName, nodes: g.nodes, edges: g.edges,
        // The reason for a CHANGE belongs to the version, not to the node: the node
        // carries why the rule exists, the version carries why it moved.
        changelog: changeReason.trim() || 'editor save',
      });
      store.setSaved({ entryId: res.id || res.entryId || store.entryId, version: res.currentVersion || res.versionNumber, name: res.name });
      setSaveDialog(false);
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
    store.loadGraph({
      nodes: g.nodes, edges: g.edges, entryId: item.id || item.entryId, name: g.name,
      version: g.currentVersion, namespace: g.namespace, isLiveForAgent: g.isLiveForAgent,
    });
  };
  // A graph just created is not live and holds no versions yet; opening it straight
  // away is what the operator meant by creating it.
  const openCreated = async (saved) => {
    const id = saved && (saved.entryId || saved.id || saved.graphId);
    if (!id) return;
    try { await loadGraph({ id }); } catch { /* it exists; the list will show it */ }
  };
  const loadDefault = async () => { const d = await promptDefaultGraph(); store.loadGraph({ nodes: d.nodes, edges: d.edges, entryId: null, name: 'Chat System Prompt (starter)' }); };

  if (loading) return <Loading label="Loading prompt graph…" />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560 }}>
      {/* Toolbar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <TextField size="small" value={store.graphName} onChange={(e) => store.setName(e.target.value)} sx={{ width: 220 }} />
        {/* WHICH graph. There are two with near-identical names, and only one of them
            is compiled by the running chat — an editor that does not say which it has
            open is how the wrong graph gets tuned for a week (HYB-011a). */}
        <Tooltip title={store.isEvolutio
          ? 'EVOLUTIO:PROMPT — the graph the live chat (agent / hybrid) compiles'
          : 'CHAT_PROMPT — the state machine\'s prompt. The live chat does NOT read this.'}>
          <Chip
            size="small"
            color={store.isLiveForAgent ? 'success' : 'default'}
            variant={store.isLiveForAgent ? 'filled' : 'outlined'}
            label={store.isLiveForAgent ? 'live · agent prompt' : (store.graphNamespace || 'unknown graph')}
          />
        </Tooltip>
        {store.version != null && <Chip size="small" variant="outlined" label={`v${store.version}`} />}
        {store.dirty && <Chip size="small" color="warning" variant="outlined" label="unsaved" />}
        <Button ref={saveRef} size="small" variant="contained" startIcon={saving ? <CircularProgress size={13} /> : <Save size={14} />} onClick={openSave}>Save version</Button>
        {missing.length > 0 && (
          <Tooltip title={`No reason recorded for: ${missing.map((m) => m.title).join(', ')}`}>
            <Chip size="small" color="warning" label={`${missing.length} new rule${missing.length > 1 ? 's' : ''} without a reason`}
              onClick={() => store.setSelected(missing[0].id)} />
          </Tooltip>
        )}
        <Button size="small" variant="outlined" startIcon={<History size={14} />} onClick={openVersions} disabled={!store.entryId}>Versions</Button>
        {/* PR-005: replaces the old "Open…" menu. That one could open a graph and
            gave no way to see — let alone change — which graph the assistant reads. */}
        <GraphSelector onOpenGraph={loadGraph} onCreated={openCreated} />
        <Button size="small" variant="text" startIcon={<RotateCcw size={13} />} onClick={loadDefault}>Load starter</Button>
        <Box sx={{ flex: 1 }} />
        {/* Layout ignores connections deliberately: bands by type and priority are
            what the COMPILER emits by, and an operator arranging rules by who refines
            whom would be reading an order the prompt does not have. */}
        {store.isEvolutio && (
          <Tooltip title="Re-arrange in the bands the compiler emits: by node type, then priority. Connections are not an ordering.">
            <Button size="small" variant="text" onClick={store.relayout}>Tidy</Button>
          </Tooltip>
        )}
        <Tooltip title="Undo"><span><IconButton size="small" onClick={store.undo}><Undo2 size={16} /></IconButton></span></Tooltip>
        <Tooltip title="Redo"><span><IconButton size="small" onClick={store.redo}><Redo2 size={16} /></IconButton></span></Tooltip>
      </Stack>

      {/* Two rows, because BUILDING the graph and LOOKING at it are different jobs
          and mixing them into one strip of chips is what made the editor read as
          view-only: every control on screen changed what was displayed, none of them
          changed what was there. */}
      <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">Add rule:</Typography>
        <Palette />
      </Box>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <BuildTools />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">Show:</Typography>
        <CanvasModes />
      </Box>

      {/* Body: explorer + canvas + right panel */}
      <Box sx={{ flex: 1, display: 'flex', gap: 1, minHeight: 0 }}>
        {/* PE-001: 22 near-identical boxes on a canvas is not a way to find a rule.
            The list, the canvas and the properties panel share one selection. */}
        <Box sx={{ width: 300, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', minHeight: 0 }}>
          <RuleExplorer />
        </Box>
        <Box sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Canvas />
        </Box>
        <Box sx={{ width: 380, border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} variant="fullWidth" sx={{ minHeight: 38, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="properties" icon={<Settings2 size={14} />} iconPosition="start" label="Rule" sx={{ minHeight: 38, py: 0 }} />
            <Tab value="assistant" icon={<Sparkles size={14} />} iconPosition="start" label="AI" sx={{ minHeight: 38, py: 0 }} />
            <Tab value="test" icon={<FlaskConical size={14} />} iconPosition="start" label="Test & apply" sx={{ minHeight: 38, py: 0 }} />
            {/* PE-004: the prompt is not the whole assistant, and the operator has to
                be able to see how much of the dialogue it actually reaches. */}
            <Tab value="context" icon={<Layers size={14} />} iconPosition="start" label="Scope" sx={{ minHeight: 38, py: 0 }} />
            {/* EC-011: with conditions, "the compiled prompt" is nine different
                prompts. This is where the operator sees which one. */}
            <Tab value="preview" icon={<Eye size={14} />} iconPosition="start" label="Context" sx={{ minHeight: 38, py: 0 }} />
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {rightTab === 'properties' && (
              <Box sx={{ height: '100%', overflow: 'auto' }}>
                {/* Click a connection, edit the connection. Before this the panel kept
                    showing the last rule, so the canvas and the panel disagreed about
                    what was selected. */}
                {store.selectedEdgeId ? <EdgePropertiesPanel /> : <RulePropertiesPanel />}
              </Box>
            )}
            {rightTab === 'assistant' && <AssistantPanel />}
            {rightTab === 'test' && <TestApplyPanel />}
            {rightTab === 'context' && <Box sx={{ height: '100%', overflow: 'auto' }}><HybridContextPanel /></Box>}
            {rightTab === 'preview' && <ContextPreviewPanel />}
          </Box>
        </Box>
      </Box>

      {/* PE-002: the reason for a change, asked at the moment it is known. */}
      <Dialog open={saveDialog} onClose={() => setSaveDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save a new version</DialogTitle>
        <DialogContent>
          {missing.length > 0 ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {missing.length === 1 ? 'A new rule has' : `${missing.length} new rules have`} no recorded reason for
              existing: {missing.map((m) => m.title).join(', ')}. Fill in “Why this rule exists” before saving —
              the twenty-two inherited rules already show what an undocumented prompt costs.
            </Alert>
          ) : (
            <TextField
              autoFocus fullWidth size="small" multiline minRows={2} sx={{ mt: 1 }}
              label="Reason for this change (optional)"
              value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Session fdv2-abc123: the assistant re-opened a settled field."
              helperText="Recorded on the version, alongside the diff. Not required." />
          )}
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setSaveDialog(false)}>Cancel</Button>
          <Button size="small" variant="contained" onClick={save} disabled={saving || missing.length > 0}
            startIcon={saving ? <CircularProgress size={13} /> : <Save size={14} />}>Save version</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={versionsAnchor} open={!!versionsAnchor} onClose={() => setVersionsAnchor(null)}>
        {versions.length === 0 && <MenuItem disabled>No versions</MenuItem>}
        {versions.map((v) => (
          <MenuItem key={v.versionNumber} onClick={() => loadVersion(v)} sx={{ display: 'block', py: 0.5 }}>
            <Typography variant="body2" component="span">
              v{v.versionNumber}{v.isProduction ? ' ● active' : ''}
              <Typography variant="caption" sx={{ ml: 1, color: 'text.disabled' }}>{(v.createdAt || '').slice(0, 16)}</Typography>
            </Typography>
            {/* PE-002: why it changed, where versions are chosen between. A list of
                numbers and dates cannot answer "which one do I want". */}
            <Typography variant="caption" sx={{ display: 'block', color: v.changelog && v.changelog !== 'editor save' ? 'text.secondary' : 'text.disabled', maxWidth: 420, whiteSpace: 'normal' }}>
              {v.changelog && v.changelog !== 'editor save' ? v.changelog : 'no reason recorded'}
            </Typography>
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
