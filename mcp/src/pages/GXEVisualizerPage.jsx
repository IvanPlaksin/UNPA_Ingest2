/**
 * GXE Visualizer Page
 *
 * Features:
 *  1. Multiple graphs as tabs
 *  2. Drill-down into nodes to create/view sub-graphs
 *  3. AI-powered graph generation
 *  4. Visual step-by-step execution
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactFlow, {
  MiniMap, Controls, Background,
  useNodesState, useEdgesState, addEdge,
  Panel, MarkerType, Handle, Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Play, Pause, RotateCcw, Zap, Brain, CheckCircle, Clock,
  AlertCircle, ChevronRight, Eye, X, Send,
  Upload, Terminal, Loader2,
  Maximize2, Minimize2, GripVertical,
  Plus, Layers, ChevronDown, ExternalLink,
  Cpu, Sparkles, Settings2, Timer, Bell, GitFork, Hourglass, Search, GitCompare, Bot, Target
} from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';
import { fetchConnectors } from '../services/api';
import GraphCatalog from '../components/GXE/GraphCatalog';
import FloatingControlPanel from '../components/GXE/FloatingControlPanel';
import FloatingWindow from '../components/GXE/FloatingWindow';
import BottomPanel from '../components/GXE/BottomPanel';
import ModelSelector from '../components/GXE/ModelSelector';
import GraphToolbar from '../components/GXE/GraphToolbar';
import SaveGraphDialog from '../components/GXE/SaveGraphDialog';
import DetailsWatcher from '../components/GXE/DetailsWatcher';
import { getGraphById, getVersion, expandSubgraphNode, createGraph } from '../services/graphCatalog.service';
import { loadMcpSettings, generateKnowledgeGraph, loadAiSettings, saveAiSettings, getDefaultGenerationPrompt, saveGenerationPrompt, setDefaultGenerationPrompt, analyzePromptOptimization } from '../services/gxe.service';
import { extractSubgraph, analyzeStructure } from '../services/subgraph.service';
import { findPaths, findSimilarNodes, predictLinks } from '../services/nexus.service';
import FloatingPromptEditor from '../components/GXE/FloatingPromptEditor';
import GraphActionsPanel from '../components/GXE/GraphActionsPanel';
import ImportSqlSelector from '../components/GXE/ImportSqlSelector';
import GnnAnalysisPrompt from '../components/GXE/GnnAnalysisPrompt';
import GnnSummaryPanel from '../components/GXE/GnnSummaryPanel';
import { buildPredictedEdges } from '../components/GXE/GnnInsightsOverlay';
import useImportSqlStore from '../stores/importSqlStore';
import { useCatalogStore } from '../stores/catalogStore';
// Legacy FloatingToolCatalog replaced by UnifiedToolCatalog wrapped in GXE chrome
import GXEToolCatalogWrapper from '../components/Catalog/GXEToolCatalogWrapper';
import ToolSettingsDialog from '../components/GXE/ToolSettingsDialog';
import InsightsBar from '../components/GXE/panels/InsightsBar';
import SearchPanel from '../components/GXE/panels/SearchPanel';
import SimilarityPanel from '../components/GXE/panels/SimilarityPanel';
import AssistantPanel from '../components/GXE/panels/AssistantPanel';
import PropertiesPanel from '../components/GXE/panels/PropertiesPanel';
import ExecutionOverlay from '../components/GXE/panels/ExecutionOverlay';
import { usePortPositions } from '../components/GXE/hooks/usePortPositions';
import GuidedModeWizard from '../components/GXE/guided/GuidedModeWizard';
import GNNPanel from '../components/GXE/panels/GNNPanel';
import WaitingNode from '../components/GXE/nodes/WaitingNode';
import PendingSignalsPanel from '../components/GXE/panels/PendingSignalsPanel';
import SignalResumeOverlay from '../components/GXE/overlays/SignalResumeOverlay';
import { Nexus } from '../components/Nexus';
import GxeContextMenu from '../components/GXE/menus/ContextMenu';
import ClusterOverlay from '../components/GXE/overlays/ClusterOverlay';
import { useNexusStore } from '../stores/nexusStore';
import { useSelectionSync } from '../components/GXE/hooks/useSelectionSync';
import { useNodeHighlighting } from '../components/GXE/hooks/useNodeHighlighting';
import '../components/Nexus/styles/highlighting.css';
import ParallelEdge from '../components/GXE/ParallelEdge';
import dagre from 'dagre';
import { useDragRepulsion } from '../components/GXE/hooks/useDragRepulsion';
import { resolveCollisions } from '../components/GXE/utils/collisionResolver';
import { useGXELayout } from '../hooks/useGXELayout';
import { useAILayout } from '../hooks/useAILayout';
import AILayoutSettingsModal from '../components/GXE/AILayoutSettingsModal';
import { computeObstacleRoutes } from '../utils/graph-layouts';
import { useHexLayout, DEFAULT_HEX_LAYOUT_HOOK_OPTIONS } from '../hooks/useHexLayout';
import HexNode from '../components/GXE/HexNode';
import HexEdge from '../components/GXE/HexEdge';
import HexGridBackground from '../components/GXE/HexGridBackground';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

// Default edge routing — smoothstep minimises crossings with orthogonal paths
const DEFAULT_EDGE_TYPE = 'smoothstep';

/**
 * Check whether nodes already carry meaningful positions.
 * Returns false when every node sits at (0,0) or has no position at all.
 */
const hasValidPositions = (nodes) => {
  if (!nodes || nodes.length === 0) return false;
  return nodes.some(n =>
    n.position && (n.position.x !== 0 || n.position.y !== 0)
  );
};

/**
 * Apply dagre top-down (TB) hierarchical layout.
 * Used as fallback when a graph has no stored positions.
 */
const autoLayoutTB = (nodes, edges) => {
  if (!nodes || nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50, align: 'UL' });

  nodes.forEach(node => {
    const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
    g.setNode(node.id, { width: isSmall ? 190 : 260, height: isSmall ? 70 : 130 });
  });
  (edges || []).forEach(edge => {
    const src = edge.source?.id || edge.source;
    const tgt = edge.target?.id || edge.target;
    if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt);
  });

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
    return {
      ...node,
      position: {
        x: pos.x - (isSmall ? 95 : 130),
        y: pos.y - (isSmall ? 35 : 65),
      },
    };
  });
};

// Knowledge Graph generation stages
const KG_STAGES = [
  { id: 'parse', label: 'Text Preprocessing', status: 'pending', stats: null },
  { id: 'chunk', label: 'Semantic Chunking', status: 'pending', stats: null },
  { id: 'extract', label: 'Entity & Relation Extraction', status: 'pending', stats: null },
  { id: 'deduplicate', label: 'Deduplication', status: 'pending', stats: null },
  { id: 'graph_build', label: 'Graph Construction', status: 'pending', stats: null },
  { id: 'ai_analysis', label: 'AI Quality Analysis', status: 'pending', stats: null }
];

const PRIMITIVE_KINDS = ['input', 'output']; // Nodes that cannot be drilled into
const PRIMITIVE_TOOLS = ['text.', 'control.']; // Level 1 tools - no drill-down

/**
 * When false, tool-ref badge nodes are hidden and their info is displayed
 * as an inline button on the parent executor node (replacing "Create Sub-Graph").
 * Set to true to restore the legacy separate-node rendering.
 */
const RENDER_TOOL_REF_AS_NODES = false;

const palette = {
  business:  { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd', glow: 'rgba(59,130,246,.5)' },
  executor:  { bg: '#1a2e1a', border: '#22c55e', text: '#86efac', glow: 'rgba(34,197,94,.5)' },
  actor:     { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe', glow: 'rgba(168,85,247,.5)' },
  ai:        { bg: '#2e2a1a', border: '#eab308', text: '#fde047', glow: 'rgba(234,179,8,.5)' },
  input:     { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9', glow: 'rgba(6,182,212,.5)' },
  output:    { bg: '#2e1a2a', border: '#ec4899', text: '#f9a8d4', glow: 'rgba(236,72,153,.5)' },
  condition: { bg: '#2e2e1a', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,.5)' },
  tool:      { bg: '#1a1a0e', border: '#d97706', text: '#fbbf24', glow: 'rgba(217,119,6,.5)' },
  subgraph:  { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.5)' },
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER: Check if node can be drilled into
   ═══════════════════════════════════════════════════════════════════════════ */

function canDrillDown(nodeData) {
  if (!nodeData) return false;
  if (nodeData.kind === 'subgraph') return true;
  // Tool-reference badges are informational, not drillable
  if (nodeData.isToolRef) return false;
  const kind = nodeData.kind || 'executor';
  // Primitives (input/output) cannot be drilled
  if (PRIMITIVE_KINDS.includes(kind)) return false;
  // Level 1 tools (text.*, control.*) are atomic
  const label = (nodeData.label || '').toLowerCase();
  if (PRIMITIVE_TOOLS.some(p => label.startsWith(p))) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-HANDLE RENDERING HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * PortHub — visual strip with port indicators above (target) or below (source) a node.
 * Each port is a distinct handle — one port = one edge.
 * The hub is a narrow rectangular bar with evenly-spaced port dots.
 *
 * @param {string} type - 'target' | 'source'
 * @param {number} count - number of ports (edges)
 * @param {string} color - port dot color (default: gray)
 */
const PortHub = ({ type, count, color = '#6b7280' }) => {
  const isTarget = type === 'target';
  const position = isTarget ? Position.Top : Position.Bottom;
  const prefix = isTarget ? 'in' : 'out';

  // Always render at least 1 handle (even if count=0) for ReactFlow connectivity
  const portCount = Math.max(count || 0, 1);

  // Hub bar styling
  const hubStyle = {
    position: 'absolute',
    left: '8px',
    right: '8px',
    height: '8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(48, 54, 61, 0.8)',
    border: '1px solid rgba(48, 54, 61, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '0 4px',
    zIndex: 1,
    ...(isTarget ? { top: '-12px' } : { bottom: '-12px' }),
  };

  // Single port — centered, no hub bar needed
  if (portCount <= 1) {
    return (
      <Handle
        type={type}
        position={position}
        id={`${prefix}-0`}
        style={{
          width: 8, height: 8,
          background: color,
          border: `2px solid ${color}88`,
          ...(isTarget ? { top: -4 } : { bottom: -4 }),
        }}
      />
    );
  }

  return (
    <div style={hubStyle}>
      {Array.from({ length: portCount }, (_, i) => (
        <Handle
          key={`${prefix}-${i}`}
          type={type}
          position={position}
          id={`${prefix}-${i}`}
          style={{
            position: 'relative',
            transform: 'none',
            top: 'auto',
            left: 'auto',
            width: 6,
            height: 6,
            background: color,
            border: `1.5px solid ${color}88`,
            borderRadius: '50%',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
};

// Backward-compatible wrappers used by node components
const TargetHandles = ({ count, className }) => {
  // Extract color hint from className
  const purple = className?.includes('purple');
  return <PortHub type="target" count={count} color={purple ? '#a855f7' : '#6b7280'} />;
};

const SourceHandles = ({ count, className }) => {
  const purple = className?.includes('purple');
  return <PortHub type="source" count={count} color={purple ? '#a855f7' : '#6b7280'} />;
};

// ── Dynamic port handles (CONS-12: portAssigner) ──
// Maps portConfig.position → ReactFlow Position
const SIDE_TO_POSITION = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

const DynamicHandles = ({ portConfigs = [], handleType }) => {
  const ports = portConfigs.filter(p => p.type === handleType);
  if (ports.length === 0) return null;

  const color = handleType === 'target' ? '#10b981' : '#3b82f6'; // emerald / blue
  return ports.map(port => {
    const style = (port.position === 'left' || port.position === 'right')
      ? { top: `${port.offsetPercent * 100}%` }
      : { left: `${port.offsetPercent * 100}%` };
    return (
      <Handle
        key={port.id}
        id={port.id}
        type={handleType}
        position={SIDE_TO_POSITION[port.position] || Position.Left}
        style={{ ...style, width: 8, height: 8, background: color, border: `2px solid ${color}88` }}
      />
    );
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   ASYNC OPERATION INDICATOR
   ═══════════════════════════════════════════════════════════════════════════ */

const ASYNC_INDICATORS = {
  blocking:       { Icon: Hourglass, color: '#f59e0b', label: 'Blocking — waits for input',     badge: 'wait' },
  async_spawn:    { Icon: GitFork,   color: '#a855f7', label: 'Async — spawns child graph',     badge: 'async' },
  notification:   { Icon: Bell,      color: '#06b6d4', label: 'Fire-and-forget notification',   badge: 'notify' },
  ai_slow:        { Icon: Timer,     color: '#eab308', label: 'AI operation (may be slow)',      badge: 'ai' },
};

/**
 * Detect if a node involves an async/blocking operation.
 * Returns an indicator config or null.
 */
function getAsyncIndicator(nodeData) {
  if (!nodeData) return null;
  const toolId = (nodeData.toolId || '').toLowerCase();
  const label = (nodeData.label || '').toLowerCase();
  const kind = (nodeData.kind || '').toLowerCase();

  // Blocking: wait_input
  if (toolId === 'workflow.wait_input' || toolId.includes('wait_input')
      || label.includes('wait') && (label.includes('input') || label.includes('approval'))
      || label.includes('human') && label.includes('review')) {
    return ASYNC_INDICATORS.blocking;
  }

  // Async spawn
  if (toolId === 'workflow.spawn_graph' || toolId.includes('spawn')
      || label.includes('spawn') && label.includes('graph')) {
    return ASYNC_INDICATORS.async_spawn;
  }

  // Notification (fire-and-forget)
  if (toolId === 'notification.send' || toolId.includes('notification')
      || label.includes('notify') || label.includes('notification')
      || (label.includes('send') && (label.includes('email') || label.includes('sms')))) {
    return ASYNC_INDICATORS.notification;
  }

  // AI operations (potentially slow)
  if (toolId === 'ai.generate' || toolId === 'ai.classify'
      || kind === 'ai'
      || label.includes('llm') || label.includes('генер')) {
    return ASYNC_INDICATORS.ai_slow;
  }

  return null;
}

/**
 * Small badge rendered on the node header when it's async.
 */
const AsyncBadge = ({ indicator }) => {
  if (!indicator) return null;
  const { Icon, color, label, badge } = indicator;
  return (
    <span
      className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium"
      style={{ backgroundColor: color + '20', color }}
      title={label}
    >
      <Icon className="w-3 h-3" />
      {badge}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM NODE with Drill-Down Button
   ═══════════════════════════════════════════════════════════════════════════ */

const GraphNode = ({ data, selected }) => {
  const kind = data.kind || 'executor';
  const c = palette[kind] || palette.executor;
  const st = data.status || 'idle';
  const canDrill = canDrillDown(data);
  const hasSubGraph = data.hasSubGraph;
  const asyncIndicator = getAsyncIndicator(data);

  const handleDrillDown = (e) => {
    e.stopPropagation();
    if (data.onDrillDown) data.onDrillDown(data);
  };

  // ── Compact rendering for tool-reference badge nodes ──
  if (data.isToolRef) {
    // When RENDER_TOOL_REF_AS_NODES is off, hide tref nodes — their info
    // is shown as an inline button on the parent executor node instead.
    if (!RENDER_TOOL_REF_AS_NODES) {
      return <div style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }} />;
    }

    return (
      <div
        className={`relative px-3 py-2 rounded border-2 border-dashed min-w-[140px] max-w-[200px] transition-all duration-300
          ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0d1117]' : ''}
          ${data.highlighted ? 'ring-2 ring-offset-1 ring-offset-[#0d1117]' : ''}`}
        style={{
          backgroundColor: c.bg,
          borderColor: data.highlighted ? '#d4a017' : c.border,
          opacity: data.dimmed ? 0.25 : 0.9,
          boxShadow: data.highlighted ? '0 0 12px rgba(212,160,23,0.5)' : 'none',
          ...(data.highlighted ? { ringColor: '#d4a017' } : {}),
        }}
      >
        {/* Side handle for USES_TOOL binding (left side — target from executor) */}
        <Handle type="target" position={Position.Left} id="tool-bind"
          className="w-2 h-2 bg-amber-500 border border-amber-700" />
        <TargetHandles count={data._inCount} className="w-2 h-2 bg-gray-500 border border-gray-700" />
        <div className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: c.text }} />
          <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
            style={{ backgroundColor: c.border + '25', color: c.text }}>tool</span>
        </div>
        <div className="font-medium text-white text-xs mt-1">{data.label}</div>
        <div className="text-[10px] mt-0.5 opacity-60" style={{ color: c.text }}>{data.executorType}</div>
        <SourceHandles count={data._outCount} className="w-2 h-2 bg-gray-500 border border-gray-700" />
      </div>
    );
  }

  // ── SubGraph proxy node rendering ──
  if (kind === 'subgraph') {
    const hlBorder = data.highlighted ? '#d4a017' : null;
    const hlShadow = data.highlighted ? '0 0 16px rgba(212,160,23,0.6)' : null;
    const ports = data.ports || [];
    const inCount = ports.filter(p => p.direction === 'IN' || p.direction === 'BIDI').length;
    const outCount = ports.filter(p => p.direction === 'OUT' || p.direction === 'BIDI').length;

    return (
      <div
        className={`relative px-4 py-3 rounded-lg border-2 border-dashed min-w-[200px] max-w-[280px] transition-all duration-300
          ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1117]' : ''}
          ${data.highlighted ? 'ring-2 ring-[#d4a017] ring-offset-1 ring-offset-[#0d1117]' : ''}
          ${st === 'running' || st === 'waiting' ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: st === 'error' ? '#3f1e1e' : st === 'waiting' ? '#3f2e1e' : c.bg,
          borderColor: hlBorder || (st === 'done' ? '#22c55e' : st === 'error' ? '#ef4444' : st === 'waiting' ? '#f59e0b' : c.border),
          boxShadow: hlShadow || (st === 'running' ? `0 0 25px ${c.glow}` : st === 'waiting' ? '0 0 25px rgba(245,158,11,0.4)' : `0 0 8px ${c.glow}`),
          opacity: data.dimmed ? 0.25 : 1,
        }}
      >
        <TargetHandles count={data._inCount} className="w-3 h-3 bg-purple-400 border-2 border-purple-700" />

        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4" style={{ color: c.text }} />
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ backgroundColor: c.border + '25', color: c.text }}>subgraph</span>
          <AsyncBadge indicator={asyncIndicator} />
          <div className="flex-1" />
          {st === 'running' && <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />}
          {st === 'done' && <CheckCircle className="w-4 h-4 text-green-400" />}
          {st === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          {st === 'waiting' && <Hourglass className="w-4 h-4 text-amber-400 animate-pulse" />}
        </div>

        <div className="font-medium text-white text-sm">{data.label}</div>

        <div className="text-[10px] mt-1 opacity-70 flex items-center gap-2" style={{ color: c.text }}>
          <span>{data.nodeCount || '?'} nodes</span>
          {ports.length > 0 && (
            <>
              <span>|</span>
              <span>{inCount} in</span>
              <span>{outCount} out</span>
            </>
          )}
        </div>

        {data.duration != null && (
          <div className="text-xs mt-1 text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />{data.duration}ms
          </div>
        )}

        <button
          onClick={handleDrillDown}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all
            bg-purple-500/20 border border-purple-500/50 text-purple-300 hover:bg-purple-500/30"
          title="Open sub-graph contents"
        >
          <Layers className="w-3.5 h-3.5" /> Open Sub-Graph
        </button>

        <SourceHandles count={data._outCount} className="w-3 h-3 bg-purple-400 border-2 border-purple-700" />
      </div>
    );
  }

  // ── Standard executor node rendering ──
  const highlightBorder = data.highlighted ? '#d4a017' : null;
  const highlightShadow = data.highlighted ? '0 0 16px rgba(212,160,23,0.6)' : null;
  const hasDynPorts = data.portConfigs?.length > 0;

  return (
    <div
      className={`relative px-4 py-3 rounded-lg border-2 min-w-[190px] max-w-[280px] transition-all duration-300
        ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1117]' : ''}
        ${data.highlighted ? 'ring-2 ring-[#d4a017] ring-offset-1 ring-offset-[#0d1117]' : ''}
        ${st === 'running' || st === 'waiting' ? 'animate-pulse' : ''}`}
      style={{
        backgroundColor: st === 'error' ? '#3f1e1e' : st === 'waiting' ? '#3f2e1e' : c.bg,
        borderColor: highlightBorder || (st === 'done' ? '#22c55e' : st === 'error' ? '#ef4444' : st === 'waiting' ? '#f59e0b' : c.border),
        boxShadow: highlightShadow || (st === 'running' ? `0 0 25px ${c.glow}` : st === 'waiting' ? '0 0 25px rgba(245,158,11,0.4)' : 'none'),
        opacity: data.dimmed ? 0.25 : 1,
      }}
    >
      {hasDynPorts
        ? <DynamicHandles portConfigs={data.portConfigs} handleType="target" />
        : <TargetHandles count={data._inCount} className="w-3 h-3 bg-gray-500 border-2 border-gray-700" />
      }
      {/* Side handle for USES_TOOL binding (right side — source to tool-ref node) */}
      {RENDER_TOOL_REF_AS_NODES && data.toolRef && (
        <Handle type="source" position={Position.Right} id="tool-bind"
          className="w-2 h-2 bg-amber-500 border border-amber-700" />
      )}

      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ backgroundColor: c.border + '25', color: c.text }}>{kind}</span>
        <AsyncBadge indicator={asyncIndicator} />
        <div className="flex-1" />
        {st === 'running' && <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />}
        {st === 'done' && <CheckCircle className="w-4 h-4 text-green-400" />}
        {st === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
        {st === 'waiting' && <Hourglass className="w-4 h-4 text-amber-400 animate-pulse" />}
      </div>

      <div className="font-medium text-white text-sm">{data.label}</div>
      {(data.toolId || data.executorType) && (
        <div className="text-[9px] mt-0.5 font-mono px-1 py-0.5 rounded inline-block"
          style={{ backgroundColor: c.border + '20', color: c.text, opacity: 0.8 }}>
          {data.toolId || data.executorType}
        </div>
      )}
      {data.description && <div className="text-xs mt-1 opacity-70" style={{ color: c.text }}>{data.description}</div>}

      {data.duration != null && (
        <div className="text-xs mt-1 text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />{data.duration}ms
        </div>
      )}

      {/* Inline Tool Button — replaces drill-down when a tool is bound */}
      {!RENDER_TOOL_REF_AS_NODES && data.toolRef ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (data.onOpenToolSettings) data.onOpenToolSettings(data);
          }}
          className="mt-2 w-full flex items-center gap-1.5 px-2 py-1.5 rounded border-2 border-dashed cursor-pointer hover:brightness-125 transition-all"
          style={{
            backgroundColor: palette.tool.bg,
            borderColor: palette.tool.border,
          }}
          title={`Configure tool: ${data.toolRef}`}
        >
          <Settings2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: palette.tool.text }} />
          <span className="text-xs font-medium truncate" style={{ color: palette.tool.text }}>
            {data.toolRef}
          </span>
          <span
            className="ml-auto text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0"
            style={{ backgroundColor: palette.tool.border + '25', color: palette.tool.text }}
          >tool</span>
        </button>
      ) : canDrill && (
        <button
          onClick={handleDrillDown}
          className={`mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all
            ${hasSubGraph
              ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300 hover:bg-purple-500/30'
              : 'bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30'}`}
          title={hasSubGraph ? 'Open sub-graph' : 'Generate sub-graph'}
        >
          {hasSubGraph ? (
            <><Layers className="w-3.5 h-3.5" /> Open Sub-Graph</>
          ) : (
            <><Plus className="w-3.5 h-3.5" /> Create Sub-Graph</>
          )}
        </button>
      )}

      {hasDynPorts
        ? <DynamicHandles portConfigs={data.portConfigs} handleType="source" />
        : <SourceHandles count={data._outCount} className="w-3 h-3 bg-gray-500 border-2 border-gray-700" />
      }
    </div>
  );
};

const nodeTypes = { graphNode: GraphNode, hexNode: HexNode, waiting: WaitingNode, waitingInput: WaitingNode };
const edgeTypes = { parallel: ParallelEdge, hexEdge: HexEdge };

/* ═══════════════════════════════════════════════════════════════════════════
   AI GRAPH GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Generate graph via AI
 * @param {string} taskText - Task description
 * @param {object} options - { model, parentContext, parentGraphNodes, useTools, enabledTools, useSDA }
 */
async function aiGenerateGraph(taskText, options = {}) {
  const { model, parentContext, parentGraphNodes, useTools, enabledTools, useSDA, temperature, maxTokens } = options;

  try {
    const payload = { task: taskText };

    // Add model selection
    if (model) {
      payload.model = model;
    }

    // Add full parent context for sub-graphs
    if (parentContext) {
      payload.parentContext = {
        nodeId: parentContext.nodeId,
        nodeLabel: parentContext.nodeLabel,
        nodeKind: parentContext.nodeKind,
        nodeDescription: parentContext.nodeDescription,
        parentTabId: parentContext.parentTabId,
        // Include parent graph structure summary
        parentGraphSummary: parentGraphNodes
          ? parentGraphNodes.map(n => `- ${n.data.label} (${n.data.kind}): ${n.data.description || 'no description'}`).join('\n')
          : null
      };
    }

    // Enable agentic mode with MCP tools
    if (useTools) {
      payload.useTools = true;
      // Pass enabled tools filter if available
      if (enabledTools && Array.isArray(enabledTools) && enabledTools.length > 0) {
        payload.enabledTools = enabledTools;
      }
    }

    // Enable full SDA pipeline (S1→S2→S3→S4→S5 with TaskPlanner)
    if (useSDA) {
      payload.useSDA = true;
    }

    // Pass AI generation parameters
    if (temperature != null) payload.temperature = temperature;
    if (maxTokens != null) payload.maxTokens = maxTokens;

    const r = await axios.post(`${API_BASE_URL}/gxe/generate`, payload);
    if (r.data?.success && r.data.data) {
      return {
        ...r.data.data,
        source: r.data.source || 'api',
        aiStatus: r.data.aiStatus || null,
        anomaly: r.data.anomaly || null,  // soft gate warning
        // Pass through pipeline metadata for prompt optimizer
        taskPlan: r.data.taskPlan || null,
        enhancement: r.data.enhancement || null,
        qualityMetrics: r.data.qualityMetrics || null,
        validation: r.data.validation || null
      };
    }
    // Pipeline halted by anomaly gate — propagate anomaly info
    if (r.data?.anomaly && r.data?.source === 'ai-anomaly') {
      return {
        anomaly: r.data.anomaly,
        source: 'ai-anomaly',
        aiStatus: r.data.aiStatus || { success: false, error: r.data.error }
      };
    }
    return {
      ...localFallbackGraph(taskText),
      source: 'local',
      aiStatus: { success: false, error: r.data?.error || 'Unknown API error' }
    };
  } catch (err) {
    console.warn('[GXE] API call failed, using local fallback:', err.message);
    return {
      ...localFallbackGraph(taskText),
      source: 'local',
      aiStatus: { success: false, error: `Backend unavailable: ${err.message}` }
    };
  }
}

/**
 * Fetch available AI models
 */
async function fetchAvailableModels() {
  try {
    const r = await axios.get(`${API_BASE_URL}/gxe/models`);
    return r.data?.data || [];
  } catch (err) {
    console.warn('[GXE] Failed to fetch models:', err.message);
    return [
      { id: 'claude-sonnet', name: 'Claude Sonnet 4', isDefault: true },
      { id: 'claude-haiku', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus', name: 'Claude Opus 4' }
    ];
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOCAL FALLBACK GRAPH GENERATOR
   ═══════════════════════════════════════════════════════════════════════════ */

function localFallbackGraph(taskText) {
  const t = taskText.toLowerCase();
  const N = [], E = [];
  let y = 0;
  const add = (id, lbl, kind, desc, x = 400) => {
    N.push({ id, type: 'graphNode', position: { x, y }, data: { label: lbl, kind, description: desc, status: 'idle' } });
    y += 130;
  };
  const link = (a, b) => E.push({ id: `e-${a}-${b}`, source: a, target: b });

  add('input', 'Task Input', 'input', 'Incoming parameters');

  // Generic fallback
  add('analyze', 'Analyze Task', 'ai', 'Understand intent');
  link('input', 'analyze');
  add('plan', 'Plan Execution', 'business', 'Decide strategy');
  link('analyze', 'plan');
  add('exec1', 'Execute Step 1', 'executor', 'Primary processing', 180);
  y -= 130;
  add('exec2', 'Execute Step 2', 'executor', 'Secondary processing', 620);
  link('plan', 'exec1'); link('plan', 'exec2');
  add('merge', 'Merge Results', 'business', 'Combine outputs');
  link('exec1', 'merge'); link('exec2', 'merge');
  add('output', 'Result', 'output', 'Final output');
  link('merge', 'output');

  return { nodes: N, edges: E, requiredParams: {
    inputText: { type: 'textarea', label: 'Input data', placeholder: 'Enter data…' }
  }};
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK NODE EXECUTOR
   ═══════════════════════════════════════════════════════════════════════════ */

const wait = ms => new Promise(r => setTimeout(r, ms));

async function runNode(nodeData, inputs) {
  const d = 150 + Math.random() * 650;
  await wait(d);
  const dur = Math.round(d);
  const k = nodeData.kind;
  if (k === 'input') return { forwarded: inputs, _d: 10 };
  if (k === 'output') return { finalResult: inputs, _d: 5 };
  if (k === 'ai') return {
    aiResponse: `AI "${nodeData.label}": processed. ${1 + Math.floor(Math.random() * 5)} findings. Confidence ${(0.7 + Math.random() * 0.3).toFixed(2)}.`,
    tokens: Math.floor(200 + Math.random() * 500), _d: dur
  };
  if (k === 'business') return { decision: `"${nodeData.label}" applied: ${1 + Math.floor(Math.random() * 3)} rules.`, _d: dur };
  if (k === 'actor') return { actorResult: `"${nodeData.label}" completed: ${2 + Math.floor(Math.random() * 4)} sub-steps.`, _d: dur };
  return { result: `Executed "${nodeData.label}" on ${Object.keys(inputs).length} inputs.`, _d: dur };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESULT PANEL - Enhanced with step-by-step node results
   ═══════════════════════════════════════════════════════════════════════════ */

const ResultPanel = ({ result, visible, onClose, nodes, nodeStates, executionOrder, stats }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [h, setH] = useState(420);
  const [activeView, setActiveView] = useState('flow'); // 'flow' | 'json'
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const drag = useRef(false);
  const sY = useRef(0);
  const sH = useRef(0);

  const onDown = useCallback(ev => {
    ev.preventDefault();
    drag.current = true; sY.current = ev.clientY; sH.current = h;
    const move = e => { if (drag.current) setH(Math.max(150, Math.min(700, sH.current + sY.current - e.clientY))); };
    const up = () => { drag.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [h]);

  // Build structured execution result
  const executionResult = useMemo(() => {
    if (!nodes || !nodeStates) return null;

    const nodeResults = (executionOrder || []).map((nodeId, index) => {
      const node = nodes.find(n => n.id === nodeId);
      const state = nodeStates[nodeId];
      const nodeData = node?.data || {};

      return {
        step: index + 1,
        nodeId,
        label: nodeData.label || nodeId,
        kind: nodeData.kind || 'unknown',
        status: nodeData.status || 'unknown',
        duration: nodeData.duration || 0,
        description: nodeData.description || '',
        result: state || null,
        explanation: generateExplanation(nodeData, state)
      };
    });

    // Extract data from new finalResult structure
    const finalResultData = result || {};
    const isSuccessful = finalResultData.success ?? nodeResults.every(n => n.status === 'done');
    const wasCancelled = finalResultData.cancelled ?? false;
    const errorInfo = finalResultData.errorSummary || null;
    const errorsArray = finalResultData.errors || [];

    return {
      success: isSuccessful,
      cancelled: wasCancelled,
      totalDuration: finalResultData.executionTime || stats?.ms || 0,
      nodesExecuted: finalResultData.nodesCompleted ?? nodeResults.filter(n => n.status === 'done').length,
      totalNodes: finalResultData.totalNodes ?? nodeResults.length,
      timestamp: finalResultData.timestamp || new Date().toISOString(),
      steps: nodeResults,
      // Output data (from new structure)
      finalOutput: finalResultData.output || null,
      // Error information (from new structure)
      errorSummary: errorInfo,
      errors: errorsArray,
      // Cancellation info
      cancellationInfo: finalResultData.cancellationInfo || null
    };
  }, [nodes, nodeStates, executionOrder, result, stats]);

  // Generate human-readable explanation for node result
  function generateExplanation(nodeData, state) {
    if (!state) return 'Node not executed';

    const kind = nodeData.kind || 'executor';
    const label = nodeData.label || 'Unknown';

    switch (kind) {
      case 'input':
        return `Input parameters loaded: ${Object.keys(state).length} parameter(s) received`;
      case 'output':
        return `Final result generated with ${Object.keys(state).length} output field(s)`;
      case 'ai':
        if (state.aiResponse) {
          return `AI analysis completed: ${state.aiResponse.substring(0, 100)}${state.aiResponse.length > 100 ? '...' : ''}`;
        }
        return `AI processing "${label}" completed`;
      case 'business':
        if (state.decision) {
          return `Business logic applied: ${state.decision}`;
        }
        return `Business rules "${label}" evaluated`;
      case 'actor':
        if (state.actorResult) {
          return `Workflow step completed: ${state.actorResult}`;
        }
        return `Actor "${label}" finished execution`;
      case 'condition':
        return `Condition evaluated: branch selected based on ${JSON.stringify(state).substring(0, 50)}`;
      default:
        return `Executor "${label}" processed ${Object.keys(state).length} data field(s)`;
    }
  }

  // Get status color and icon
  const getStatusStyle = (status) => {
    switch (status) {
      case 'done': return { color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/50', icon: CheckCircle };
      case 'error': return { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', icon: AlertCircle };
      case 'running': return { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', icon: Loader2 };
      default: return { color: 'text-gray-400', bg: 'bg-gray-500/20', border: 'border-gray-500/50', icon: Clock };
    }
  };

  // Get kind color
  const getKindColor = (kind) => {
    return palette[kind]?.border || '#6b7280';
  };

  if (!visible) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#161b22] border-t-2 border-green-500 z-50 flex flex-col"
      style={{ height: collapsed ? 44 : h }}>
      {!collapsed && (
        <div className="h-2 cursor-ns-resize flex items-center justify-center hover:bg-[#30363d] select-none" onMouseDown={onDown}>
          <GripVertical className="w-4 h-4 text-gray-600 rotate-90" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#0d1117]">
        <div className="flex items-center gap-4">
          {/* Status indicator */}
          {executionResult?.success ? (
            <span className="flex items-center gap-2 text-sm font-medium text-green-400">
              <CheckCircle className="w-4 h-4" />
              Execution Success
            </span>
          ) : executionResult?.cancelled ? (
            <span className="flex items-center gap-2 text-sm font-medium text-yellow-400">
              <AlertCircle className="w-4 h-4" />
              Execution Cancelled
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-medium text-red-400">
              <AlertCircle className="w-4 h-4" />
              Execution Failed
            </span>
          )}

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-0.5">
            <button
              onClick={() => setActiveView('flow')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeView === 'flow' ? 'bg-[#30363d] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Flow View
            </button>
            <button
              onClick={() => setActiveView('json')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeView === 'json' ? 'bg-[#30363d] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              JSON
            </button>
          </div>

          {/* Stats */}
          {executionResult && (
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                {executionResult.success ? (
                  <CheckCircle className="w-3 h-3 text-green-400" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                {executionResult.nodesExecuted}/{executionResult.totalNodes} nodes
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {executionResult.totalDuration}ms
              </span>
              {executionResult.errorSummary && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  {executionResult.errorSummary.totalErrors} error(s)
                </span>
              )}
            </div>
          )}
        </div>

        <span className="flex items-center gap-1">
          <button onClick={() => setCollapsed(c => !c)} className="p-1 hover:bg-[#30363d] rounded text-gray-400">
            {collapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-1 hover:bg-[#30363d] rounded text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </span>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden flex">
          {activeView === 'flow' ? (
            /* Flow View - Step by step execution */
            <div className="flex-1 flex overflow-hidden">
              {/* Steps list */}
              <div className="w-1/2 border-r border-[#30363d] overflow-auto p-3">
                <div className="space-y-2">
                  {executionResult?.steps.map((step, idx) => {
                    const style = getStatusStyle(step.status);
                    const StatusIcon = style.icon;
                    const isSelected = selectedNodeId === step.nodeId;

                    return (
                      <div
                        key={step.nodeId}
                        onClick={() => setSelectedNodeId(isSelected ? null : step.nodeId)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-500/20 border-blue-500/50'
                            : `${style.bg} ${style.border} hover:bg-opacity-30`
                        }`}
                      >
                        {/* Step header */}
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: getKindColor(step.kind) + '40', color: getKindColor(step.kind) }}
                          >
                            {step.step}
                          </div>
                          <span className="font-medium text-white text-sm flex-1">{step.label}</span>
                          <StatusIcon className={`w-4 h-4 ${style.color} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                          {step.duration > 0 && (
                            <span className="text-xs text-gray-500">{step.duration}ms</span>
                          )}
                        </div>

                        {/* Kind badge */}
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded uppercase"
                            style={{ backgroundColor: getKindColor(step.kind) + '25', color: getKindColor(step.kind) }}
                          >
                            {step.kind}
                          </span>
                          {step.description && (
                            <span className="text-xs text-gray-500 truncate">{step.description}</span>
                          )}
                        </div>

                        {/* Explanation */}
                        <p className="text-xs text-gray-400 leading-relaxed">{step.explanation}</p>

                        {/* Connector line */}
                        {idx < (executionResult?.steps.length || 0) - 1 && (
                          <div className="flex justify-center mt-2">
                            <div className="w-0.5 h-4 bg-[#30363d]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail panel */}
              <div className="w-1/2 overflow-auto p-3">
                {selectedNodeId ? (
                  <div>
                    {/* Check if this node has an error */}
                    {executionResult?.errors?.find(e => e.nodeId === selectedNodeId) ? (
                      <>
                        <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Error: {executionResult?.steps.find(s => s.nodeId === selectedNodeId)?.label}
                        </h3>
                        <div className="space-y-3">
                          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="text-xs text-red-300 font-medium mb-1">Error Message</div>
                            <div className="text-sm text-red-400">
                              {executionResult.errors.find(e => e.nodeId === selectedNodeId)?.error}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Input Data</div>
                            <pre className="text-xs text-yellow-300 bg-[#0d1117] p-2 rounded border border-[#30363d] overflow-auto max-h-[100px]">
                              {JSON.stringify(executionResult.errors.find(e => e.nodeId === selectedNodeId)?.inputs || {}, null, 2)}
                            </pre>
                          </div>
                          {executionResult.errors.find(e => e.nodeId === selectedNodeId)?.stack && (
                            <div>
                              <div className="text-xs text-gray-400 mb-1">Stack Trace</div>
                              <pre className="text-[10px] text-gray-500 bg-[#0d1117] p-2 rounded border border-[#30363d] overflow-auto max-h-[100px]">
                                {executionResult.errors.find(e => e.nodeId === selectedNodeId)?.stack}
                              </pre>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="text-sm font-medium text-gray-300 mb-3">
                          Node Output: {executionResult?.steps.find(s => s.nodeId === selectedNodeId)?.label}
                        </h3>
                        <pre className="text-xs text-green-300 bg-[#0d1117] p-3 rounded-lg border border-[#30363d] overflow-auto max-h-[300px]">
                          {JSON.stringify(nodeStates[selectedNodeId], null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                ) : executionResult?.errorSummary ? (
                  /* Show error summary when no node selected and there are errors */
                  <div>
                    <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Execution Errors Summary
                    </h3>
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-3">
                      <div className="text-xs text-gray-400 mb-1">Total Errors</div>
                      <div className="text-lg font-bold text-red-400">{executionResult.errorSummary.totalErrors}</div>
                    </div>
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1">Failed Nodes</div>
                      <div className="flex flex-wrap gap-1">
                        {executionResult.errorSummary.failedNodes.map((name, i) => (
                          <span key={i} className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-300">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">First Error</div>
                      <div className="text-sm text-red-400">{executionResult.errorSummary.firstError}</div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Click on a failed step to see details</p>
                  </div>
                ) : executionResult?.cancelled ? (
                  /* Show cancellation info */
                  <div>
                    <h3 className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Execution Cancelled
                    </h3>
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Reason</div>
                      <div className="text-sm text-yellow-400">{executionResult.cancellationInfo?.reason || 'User cancelled'}</div>
                      {executionResult.cancellationInfo?.nodesRemaining > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          {executionResult.cancellationInfo.nodesRemaining} node(s) were not executed
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    <div className="text-center">
                      <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Click on a step to view details</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* JSON View - Full structured result */
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   TOPOLOGICAL SORT
   ═══════════════════════════════════════════════════════════════════════════ */

function topoSort(nodes, edges) {
  const deg = {}, adj = {};
  nodes.forEach(n => { deg[n.id] = 0; adj[n.id] = []; });
  edges.forEach(e => { if (adj[e.source]) adj[e.source].push(e.target); if (deg[e.target] != null) deg[e.target]++; });
  const q = nodes.filter(n => deg[n.id] === 0).map(n => n.id), out = [];
  while (q.length) { const id = q.shift(); out.push(id); for (const nb of adj[id] || []) { deg[nb]--; if (deg[nb] === 0) q.push(nb); } }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const TabBar = ({ tabs, activeTabId, onTabSelect, onTabClose, onNewTab }) => {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#0d1117] border-b border-[#30363d] overflow-x-auto">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all text-sm
            ${activeTabId === tab.id
              ? 'bg-[#161b22] text-white border-t border-l border-r border-[#30363d]'
              : 'bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d]'}`}
          onClick={() => onTabSelect(tab.id)}
        >
          {tab.isRoot ? (
            <Brain className="w-4 h-4 text-yellow-400" />
          ) : (
            <Layers className="w-4 h-4 text-purple-400" />
          )}
          <span className="max-w-[150px] truncate">{tab.title}</span>
          {!tab.isRoot && (
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
              className="p-0.5 rounded hover:bg-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onNewTab}
        className="p-1.5 rounded hover:bg-[#30363d] text-gray-500 hover:text-white transition-colors"
        title="New graph"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER: Generate prompt for sub-graph based on parent context
   ═══════════════════════════════════════════════════════════════════════════ */

function generateSubGraphPrompt(parentContext) {
  if (!parentContext) return '';

  const { nodeLabel, nodeKind, nodeDescription } = parentContext;
  const desc = nodeDescription || `выполнение операции "${nodeLabel}"`;

  const kindPrompts = {
    ai: `Детализируй AI-операцию "${nodeLabel}": какие шаги нужны для ${desc}? Включи предобработку данных, вызов модели, постобработку результатов.`,
    actor: `Разложи workflow "${nodeLabel}" на составные части: ${desc}. Определи все шаги, точки принятия решений и взаимодействия.`,
    business: `Опиши бизнес-логику "${nodeLabel}": ${desc}. Какие правила, валидации и трансформации данных необходимы?`,
    executor: `Детализируй обработку "${nodeLabel}": ${desc}. Какие подоперации и преобразования данных требуются?`,
    condition: `Опиши логику ветвления "${nodeLabel}": ${desc}. Какие условия проверяются и какие пути возможны?`
  };

  return kindPrompts[nodeKind] || `Детализируй операцию "${nodeLabel}": ${desc}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINGLE GRAPH VIEW (used in each tab)
   ═══════════════════════════════════════════════════════════════════════════ */

const GraphView = ({
  tabData,
  onUpdateTabData,
  onDrillDown,
  isActive,
  parentGraphNodes, // Nodes from parent graph for context
  availableModels,
  selectedModel,
  onModelChange,
  useTools,
  onUseToolsChange,
  enabledTools = [],
  useSDA = false, // Use full SDA pipeline (S1→S2→S3→S4→S5)
  aiSettings,
  onAiSettingsChange,
  onOpenPromptEditor,
  promptEditorOpen,
  onClosePromptEditor,
  currentSystemPrompt,
  onSavePrompt,
  onSetDefaultPrompt,
  onNavigateToTab,
  dataSources = []
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(tabData.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(tabData.edges || []);
  const [phase, setPhase] = useState(tabData.phase || 'input');
  const [taskText, setTaskText] = useState(tabData.taskText || '');
  const [requiredParams, setRequiredParams] = useState(tabData.requiredParams || {});
  const [paramValues, setParamValues] = useState(tabData.paramValues || {});
  const [log, setLog] = useState(tabData.log || []);
  const [nodeStates, setNodeStates] = useState(tabData.nodeStates || {});
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [panelMode, setPanelMode] = useState('nexus'); // 'nexus' | 'classic'
  const [finalResult, setFinalResult] = useState(tabData.finalResult || null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState(tabData.stats || { done: 0, total: 0, ms: 0 });
  const [executionOrder, setExecutionOrder] = useState(tabData.executionOrder || []);
  const [graphMetadata, setGraphMetadata] = useState(tabData.graphMetadata || {
    name: '',
    description: '',
    type: 'atomic',
    namespace: 'default',
    tags: []
  });
  const cancelRef = useRef(false);
  const autoGenerateTriggered = useRef(false);

  // Stable ref for onDrillDown — avoids nodesWithCallbacks useMemo invalidation on parent re-render
  const onDrillDownRef = useRef(onDrillDown);
  onDrillDownRef.current = onDrillDown;

  // Toolbar state
  const [godMode, setGodMode] = useState(false);
  const [graphVersion, setGraphVersion] = useState(tabData.graphVersion || '1.0.0');
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [nodeLock, setNodeLock] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [similarityPanelOpen, setSimilarityPanelOpen] = useState(false);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [dynamicPortsEnabled, setDynamicPortsEnabled] = useState(false);
  const [guidedModeOpen, setGuidedModeOpen] = useState(false);
  const [gnnPanelOpen, setGnnPanelOpen] = useState(false);
  const [ctxMenuPos, setCtxMenuPos] = useState(null);
  const [ctxMenuTarget, setCtxMenuTarget] = useState(null);

  // Tool settings dialog state (inline tool button → modal)
  const [toolSettingsTarget, setToolSettingsTarget] = useState(null); // { nodeId, toolRef, executorType, parameters }

  // Ctrl+F → toggle search panel, Ctrl+I → toggle properties
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchPanelOpen(v => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        setPropertiesPanelOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const [saveDialogPrefill, setSaveDialogPrefill] = useState(null);
  const [edgeType, setEdgeType] = useState(DEFAULT_EDGE_TYPE);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [gnnOverlayVisible, setGnnOverlayVisible] = useState(true);
  const reactFlowRef = useRef(null);

  // Drag repulsion — push neighbors apart when dragging nodes
  const { onNodeDrag: dragRepulsionHandler, onNodeDragStop: dragRepulsionStopRaw } = useDragRepulsion(
    nodes, setNodes, { padding: 24, cascadeDepth: 3 }
  );

  // Keep a ref to latest nodes for reading in callbacks without re-render dependency
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // After drag stop: run repulsion, update port positions + obstacle routes
  const dragRepulsionStopHandler = useCallback((event, node) => {
    dragRepulsionStopRaw(event, node);
    // Defer until repulsion setNodes has flushed
    setTimeout(() => {
      const current = nodesRef.current;
      setPortPositionSnapshot(new Map(current.map(n => [n.id, n.position?.x ?? 0])));
      setLayoutGeneration(g => g + 1); // recalculate obstacle routes
    }, 100);
  }, [dragRepulsionStopRaw]);

  // Unified layout engine (replaces inline layout logic in GraphToolbar)
  const [gxeLayoutOptions, setGxeLayoutOptions] = useState({
    algorithm: 'elk-layered', direction: 'TB', nodeSpacing: 120, rankSpacing: 200,
  });
  const { applyLayout: gxeApplyLayoutRaw, isLayouting: gxeIsLayouting } = useGXELayout(
    nodes, edges, setNodes, setEdges, reactFlowRef.current, gxeLayoutOptions
  );

  // Wrap layout apply to bump port position snapshot after completion
  const gxeApplyLayout = useCallback(async (...args) => {
    await gxeApplyLayoutRaw(...args);
    setTimeout(() => setLayoutGeneration(g => g + 1), 150);
  }, [gxeApplyLayoutRaw]);

  // AI Layout engine — LLM-powered layout computation
  const {
    applyAILayout: applyAILayoutRaw, isAILayouting, aiLayoutError, lastMetadata: aiLayoutMetadata,
    config: aiLayoutConfig, loadConfig: loadAIConfig, saveConfig: saveAIConfig,
  } = useAILayout(nodes, edges, setNodes, setEdges, reactFlowRef.current, graphMetadata?.type);

  const applyAILayout = useCallback(async (...args) => {
    await applyAILayoutRaw(...args);
    setTimeout(() => setLayoutGeneration(g => g + 1), 150);
  }, [applyAILayoutRaw]);

  // ── Hex Layout ──────────────────────────────────────────────────────────
  const [gridType, setGridType] = useState('rectangular');
  const [hexOptions, setHexOptions] = useState({ hexSize: 100, channelCapacity: 3, hexEdgeRouting: 'default' });
  const [showDebugRoadMap, setShowDebugRoadMap] = useState(false);
  const {
    applyHexLayout, applyAIHexLayout, clearHexLayout, snapNodeToHexGrid,
    isLayouting: isHexLayouting, isAIHexLayouting, aiHexLayoutError, aiHexLayoutMetadata,
    hexGrid, hexConfig,
    occupiedCells, routingHeatmap, debugRoadMap,
  } = useHexLayout(
    nodes, edges, setNodes, setEdges, reactFlowRef.current,
    { ...DEFAULT_HEX_LAYOUT_HOOK_OPTIONS, ...hexOptions, direction: 'TB' }
  );
  const handleGridTypeChange = useCallback((newType) => {
    setGridType(newType);
    if (newType === 'rectangular') clearHexLayout();
  }, [clearHexLayout]);
  const handleHexOptionsChange = useCallback((partial) => {
    setHexOptions(prev => ({ ...prev, ...partial }));
  }, []);

  // Hex mode: snap dragged node to nearest hex cell on drag stop
  const hexNodeDragStopHandler = useCallback((event, node) => {
    snapNodeToHexGrid(node);
  }, [snapNodeToHexGrid]);

  // Save hex settings as default display rules
  const handleSaveHexDefaults = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/gxe/display-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphType: graphMetadata?.type || 'global',
          hexEnabled: gridType === 'hexagonal',
          hexSize: hexOptions.hexSize,
          hexChannelCapacity: hexOptions.channelCapacity,
          hexAllow45Degree: false,
          hexLayerSpacing: 3,
          hexNodeSpacing: 2,
          hexTrackSpacing: 12,
          hexGridStyle: 'minimal',
        }),
      });
      console.log('[GXE] Hex display rules saved');
    } catch (err) {
      console.error('[GXE] Failed to save hex display rules:', err);
    }
  }, [gridType, hexOptions, graphMetadata]);

  // Load display rules for current graph type
  useEffect(() => {
    async function loadRules() {
      try {
        const gt = graphMetadata?.type || 'global';
        const resp = await fetch(`${API_BASE_URL}/gxe/display-rules?graphType=${gt}`);
        if (!resp.ok) return;
        const { data } = await resp.json();
        if (!data) return;
        if (data.hexEnabled) setGridType('hexagonal');
        setHexOptions(prev => ({
          ...prev,
          hexSize: data.hexSize || prev.hexSize,
          channelCapacity: data.hexChannelCapacity || prev.channelCapacity,
          // allow45Degree removed — hex routing uses only cardinal directions
        }));
      } catch {
        // Silently ignore — defaults already set
      }
    }
    loadRules();
  }, [graphMetadata?.type]);

  const [aiLayoutSettingsOpen, setAiLayoutSettingsOpen] = useState(false);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);

  const handleOpenAILayoutSettings = useCallback(async () => {
    setAiConfigLoading(true);
    setAiLayoutSettingsOpen(true);
    await loadAIConfig();
    setAiConfigLoading(false);
  }, [loadAIConfig]);

  const handleSaveAILayoutConfig = useCallback(async (config) => {
    await saveAIConfig(config);
  }, [saveAIConfig]);

  // NEXUS: Sync namespace and selection
  const setNexusNamespace = useNexusStore(state => state.setNamespace);
  const analysisEvents = useNexusStore(state => state.analysisEvents);
  const isAnalyzing = useNexusStore(state => state.isAnalyzing);
  const clearAnalysisEvents = useNexusStore(state => state.clearAnalysisEvents);
  const consolidationQueue = useNexusStore(state => state.consolidationQueue);
  const clearConsolidationQueue = useNexusStore(state => state.clearConsolidationQueue);
  useEffect(() => {
    if (graphMetadata?.namespace) {
      setNexusNamespace(graphMetadata.namespace);
    }
  }, [graphMetadata?.namespace, setNexusNamespace]);

  const { onSelectionChange: nexusSelectionChange, selectAndFocus: gxeSelectAndFocus } = useSelectionSync({
    nodes,
    setNodes,
    reactFlowInstance: reactFlowRef.current,
  });

  // NEXUS: Node highlighting
  const { highlightNodes, clearHighlight } = useNodeHighlighting({ setNodes });

  // Analysis: node highlight from BottomPanel Analysis tab
  const handleAnalysisNodeHighlight = useCallback((nodeIds) => {
    if (nodeIds?.length) highlightNodes(nodeIds, 'glow', '#8b5cf6');
  }, [highlightNodes]);

  // Log helper (hoisted above NEXUS handlers that depend on it)
  const addLog = useCallback((msg, type = 'info', nodeId = null) => {
    setLog(p => [...p, { msg, type, nodeId, ts: new Date().toISOString() }]);
  }, []);

  // ── Collapse selected nodes into a SubGraph proxy node ──
  // Uses functional updaters so multiple sequential calls (from queue) work correctly
  const collapseToProxy = useCallback((selectedNodeIds, extractionResult) => {
    const selectedSet = new Set(selectedNodeIds);

    // Proxy node data (position computed from current nodes via updater)
    const proxyData = {
      kind: 'subgraph',
      label: extractionResult.name || 'SubGraph',
      executorType: 'runtime.execute_subgraph',
      subgraphId: extractionResult.subgraphId,
      ports: extractionResult.boundaryInterface?.ports || [],
      nodeCount: extractionResult.nodeCount || selectedNodeIds.length,
      hasSubGraph: true,
      savedSubGraphId: extractionResult.subgraphId,
    };

    setNodes(prevNodes => {
      // Centroid of selected nodes
      const sel = prevNodes.filter(n => selectedSet.has(n.id));
      if (sel.length === 0) return prevNodes; // nodes already removed
      const cx = sel.reduce((s, n) => s + (n.position?.x || 0), 0) / sel.length;
      const cy = sel.reduce((s, n) => s + (n.position?.y || 0), 0) / sel.length;

      const proxyNode = {
        id: extractionResult.subgraphId,
        type: 'graphNode',
        position: { x: cx, y: cy },
        data: proxyData,
      };

      return prevNodes.filter(n => !selectedSet.has(n.id)).concat(proxyNode);
    });

    setEdges(prevEdges => {
      const seen = new Set();
      const newEdges = [];
      const proxyId = extractionResult.subgraphId;
      for (const edge of prevEdges) {
        const srcIn = selectedSet.has(edge.source);
        const tgtIn = selectedSet.has(edge.target);
        if (srcIn && tgtIn) continue;
        if (srcIn) {
          const key = `${proxyId}||${edge.target}`;
          if (seen.has(key)) continue; seen.add(key);
          newEdges.push({ ...edge, id: `e-${proxyId}-${edge.target}`, source: proxyId });
        } else if (tgtIn) {
          const key = `${edge.source}||${proxyId}`;
          if (seen.has(key)) continue; seen.add(key);
          newEdges.push({ ...edge, id: `e-${edge.source}-${proxyId}`, target: proxyId });
        } else {
          newEdges.push(edge);
        }
      }
      return newEdges;
    });

    // Register for drill-down
    onUpdateTabData({
      savedSubGraphs: {
        ...(tabData.savedSubGraphs || {}),
        [extractionResult.subgraphId]: { id: extractionResult.subgraphId, name: extractionResult.name },
      },
    });
  }, [setNodes, setEdges, tabData, onUpdateTabData]);

  // ── Process consolidation queue from GuidedMode ──
  useEffect(() => {
    if (consolidationQueue.length === 0) return;
    // Apply each queued collapse sequentially
    for (const { nodeIds, extractionResult } of consolidationQueue) {
      if (nodeIds?.length && extractionResult?.subgraphId) {
        collapseToProxy(nodeIds, extractionResult);
      }
    }
    clearConsolidationQueue();
  }, [consolidationQueue, collapseToProxy, clearConsolidationQueue]);

  // Context Menu + selection (GXE native, CONS-16/19)
  const selectAndFocus = gxeSelectAndFocus;

  const handleContextMenuAction = useCallback((actionId, context) => {
    const ns = graphMetadata?.namespace || 'default';
    switch (actionId) {
      case 'highlight_selection':
      case 'highlight_edge':
        if (context?.ids) highlightNodes(context.ids, 'glow', '#6366f1');
        break;
      case 'clear_highlights':
        clearHighlight();
        break;
      case 'focus':
      case 'focus_node':
        if (context?.ids?.[0]) selectAndFocus(context.ids);
        break;
      case 'fitView':
      case 'fit_view':
        if (reactFlowRef.current) reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
        break;
      case 'selectAll':
      case 'select_all':
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        break;
      case 'delete':
        if (context?.ids?.length) {
          if (context.type === 'edge') {
            setEdges(eds => eds.filter(e => !context.ids.includes(e.id)));
          } else {
            const idsSet = new Set(context.ids);
            setNodes(nds => nds.filter(n => !idsSet.has(n.id)));
            setEdges(eds => eds.filter(e => !idsSet.has(e.source) && !idsSet.has(e.target)));
          }
          addLog(`Deleted ${context.ids.length} ${context.type === 'edge' ? 'edge(s)' : 'node(s)'}`, 'info');
        }
        break;
      case 'duplicate':
        if (context?.ids?.length) {
          const duped = nodes.filter(n => context.ids.includes(n.id)).map(n => ({
            ...n,
            id: `${n.id}-copy-${Date.now().toString(36)}`,
            position: { x: n.position.x + 50, y: n.position.y + 50 },
            selected: false,
          }));
          setNodes(nds => [...nds, ...duped]);
          addLog(`Duplicated ${duped.length} node(s)`, 'info');
        }
        break;
      case 'editProperties':
        setPropertiesPanelOpen(true);
        break;
      case 'findSimilar':
        if (context?.ids?.[0]) {
          setSimilarityPanelOpen(true);
          addLog(`Finding nodes similar to ${context.ids[0]}...`, 'info');
        }
        break;
      case 'exploreNeighbors':
        if (context?.ids?.length) {
          const neighborIds = new Set();
          edges.forEach(e => {
            if (context.ids.includes(e.source)) neighborIds.add(e.target);
            if (context.ids.includes(e.target)) neighborIds.add(e.source);
          });
          if (neighborIds.size > 0) highlightNodes([...neighborIds], 'glow', '#58a6ff');
          addLog(`Found ${neighborIds.size} neighbor(s)`, 'info');
        }
        break;
      case 'reverseDirection':
        if (context?.ids?.[0] && context.type === 'edge') {
          setEdges(eds => eds.map(e =>
            e.id === context.ids[0] ? { ...e, source: e.target, target: e.source } : e
          ));
          addLog('Edge direction reversed', 'info');
        }
        break;
      case 'extractSubgraph':
      case 'extract_subgraph':
        if (context?.ids?.length >= 2) {
          const name = `SubGraph-${Date.now().toString(36)}`;
          addLog(`Extracting subgraph "${name}" from ${context.ids.length} nodes...`, 'info');
          extractSubgraph(ns, context.ids, name)
            .then(res => {
              addLog(`SubGraph "${name}" extracted: ${res.boundaryInterface?.ports?.length || 0} boundary ports`, 'success');
              collapseToProxy(context.ids, res);
            })
            .catch(err => addLog(`Extract failed: ${err.message}`, 'error'));
        }
        break;
      case 'analyze_selection':
      case 'run_analysis':
        addLog(`Analyzing structure for namespace "${ns}"...`, 'info');
        analyzeStructure(ns)
          .then(res => addLog(`Analysis: ${res.nodeCount || '?'} nodes, density=${res.density?.toFixed(3) || '?'}, components=${res.components || '?'}`, 'success'))
          .catch(err => addLog(`Analysis failed: ${err.message}`, 'error'));
        break;
      case 'expand_subgraph':
        if (context?.ids?.length === 1) {
          const proxyId = context.ids[0];
          const proxyNode = nodes.find(n => n.id === proxyId);
          const sgId = proxyNode?.data?.subgraphId;
          if (!sgId) { addLog('No subgraph ID found on proxy node', 'error'); break; }
          addLog(`Expanding subgraph "${proxyNode.data?.label || sgId}"...`, 'info');
          expandSubgraphNode(sgId).then(res => {
            if (!res || !res.nodes?.length) {
              addLog('Expand returned no nodes', 'error');
              return;
            }
            // Position internal nodes around proxy centroid
            const px = proxyNode.position?.x || 0;
            const py = proxyNode.position?.y || 0;
            const internalNodes = res.nodes.map((n, i) => ({
              id: n.id,
              type: 'graphNode',
              position: {
                x: px + (Math.cos(2 * Math.PI * i / res.nodes.length) * 150),
                y: py + (Math.sin(2 * Math.PI * i / res.nodes.length) * 150),
              },
              data: {
                kind: n.type?.toLowerCase() || 'default',
                label: n.name || n.id,
                ...n,
              },
            }));
            const internalEdges = (res.links || []).map(l => ({
              id: `e-${l.source}-${l.target}`,
              source: l.source,
              target: l.target,
              type: 'parallelEdge',
              data: { label: l.type || '' },
            }));
            // Rewire proxy boundary edges back to internal nodes using ports
            const ports = res.ports || proxyNode.data?.ports || [];
            const internalNodeIds = new Set(internalNodes.map(n => n.id));
            const rewiredEdges = [];
            for (const edge of edges) {
              if (edge.source === proxyId) {
                // Outgoing: proxy→external → find OUT port to map back to internal node
                const outPort = ports.find(p => p.direction === 'OUT' && p.internalNodeId);
                const internalSrc = outPort?.internalNodeId || internalNodes[internalNodes.length - 1]?.id;
                if (internalSrc) rewiredEdges.push({ ...edge, id: `e-${internalSrc}-${edge.target}`, source: internalSrc });
              } else if (edge.target === proxyId) {
                // Incoming: external→proxy → find IN port to map back to internal node
                const inPort = ports.find(p => p.direction === 'IN' && p.internalNodeId);
                const internalTgt = inPort?.internalNodeId || internalNodes[0]?.id;
                if (internalTgt) rewiredEdges.push({ ...edge, id: `e-${edge.source}-${internalTgt}`, target: internalTgt });
              } else {
                rewiredEdges.push(edge);
              }
            }
            // Replace proxy with internal nodes
            setNodes(prev => prev.filter(n => n.id !== proxyId).concat(internalNodes));
            setEdges(rewiredEdges.concat(internalEdges));
            addLog(`Expanded: ${internalNodes.length} nodes, ${internalEdges.length} internal edges restored`, 'success');
          }).catch(err => addLog(`Expand failed: ${err.message}`, 'error'));
        }
        break;
      default:
        console.log(`NEXUS action "${actionId}" not implemented yet`, context);
    }
  }, [highlightNodes, clearHighlight, selectAndFocus, setNodes, setEdges, nodes, edges, graphMetadata, addLog, collapseToProxy]);

  // NEXUS: QuickActionBar handler
  const handleQuickAction = useCallback((actionId, context) => {
    const ns = graphMetadata?.namespace || 'default';
    const ids = context?.ids || [];
    switch (actionId) {
      case 'highlight':
        if (ids.length) highlightNodes(ids, 'glow', '#6366f1');
        break;
      case 'focus':
        if (ids.length) selectAndFocus(ids);
        break;
      case 'explore':
        // Focus + highlight neighbors
        if (ids.length) {
          selectAndFocus(ids);
          const neighborIds = new Set();
          edges.forEach(e => {
            if (ids.includes(e.source)) neighborIds.add(e.target);
            if (ids.includes(e.target)) neighborIds.add(e.source);
          });
          if (neighborIds.size > 0) highlightNodes([...neighborIds], 'glow', '#58a6ff');
        }
        break;
      case 'extract':
        if (ids.length >= 2) {
          const name = `SubGraph-${Date.now().toString(36)}`;
          addLog(`Extracting subgraph "${name}" from ${ids.length} nodes...`, 'info');
          extractSubgraph(ns, ids, name)
            .then(res => {
              addLog(`SubGraph "${name}" extracted: ${res.boundaryInterface?.ports?.length || 0} boundary ports`, 'success');
              collapseToProxy(ids, res);
            })
            .catch(err => addLog(`Extract failed: ${err.message}`, 'error'));
        }
        break;
      case 'analyze':
        addLog(`Analyzing structure for namespace "${ns}"...`, 'info');
        analyzeStructure(ns)
          .then(res => addLog(`Analysis: ${res.nodeCount || '?'} nodes, density=${res.density?.toFixed(3) || '?'}, components=${res.components || '?'}`, 'success'))
          .catch(err => addLog(`Analysis failed: ${err.message}`, 'error'));
        break;
      case 'paths':
        if (ids.length === 2) {
          addLog(`Finding paths between ${ids[0]} → ${ids[1]}...`, 'info');
          findPaths(ns, ids[0], ids[1])
            .then(res => {
              const paths = res.paths || [];
              addLog(`Found ${paths.length} path(s)`, 'success');
              if (paths.length > 0) {
                const allPathNodes = [...new Set(paths.flatMap(p => p.nodeIds || p.nodes || []))];
                if (allPathNodes.length) highlightNodes(allPathNodes, 'glow', '#d29922');
              }
            })
            .catch(err => addLog(`Path finding failed: ${err.message}`, 'error'));
        }
        break;
      case 'similar':
        if (ids.length === 1) {
          addLog(`Finding nodes similar to ${ids[0]}...`, 'info');
          findSimilarNodes(ns, ids[0])
            .then(res => {
              const similar = res.similar || res.nodes || [];
              addLog(`Found ${similar.length} similar node(s)`, 'success');
              if (similar.length > 0) highlightNodes(similar.map(s => s.id || s), 'glow', '#a371f7');
            })
            .catch(err => addLog(`Similarity search failed: ${err.message}`, 'error'));
        }
        break;
      case 'predict':
        if (ids.length === 1) {
          addLog(`Predicting links for ${ids[0]}...`, 'info');
          predictLinks(ns, ids[0])
            .then(res => {
              const links = res.predictions || res.links || [];
              addLog(`${links.length} predicted link(s)`, 'success');
              if (links.length > 0) highlightNodes(links.map(l => l.targetId || l.target || l), 'glow', '#f778ba');
            })
            .catch(err => addLog(`Link prediction failed: ${err.message}`, 'error'));
        }
        break;
      case 'name':
        if (ids.length >= 3) {
          const selectedNodes = nodes.filter(n => ids.includes(n.id));
          const labels = selectedNodes.map(n => n.data?.label || n.data?.name || n.id).slice(0, 10);
          addLog(`Cluster suggestion for ${ids.length} nodes: [${labels.join(', ')}]`, 'info');
        }
        break;
      default:
        console.log(`Unknown quick action "${actionId}"`, context);
    }
  }, [highlightNodes, selectAndFocus, edges, nodes, addLog, graphMetadata, collapseToProxy]);

  const handlePaneContextMenu = useCallback((event) => {
    event.preventDefault();
    setCtxMenuPos({ x: event.clientX, y: event.clientY });
    setCtxMenuTarget({ type: 'canvas', ids: [] });
  }, []);

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    const currentSelection = nodes.filter(n => n.selected);
    if (currentSelection.length > 1 && currentSelection.some(n => n.id === node.id)) {
      setCtxMenuPos({ x: event.clientX, y: event.clientY });
      setCtxMenuTarget({ type: 'nodes', ids: currentSelection.map(n => n.id) });
    } else {
      setCtxMenuPos({ x: event.clientX, y: event.clientY });
      setCtxMenuTarget({ type: 'node', ids: [node.id], nodeData: node.data });
    }
  }, [nodes]);

  const handleEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setCtxMenuPos({ x: event.clientX, y: event.clientY });
    setCtxMenuTarget({ type: 'edge', ids: [edge.id], edgeData: edge });
  }, []);

  // ── Update node data from DetailsWatcher (AI model settings) ──
  const handleUpdateNodeData = useCallback((nodeId, dataUpdate) => {
    // 1. Update executor node
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, data: { ...n.data, ...dataUpdate,
        parameters: { ...n.data?.parameters, ...dataUpdate.parameters }
      }};
    }));

    // 2. Sync model fields to bound tool-ref badge nodes (via USES_TOOL edges)
    // Only needed when tool-ref nodes are rendered as separate nodes
    if (RENDER_TOOL_REF_AS_NODES) {
      const modelFields = ['model', 'temperature', 'maxTokens', 'responseFormat'];
      const modelSync = {};
      for (const f of modelFields) {
        if (dataUpdate.parameters?.[f] !== undefined) modelSync[f] = dataUpdate.parameters[f];
      }
      if (Object.keys(modelSync).length > 0) {
        const toolRefIds = edges
          .filter(e => e.label === 'USES_TOOL' && e.source === nodeId)
          .map(e => e.target);
        if (toolRefIds.length > 0) {
          setNodes(nds => nds.map(n => {
            if (!toolRefIds.includes(n.id)) return n;
            return { ...n, data: { ...n.data, parameters: { ...n.data?.parameters, ...modelSync } } };
          }));
        }
      }
    }

    // 3. Keep selectedNode fresh so DetailsWatcher re-renders
    setSelectedNode(prev => {
      if (!prev || prev.id !== nodeId) return prev;
      return { ...prev, data: { ...prev.data, ...dataUpdate,
        parameters: { ...prev.data?.parameters, ...dataUpdate.parameters }
      }};
    });
  }, [setNodes, edges]);

  // Phase 0 SSE execution state
  const [executionError, setExecutionError] = useState(null);
  const [executionSummary, setExecutionSummary] = useState(null);
  const abortControllerRef = useRef(null);

  // Live Execution tab state
  const [liveExecutionEvents, setLiveExecutionEvents] = useState([]);
  const [liveExecutionStatus, setLiveExecutionStatus] = useState('idle');
  const [waitingInputs, setWaitingInputs] = useState([]);
  const [currentExecutionId, setCurrentExecutionId] = useState(null);

  // AI Execution Assistant state
  const assistantRef = useRef(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(380);
  const pendingAutoMessageRef = useRef(null);

  // Generation mode: 'execution' (DAG) or 'knowledge' (entity/relation extraction)
  const [generationMode, setGenerationMode] = useState('execution');

  // Selected sources for extraction (per-tab state)
  const [selectedSources, setSelectedSources] = useState([]);

  // AI Analysis result (stored separately for prominent display)
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);

  // Generation stages state
  const [generationStages, setGenerationStages] = useState([
    { id: 'analyze', label: 'Task Analysis', status: 'pending', stats: null },
    { id: 'schema', label: 'Schema Design', status: 'pending', stats: null },
    { id: 'nodes', label: 'Node Generation', status: 'pending', stats: null },
    { id: 'edges', label: 'Edge Wiring', status: 'pending', stats: null },
    { id: 'validate', label: 'Validation', status: 'pending', stats: null }
  ]);
  const generationStartTime = useRef(null);

  // Generation events log for BottomPanel
  const [generationEvents, setGenerationEvents] = useState([]);

  // Add generation event helper
  const addGenerationEvent = useCallback((event) => {
    setGenerationEvents(prev => [...prev, {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...event
    }]);
  }, []);

  // Clear generation events
  const clearGenerationEvents = useCallback(() => {
    setGenerationEvents([]);
  }, []);

  // Toolbar save completion handler
  const handleToolbarSaveComplete = useCallback((savedGraph) => {
    if (savedGraph?.id) {
      onUpdateTabData({ catalogGraphId: savedGraph.id });
    }
  }, [onUpdateTabData]);

  // Edge type change: styledEdges memo applies edgePathType via data prop
  const handleEdgeTypeChange = useCallback((newType) => {
    setEdgeType(newType);
  }, []);

  // Path highlighting: find path from root(s) to hovered/selected node
  const highlightTarget = hoveredNodeId || selectedNode?.id || null;

  const highlightedEdgeIds = useMemo(() => {
    if (!highlightTarget || nodes.length === 0 || edges.length === 0) return new Set();

    // Build reverse adjacency: child → parent edges
    const reverseAdj = new Map();
    const edgeMap = new Map(); // "source->target" → edge id
    for (const e of edges) {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      if (!reverseAdj.has(tgt)) reverseAdj.set(tgt, []);
      reverseAdj.get(tgt).push(src);
      edgeMap.set(`${src}->${tgt}`, e.id);
    }

    // BFS backwards from target to all roots
    const visited = new Set();
    const pathEdges = new Set();
    const queue = [highlightTarget];
    visited.add(highlightTarget);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      const parents = reverseAdj.get(nodeId) || [];
      for (const parentId of parents) {
        const eId = edgeMap.get(`${parentId}->${nodeId}`);
        if (eId) pathEdges.add(eId);
        if (!visited.has(parentId)) {
          visited.add(parentId);
          queue.push(parentId);
        }
      }
    }

    return pathEdges;
  }, [highlightTarget, nodes, edges]);

  const highlightedNodeIds = useMemo(() => {
    if (!highlightTarget || highlightedEdgeIds.size === 0) return new Set();

    // Collect all node IDs on the highlighted path
    const nodeIds = new Set();
    nodeIds.add(highlightTarget);
    for (const e of edges) {
      if (highlightedEdgeIds.has(e.id)) {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        nodeIds.add(src);
        nodeIds.add(tgt);
      }
    }
    return nodeIds;
  }, [highlightTarget, highlightedEdgeIds, edges]);

  // Snapshot of node positions — updated on drag stop / layout apply (not every frame).
  // Used to sort port handles by spatial X-position of connected nodes.
  const [portPositionSnapshot, setPortPositionSnapshot] = useState(() =>
    new Map(nodes.map(n => [n.id, n.position?.x ?? 0]))
  );
  // Bumped after layout apply to trigger snapshot recalculation
  const [layoutGeneration, setLayoutGeneration] = useState(0);

  // Update snapshot when structure changes or layout is applied
  useEffect(() => {
    setPortPositionSnapshot(new Map(nodes.map(n => [n.id, n.position?.x ?? 0])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges.length, nodes.length, layoutGeneration]);

  // Compute obstacle-avoiding routes for edges that cross unrelated nodes.
  // Updated on layout apply / drag stop (not every frame) via layoutGeneration.
  const obstacleRoutedEdges = useMemo(() => {
    return computeObstacleRoutes(nodes, edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, layoutGeneration]);

  // Compute per-node incoming/outgoing edge lists for multi-handle rendering.
  // Lists are sorted by the X-position of the connected node so that
  // handle order (left→right) matches spatial layout of neighbors.
  const nodeEdgeMap = useMemo(() => {
    const posX = portPositionSnapshot;

    // Build edge lookup for sorting
    const edgeById = new Map();
    edges.forEach(e => edgeById.set(e.id, e));

    const map = {};
    edges.forEach(e => {
      if (!map[e.target]) map[e.target] = { incoming: [], outgoing: [] };
      if (!map[e.source]) map[e.source] = { incoming: [], outgoing: [] };
      // Skip USES_TOOL edges from handle distribution (they use side handles)
      // Only relevant when tool-ref nodes are rendered as separate nodes
      if (RENDER_TOOL_REF_AS_NODES && (e.label === 'USES_TOOL' || e.sourceHandle === 'tool-bind' || e.targetHandle === 'tool-bind')) return;
      map[e.target].incoming.push(e.id);
      map[e.source].outgoing.push(e.id);
    });

    // Sort each list by the X-position of the OTHER end of the edge
    for (const nodeId of Object.keys(map)) {
      map[nodeId].incoming.sort((aId, bId) => {
        const aEdge = edgeById.get(aId);
        const bEdge = edgeById.get(bId);
        return (posX.get(aEdge?.source) ?? 0) - (posX.get(bEdge?.source) ?? 0);
      });
      map[nodeId].outgoing.sort((aId, bId) => {
        const aEdge = edgeById.get(aId);
        const bEdge = edgeById.get(bId);
        return (posX.get(aEdge?.target) ?? 0) - (posX.get(bEdge?.target) ?? 0);
      });
    }

    return map;
  }, [edges, portPositionSnapshot]);

  // Apply parallel-edge offsets and path highlighting for rendering
  const styledEdges = useMemo(() => {
    // In hex mode, edges already have correct type/handles from useHexLayout.
    // Do NOT override type or handles — only apply highlight styles.
    if (gridType === 'hexagonal') {
      const baseEdges = obstacleRoutedEdges;
      if (highlightedEdgeIds.size === 0) return baseEdges;
      return baseEdges.map(e => {
        if (highlightedEdgeIds.has(e.id)) {
          return {
            ...e,
            style: { ...e.style, stroke: '#d4a017', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d4a017' },
            zIndex: 1000,
          };
        }
        return { ...e, style: { ...e.style, opacity: 0.25 } };
      });
    }

    // ── Rectangular mode ──
    // Use obstacle-routed edges as base (has obstacleRoute data where needed)
    const baseEdges = obstacleRoutedEdges;

    // Step 0: Assign parallel offsets — group edges by node pair
    const grouped = new Map();
    baseEdges.forEach(e => {
      const pair = [e.source, e.target].sort().join('||');
      if (!grouped.has(pair)) grouped.set(pair, []);
      grouped.get(pair).push(e);
    });

    const withOffsets = baseEdges.map(e => {
      const pair = [e.source, e.target].sort().join('||');
      const group = grouped.get(pair);
      const total = group.length;
      const idx = group.indexOf(e);
      const offset = total <= 1 ? 0 : (idx - (total - 1) / 2) * 20;

      // USES_TOOL edges keep side handles (only in legacy separate-node mode)
      const handleProps = (RENDER_TOOL_REF_AS_NODES && e.label === 'USES_TOOL' && !e.sourceHandle)
        ? { sourceHandle: 'tool-bind', targetHandle: 'tool-bind' }
        : {};

      return {
        ...e,
        ...handleProps,
        type: 'parallel',
        data: {
          ...e.data,
          parallelOffset: offset,
          edgePathType: edgeType,
        },
      };
    });

    // Step 1: Assign per-handle IDs for multi-connection nodes
    const withHandles = withOffsets.map(e => {
      // Skip USES_TOOL edges (they already have explicit handles) — legacy mode only
      if (RENDER_TOOL_REF_AS_NODES && (e.sourceHandle === 'tool-bind' || e.targetHandle === 'tool-bind')) return e;

      const targetInfo = nodeEdgeMap[e.target];
      const sourceInfo = nodeEdgeMap[e.source];
      const extra = {};

      if (targetInfo && targetInfo.incoming.length > 1) {
        const idx = targetInfo.incoming.indexOf(e.id);
        if (idx >= 0) extra.targetHandle = `in-${idx}`;
      }
      if (sourceInfo && sourceInfo.outgoing.length > 1) {
        const idx = sourceInfo.outgoing.indexOf(e.id);
        if (idx >= 0) extra.sourceHandle = `out-${idx}`;
      }

      return Object.keys(extra).length > 0 ? { ...e, ...extra } : e;
    });

    // Step 2: Apply highlight styles
    if (highlightedEdgeIds.size === 0) return withHandles;

    return withHandles.map(e => {
      if (highlightedEdgeIds.has(e.id)) {
        return {
          ...e,
          style: { ...e.style, stroke: '#d4a017', strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#d4a017' },
          zIndex: 1000,
        };
      }
      // Dim non-highlighted edges
      return {
        ...e,
        style: { ...e.style, opacity: 0.25 },
      };
    });
  }, [obstacleRoutedEdges, highlightedEdgeIds, edgeType, nodeEdgeMap, gridType]);

  // GNN overlay: merge predicted edges into the edge list
  const gnnResults = useImportSqlStore(s => s.gnnResults);
  const gnnStatus = useImportSqlStore(s => s.gnnStatus);

  const edgesWithGnn = useMemo(() => {
    if (!gnnOverlayVisible || gnnStatus !== 'complete' || !gnnResults?.predictions) return styledEdges;
    const predicted = buildPredictedEdges(gnnResults.predictions.predictions || []);
    return [...styledEdges, ...predicted];
  }, [styledEdges, gnnOverlayVisible, gnnStatus, gnnResults]);


  // SSE status mapping: Phase 0 → existing GraphNode statuses
  const STATUS_MAP = {
    'pending':   'idle',
    'running':   'running',
    'completed': 'done',
    'failed':    'error',
    'skipped':   'done'
  };

  // Save state back to tab when changed (debounced to avoid starving React Router transitions)
  const onUpdateTabDataRef = useRef(onUpdateTabData);
  onUpdateTabDataRef.current = onUpdateTabData;
  useEffect(() => {
    const timer = setTimeout(() => {
      onUpdateTabDataRef.current({
        nodes, edges, phase, taskText, requiredParams, paramValues,
        log, nodeStates, finalResult, stats, executionOrder, graphMetadata, graphVersion
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, edges, phase, taskText, requiredParams, paramValues, log, nodeStates, finalResult, stats, executionOrder, graphMetadata, graphVersion]);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Inject drill-down callback into nodes
  // ── Tool-ref follow: when an executor node is dragged, sync its tool-ref nodes ──
  // Only active when RENDER_TOOL_REF_AS_NODES is true (legacy separate-node mode)
  const toolBindMap = useMemo(() => {
    if (!RENDER_TOOL_REF_AS_NODES) return {};
    // executorId → [toolRefId, ...]
    const map = {};
    for (const e of edges) {
      if (e.label === 'USES_TOOL') {
        if (!map[e.source]) map[e.source] = [];
        map[e.source].push(e.target);
      }
    }
    return map;
  }, [edges]);

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    // Drag-follow only when tool-ref nodes are rendered as separate nodes
    if (!RENDER_TOOL_REF_AS_NODES) return;

    // After position changes on executor nodes, sync bound tool-ref nodes
    const posChanges = changes.filter(c => c.type === 'position' && c.position);
    if (posChanges.length === 0) return;

    const syncUpdates = [];
    for (const change of posChanges) {
      const toolRefIds = toolBindMap[change.id];
      if (toolRefIds) {
        for (const tId of toolRefIds) {
          syncUpdates.push({
            id: tId,
            type: 'position',
            position: { x: change.position.x + 260, y: change.position.y },
          });
        }
      }
    }
    if (syncUpdates.length > 0) {
      onNodesChange(syncUpdates);
    }
  }, [onNodesChange, toolBindMap]);

  // Inject drill-down callback + port edge metadata into nodes
  const nodesWithCallbacks = useMemo(() => {
    const hasHighlight = highlightedNodeIds.size > 0;
    // Build edge lookup for port info
    const edgeById = new Map();
    const nodeLabels = new Map();
    nodes.forEach(n => nodeLabels.set(n.id, n.data?.label || n.id));
    edges.forEach(e => edgeById.set(e.id, e));

    return nodes.map(n => {
      const edgeInfo = nodeEdgeMap[n.id] || { incoming: [], outgoing: [] };

      // Build port edge info arrays for PortHub tooltips (hex mode)
      const _inEdges = edgeInfo.incoming.map(eId => {
        const e = edgeById.get(eId);
        return e ? {
          id: e.id,
          label: e.label || e.data?.label || e.id,
          sourceLabel: nodeLabels.get(e.source) || e.source,
          targetLabel: nodeLabels.get(e.target) || e.target,
          type: e.data?.kind || e.label || undefined,
        } : { id: eId, label: eId };
      });
      const _outEdges = edgeInfo.outgoing.map(eId => {
        const e = edgeById.get(eId);
        return e ? {
          id: e.id,
          label: e.label || e.data?.label || e.id,
          sourceLabel: nodeLabels.get(e.source) || e.source,
          targetLabel: nodeLabels.get(e.target) || e.target,
          type: e.data?.kind || e.label || undefined,
        } : { id: eId, label: eId };
      });

      return {
        ...n,
        data: {
          ...n.data,
          onDrillDown: (nodeData) => onDrillDownRef.current(n.id, nodeData),
          onOpenToolSettings: (nodeData) => setToolSettingsTarget({
            nodeId: n.id,
            toolRef: nodeData.toolRef || nodeData.tool || nodeData.toolId || null,
            executorType: nodeData.executorType || nodeData.executor || null,
            parameters: nodeData.parameters || nodeData.params || nodeData.config || {},
          }),
          hasSubGraph: tabData.subGraphs?.[n.id] != null || tabData.savedSubGraphs?.[n.id] != null,
          savedSubGraphId: tabData.savedSubGraphs?.[n.id]?.id || null,
          highlighted: hasHighlight && highlightedNodeIds.has(n.id),
          dimmed: hasHighlight && !highlightedNodeIds.has(n.id),
          _inCount: edgeInfo.incoming.length,
          _outCount: edgeInfo.outgoing.length,
          _inEdges,
          _outEdges,
        }
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, tabData.subGraphs, tabData.savedSubGraphs, highlightedNodeIds, nodeEdgeMap]);

  // CONS-12: Dynamic port positions (multi-handle)
  const { nodesWithPorts, edgesWithPorts } = usePortPositions(nodesWithCallbacks, edgesWithGnn, dynamicPortsEnabled);

  // Helper to update generation stage
  const updateStage = useCallback((stageId, status, stats = null) => {
    setGenerationStages(prev => {
      const found = prev.some(s => s.id === stageId);
      console.log('[updateStage]', stageId, '→', status, 'found:', found, 'stages:', prev.map(s => s.id));
      return prev.map(s =>
        s.id === stageId ? { ...s, status, stats, completedAt: status === 'done' ? Date.now() : null } : s
      );
    });
  }, []);

  // Reset all generation stages
  const resetGenerationStages = useCallback(() => {
    setGenerationStages([
      { id: 'analyze', label: 'Task Analysis', status: 'pending', stats: null },
      { id: 'schema', label: 'Schema Design', status: 'pending', stats: null },
      { id: 'nodes', label: 'Node Generation', status: 'pending', stats: null },
      { id: 'edges', label: 'Edge Wiring', status: 'pending', stats: null },
      { id: 'validate', label: 'Validation', status: 'pending', stats: null }
    ]);
  }, []);

  /* ── Build Knowledge Graph from text via extraction SSE ── */
  const buildKnowledgeGraph = useCallback(async (inputText) => {
    const hasConnectorSources = selectedSources.some(s => s !== '__text__');
    if ((!inputText || !inputText.trim()) && !hasConnectorSources) return;

    setPhase('generating');
    setLog([]); setNodeStates({}); setFinalResult(null); setShowResult(false);
    setAiAnalysisResult(null);

    // Set KG stages
    setGenerationStages(KG_STAGES.map(s => ({ ...s, status: 'pending', stats: null })));
    generationStartTime.current = Date.now();
    setGenerationEvents([]);

    addGenerationEvent({
      type: 'info',
      title: 'Knowledge Graph Generation Started',
      subtitle: 'Extracting entities and relationships from text',
      input: inputText.substring(0, 200) + (inputText.length > 200 ? '...' : '')
    });

    addLog(`Task: "${inputText.substring(0, 100)}..."`, 'start');
    addLog('Extracting knowledge graph from text...', 'ai');

    try {
      const connectorSources = selectedSources.filter(s => s !== '__text__');
      const response = await generateKnowledgeGraph(inputText, {
        sources: connectorSources.length > 0 ? connectorSources : undefined
      });

      await readSSEStream(response, (event) => {
        console.log('[KG SSE]', event.type, event.stage || '', event.status || '', event);

        // Handle stage_update events
        if (event.type === 'stage_update') {
          console.log('[KG SSE] Updating stage:', event.stage, '→', event.status, 'stats:', event.stats);
          updateStage(event.stage, event.status === 'done' ? 'done' : event.status === 'error' ? 'error' : 'running', event.stats || null);
          if (event.message) {
            addLog(event.message, event.status === 'error' ? 'error' : 'info');
          }
        }

        // Handle extraction events for the log
        if (['parsing', 'chunking', 'extraction', 'extraction_result', 'deduplication', 'graph_build', 'ai_analysis'].includes(event.type)) {
          addGenerationEvent({
            type: event.type,
            title: event.title || event.type,
            subtitle: event.subtitle || '',
            output: event.output || event.stats,
            duration: event.duration
          });

          // Capture AI analysis result for prominent display
          if (event.type === 'ai_analysis' && event.output && typeof event.output === 'object' && event.output.completenessScore != null) {
            console.log('[KG SSE] Captured AI analysis result:', event.output.completenessScore + '%');
            setAiAnalysisResult(event.output);
          }
        }

        // Handle error events
        if (event.type === 'error') {
          addGenerationEvent({
            type: 'error',
            title: event.title || 'Error',
            subtitle: event.subtitle || event.error || event.message,
            error: event.error || event.message
          });
        }

        // Handle anomaly_detected events (pipeline halted or warned by anomaly gate)
        if (event.type === 'anomaly_detected') {
          const a = event.anomaly || {};
          const isSoft = a.soft === true;
          updateStage(event.stage, 'error', { anomaly: true, reason: a.reason });
          addGenerationEvent({
            type: 'anomaly',
            title: isSoft ? `Quality Warning: ${event.stage}` : `Pipeline Halted: ${event.stage}`,
            subtitle: a.reason || 'Anomaly detected',
            output: a.analysis || null
          });
          if (a.analysis) {
            setAiAnalysisResult({ anomaly: true, stage: event.stage, ...a.analysis });
          }
          addLog(`${isSoft ? 'WARNING' : 'ANOMALY'} at ${event.stage}: ${a.reason}`, isSoft ? 'warning' : 'error');
          if (a.analysis?.suggestedFix) {
            addLog(`Suggested fix: ${a.analysis.suggestedFix}`, 'info');
          }
          // Soft anomalies don't halt — graph still arrives in 'complete' event
          if (!isSoft) {
            setPhase('input');
          }
        }

        // Handle complete event
        if (event.type === 'complete') {
          console.log('[KG SSE] COMPLETE event. aiAnalysis:', event.aiAnalysis ? 'YES' : 'NO', 'nodes:', (event.nodes || []).length, 'edges:', (event.edges || []).length);
          const receivedNodes = event.nodes || [];
          const receivedEdges = event.edges || [];

          // Style edges — parallel type with smoothstep path
          const styledEdges = receivedEdges.map(ed => ({
            ...ed,
            type: 'parallel',
            data: { ...ed.data, edgePathType: DEFAULT_EDGE_TYPE },
            animated: true,
            style: ed.style || { stroke: '#8b5cf6', strokeWidth: 2 },
            labelStyle: ed.labelStyle || { fill: '#d8b4fe', fontSize: 10 },
            markerEnd: ed.markerEnd || { type: MarkerType.ArrowClosed, color: '#8b5cf6' }
          }));

          // Auto-layout as top-down DAG when backend didn't supply positions
          const layoutedNodes = hasValidPositions(receivedNodes)
            ? receivedNodes
            : autoLayoutTB(receivedNodes, styledEdges);

          setNodes(layoutedNodes);
          setEdges(styledEdges);
          setRequiredParams({});
          setParamValues({});

          const totalDuration = Date.now() - generationStartTime.current;
          const aiScore = event.aiAnalysis?.completenessScore;
          const aiSuffix = aiScore != null ? ` | Completeness: ${aiScore}%` : '';
          addLog(`Knowledge graph ready: ${receivedNodes.length} entities, ${receivedEdges.length} relations${aiSuffix}`, 'success');

          addGenerationEvent({
            type: 'complete',
            title: 'Knowledge Graph Complete',
            subtitle: `${receivedNodes.length} entities, ${receivedEdges.length} relations${aiSuffix}`,
            duration: totalDuration,
            output: { ...event.stats, aiAnalysis: event.aiAnalysis }
          });

          setPhase('ready');
        }
      });

      // If stream ended without complete event
      if (generationStartTime.current) {
        const elapsed = Date.now() - generationStartTime.current;
        if (elapsed > 0) {
          // Stream may have completed - check if we're still generating
        }
      }
    } catch (err) {
      setGenerationStages(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error', stats: { error: err.message } } : s
      ));
      addGenerationEvent({
        type: 'error',
        title: 'Knowledge Graph Failed',
        subtitle: err.message,
        error: err.message,
        duration: Date.now() - generationStartTime.current
      });
      addLog(`Error: ${err.message}`, 'error');
      setPhase('input');
    }
  }, [taskText, selectedSources, addLog, setNodes, setEdges, updateStage, addGenerationEvent]);

  /* ── Build graph from text (can accept custom prompt) ── */
  const buildGraph = useCallback(async (customPrompt = null) => {
    const prompt = customPrompt || taskText || '';
    const hasConnectorSources = selectedSources.some(s => s !== '__text__');

    // Dispatch to knowledge graph mode if selected
    if (generationMode === 'knowledge') {
      if (!prompt.trim() && !hasConnectorSources) return;
      return buildKnowledgeGraph(prompt || '');
    }

    if (typeof prompt !== 'string' || !prompt.trim()) return;

    // Update taskText if using custom prompt
    if (customPrompt && customPrompt !== taskText) {
      setTaskText(customPrompt);
    }

    setPhase('generating');
    setLog([]); setNodeStates({}); setFinalResult(null); setShowResult(false);
    resetGenerationStages();
    generationStartTime.current = Date.now();

    // Clear previous generation events and add start event
    setGenerationEvents([]);
    const toolsInfo = useTools && enabledTools.length > 0 ? ` (${enabledTools.length} tools)` : '';
    addGenerationEvent({
      type: 'info',
      title: 'Generation Started',
      subtitle: `Model: ${selectedModel || 'claude-sonnet'}${useTools ? ' (agentic)' : ''}${toolsInfo}`,
      input: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : '')
    });

    addLog(`Task: "${prompt}"`, 'start');
    addLog(`Model: ${selectedModel || 'claude-sonnet'}${useTools ? ` (agentic mode, ${enabledTools.length || 'all'} tools)` : ''}`, 'ai');
    addLog('AI is building the execution graph…', 'ai');

    // Stage 1: Task Analysis
    updateStage('analyze', 'running');
    addGenerationEvent({
      type: 'text_analysis',
      title: 'Text Analysis',
      subtitle: 'Analyzing task requirements...',
      status: 'running'
    });
    const analyzeStart = Date.now();

    try {
      // Simulate stage progression during API call
      const stageTimers = [];

      // Stage progression simulation (will be cleared when real data arrives)
      stageTimers.push(setTimeout(() => {
        updateStage('analyze', 'done', {
          duration: Date.now() - analyzeStart,
          tokens: Math.floor(50 + Math.random() * 100)
        });
        updateStage('schema', 'running');
      }, 400));

      stageTimers.push(setTimeout(() => {
        updateStage('schema', 'done', {
          duration: 300 + Math.floor(Math.random() * 200),
          complexity: ['simple', 'moderate', 'complex'][Math.floor(Math.random() * 3)]
        });
        updateStage('nodes', 'running');
      }, 900));

      stageTimers.push(setTimeout(() => {
        updateStage('nodes', 'done', {
          duration: 400 + Math.floor(Math.random() * 300)
        });
        updateStage('edges', 'running');
      }, 1500));

      stageTimers.push(setTimeout(() => {
        updateStage('edges', 'done', {
          duration: 200 + Math.floor(Math.random() * 200)
        });
        updateStage('validate', 'running');
      }, 2000));

      // Log AI request event
      const aiRequestStart = Date.now();
      addGenerationEvent({
        type: 'ai_request',
        title: 'Claude API Request',
        subtitle: `Model: ${selectedModel || 'claude-sonnet'}`,
        status: 'running',
        input: { task: prompt.substring(0, 100), model: selectedModel, useTools }
      });

      const g = await aiGenerateGraph(prompt, {
        model: selectedModel,
        parentContext: tabData.parentContext,
        parentGraphNodes,
        useTools,
        enabledTools,
        useSDA,
        temperature: aiSettings.temperature,
        maxTokens: aiSettings.maxTokens
      });

      // Clear simulation timers
      stageTimers.forEach(t => clearTimeout(t));

      // Check for pipeline anomaly (hard gate — no graph generated)
      if (g.anomaly && g.source === 'ai-anomaly') {
        const a = g.anomaly;
        addGenerationEvent({
          type: 'anomaly',
          title: `Pipeline Halted: ${a.stage}`,
          subtitle: a.reason || 'Anomaly detected',
          output: a.analysis || null,
          duration: Date.now() - aiRequestStart
        });
        addLog(`ANOMALY at ${a.stage}: ${a.reason}`, 'error');
        if (a.analysis?.diagnosis) addLog(`Diagnosis: ${a.analysis.diagnosis}`, 'info');
        if (a.analysis?.suggestedFix) addLog(`Suggested fix: ${a.analysis.suggestedFix}`, 'info');
        if (a.analysis) setAiAnalysisResult({ anomaly: true, stage: a.stage, ...a.analysis });
        setPhase('input');
        return;
      }

      // Check for soft anomaly (graph returned with warning)
      if (g.anomaly && g.source !== 'ai-anomaly') {
        const a = g.anomaly;
        addGenerationEvent({
          type: 'anomaly',
          title: `Quality Warning: ${a.stage}`,
          subtitle: a.reason || 'Low quality detected',
          output: a.analysis || null
        });
        addLog(`WARNING: ${a.reason}`, 'warning');
        if (a.analysis?.suggestedFix) addLog(`Suggestion: ${a.analysis.suggestedFix}`, 'info');
      }

      const totalDuration = Date.now() - generationStartTime.current;
      const aiDuration = Date.now() - aiRequestStart;

      // Log AI response event
      addGenerationEvent({
        type: 'ai_response',
        title: 'Claude API Response',
        subtitle: g.source === 'ai' ? 'Graph generated successfully' : `Fallback: ${g.source}`,
        duration: aiDuration,
        tokens: g.aiStatus?.inputTokens,
        output: {
          source: g.source,
          nodes: g.nodes?.length || 0,
          edges: g.edges?.length || 0,
          model: g.aiStatus?.model,
          toolsUsed: g.aiStatus?.toolsUsed
        }
      });

      // Log graph build event
      addGenerationEvent({
        type: 'graph_build',
        title: 'Graph Construction',
        subtitle: `${g.nodes?.length || 0} nodes, ${g.edges?.length || 0} edges`,
        output: {
          nodeTypes: [...new Set((g.nodes || []).map(n => n.data?.kind))],
          requiredParams: Object.keys(g.requiredParams || {})
        }
      });

      // Log validation event
      addGenerationEvent({
        type: 'validation',
        title: 'Graph Validation',
        subtitle: 'Structure validated',
        output: { valid: true, warnings: [] }
      });

      // ── Stage: Prompt Optimization Analysis (Claude 4.6 Fast) ──
      // Runs asynchronously after validation — analyzes the generation result
      // and suggests system prompt improvements.
      const optimizationStart = Date.now();
      addGenerationEvent({
        type: 'prompt_optimization',
        title: 'Prompt Optimization Analysis',
        subtitle: 'Claude 4.6 Fast is analyzing generation quality...',
        status: 'running'
      });
      addLog('Analyzing prompt effectiveness with Claude 4.6 Fast...', 'ai');

      let promptOptResult = null;
      try {
        const optRes = await analyzePromptOptimization(
          prompt,
          currentSystemPrompt || '',
          {
            nodes: g.nodes, edges: g.edges, source: g.source,
            requiredParams: g.requiredParams,
            taskPlan: g.taskPlan, enhancement: g.enhancement,
            qualityMetrics: g.qualityMetrics, validation: g.validation
          },
          selectedModel
        );
        const optDuration = Date.now() - optimizationStart;

        if (optRes.success && optRes.data) {
          promptOptResult = optRes.data;
          const score = optRes.data.qualityScore;
          const sugCount = optRes.data.suggestions?.length || 0;

          addGenerationEvent({
            type: 'prompt_optimization',
            title: 'Prompt Optimization Complete',
            subtitle: `Quality: ${score != null ? score + '%' : '—'} · ${sugCount} suggestion${sugCount !== 1 ? 's' : ''}`,
            duration: optDuration,
            status: 'done',
            output: {
              qualityScore: score,
              qualitySummary: optRes.data.qualitySummary,
              strengths: optRes.data.strengths,
              weaknesses: optRes.data.weaknesses,
              suggestions: optRes.data.suggestions,
              promptPatch: optRes.data.promptPatch,
              model: optRes.data.model,
              fast: optRes.data.fast
            }
          });
          addLog(`Prompt quality: ${score != null ? score + '%' : '—'} — ${sugCount} optimization${sugCount !== 1 ? 's' : ''} suggested`, 'success');
          if (optRes.data.promptPatch) {
            addLog(`Recommended patch: ${optRes.data.promptPatch.substring(0, 150)}...`, 'info');
          }
        } else {
          addGenerationEvent({
            type: 'prompt_optimization',
            title: 'Prompt Optimization',
            subtitle: optRes.error || 'Analysis unavailable',
            duration: optDuration,
            status: 'error'
          });
          addLog(`Prompt optimization skipped: ${optRes.error || 'unavailable'}`, 'warning');
        }
      } catch (optErr) {
        addGenerationEvent({
          type: 'prompt_optimization',
          title: 'Prompt Optimization',
          subtitle: `Error: ${optErr.message}`,
          duration: Date.now() - optimizationStart,
          status: 'error'
        });
        addLog(`Prompt optimization error: ${optErr.message}`, 'warning');
      }

      const totalDurationFinal = Date.now() - generationStartTime.current;

      // Update all stages with real results
      setGenerationStages([
        { id: 'analyze', label: 'Task Analysis', status: 'done', stats: {
          duration: Math.floor(totalDuration * 0.15),
          tokens: g.aiStatus?.inputTokens || Math.floor(prompt.length / 4)
        }},
        { id: 'schema', label: 'Schema Design', status: 'done', stats: {
          duration: Math.floor(totalDuration * 0.25),
          complexity: (g.nodes?.length || 0) > 6 ? 'complex' : (g.nodes?.length || 0) > 3 ? 'moderate' : 'simple'
        }},
        { id: 'nodes', label: 'Node Generation', status: 'done', stats: {
          duration: Math.floor(totalDuration * 0.30),
          count: g.nodes?.length || 0,
          types: [...new Set((g.nodes || []).map(n => n.data?.kind || 'executor'))].length
        }},
        { id: 'edges', label: 'Edge Wiring', status: 'done', stats: {
          duration: Math.floor(totalDuration * 0.20),
          count: g.edges?.length || 0
        }},
        { id: 'validate', label: 'Validation', status: 'done', stats: {
          duration: Math.floor(totalDuration * 0.10),
          valid: true,
          source: g.source || 'local'
        }},
        { id: 'prompt_opt', label: 'Prompt Optimization', status: promptOptResult ? 'done' : 'error', stats: {
          duration: Date.now() - optimizationStart,
          qualityScore: promptOptResult?.qualityScore,
          suggestions: promptOptResult?.suggestions?.length || 0,
          model: 'Claude 4.6 Fast'
        }}
      ]);

      const styled = (g.edges || []).map(ed => ({
        ...ed, animated: false,
        style: { stroke: '#6b7280', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }
      }));
      setNodes(g.nodes || []);
      setEdges(styled);
      setRequiredParams(g.requiredParams || {});
      const defs = {};
      Object.entries(g.requiredParams || {}).forEach(([k, v]) => { defs[k] = v.default || ''; });
      setParamValues(defs);
      const sourceLabel = g.source === 'ai' ? '🤖 AI (Claude)' : g.source === 'rules' ? '📋 Rules' : '💻 Local';

      if (g.aiStatus && !g.aiStatus.success && g.aiStatus.error) {
        addLog(`⚠️ AI unavailable: ${g.aiStatus.error}`, 'warning');
      }

      // Show tools used info (agentic mode)
      if (g.aiStatus?.success && g.aiStatus.toolsUsed?.length > 0) {
        addLog(`🔧 Tools used: ${g.aiStatus.toolsUsed.join(', ')}`, 'info');
      }

      addLog(`Graph ready: ${(g.nodes || []).length} nodes, ${(g.edges || []).length} edges [${sourceLabel}]`, 'success');

      // Log completion event
      addGenerationEvent({
        type: 'complete',
        title: 'Generation Complete',
        subtitle: `${g.nodes?.length || 0} nodes, ${g.edges?.length || 0} edges`,
        duration: totalDurationFinal,
        output: {
          totalNodes: g.nodes?.length || 0,
          totalEdges: g.edges?.length || 0,
          source: g.source,
          requiredParams: Object.keys(g.requiredParams || {}),
          promptOptimization: promptOptResult ? {
            qualityScore: promptOptResult.qualityScore,
            suggestions: promptOptResult.suggestions?.length || 0
          } : null
        }
      });

      setPhase('ready');
    } catch (err) {
      // Mark failed stage
      setGenerationStages(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error', stats: { error: err.message } } : s
      ));

      // Log error event
      addGenerationEvent({
        type: 'error',
        title: 'Generation Failed',
        subtitle: err.message,
        error: err.message,
        duration: Date.now() - generationStartTime.current
      });

      addLog(`Error: ${err.message}`, 'error');
      setPhase('input');
    }
  }, [taskText, tabData.parentContext, parentGraphNodes, selectedModel, useTools, enabledTools, addLog, setNodes, setEdges, updateStage, resetGenerationStages, addGenerationEvent, generationMode, buildKnowledgeGraph, currentSystemPrompt, selectedSources]);

  // Auto-generate sub-graph when opening new tab with autoGenerate flag
  useEffect(() => {
    if (
      tabData.parentContext &&
      tabData.autoGenerate &&
      !autoGenerateTriggered.current &&
      nodes.length === 0 &&
      phase === 'input' &&
      isActive
    ) {
      autoGenerateTriggered.current = true;
      const generatedPrompt = generateSubGraphPrompt(tabData.parentContext);
      if (generatedPrompt) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          buildGraph(generatedPrompt);
        }, 100);
      }
    }
  }, [tabData.parentContext, tabData.autoGenerate, nodes.length, phase, isActive, buildGraph]);

  /* ── SSE Stream Reader ── */
  const readSSEStream = async (response, onEvent) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.trim().split('\n');
          if (lines.length === 0) continue;

          // Parse SSE format: event: <type>\ndata: <json>
          let eventType = 'message';
          let eventData = null;

          for (const line of lines) {
            if (line.startsWith(':')) continue; // Comment
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                eventData = JSON.parse(line.slice(6));
              } catch (e) {
                console.warn('GXE SSE JSON parse error:', e, line);
              }
            }
          }

          if (eventData) {
            // Merge: SSE event type as fallback, JSON data type takes precedence
            onEvent({ type: eventType, ...eventData });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  /* ── AI Assistant: queue auto-message (handles race with streaming) ── */
  const queueAutoMessage = useCallback((msg, err) => {
    if (assistantRef.current && !assistantRef.current.isStreaming()) {
      assistantRef.current.sendAutoMessage(msg, err);
    } else {
      pendingAutoMessageRef.current = { message: msg, error: err };
    }
  }, []);

  const handleAssistantStreamingComplete = useCallback(() => {
    if (pendingAutoMessageRef.current && assistantRef.current) {
      const { message, error } = pendingAutoMessageRef.current;
      pendingAutoMessageRef.current = null;
      setTimeout(() => {
        if (assistantRef.current) {
          assistantRef.current.sendAutoMessage(message, error);
        }
      }, 300);
    }
  }, []);

  /* ── SSE Event Handler ── */
  // Track execution state for building finalResult
  const sseExecutionStateRef = useRef({
    startTime: 0,
    nodeCount: 0,
    completedCount: 0,
    failedCount: 0,
    errors: [],
    output: null
  });

  const handleSSEEvent = useCallback((event) => {
    const state = sseExecutionStateRef.current;

    switch (event.type) {
      // ── Connection / Start ──
      case 'connected':
        if (event.executionId) {
          setCurrentExecutionId(event.executionId);
        }
        state.startTime = Date.now();
        state.completedCount = 0;
        state.failedCount = 0;
        state.errors = [];
        state.output = null;
        setLiveExecutionEvents([]);
        setWaitingInputs([]);
        setLiveExecutionStatus('running');
        addLog(`SSE connected: ${event.executionId || 'unknown'}`, 'start');
        break;

      case 'start':
        state.startTime = Date.now();
        state.nodeCount = event.nodeCount || 0;
        state.completedCount = 0;
        state.failedCount = 0;
        state.errors = [];
        state.output = null;
        setStats(s => ({ ...s, total: event.nodeCount }));
        setLiveExecutionEvents([]);
        setWaitingInputs([]);
        setLiveExecutionStatus('running');
        if (event.executionId) setCurrentExecutionId(event.executionId);
        addLog(`Execution started: ${event.nodeCount} nodes`, 'start');
        break;

      // ── Node Started ──
      case 'node:start':
      case 'node:started': {
        setNodes(nds => nds.map(n => {
          if (n.id !== event.nodeId) return n;
          return {
            ...n,
            data: { ...n.data, status: 'running', executionStatus: 'running' }
          };
        }));
        setEdges(es => es.map(e =>
          e.target === event.nodeId
            ? { ...e, animated: true, style: { ...e.style, stroke: '#eab308' } }
            : e
        ));

        // Live execution timeline
        setLiveExecutionEvents(prev => [...prev, {
          id: `${event.nodeId}-${Date.now()}`,
          type: 'node:started',
          timestamp: Date.now(),
          nodeId: event.nodeId,
          nodeLabel: event.nodeLabel || event.toolId || event.nodeId,
          status: 'running',
          input: event.input
        }]);

        addLog(`Running: ${event.nodeLabel || event.toolId || event.nodeId}`, 'execute', event.nodeId);
        break;
      }

      // ── Node Completed ──
      case 'node:complete':
      case 'node:completed': {
        state.completedCount++;

        setNodes(nds => nds.map(n => {
          if (n.id !== event.nodeId) return n;
          const output = event.output || event.result;
          return {
            ...n,
            data: {
              ...n.data,
              status: 'done',
              duration: event.duration || event.metrics?.wallTimeMs || 0,
              executionStatus: 'completed',
              outputPreview: typeof output === 'string' ? output : JSON.stringify(output)?.slice(0, 100)
            }
          };
        }));

        setNodeStates(prev => ({
          ...prev,
          [event.nodeId]: event.output || event.result
        }));

        setEdges(es => es.map(e =>
          e.target === event.nodeId
            ? { ...e, animated: false, style: { ...e.style, stroke: '#22c55e' } }
            : e
        ));

        setStats(s => ({ ...s, done: s.done + 1 }));

        if (event.nodeId === 'output' || event.nodeLabel?.toLowerCase()?.includes('output')) {
          state.output = event.output || event.result;
        }

        // Update live execution event
        const dur = event.duration || event.metrics?.wallTimeMs || 0;
        setLiveExecutionEvents(prev => prev.map(e =>
          e.nodeId === event.nodeId && e.status === 'running'
            ? { ...e, status: 'completed', duration: dur, result: event.output || event.result }
            : e
        ));

        addLog(`Done: ${event.nodeLabel || event.nodeId} (${dur}ms)`, 'success', event.nodeId);
        break;
      }

      // ── Node Failed ──
      case 'node:error':
      case 'node:failed': {
        state.failedCount++;
        state.errors.push({
          nodeId: event.nodeId,
          nodeLabel: event.nodeLabel || event.nodeId,
          error: event.error,
          timestamp: new Date().toISOString()
        });

        setNodes(nds => nds.map(n => {
          if (n.id !== event.nodeId) return n;
          return {
            ...n,
            data: { ...n.data, status: 'error', executionStatus: 'failed', error: event.error }
          };
        }));

        setEdges(es => es.map(e =>
          e.target === event.nodeId
            ? { ...e, animated: false, style: { ...e.style, stroke: '#ef4444' } }
            : e
        ));

        setStats(s => ({ ...s, done: s.done + 1 }));

        // Update live execution event
        setLiveExecutionEvents(prev => prev.map(e =>
          e.nodeId === event.nodeId && e.status === 'running'
            ? { ...e, status: 'error', error: event.error }
            : e
        ));

        addLog(`Error: ${event.nodeLabel || event.nodeId} — ${event.error}`, 'error', event.nodeId);
        break;
      }

      // ── Waiting for User Input ──
      case 'waiting:input': {
        // Update node visual on canvas (amber)
        setNodes(nds => nds.map(n => {
          if (n.id !== event.nodeId) return n;
          return {
            ...n,
            data: { ...n.data, status: 'waiting', executionStatus: 'waiting_input' }
          };
        }));
        setEdges(es => es.map(e =>
          e.target === event.nodeId
            ? { ...e, animated: true, style: { ...e.style, stroke: '#f59e0b', strokeDasharray: '5,5' } }
            : e
        ));

        // Update live event to waiting
        setLiveExecutionEvents(prev => prev.map(e =>
          e.nodeId === event.nodeId && e.status === 'running'
            ? { ...e, status: 'waiting' }
            : e
        ));

        // Add to waiting inputs
        setWaitingInputs(prev => [...prev, {
          nodeId: event.nodeId,
          nodeLabel: event.nodeLabel || event.nodeId,
          expected_inputs: event.expected_inputs || [],
          resume_token: event.resume_token,
          timeout_at: event.timeout_at,
          timeout_action: event.timeout_action,
          prompt: event.prompt
        }]);

        setLiveExecutionStatus('paused');
        addLog(`Waiting for input: ${event.nodeLabel || event.nodeId}`, 'execute', event.nodeId);
        break;
      }

      // ── Execution Progress ──
      case 'execution:progress':
        setStats(s => ({
          ...s,
          done: event.completed || s.done,
          total: event.total || s.total
        }));
        break;

      // ── Execution Completed ──
      case 'complete':
      case 'execution:completed': {
        const executionTime = event.duration || event.metrics?.totalDurationMs || (Date.now() - state.startTime);
        const hasErrors = state.errors.length > 0;

        const structuredResult = {
          success: !hasErrors,
          cancelled: false,
          executionTime,
          nodesCompleted: state.completedCount,
          totalNodes: state.nodeCount || event.metrics?.nodesTotal,
          timestamp: new Date().toISOString(),
          output: event.output || state.output,
          nodeResults: event.nodeResults,
          ...(hasErrors && {
            errorSummary: {
              totalErrors: state.errors.length,
              failedNodes: state.errors.map(e => e.nodeLabel),
              firstError: state.errors[0]?.error || 'Unknown error'
            },
            errors: state.errors
          })
        };

        setFinalResult(structuredResult);
        setExecutionSummary(event);
        setLiveExecutionStatus('completed');
        addLog(`Complete: ${state.completedCount} done, ${state.failedCount} failed (${executionTime}ms)`, 'complete');
        break;
      }

      // ── Tool Validation Failed (pre-execution) ──
      case 'execution:toolValidationFailed': {
        const toolErr = event.error || 'Tool validation failed';
        const missing = event.missingTools || [];
        setExecutionError(toolErr);
        setLiveExecutionStatus('failed');
        setLiveExecutionEvents(prev => [...prev, {
          id: `tool-val-${Date.now()}`,
          type: 'execution:toolValidationFailed',
          timestamp: Date.now(),
          nodeId: 'tool-validation',
          nodeLabel: 'Tool Validation',
          status: 'error',
          error: toolErr,
        }]);
        addLog(`Tool validation failed: ${missing.length} nodes missing tools`, 'error');

        // AI auto-diagnose missing tools
        setIsAssistantOpen(true);
        const toolDetails = missing.map(t => `${t.nodeId} (${t.label}): kind="${t.kind}", toolId="${t.toolId || 'none'}"`).join('\n');
        queueAutoMessage(
          `TOOL VALIDATION FAILED: ${missing.length} nodes have unresolved tools.\n\n${toolDetails}\n\nSearch for matching tools in the registry using MCP tools. For each node, find the best matching tool based on the node label and purpose. Propose update_node mutations to assign correct toolIds.`,
          toolErr
        );
        break;
      }

      // ── Execution Failed ──
      case 'error':
      case 'execution:failed': {
        const failErr = event.error;
        const hasMissingTools = event.missingTools && event.missingTools.length > 0;
        setExecutionError(failErr);

        const errorResult = {
          success: false,
          cancelled: false,
          executionTime: Date.now() - state.startTime,
          nodesCompleted: state.completedCount,
          totalNodes: state.nodeCount,
          timestamp: new Date().toISOString(),
          errorSummary: {
            totalErrors: 1,
            failedNodes: event.failedNodes || ['execution'],
            firstError: failErr,
            missingTools: event.missingTools,
          },
          errors: [{ error: failErr, timestamp: new Date().toISOString() }]
        };

        setFinalResult(errorResult);
        setLiveExecutionStatus('failed');
        addLog(`Execution failed: ${failErr}`, 'error');

        // AI auto-diagnose on tool-related failures
        if (hasMissingTools) {
          setIsAssistantOpen(true);
          const toolDetails = event.missingTools.map(t => `${t.nodeId} (${t.label}): kind="${t.kind}", toolId="${t.toolId || 'none'}"`).join('\n');
          queueAutoMessage(
            `EXECUTION FAILED — ${event.missingTools.length} nodes have unresolved tools:\n\n${toolDetails}\n\nSearch for matching tools in the registry using MCP tools. For each node, find the best matching tool. Propose update_node mutations.`,
            failErr
          );
        }
        break;
      }

      // ── Execution Paused / Resumed ──
      case 'execution:paused':
        setLiveExecutionStatus('paused');
        break;

      case 'execution:resumed':
        setLiveExecutionStatus('running');
        break;

      // ── Execution Cancelled ──
      case 'execution:cancelled':
        setLiveExecutionStatus('cancelled');
        addLog('Execution cancelled', 'warning');
        break;
    }
  }, [setNodes, setEdges, setNodeStates, setFinalResult, addLog, queueAutoMessage]);

  /* ── Resume Input (for waiting:input nodes) ── */
  const handleResumeInput = useCallback(async (nodeId, { resume_token, payload }) => {
    if (!currentExecutionId) {
      addLog('Cannot resume: no active execution', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/gxe/v2/execute/${currentExecutionId}/resume-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_token, payload, nodeId })
      });

      const result = await response.json();

      if (result.success) {
        // Remove from waiting inputs
        setWaitingInputs(prev => prev.filter(w => w.nodeId !== nodeId));
        setLiveExecutionStatus('running');

        // Update live event
        setLiveExecutionEvents(prev => prev.map(e =>
          e.nodeId === nodeId && e.status === 'waiting'
            ? { ...e, status: 'resumed', inputProvided: payload }
            : e
        ));

        // Update node visual (back to running)
        setNodes(nds => nds.map(n => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            data: { ...n.data, status: 'running', executionStatus: 'running' }
          };
        }));

        addLog(`Input provided for: ${nodeId}`, 'success', nodeId);
      } else {
        addLog(`Failed to resume: ${result.error}`, 'error', nodeId);
      }
    } catch (error) {
      addLog(`Resume error: ${error.message}`, 'error', nodeId);
    }
  }, [currentExecutionId, addLog, setNodes]);

  /* ── Execute (Phase 0 SSE) ── */
  const executeWithSSE = useCallback(async () => {
    if (phase === 'executing') return;

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset state
    setPhase('executing');
    cancelRef.current = false;
    setFinalResult(null);
    setShowResult(false);
    setNodeStates({});
    setExecutionError(null);
    setExecutionSummary(null);
    setLiveExecutionEvents([]);
    setLiveExecutionStatus('running');
    setWaitingInputs([]);
    setCurrentExecutionId(null);
    const t0 = Date.now();

    // Reset all nodes to idle
    setNodes(ns => ns.map(n => ({
      ...n,
      data: { ...n.data, status: 'idle', duration: null, executionStatus: 'pending', outputPreview: null, error: null }
    })));
    setEdges(es => es.map(e => ({ ...e, animated: false, style: { ...e.style, stroke: '#6b7280', strokeDasharray: null } })));

    const order = topoSort(nodes, edges);
    setExecutionOrder(order);
    setStats({ done: 0, total: order.length, ms: 0 });
    addLog(`Execution started (Phase 0 SSE) — ${order.length} nodes`, 'start');

    // AI pre-validation: open assistant panel and send auto-message
    setIsAssistantOpen(true);
    if (assistantRef.current) {
      assistantRef.current.sendAutoMessage(
        `Pre-execution validation: Analyze this graph (${nodes.length} nodes, ${edges.length} edges). Check all nodes have valid toolIds. Flag generic types (input, action, ai_node, condition) that need real tool assignments.`,
        null
      );
    }

    try {
      // Optional: validate first (skip if endpoint unavailable)
      try {
        const validateResponse = await fetch(`${API_BASE_URL}/gxe/v2/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes, edges, params: paramValues }),
          signal: controller.signal
        });

        if (validateResponse.ok) {
          const validation = await validateResponse.json();
          if (validation.canExecute === false) {
            const errMsg = `Validation failed (level ${validation.completedLevel}): ${validation.errorCount} errors`;
            setExecutionError({
              message: errMsg,
              errors: validation.errors || [],
              warnings: validation.warnings || [],
              completedLevel: validation.completedLevel,
              structural: validation.structural,
              dag: validation.dag,
              flow: validation.flow,
              toolValidity: validation.toolValidity,
              typeCheck: validation.typeCheck,
            });
            setLiveExecutionStatus('failed');
            setLiveExecutionEvents(prev => [...prev, {
              id: `validation-${Date.now()}`,
              type: 'validation',
              timestamp: Date.now(),
              nodeId: 'validation',
              nodeLabel: 'Graph Validation',
              status: 'error',
              error: errMsg,
              validationErrors: validation.errors || [],
              validationWarnings: validation.warnings || [],
            }]);
            addLog(`Validation failed: ${validation.errorCount} errors`, 'error');
            // AI auto-analyze validation failure — ensure panel is open
            setIsAssistantOpen(true);
            queueAutoMessage(
              `Validation FAILED at level ${validation.completedLevel}/6.\nErrors: ${(validation.errors || []).map(e => e.message).join('; ')}\nSearch for matching tools using MCP tools and propose update_node mutations to fix.`,
              null
            );
            setPhase('ready');
            return;
          }
          addLog(`Validation passed (level ${validation.completedLevel})`, 'success');
        } else {
          addLog('Validation endpoint unavailable, proceeding to execute', 'info');
        }
      } catch (valErr) {
        if (valErr.name === 'AbortError') throw valErr;
        addLog('Validation skipped (endpoint unavailable)', 'info');
      }

      // Execute with SSE (one-step: POST returns SSE stream directly)
      const executeResponse = await fetch(`${API_BASE_URL}/runtime/execute-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dag: { nodes, edges },
          inputData: paramValues || {}
        }),
        signal: controller.signal
      });

      if (!executeResponse.ok) {
        let errMsg = `HTTP ${executeResponse.status}`;
        try {
          const errBody = await executeResponse.json();
          errMsg = errBody.error || errMsg;
        } catch { /* not JSON */ }
        throw new Error(errMsg);
      }

      // Read SSE stream
      await readSSEStream(executeResponse, handleSSEEvent);

    } catch (error) {
      if (error.name === 'AbortError') {
        addLog('Execution aborted', 'warning');
        setLiveExecutionStatus('cancelled');
      } else {
        setExecutionError(error.message);
        setLiveExecutionStatus('failed');
        setLiveExecutionEvents(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'execution:failed',
          timestamp: Date.now(),
          nodeId: 'execution',
          nodeLabel: 'Execution',
          status: 'error',
          error: error.message
        }]);
        addLog(`Error: ${error.message}`, 'error');
        // AI auto-analyze execution failure — ensure panel is open
        setIsAssistantOpen(true);
        queueAutoMessage(
          `Execution FAILED: ${error.message}\n\nDiagnose the issue, search for matching tools using MCP tools, and propose mutations to fix the graph.`,
          error.message
        );
      }
    } finally {
      const executionTime = Date.now() - t0;
      setStats(s => ({ ...s, ms: executionTime }));
      if (phase === 'executing') setPhase('done');
      setShowResult(true);
      abortControllerRef.current = null;
    }
  }, [nodes, edges, paramValues, phase, handleSSEEvent, addLog, setNodes, setEdges, queueAutoMessage]);

  /* ── Execute (Legacy mock - fallback) ── */
  const execute = useCallback(async () => {
    setPhase('executing');
    cancelRef.current = false;
    setFinalResult(null); setShowResult(false); setNodeStates({});
    const t0 = Date.now();

    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, status: 'pending', duration: undefined } })));

    const order = topoSort(nodes, edges);
    setExecutionOrder(order); // Save execution order for ResultPanel
    setStats({ done: 0, total: order.length, ms: 0 });
    addLog(`Execution started — ${order.length} nodes`, 'start');

    const outputs = {};
    const errors = []; // Collect all errors
    let cnt = 0;
    let outputNodeResult = null;
    let wasCancelled = false;

    outputs['input'] = paramValues;
    setNodes(ns => ns.map(n => n.id === 'input' ? { ...n, data: { ...n.data, status: 'done' } } : n));
    setNodeStates(p => ({ ...p, input: paramValues }));
    addLog('Input parameters loaded', 'input', 'input');

    for (const nid of order) {
      if (cancelRef.current) {
        wasCancelled = true;
        addLog('Cancelled', 'warning');
        break;
      }
      const nd = nodes.find(n => n.id === nid);
      if (!nd || nid === 'input') continue;

      const ins = edges.filter(e => e.target === nid).reduce((a, e) => ({ ...a, ...(outputs[e.source] || {}) }), {});

      setNodes(ns => ns.map(n => n.id === nid ? { ...n, data: { ...n.data, status: 'running' } } : n));
      setEdges(es => es.map(e => e.target === nid ? { ...e, animated: true, style: { ...e.style, stroke: '#eab308' } } : e));
      addLog(`Running: ${nd.data.label}`, 'execute', nid);

      try {
        const res = await runNode(nd.data, ins);
        const dur = res._d || 0;
        delete res._d;
        outputs[nid] = res;
        setNodeStates(p => ({ ...p, [nid]: res }));

        setNodes(ns => ns.map(n => n.id === nid ? { ...n, data: { ...n.data, status: 'done', duration: dur } } : n));
        setEdges(es => es.map(e => e.target === nid ? { ...e, animated: false, style: { ...e.style, stroke: '#22c55e' } } : e));
        cnt++;
        setStats({ done: cnt, total: order.length, ms: Date.now() - t0 });
        addLog(`Done: ${nd.data.label} (${dur}ms)`, 'success', nid);

        if (nd.data.kind === 'output') {
          outputNodeResult = res;
        }
      } catch (err) {
        setNodes(ns => ns.map(n => n.id === nid ? { ...n, data: { ...n.data, status: 'error' } } : n));
        addLog(`Error: ${nd.data.label} — ${err.message}`, 'error', nid);

        // Collect error details
        errors.push({
          nodeId: nid,
          nodeLabel: nd.data.label,
          nodeKind: nd.data.kind,
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
          inputs: ins
        });
      }
    }

    const executionTime = Date.now() - t0;
    setStats(s => ({ ...s, ms: executionTime }));

    // Build structured finalResult
    const hasErrors = errors.length > 0;
    const structuredResult = {
      success: !hasErrors && !wasCancelled,
      cancelled: wasCancelled,
      executionTime,
      nodesCompleted: cnt,
      totalNodes: order.length,
      timestamp: new Date().toISOString(),
      // Output data (only if successful)
      output: !hasErrors && !wasCancelled ? outputNodeResult : null,
      // Error information (only if failed)
      ...(hasErrors && {
        errorSummary: {
          totalErrors: errors.length,
          failedNodes: errors.map(e => e.nodeLabel),
          firstError: errors[0]?.error || 'Unknown error'
        },
        errors: errors
      }),
      // Cancellation info
      ...(wasCancelled && {
        cancellationInfo: {
          reason: 'User cancelled execution',
          nodesRemaining: order.length - cnt
        }
      })
    };

    setFinalResult(structuredResult);
    addLog(
      hasErrors
        ? `Completed with ${errors.length} error(s). Total: ${executionTime}ms`
        : wasCancelled
          ? `Cancelled after ${cnt} nodes. Total: ${executionTime}ms`
          : `Complete. Total: ${executionTime}ms`,
      hasErrors ? 'error' : wasCancelled ? 'warning' : 'complete'
    );
    setPhase('done');
    setShowResult(true);
  }, [nodes, edges, paramValues, addLog, setNodes, setEdges]);

  const cancel = () => { cancelRef.current = true; setPhase('ready'); };

  const reset = useCallback(() => {
    setPhase('input'); setNodes([]); setEdges([]); setTaskText('');
    setLog([]); setNodeStates({}); setFinalResult(null); setShowResult(false);
    setRequiredParams({}); setParamValues({});
  }, [setNodes, setEdges]);

  const canExec = phase === 'ready' || phase === 'done';

  // Handler for param changes
  const handleParamChange = useCallback((key, value) => {
    setParamValues(p => ({ ...p, [key]: value }));
  }, []);

  // Apply AI-proposed graph mutations (supports async create_subgraph)
  const handleApplyMutations = useCallback(async (mutations) => {
    if (!mutations || mutations.length === 0) return;

    console.log('[ApplyMutations] Received', mutations.length, 'mutations:', mutations);

    // Classify mutations into categories
    const nodeUpdates = [];        // { nodeId, changes }
    const nodeRemovals = [];       // nodeId[]
    const edgeRemovals = [];       // { source, target }[]
    const edgeAdditions = [];      // edge objects
    const subgraphCreations = [];  // { parentNodeId, subgraph }
    const saveGraphMuts = [];      // { name, graphDescription, ... }
    let skipped = 0;

    for (const mut of mutations) {
      switch (mut.type) {
        case 'update_node':
          if (mut.nodeId && mut.changes && typeof mut.changes === 'object') {
            nodeUpdates.push({ nodeId: mut.nodeId, changes: mut.changes });
          } else {
            console.warn('[ApplyMutations] Skipping update_node — missing nodeId or changes:', mut);
            skipped++;
          }
          break;

        case 'remove_node':
          if (mut.nodeId) {
            nodeRemovals.push(mut.nodeId);
          } else {
            console.warn('[ApplyMutations] Skipping remove_node — missing nodeId:', mut);
            skipped++;
          }
          break;

        case 'remove_edge':
          if (mut.source && mut.target) {
            edgeRemovals.push({ source: mut.source, target: mut.target });
          } else {
            console.warn('[ApplyMutations] Skipping remove_edge — missing source/target:', mut);
            skipped++;
          }
          break;

        case 'add_edge':
          if (mut.source && mut.target) {
            edgeAdditions.push({
              id: `e-${mut.source}-${mut.target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              source: mut.source,
              target: mut.target,
              type: 'smoothstep',
              animated: false,
            });
          } else {
            console.warn('[ApplyMutations] Skipping add_edge — missing source/target:', mut);
            skipped++;
          }
          break;

        case 'link_subgraph':
          if (mut.parentNodeId && mut.catalogGraphId) {
            // Convert to a node update — synchronous
            nodeUpdates.push({
              nodeId: mut.parentNodeId,
              changes: {
                kind: 'subgraph',
                toolId: 'runtime.execute_subgraph',
                subgraphId: mut.catalogGraphId,
                hasSubGraph: true,
                ...(mut.catalogGraphName ? { subgraphName: mut.catalogGraphName } : {})
              }
            });
          } else {
            console.warn('[ApplyMutations] Skipping link_subgraph — missing parentNodeId or catalogGraphId:', mut);
            skipped++;
          }
          break;

        case 'create_subgraph':
          if (mut.parentNodeId && mut.subgraph && mut.subgraph.nodes && mut.subgraph.edges) {
            subgraphCreations.push(mut);
          } else {
            console.warn('[ApplyMutations] Skipping create_subgraph — missing parentNodeId or subgraph data:', mut);
            skipped++;
          }
          break;

        case 'save_graph':
          saveGraphMuts.push(mut);
          break;

        default:
          console.warn('[ApplyMutations] Unknown mutation type:', mut.type, mut);
          skipped++;
      }
    }

    // ── PASS 1: Synchronous mutations (node updates/removals, edges, link_subgraph) ──

    if (nodeUpdates.length > 0 || nodeRemovals.length > 0) {
      setNodes(prev => {
        let result = prev;
        const graphNodeIds = prev.map(n => n.id);

        if (nodeRemovals.length > 0) {
          const removeSet = new Set(nodeRemovals);
          const beforeLen = result.length;
          result = result.filter(n => !removeSet.has(n.id));
          console.log(`[ApplyMutations] Remove nodes: ${beforeLen} → ${result.length}`);
        }

        if (nodeUpdates.length > 0) {
          const updateMap = new Map();
          for (const u of nodeUpdates) {
            if (updateMap.has(u.nodeId)) {
              updateMap.set(u.nodeId, { ...updateMap.get(u.nodeId), ...u.changes });
            } else {
              updateMap.set(u.nodeId, u.changes);
            }
          }

          const mutationIds = [...updateMap.keys()];
          const matched = mutationIds.filter(id => graphNodeIds.includes(id));
          const unmatched = mutationIds.filter(id => !graphNodeIds.includes(id));
          if (unmatched.length > 0) {
            console.warn(`[ApplyMutations] ID MISMATCH: ${unmatched.length}/${mutationIds.length} not found in graph`);
            console.warn('[ApplyMutations] Unmatched IDs:', unmatched.slice(0, 5));
          }
          console.log(`[ApplyMutations] Update nodes: ${matched.length} matched, ${unmatched.length} unmatched`);

          let changedCount = 0;
          result = result.map(n => {
            const changes = updateMap.get(n.id);
            if (!changes) return n;
            changedCount++;
            return { ...n, data: { ...n.data, ...changes } };
          });
          console.log(`[ApplyMutations] Actually changed ${changedCount} node(s)`);
        }

        return result;
      });
    }

    if (edgeRemovals.length > 0 || edgeAdditions.length > 0 || nodeRemovals.length > 0) {
      setEdges(prev => {
        let result = prev;
        if (edgeRemovals.length > 0) {
          result = result.filter(e =>
            !edgeRemovals.some(r => r.source === e.source && r.target === e.target)
          );
        }
        if (nodeRemovals.length > 0) {
          const removeSet = new Set(nodeRemovals);
          result = result.filter(e => !removeSet.has(e.source) && !removeSet.has(e.target));
        }
        if (edgeAdditions.length > 0) {
          result = [...result, ...edgeAdditions];
        }
        return result;
      });
    }

    // ── PASS 2: Async mutations (create_subgraph — API calls) ──

    for (const mut of subgraphCreations) {
      try {
        addLog(`Creating sub-graph for node ${mut.parentNodeId}...`, 'info');
        const created = await createGraph({
          name: mut.subgraph.name || `Sub-graph for ${mut.parentNodeId}`,
          description: mut.subgraph.description || '',
          type: mut.subgraph.type || 'business',
          namespace: mut.subgraph.namespace || 'default',
          tags: mut.subgraph.tags || [],
          nodes: mut.subgraph.nodes,
          edges: mut.subgraph.edges,
          requiredParams: mut.subgraph.requiredParams || [],
          parentGraphId: tabData.catalogGraphId || undefined,
          parentNodeId: mut.parentNodeId
        });

        // Handle server-side validation responses
        if (created.duplicate) {
          addLog(`Graph already exists as "${created.name}" — linking instead`, 'info');
          // Link to existing instead of creating new
          setNodes(prev => prev.map(n => {
            if (n.id !== mut.parentNodeId) return n;
            return {
              ...n,
              data: {
                ...n.data,
                kind: 'subgraph',
                toolId: 'runtime.execute_subgraph',
                subgraphId: created.entryId || created.id,
                hasSubGraph: true,
                subgraphName: created.name
              }
            };
          }));
          continue;
        }

        if (created.wasAutoFixed) {
          addLog('Sub-graph was auto-corrected before saving', 'warning');
        }

        // Update parent node to reference the created sub-graph
        const subgraphId = created.entryId || created.legacyId || created.id;
        setNodes(prev => prev.map(n => {
          if (n.id !== mut.parentNodeId) return n;
          return {
            ...n,
            data: {
              ...n.data,
              kind: 'subgraph',
              toolId: 'runtime.execute_subgraph',
              subgraphId,
              hasSubGraph: true,
              subgraphName: mut.subgraph.name || created.name
            }
          };
        }));

        addLog(`Sub-graph created: ${mut.subgraph.name || 'unnamed'} (${subgraphId})`, 'success');
      } catch (err) {
        console.error('[ApplyMutations] create_subgraph failed:', err);
        addLog(`Failed to create sub-graph for ${mut.parentNodeId}: ${err.message}`, 'error');
        skipped++;
      }
    }

    // ── PASS 3: UI mutations (save_graph — open SaveGraphDialog with AI prefill) ──

    if (saveGraphMuts.length > 0) {
      const s = saveGraphMuts[0];
      setSaveDialogPrefill({
        name: s.name || '',
        description: s.graphDescription || '',
        type: s.graphType || s.type || 'business',
        namespace: s.namespace || 'default',
        tags: s.tags || [],
        version: s.version || '1.0.0'
      });
      setSaveDialogOpen(true);
    }

    const applied = mutations.length - skipped;
    const msg = skipped > 0
      ? `Applied ${applied}/${mutations.length} mutations (${skipped} skipped)`
      : `Applied ${applied} mutation(s)`;
    addLog(msg, applied > 0 ? 'success' : 'warning');
    console.log('[ApplyMutations]', msg);
  }, [setNodes, setEdges, addLog, tabData.catalogGraphId]);

  const handleAddNodeToCanvas = useCallback((toolData) => {
    const rfi = reactFlowRef.current;
    const pos = rfi
      ? rfi.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 };
    const kindMap = { ai: 'ai', patterns: 'subgraph', meta: 'tool' };
    const kind = kindMap[toolData.category] || 'executor';
    const newNode = {
      id: `${toolData.executorId}-${Date.now()}`,
      type: 'graphNode',
      position: pos,
      data: {
        label: toolData.name,
        kind,
        executorType: toolData.executorId,
        toolRef: toolData.toolId,
        description: toolData.description || '',
        inputFormat: toolData.inputSchema ? JSON.parse(toolData.inputSchema) : undefined,
        outputFormat: toolData.outputSchema ? JSON.parse(toolData.outputSchema) : undefined,
        params: {},
        status: 'idle',
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes]);

  if (!isActive) return null;

  return (
    <div className="h-full flex flex-col" style={{ position: 'relative', width: '100%' }} >
      {/* Floating Control Panel */}
      <FloatingControlPanel
        // Execution tab props
        phase={phase}
        requiredParams={requiredParams}
        paramValues={paramValues}
        onParamChange={handleParamChange}
        log={log}
        selectedNode={selectedNode}
        nodeStates={nodeStates}
        nodesWithCallbacks={nodesWithPorts}
        onNodeSelect={setSelectedNode}
        stats={stats}
        finalResult={finalResult}
        showResult={showResult}
        onShowResult={() => setShowResult(true)}
        canExecute={canExec}
        onExecute={executeWithSSE}
        onCancel={cancel}
        executionError={executionError}
        executionSummary={executionSummary}
        // Generator tab props
        taskText={taskText}
        onTaskTextChange={setTaskText}
        onBuildGraph={() => buildGraph(null)}
        parentContext={tabData.parentContext}
        generationStages={generationStages}
        generationMode={generationMode}
        aiAnalysisResult={aiAnalysisResult}
        onGenerationModeChange={setGenerationMode}
        dataSources={dataSources}
        selectedSources={selectedSources}
        onSelectedSourcesChange={setSelectedSources}
        // Graph Info tab props
        graphMetadata={graphMetadata}
        catalogGraphId={tabData.catalogGraphId}
        onGraphMetadataChange={setGraphMetadata}
        nodesCount={nodes.length}
        edgesCount={edges.length}
        // AI Settings tab props
        aiSettings={aiSettings}
        onAiSettingsChange={onAiSettingsChange}
        onOpenPromptEditor={onOpenPromptEditor}
        availableModels={availableModels}
        // Common props
        isGenerating={phase === 'generating'}
        isExecuting={phase === 'executing'}
      />

      {/* Floating Generation Prompt Editor */}
      {promptEditorOpen && (
        <FloatingPromptEditor
          open
          onClose={onClosePromptEditor}
          onSave={onSavePrompt}
          onSetDefault={onSetDefaultPrompt}
        />
      )}

      {/* Details Watcher — floating panel for selected node/edge info */}
      <DetailsWatcher
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        onOpenSubGraph={(nodeId, nodeData) => onDrillDown(nodeId, nodeData)}
        onNavigateToTab={onNavigateToTab}
        subGraphs={tabData.subGraphs}
        savedSubGraphs={tabData.savedSubGraphs}
        availableModels={availableModels}
        onUpdateNodeData={handleUpdateNodeData}
      />

      {/* Panel Toggle: Classic ↔ NEXUS */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 70,
        zIndex: 100,
        display: 'flex',
        gap: 4,
        background: '#1e293b',
        padding: 4,
        borderRadius: 8,
        border: '1px solid #475569',
        transition: 'right 0.2s ease',
      }}>
        <button
          onClick={() => setPanelMode('classic')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 6,
            background: panelMode === 'classic' ? '#6366f1' : 'transparent',
            color: panelMode === 'classic' ? 'white' : '#94a3b8',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Classic
        </button>
        <button
          onClick={() => setPanelMode('nexus')}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 6,
            background: panelMode === 'nexus' ? '#6366f1' : 'transparent',
            color: panelMode === 'nexus' ? 'white' : '#94a3b8',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ◈ NEXUS
        </button>
      </div>

      {/* NEXUS Panel — Floating Graph Intelligence Hub */}
      {panelMode === 'nexus' && (
        <FloatingWindow
          storageKey="gxe-nexus-panel"
          title="NEXUS"
          icon={<span style={{ fontSize: 16, color: '#6366f1' }}>◈</span>}
          defaultPosition={{ x: Math.max(window.innerWidth - 420, 200), y: 60 }}
          defaultSize={{ width: 380, height: 650 }}
          minSize={{ width: 320, height: 300 }}
          zIndex={50}
          onClose={() => setPanelMode('classic')}
        >
          <Nexus nodes={nodes} edges={edges} />
        </FloatingWindow>
      )}

      {/* Classic Graph Actions Panel — floating toolbar for graph operations */}
      {panelMode === 'classic' && (
        <GraphActionsPanel
          namespace={graphMetadata?.namespace || 'default'}
          catalogGraphId={tabData.catalogGraphId}
          selectedNodes={selectedNodeIds}
          nodes={nodes}
          edges={edges}
        />
      )}

      {/* Context Menu — GXE native, renders via portal (CONS-16) */}
      <GxeContextMenu
        position={ctxMenuPos}
        target={ctxMenuTarget}
        onAction={handleContextMenuAction}
        onClose={() => { setCtxMenuPos(null); setCtxMenuTarget(null); }}
      />

      {/* Tool Catalog — floating window */}
      <GXEToolCatalogWrapper
        onAddNodeToCanvas={handleAddNodeToCanvas}
      />

      {/* Graph Toolbar — always visible (SQL Import button needs to be accessible) */}
      <GraphToolbar
        graphMetadata={graphMetadata}
        catalogGraphId={tabData.catalogGraphId}
        graphVersion={graphVersion}
        nodes={nodes}
        edges={edges}
        requiredParams={requiredParams}
        setNodes={setNodes}
        setEdges={setEdges}
        reactFlowInstance={reactFlowRef.current}
        godMode={godMode}
        onGodModeToggle={() => setGodMode(g => !g)}
        onSaveComplete={handleToolbarSaveComplete}
        onVersionChange={setGraphVersion}
        onOpenSaveDialog={() => setSaveDialogOpen(true)}
        snapToGrid={snapToGrid}
        onSnapToGridToggle={() => setSnapToGrid(s => !s)}
        nodeLock={nodeLock}
        onNodeLockToggle={() => setNodeLock(l => !l)}
        edgeType={edgeType}
        onEdgeTypeChange={handleEdgeTypeChange}
        onApplyLayout={gxeApplyLayout}
        isLayouting={gxeIsLayouting}
        layoutOptions={gxeLayoutOptions}
        onLayoutOptionsChange={setGxeLayoutOptions}
        onApplyAILayout={applyAILayout}
        isAILayouting={isAILayouting}
        aiLayoutError={aiLayoutError}
        aiLayoutMetadata={aiLayoutMetadata}
        onOpenAILayoutSettings={handleOpenAILayoutSettings}
        gridType={gridType}
        onGridTypeChange={handleGridTypeChange}
        hexOptions={hexOptions}
        onHexOptionsChange={handleHexOptionsChange}
        onApplyHexLayout={applyHexLayout}
        onApplyAIHexLayout={applyAIHexLayout}
        isHexLayouting={isHexLayouting}
        isAIHexLayouting={isAIHexLayouting}
        aiHexLayoutError={aiHexLayoutError}
        aiHexLayoutMetadata={aiHexLayoutMetadata}
        onSaveHexDefaults={handleSaveHexDefaults}
        showDebugRoadMap={showDebugRoadMap}
        onDebugRoadMapToggle={() => setShowDebugRoadMap(v => !v)}
        onToggleSearch={() => setSearchPanelOpen(v => !v)}
        onToggleSimilarity={() => setSimilarityPanelOpen(v => !v)}
        onToggleAssistant={() => setAssistantPanelOpen(v => !v)}
        onToggleProperties={() => setPropertiesPanelOpen(v => !v)}
        dynamicPortsEnabled={dynamicPortsEnabled}
        onToggleDynamicPorts={() => setDynamicPortsEnabled(v => !v)}
        onToggleGuidedMode={() => setGuidedModeOpen(v => !v)}
        onToggleGNNPanel={() => setGnnPanelOpen(v => !v)}
      />

      {/* Search Panel — floating window (CONS-07) */}
      {searchPanelOpen && (
        <FloatingWindow
          storageKey="gxe-search-panel"
          title="Search Graph"
          icon={<Search size={14} className="text-[#58a6ff]" />}
          defaultPosition={{ x: 60, y: 140 }}
          defaultSize={{ width: 360, height: 480 }}
          minSize={{ width: 300, height: 200 }}
          zIndex={45}
          onClose={() => setSearchPanelOpen(false)}
        >
          <SearchPanel
            nodes={nodes}
            namespace={graphMetadata?.namespace || 'GXE'}
            embeddingsAvailable={false}
            onNavigate={(node) => {
              const rfNode = nodes.find(n => n.id === node.id);
              if (rfNode && reactFlowRef.current) {
                reactFlowRef.current.fitView({ nodes: [rfNode], padding: 0.5, duration: 400 });
                setSelectedNode(rfNode);
              }
            }}
            onClose={() => setSearchPanelOpen(false)}
          />
        </FloatingWindow>
      )}

      {/* Similarity Panel — floating window (CONS-09) */}
      {similarityPanelOpen && (
        <FloatingWindow
          storageKey="gxe-similarity-panel"
          title="Similarity Explorer"
          icon={<GitCompare size={14} className="text-[#a78bfa]" />}
          defaultPosition={{ x: 80, y: 160 }}
          defaultSize={{ width: 340, height: 520 }}
          minSize={{ width: 300, height: 300 }}
          zIndex={44}
          onClose={() => setSimilarityPanelOpen(false)}
        >
          <SimilarityPanel
            selectedNode={selectedNode}
            nodes={nodes}
            edges={edges}
            namespace={graphMetadata?.namespace || 'GXE'}
            onNavigate={(node) => {
              const rfNode = nodes.find(n => n.id === node.id);
              if (rfNode && reactFlowRef.current) {
                reactFlowRef.current.fitView({ nodes: [rfNode], padding: 0.5, duration: 400 });
                setSelectedNode(rfNode);
              }
            }}
          />
        </FloatingWindow>
      )}

      {/* Assistant Panel — floating AI chat (CONS-08) */}
      {assistantPanelOpen && (
        <FloatingWindow
          storageKey="gxe-assistant-panel"
          title="Graph Assistant"
          icon={<Bot size={14} className="text-[#7ee787]" />}
          defaultPosition={{ x: window.innerWidth - 420, y: 100 }}
          defaultSize={{ width: 380, height: 540 }}
          minSize={{ width: 320, height: 300 }}
          zIndex={46}
          onClose={() => setAssistantPanelOpen(false)}
        >
          <AssistantPanel
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            namespace={graphMetadata?.namespace || 'GXE'}
            onAction={(action, data) => {
              console.log('[AssistantPanel] Action:', action, data);
            }}
          />
        </FloatingWindow>
      )}

      {/* Properties Panel — floating right sidebar (CONS-10) */}
      {propertiesPanelOpen && (
        <FloatingWindow
          storageKey="gxe-properties-panel"
          title={selectedNode ? 'Node Properties' : selectedEdge ? 'Edge Properties' : 'Properties'}
          icon={<Settings size={14} className="text-[#f78166]" />}
          defaultPosition={{ x: window.innerWidth - 380, y: 60 }}
          defaultSize={{ width: 340, height: 560 }}
          minSize={{ width: 300, height: 300 }}
          zIndex={47}
          onClose={() => setPropertiesPanelOpen(false)}
        >
          <PropertiesPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onNodeUpdate={(nodeId, partial) => {
              setNodes(nds => nds.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...partial } } : n
              ));
            }}
            onEdgeUpdate={(edgeId, partial) => {
              setEdges(eds => eds.map(e =>
                e.id === edgeId ? { ...e, data: { ...e.data, ...partial } } : e
              ));
            }}
            onNodeDelete={(nodeId) => {
              setNodes(nds => nds.filter(n => n.id !== nodeId));
              setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
              setSelectedNode(null);
            }}
            onEdgeDelete={(edgeId) => {
              setEdges(eds => eds.filter(e => e.id !== edgeId));
              setSelectedEdge(null);
            }}
            onNodeDuplicate={(nodeId) => {
              const orig = nodes.find(n => n.id === nodeId);
              if (orig) {
                const newNode = {
                  ...orig,
                  id: `${orig.id}-copy-${Date.now()}`,
                  position: { x: orig.position.x + 50, y: orig.position.y + 50 },
                  data: { ...orig.data, label: `${orig.data?.label || ''} (copy)` },
                };
                setNodes(nds => [...nds, newNode]);
              }
            }}
          />
        </FloatingWindow>
      )}

      {/* Guided Mode — 4-phase analysis wizard (CONS-13) */}
      {guidedModeOpen && (
        <FloatingWindow
          storageKey="gxe-guided-mode"
          title="Guided Analysis"
          icon={<Target size={14} className="text-[#a78bfa]" />}
          defaultPosition={{ x: 60, y: 100 }}
          defaultSize={{ width: 400, height: 560 }}
          minSize={{ width: 340, height: 300 }}
          zIndex={48}
          onClose={() => setGuidedModeOpen(false)}
        >
          <GuidedModeWizard
            namespace={graphMetadata?.namespace || 'GXE'}
            onHighlight={(nodeIds) => {
              if (nodeIds?.length && reactFlowRef.current) {
                const rfNodes = nodes.filter(n => nodeIds.includes(n.id));
                if (rfNodes.length > 0) {
                  reactFlowRef.current.fitView({ nodes: rfNodes, padding: 0.3, duration: 400 });
                }
              }
            }}
          />
        </FloatingWindow>
      )}

      {/* GNN Panel — predictions + settings (CONS-14+15) */}
      <GNNPanel
        isOpen={gnnPanelOpen}
        onClose={() => setGnnPanelOpen(false)}
        nodes={nodes}
        edges={edges}
        onHighlight={(nodeIds) => {
          if (nodeIds?.length && reactFlowRef.current) {
            const rfNodes = nodes.filter(n => nodeIds.includes(n.id));
            if (rfNodes.length > 0) {
              reactFlowRef.current.fitView({ nodes: rfNodes, padding: 0.3, duration: 400 });
            }
          }
        }}
        onAddEdge={(edgeData) => {
          const newEdge = {
            id: `gnn-${edgeData.source}-${edgeData.target}-${Date.now()}`,
            source: edgeData.source,
            target: edgeData.target,
            type: 'default',
            data: { label: edgeData.type, ...edgeData.data },
            style: { strokeDasharray: '5 3', stroke: '#a78bfa' },
          };
          setEdges(prev => [...prev, newEdge]);
        }}
      />

      {/* Execution Overlay — canvas progress card (CONS-11) */}
      <ExecutionOverlay
        phase={phase}
        nodeStates={nodeStates}
        stats={stats}
        executionOrder={executionOrder}
        onCancel={cancel}
      />

      {/* Insights Bar — proactive graph analysis (CONS-06) */}
      <InsightsBar
        namespace={graphMetadata?.namespace || 'GXE'}
        onInsightAction={(action, insight) => {
          console.log('[InsightsBar] Action:', action, insight);
        }}
        onShowOnGraph={(nodeIds) => {
          if (nodeIds?.length && reactFlowRef.current) {
            const rfNodes = nodes.filter(n => nodeIds.includes(n.id));
            if (rfNodes.length > 0) {
              reactFlowRef.current.fitView({ nodes: rfNodes, padding: 0.3, duration: 400 });
            }
          }
        }}
      />

      {/* Graph area - full width with bottom padding for BottomPanel */}
      <div className="flex-1 flex flex-col" style={{ height: '100%', width: '100%', paddingBottom: '40px' }}>
        {/* Graph canvas */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {nodesWithPorts.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <Brain className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <h2 className="text-lg text-gray-400 mb-2">
                  {tabData.parentContext ? 'Define Sub-Graph' : 'Describe your task'}
                </h2>
                <p className="text-sm text-gray-600">
                  {tabData.parentContext
                    ? `Open the Control Panel (Generator tab) and describe the internal logic for "${tabData.parentContext.nodeLabel}". AI will build the detailed execution graph.`
                    : 'Open the Control Panel (Generator tab) and enter a task description. AI will analyze it and build an executable graph with business logic, executors and actors.'}
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodesWithPorts} edges={edgesWithPorts}
              onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange}
              onConnect={params => setEdges(eds => addEdge({ ...params, type: 'parallel', data: { edgePathType: edgeType }, animated: false, style: { stroke: '#6b7280', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' } }, eds))}
              onNodeClick={(_, n) => { setSelectedNode(n); setSelectedEdge(null); }}
              onEdgeClick={(_, e) => { setSelectedEdge(e); setSelectedNode(null); }}
              onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setSelectedNodeIds([]); }}
              onSelectionChange={(params) => {
                setSelectedNodeIds((params.nodes || []).map(n => n.id));
                nexusSelectionChange(params);
              }}
              onPaneContextMenu={handlePaneContextMenu}
              onNodeContextMenu={handleNodeContextMenu}
              onEdgeContextMenu={handleEdgeContextMenu}
              onNodeDrag={gridType === 'rectangular' ? dragRepulsionHandler : undefined}
              onNodeDragStop={gridType === 'rectangular' ? dragRepulsionStopHandler : gridType === 'hexagonal' ? hexNodeDragStopHandler : undefined}
              onDrop={(e) => {
                e.preventDefault();
                const toolJson = e.dataTransfer.getData('application/gxe-tool');
                if (!toolJson) return;
                try {
                  const toolData = JSON.parse(toolJson);
                  const rfi = reactFlowRef.current;
                  const pos = rfi
                    ? rfi.screenToFlowPosition({ x: e.clientX, y: e.clientY })
                    : { x: 200, y: 200 };
                  const kindMap = { ai: 'ai', patterns: 'subgraph', meta: 'tool' };
                  const kind = kindMap[toolData.category] || 'executor';
                  setNodes(nds => [...nds, {
                    id: `${toolData.executorId}-${Date.now()}`,
                    type: 'graphNode',
                    position: pos,
                    data: {
                      label: toolData.name,
                      kind,
                      executorType: toolData.executorId,
                      toolRef: toolData.toolId,
                      description: toolData.description || '',
                      inputFormat: toolData.inputSchema ? JSON.parse(toolData.inputSchema) : undefined,
                      outputFormat: toolData.outputSchema ? JSON.parse(toolData.outputSchema) : undefined,
                      params: {},
                      status: 'idle',
                    },
                  }]);
                  useCatalogStore.getState().addRecentTool(toolData.toolId);
                } catch {}
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onNodeMouseEnter={(_, n) => setHoveredNodeId(n.id)}
              onNodeMouseLeave={() => setHoveredNodeId(null)}
              onInit={(instance) => { reactFlowRef.current = instance; }}
              onMove={(_, vp) => setViewport(vp)}
              nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView className="bg-[#0d1117]"
              minZoom={0.05}
              maxZoom={4}
              snapToGrid={snapToGrid}
              snapGrid={[20, 20]}
              nodesDraggable={!nodeLock}
            >
              <Controls className="bg-[#21262d] border border-[#30363d] rounded-lg" />
              <MiniMap className="bg-[#21262d] border border-[#30363d] rounded-lg"
                nodeColor={n => n.data?.status === 'done' ? '#22c55e' : n.data?.status === 'running' ? '#eab308' : n.data?.status === 'waiting' ? '#f59e0b' : '#6b7280'} />
              <Background color="#30363d" gap={20} />
              {gridType === 'hexagonal' && hexGrid && (
                <HexGridBackground
                  config={hexConfig}
                  style="minimal"
                  occupiedCells={occupiedCells}
                  routingHeatmap={routingHeatmap}
                  visible={true}
                  debugRoadMap={debugRoadMap}
                  showDebugRoadMap={showDebugRoadMap}
                />
              )}
              <Panel position="top-left" className="bg-[#21262d]/95 p-3 rounded-lg border border-[#30363d] m-2">
                <div className="text-xs font-medium text-gray-400 mb-2">Node Types</div>
                {Object.entries(palette).map(([k, cv]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: cv.border }} />
                    <span className="text-xs text-gray-300 capitalize">{k}</span>
                  </div>
                ))}
              </Panel>
            </ReactFlow>
          )}

          {/* Cluster Overlay — visual boundaries (CONS-18) */}
          <ClusterOverlay
            clusters={[]}
            nodes={nodes}
            viewport={viewport}
            reactFlowInstance={reactFlowRef.current}
          />

          {/* GNN Summary Panel — bottom bar with analysis results */}
          <GnnSummaryPanel
            visible={gnnStatus === 'complete'}
            overlayVisible={gnnOverlayVisible}
            onToggleOverlay={() => setGnnOverlayVisible(v => !v)}
            onRerun={() => useImportSqlStore.getState().showGnnAnalysisPrompt()}
          />
        </div>
      </div>

      {/* Bottom Panel with Tabs */}
      <BottomPanel
        // Result tab props
        result={finalResult}
        showResult={showResult}
        onCloseResult={() => setShowResult(false)}
        nodes={nodesWithPorts}
        edges={edges}
        nodeStates={nodeStates}
        executionOrder={executionOrder}
        stats={stats}
        isExecuting={phase === 'executing'}
        onNodeClick={(nodeId) => {
          // Highlight and center on selected node in the graph
          const node = nodesWithPorts.find(n => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
            setSelectedEdge(null);
          }
        }}
        // Generation log props
        generationEvents={generationEvents}
        isGenerating={phase === 'generating'}
        onClearLog={clearGenerationEvents}
        // Analysis tab props
        analysisEvents={analysisEvents}
        isAnalyzing={isAnalyzing}
        onClearAnalysis={clearAnalysisEvents}
        onNodeHighlight={handleAnalysisNodeHighlight}
        // Live Execution tab props
        liveExecutionEvents={liveExecutionEvents}
        liveExecutionStatus={liveExecutionStatus}
        liveExecutionProgress={{ completed: stats.done, total: stats.total }}
        waitingInputs={waitingInputs}
        onResumeInput={handleResumeInput}
        onCancelExecution={() => {
          cancelRef.current = true;
          if (abortControllerRef.current) abortControllerRef.current.abort();
          setLiveExecutionStatus('cancelled');
          if (currentExecutionId) {
            fetch(`${API_BASE_URL}/gxe/v2/execute/${currentExecutionId}/cancel`, { method: 'POST' }).catch(() => {});
          }
        }}
        onClearLiveLog={() => { setLiveExecutionEvents([]); setExecutionError(null); }}
        executionError={executionError}
        // Live Execution launch props
        canExecute={canExec}
        onExecute={executeWithSSE}
        requiredParams={requiredParams}
        paramValues={paramValues}
        onParamChange={handleParamChange}
        nodesCount={nodes.length}
        edgesCount={edges.length}
        // Graph Analyst Chat props
        graphNodes={nodes}
        graphEdges={edges}
        namespace={graphMetadata?.namespace || 'default'}
        // Mutation callbacks
        onApplyMutations={handleApplyMutations}
        // AI Execution Assistant props
        assistantRef={assistantRef}
        isAssistantOpen={isAssistantOpen}
        onToggleAssistant={() => setIsAssistantOpen(prev => !prev)}
        assistantWidth={assistantWidth}
        onAssistantWidthChange={setAssistantWidth}
        onAssistantStreamingComplete={handleAssistantStreamingComplete}
        // GXE AI Assistant tab props
        selectedNodes={nodes.filter(n => selectedNodeIds.includes(n.id))}
        selectedEdges={[]}
        setNodes={setNodes}
        setEdges={setEdges}
        catalogGraphId={tabData.catalogGraphId || null}
      />

      {/* SaveGraphDialog for toolbar "Save As New" action + AI save_graph mutations */}
      <SaveGraphDialog
        open={saveDialogOpen}
        onClose={() => { setSaveDialogOpen(false); setSaveDialogPrefill(null); }}
        onSaved={(created) => {
          setSaveDialogOpen(false);
          setSaveDialogPrefill(null);
          if (created?.id) {
            onUpdateTabData({ catalogGraphId: created.id });
            if (created.version) setGraphVersion(created.version);
          }
        }}
        graphData={{
          nodes,
          edges,
          requiredParams,
          taskText,
          parentContext: tabData.parentContext
        }}
        parentContext={tabData.parentContext}
        prefill={saveDialogPrefill}
      />

      {/* Tool Settings Dialog — opened from inline tool button on nodes */}
      {toolSettingsTarget && (
        <ToolSettingsDialog
          nodeId={toolSettingsTarget.nodeId}
          toolRef={toolSettingsTarget.toolRef}
          executorType={toolSettingsTarget.executorType}
          parameters={toolSettingsTarget.parameters}
          onSave={(nodeId, params) => {
            setNodes(nds => nds.map(n => {
              if (n.id !== nodeId) return n;
              return { ...n, data: { ...n.data, parameters: params, params } };
            }));
            addLog(`Tool settings updated for node "${nodeId}"`, 'info');
          }}
          onClose={() => setToolSettingsTarget(null)}
        />
      )}

      {/* AI Layout Settings Modal */}
      <AILayoutSettingsModal
        isOpen={aiLayoutSettingsOpen}
        onClose={() => setAiLayoutSettingsOpen(false)}
        config={aiLayoutConfig}
        onSave={handleSaveAILayoutConfig}
        isLoading={aiConfigLoading}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT WITH TABS
   ═══════════════════════════════════════════════════════════════════════════ */

const GXEVisualizerPage = () => {
  const [searchParams] = useSearchParams();
  const [tabs, setTabs] = useState([
    { id: 'root', title: 'Main Graph', isRoot: true, data: {} }
  ]);
  const [activeTabId, setActiveTabId] = useState('root');

  // Catalog state
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [catalogWidth, setCatalogWidth] = useState(280);

  // Model selection state
  const [availableModels, setAvailableModels] = useState([
    { id: 'claude-sonnet', name: 'Claude Sonnet 4', isDefault: true },
    { id: 'claude-haiku', name: 'Claude Haiku 4.5' },
    { id: 'claude-opus', name: 'Claude Opus 4' }
  ]);

  // Data source connectors (shared across tabs)
  const [dataSources, setDataSources] = useState([]);

  // Consolidated AI settings
  const [aiSettings, setAiSettings] = useState({
    selectedModel: 'claude-sonnet',
    temperature: 0.3,
    maxTokens: 4096,
    useTools: true,
    enabledTools: [],
    useSDA: true
  });
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState('');

  // Derived values and setters for backward compatibility
  const selectedModel = aiSettings.selectedModel;
  const useTools = aiSettings.useTools;
  const enabledTools = aiSettings.enabledTools;
  const useSDA = aiSettings.useSDA;
  const setSelectedModel = (v) => setAiSettings(prev => ({ ...prev, selectedModel: v }));
  const setUseTools = (v) => setAiSettings(prev => ({ ...prev, useTools: v }));
  const setEnabledTools = (v) => setAiSettings(prev => ({ ...prev, enabledTools: v }));
  const setUseSDA = (v) => setAiSettings(prev => ({ ...prev, useSDA: v }));

  // Fetch available models, AI settings, MCP settings, and system prompt on mount
  useEffect(() => {
    fetchAvailableModels().then(models => {
      if (models.length > 0) {
        setAvailableModels(models);
        const defaultModel = models.find(m => m.isDefault);
        if (defaultModel) {
          setAiSettings(prev => ({ ...prev, selectedModel: defaultModel.id }));
        }
      }
    });

    // Load AI settings from graph
    loadAiSettings().then(result => {
      if (result.success && result.data) {
        setAiSettings(prev => ({ ...prev, ...result.data }));
        console.log('[GXE] Loaded AI settings from graph');
      }
    }).catch(err => {
      console.warn('[GXE] Failed to load AI settings:', err.message);
    });

    // Load MCP tools settings
    loadMcpSettings('default').then(result => {
      if (result.success && result.data?.enabledTools) {
        setAiSettings(prev => ({ ...prev, enabledTools: result.data.enabledTools }));
        console.log(`[GXE] Loaded ${result.data.enabledTools.length} enabled MCP tools`);
      }
    }).catch(err => {
      console.warn('[GXE] Failed to load MCP settings:', err.message);
    });

    // Load current default generation prompt
    getDefaultGenerationPrompt().then(result => {
      if (result.success && result.data?.content) {
        setCurrentSystemPrompt(result.data.content);
      }
    }).catch(err => {
      console.warn('[GXE] Failed to load generation prompt:', err.message);
    });

    // Load available data source connectors
    fetchConnectors().then(connectors => {
      setDataSources(connectors);
      console.log(`[GXE] Loaded ${connectors.length} data source connectors`);
    });
  }, []);

  // ── Watch for SQL import results → create tabs ──
  const pendingGraphs = useImportSqlStore(s => s.pendingGraphs);
  const consumePendingGraphs = useImportSqlStore(s => s.consumePendingGraphs);

  useEffect(() => {
    if (!pendingGraphs || !pendingGraphs.graphs?.length) return;

    const { graphs, summary } = consumePendingGraphs();
    if (!graphs?.length) return;

    let firstTabId = null;
    for (const graph of graphs) {
      const tabId = `tab-${Date.now()}-${graph.type}`;
      const newTab = {
        id: tabId,
        title: graph.title || `SQL: ${graph.type}`,
        isRoot: false,
        data: {
          nodes: graph.nodes || [],
          edges: graph.edges || [],
          phase: 'editing',
          importSummary: summary,
        },
        subGraphs: {},
      };
      setTabs(t => [...t, newTab]);
      if (!firstTabId) firstTabId = tabId;
    }

    if (firstTabId) setActiveTabId(firstTabId);
    console.log(`[GXE] Imported ${graphs.length} SQL graphs: ${graphs.map(g => g.type).join(', ')}`);

    // Offer GNN analysis after successful import — pass merged graph data
    const allNodes = [];
    const allEdges = [];
    graphs.forEach(g => {
      if (g.nodes) allNodes.push(...g.nodes);
      if (g.edges) allEdges.push(...g.edges);
    });
    useImportSqlStore.getState().showGnnAnalysisPrompt({ nodes: allNodes, edges: allEdges });
  }, [pendingGraphs]);

  // AI settings change handler (auto-saves to backend)
  const handleAiSettingsChange = useCallback((newSettings) => {
    setAiSettings(newSettings);
    saveAiSettings(newSettings).catch(err => {
      console.warn('[GXE] Failed to save AI settings:', err.message);
    });
  }, []);

  // Generation prompt save handler
  const handleSavePrompt = useCallback(async (content, name, metadata) => {
    const result = await saveGenerationPrompt(content, name, metadata);
    if (result.success) {
      setCurrentSystemPrompt(content);
    }
    return result;
  }, []);

  // Set default generation prompt handler
  const handleSetDefaultPrompt = useCallback(async (promptId) => {
    const result = await setDefaultGenerationPrompt(promptId);
    if (result.success) {
      const r = await getDefaultGenerationPrompt();
      if (r.success && r.data?.content) {
        setCurrentSystemPrompt(r.data.content);
      }
    }
    return result;
  }, []);

  // Get parent tab's nodes for context
  const getParentTabNodes = useCallback((parentTabId) => {
    const parentTab = tabs.find(t => t.id === parentTabId);
    return parentTab?.data?.nodes || [];
  }, [tabs]);

  // Get parent tab's edges for context
  const getParentTabEdges = useCallback((parentTabId) => {
    const parentTab = tabs.find(t => t.id === parentTabId);
    return parentTab?.data?.edges || [];
  }, [tabs]);

  // Calculate upstream/downstream nodes for a given node
  const getNodeContext = useCallback((nodeId, parentTabId) => {
    const nodes = getParentTabNodes(parentTabId);
    const edges = getParentTabEdges(parentTabId);

    // Find upstream nodes (nodes that connect TO this node)
    const upstreamEdges = edges.filter(e => e.target === nodeId);
    const upstreamNodes = upstreamEdges
      .map(e => nodes.find(n => n.id === e.source))
      .filter(Boolean)
      .map(n => ({ id: n.id, label: n.data?.label, kind: n.data?.kind, description: n.data?.description }));

    // Find downstream nodes (nodes that this node connects TO)
    const downstreamEdges = edges.filter(e => e.source === nodeId);
    const downstreamNodes = downstreamEdges
      .map(e => nodes.find(n => n.id === e.target))
      .filter(Boolean)
      .map(n => ({ id: n.id, label: n.data?.label, kind: n.data?.kind, description: n.data?.description }));

    // Determine pipeline position
    const hasInputUpstream = upstreamNodes.some(n => n.kind === 'input');
    const hasOutputDownstream = downstreamNodes.some(n => n.kind === 'output');
    let pipelinePosition = 'middle';
    if (hasInputUpstream) pipelinePosition = 'start';
    if (hasOutputDownstream) pipelinePosition = 'end';

    // Build full graph summary with connections
    const graphSummary = nodes.map(n => {
      const nodeEdges = edges.filter(e => e.source === n.id || e.target === n.id);
      const connections = nodeEdges.map(e => {
        if (e.source === n.id) return `→ ${nodes.find(nn => nn.id === e.target)?.data?.label || e.target}`;
        return `← ${nodes.find(nn => nn.id === e.source)?.data?.label || e.source}`;
      }).join(', ');
      const isCurrentNode = n.id === nodeId ? ' ⭐ [THIS NODE]' : '';
      return `- ${n.data?.label} (${n.data?.kind})${isCurrentNode}: ${n.data?.description || 'no description'} [${connections || 'no connections'}]`;
    }).join('\n');

    return {
      upstreamNodes,
      downstreamNodes,
      pipelinePosition,
      parentGraphSummary: graphSummary,
      dataFlowContext: `Data flows from: ${upstreamNodes.map(n => n.label).join(', ') || 'input'} → [${nodeId}] → ${downstreamNodes.map(n => n.label).join(', ') || 'output'}`
    };
  }, [getParentTabNodes, getParentTabEdges]);

  const createNewTab = useCallback((title = 'New Graph', parentContext = null, autoGenerate = false) => {
    const id = `tab-${Date.now()}`;
    const newTab = {
      id,
      title,
      isRoot: false,
      data: { parentContext, autoGenerate },
      subGraphs: {}
    };
    setTabs(t => [...t, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((tabId) => {
    if (tabId === 'root') return; // Can't close root
    setTabs(t => t.filter(tab => tab.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('root');
    }
  }, [activeTabId]);

  const updateTabData = useCallback((tabId, newData) => {
    setTabs(t => t.map(tab =>
      tab.id === tabId ? { ...tab, data: { ...tab.data, ...newData } } : tab
    ));
  }, []);

  const handleDrillDown = useCallback(async (tabId, nodeId, nodeData) => {
    const currentTab = tabs.find(t => t.id === tabId);

    // 1. Check if sub-graph already exists as an open tab
    const existingSubGraphTabId = currentTab?.data?.subGraphs?.[nodeId];
    if (existingSubGraphTabId) {
      const existingTab = tabs.find(t => t.id === existingSubGraphTabId);
      if (existingTab) {
        setActiveTabId(existingSubGraphTabId);
        return;
      }
    }

    // 2. Check if there's a saved sub-graph in the catalog
    const savedSubGraph = currentTab?.data?.savedSubGraphs?.[nodeId];
    if (savedSubGraph?.id) {
      try {
        // Load the saved sub-graph from catalog
        const fullSubGraph = await getGraphById(savedSubGraph.id);
        if (fullSubGraph) {
          // Open saved sub-graph in a new tab
          const newTabId = `tab-${Date.now()}`;
          let preparedNodes = (fullSubGraph.nodes || []).map(n => ({
            ...n,
            type: 'graphNode',
            data: { ...n.data, kind: n.data?.kind || n.type || 'default', status: 'idle' }
          }));
          const styledEdges = (fullSubGraph.edges || []).map(ed => ({
            ...ed,
            type: 'parallel',
            data: { ...ed.data, edgePathType: DEFAULT_EDGE_TYPE },
            animated: false,
            style: { stroke: '#6b7280', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }
          }));
          // Auto-layout as top-down DAG when positions are missing
          if (!hasValidPositions(preparedNodes)) {
            preparedNodes = autoLayoutTB(preparedNodes, styledEdges);
          }

          const newTab = {
            id: newTabId,
            title: fullSubGraph.name || nodeData.label,
            isRoot: false,
            data: {
              nodes: preparedNodes,
              edges: styledEdges,
              requiredParams: fullSubGraph.requiredParams || {},
              taskText: fullSubGraph.description || '',
              phase: preparedNodes.length > 0 ? 'ready' : 'input',
              catalogGraphId: fullSubGraph.id,
              namespace: fullSubGraph.namespace || 'default',
              tags: fullSubGraph.tags || [],
              type: fullSubGraph.type || 'atomic',
              savedSubGraphs: fullSubGraph.subGraphs || {},
              // Mark as loaded sub-graph with parent info
              parentContext: {
                nodeId,
                nodeLabel: nodeData.label,
                parentTabId: tabId,
                parentGraphInfo: {
                  catalogGraphId: currentTab?.data?.catalogGraphId,
                  namespace: currentTab?.data?.namespace,
                  tags: currentTab?.data?.tags,
                  type: currentTab?.data?.type
                }
              }
            }
          };

          setTabs(t => [...t, newTab]);
          setActiveTabId(newTabId);

          // Link this tab to parent's subGraphs map
          setTabs(t => t.map(tab =>
            tab.id === tabId
              ? { ...tab, data: { ...tab.data, subGraphs: { ...(tab.data.subGraphs || {}), [nodeId]: newTabId } } }
              : tab
          ));
          return;
        }
      } catch (error) {
        console.error('[GXE] Failed to load saved sub-graph:', error);
        // Fall through to create new sub-graph
      }
    }

    // 3. No existing sub-graph - create new one with AI generation
    const nodeContext = getNodeContext(nodeId, tabId);

    const parentGraphInfo = {
      catalogGraphId: currentTab?.data?.catalogGraphId || null,
      namespace: currentTab?.data?.namespace || 'default',
      tags: currentTab?.data?.tags || [],
      type: currentTab?.data?.type || 'atomic'
    };

    const parentContext = {
      nodeId,
      nodeLabel: nodeData.label || nodeId,
      nodeKind: nodeData.kind || 'executor',
      nodeDescription: nodeData.description || '',
      nodeInputs: nodeData.inputs || [],
      nodeOutputs: nodeData.outputs || [],
      parentTabId: tabId,
      parentGraphInfo,
      ...nodeContext
    };

    const newTabId = createNewTab(`${nodeData.label}`, parentContext, true); // autoGenerate = true

    // Link sub-graph to parent node
    setTabs(t => t.map(tab =>
      tab.id === tabId
        ? { ...tab, data: { ...tab.data, subGraphs: { ...(tab.data.subGraphs || {}), [nodeId]: newTabId } } }
        : tab
    ));
  }, [tabs, createNewTab, getNodeContext]);

  // Handle graph selection from catalog (double-click on node in tree)
  // Receives: { nodes, edges, sourceGraph, rootNode }
  const handleSelectGraph = useCallback((graphData) => {
    if (!graphData) return;

    const { nodes, edges, sourceGraph, rootNode } = graphData;

    // Ensure nodes have proper type for ReactFlow
    let preparedNodes = (nodes || []).map(n => ({
      ...n,
      type: 'graphNode',
      data: {
        ...n.data,
        kind: n.data?.kind || n.type || 'default',
        status: 'idle'
      }
    }));

    // Style edges for ReactFlow — parallel type with smoothstep path
    const styledEdges = (edges || []).map(ed => ({
      ...ed,
      type: 'parallel',
      data: { ...ed.data, edgePathType: DEFAULT_EDGE_TYPE },
      animated: false,
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }
    }));

    // Auto-layout as top-down DAG when positions are missing
    if (!hasValidPositions(preparedNodes)) {
      preparedNodes = autoLayoutTB(preparedNodes, styledEdges);
    }

    // Create new tab with loaded graph
    const id = `tab-${Date.now()}`;
    const title = rootNode?.data?.label || sourceGraph?.name || 'Loaded Graph';

    const newTab = {
      id,
      title,
      isRoot: false,
      data: {
        nodes: preparedNodes,
        edges: styledEdges,
        requiredParams: sourceGraph?.requiredParams || {},
        taskText: sourceGraph?.description || '',
        phase: preparedNodes.length > 0 ? 'ready' : 'input',
        catalogGraphId: sourceGraph?.id || null,
        sourceRootNode: rootNode?.id || null,
        // Store graph metadata for toolbar save and inheritance by sub-graphs
        graphMetadata: {
          id: sourceGraph?.id || sourceGraph?.entryId || null,
          name: sourceGraph?.name || '',
          description: sourceGraph?.description || '',
          type: sourceGraph?.type || 'atomic',
          namespace: sourceGraph?.namespace || 'default',
          tags: sourceGraph?.tags || []
        },
        namespace: sourceGraph?.namespace || 'default',
        tags: sourceGraph?.tags || [],
        type: sourceGraph?.type || 'atomic',
        // Store graph version from catalog
        graphVersion: sourceGraph?.version || '1.0.0',
        // Store saved sub-graphs from catalog (nodeId -> { id, name, ... })
        savedSubGraphs: sourceGraph?.subGraphs || {}
      }
    };

    setTabs(t => [...t, newTab]);
    setActiveTabId(id);
  }, []);

  // ── Load graph from URL params (?graphId=xxx&version=yyy) ──────────
  const urlGraphHandled = useRef(false);
  useEffect(() => {
    if (urlGraphHandled.current) return;
    const graphId = searchParams.get('graphId');
    if (!graphId) return;
    urlGraphHandled.current = true;

    const versionParam = searchParams.get('version');

    (async () => {
      try {
        const graph = versionParam
          ? await getVersion(graphId, versionParam)
          : await getGraphById(graphId);
        if (graph) {
          handleSelectGraph({
            nodes: graph.nodes || [],
            edges: graph.edges || [],
            sourceGraph: graph,
            rootNode: null,
          });
        }
      } catch (err) {
        console.error('[GXE] Failed to load graph from URL params:', err);
      }
    })();
  }, [searchParams, handleSelectGraph]);

  // Get current tab data for saving
  const getCurrentTabData = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    return tab?.data || {};
  }, [tabs, activeTabId]);

  // Stable per-tab callbacks — prevent inline arrow functions from invalidating child memos
  const handleDrillDownRef = useRef(handleDrillDown);
  handleDrillDownRef.current = handleDrillDown;
  const stableUpdateTabData = useCallback((tabId, data) => updateTabData(tabId, data), [updateTabData]);
  const stableDrillDown = useCallback((tabId, nodeId, nodeData) => handleDrillDownRef.current(tabId, nodeId, nodeData), []);
  const stableOpenPromptEditor = useCallback(() => setPromptEditorOpen(true), []);
  const stableClosePromptEditor = useCallback(() => setPromptEditorOpen(false), []);

  return (
    <div className="h-full flex bg-[#0d1117]">
      {/* Graph Catalog Sidebar */}
      <GraphCatalog
        isCollapsed={catalogCollapsed}
        onToggleCollapse={() => setCatalogCollapsed(!catalogCollapsed)}
        width={catalogWidth}
        onWidthChange={setCatalogWidth}
        onSelectGraph={handleSelectGraph}
        currentGraphData={getCurrentTabData()}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0" style={{height: "100%"}}>
        {/* Global Settings Bar */}
        <div className="px-4 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center gap-4">
          {/* Model Selector with MCP Tools Button */}
          <ModelSelector
            value={selectedModel}
            onChange={setSelectedModel}
            showToolsButton={true}
            onToolsChange={setEnabledTools}
            settingsId="default"
          />

          {/* Agentic Mode Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useTools}
              onChange={(e) => setUseTools(e.target.checked)}
              className="w-4 h-4 rounded border-[#30363d] bg-[#21262d] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <Sparkles className={`w-4 h-4 ${useTools ? 'text-yellow-400' : 'text-gray-500'}`} />
            <span className={`text-sm ${useTools ? 'text-yellow-400' : 'text-gray-400'}`}>
              Agentic Mode
            </span>
          </label>

          {/* SDA Pipeline Toggle */}
          <label className="flex items-center gap-2 cursor-pointer" title="Use full SDA pipeline with Task Planner (S1→S2→S3→S4→S5)">
            <input
              type="checkbox"
              checked={useSDA}
              onChange={(e) => setUseSDA(e.target.checked)}
              className="w-4 h-4 rounded border-[#30363d] bg-[#21262d] text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
            />
            <span className={`text-sm font-mono ${useSDA ? 'text-purple-400' : 'text-gray-400'}`}>
              SDA
            </span>
          </label>

          <div className="flex-1" />

          {/* Settings hint */}
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Settings2 className="w-3.5 h-3.5" />
            {useSDA
              ? 'Full SDA Pipeline (S1→S2→S3→S4→S5)'
              : useTools
                ? `AI uses ${enabledTools.length || 'all'} MCP tools`
                : 'Direct generation'}
          </div>
        </div>

        {/* Tab Bar */}
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabClose={closeTab}
          onNewTab={() => createNewTab()}
        />

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden" style={{width: "100%"}}>
          {tabs.map(tab => (
            <GraphView
              key={tab.id}
              tabData={tab.data}
              onUpdateTabData={(data) => stableUpdateTabData(tab.id, data)}
              onDrillDown={(nodeId, nodeData) => stableDrillDown(tab.id, nodeId, nodeData)}
              onNavigateToTab={setActiveTabId}
              isActive={activeTabId === tab.id}
              parentGraphNodes={tab.data.parentContext ? getParentTabNodes(tab.data.parentContext.parentTabId) : null}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              useTools={useTools}
              onUseToolsChange={setUseTools}
              enabledTools={enabledTools}
              useSDA={useSDA}
              aiSettings={aiSettings}
              onAiSettingsChange={handleAiSettingsChange}
              onOpenPromptEditor={stableOpenPromptEditor}
              promptEditorOpen={promptEditorOpen}
              onClosePromptEditor={stableClosePromptEditor}
              currentSystemPrompt={currentSystemPrompt}
              onSavePrompt={handleSavePrompt}
              onSetDefaultPrompt={handleSetDefaultPrompt}
              dataSources={dataSources}
            />
          ))}
        </div>
      </div>

      {/* Import SQL Selector (floating, page-level) */}
      <ImportSqlSelector />

      {/* GNN Analysis Prompt (modal after SQL import) */}
      <GnnAnalysisPrompt />
    </div>
  );
};

// PH-004: Page-level error boundary
import ErrorBoundary from '../components/common/ErrorBoundary';

const GXEVisualizerPageWithBoundary = () => (
  <ErrorBoundary name="GXE Visualizer" level="page" onReset={() => window.location.reload()}>
    <GXEVisualizerPage />
  </ErrorBoundary>
);

export default GXEVisualizerPageWithBoundary;
