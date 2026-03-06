/**
 * GraphToolbar Component
 * Toolbar for GXE graph operations, layout formatting, and view controls.
 * Rendered at the top of each active graph tab.
 */

import React, { useState, useCallback } from 'react';
import {
  Save, Copy, Shield, ShieldOff,
  ArrowDown, ArrowUp, ArrowRight, ArrowLeft,
  RotateCw, Maximize2, Grid3X3, Lock, Unlock,
  Spline, Database
} from 'lucide-react';
import useImportSqlStore from '../../stores/importSqlStore';
import dagre from 'dagre';
import { updateGraph, createVersion } from '../../services/graphCatalog.service';
import {
  LAYOUT_ALGORITHMS,
  EDGE_TYPES,
  applyForceLayout,
  applyCircularLayout,
  applyRadialLayout,
  applyGridLayout,
  applyTreeLayout,
  applyElkLayeredLayout,
  applyElkStressLayout,
  applyElkForceLayout,
  applyElkMrTreeLayout,
  applyElkRadialLayout,
  applyElkRoutes
} from '../../utils/graph-layouts';

// No longer needed — version numbers are integers managed by the backend

// Dagre layout helper (kept separate as it uses the dagre library)
// Node dimensions match actual rendered sizes: regular ~260x130, tool ~190x70
const applyDagreLayout = (nodes, edges, direction = 'TB', nodesep = 50, ranksep = 80) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep, nodesep, align: 'UL' });

  nodes.forEach(node => {
    const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
    g.setNode(node.id, { width: isSmall ? 190 : 260, height: isSmall ? 70 : 130 });
  });

  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
    return {
      ...node,
      position: {
        x: pos.x - (isSmall ? 95 : 130),
        y: pos.y - (isSmall ? 35 : 65)
      }
    };
  });
};

const GraphToolbar = ({
  graphMetadata,
  catalogGraphId,
  graphVersion,
  nodes,
  edges,
  requiredParams,
  setNodes,
  setEdges,
  reactFlowInstance,
  godMode,
  onGodModeToggle,
  onSaveComplete,
  onVersionChange,
  onOpenSaveDialog,
  snapToGrid,
  onSnapToGridToggle,
  nodeLock,
  onNodeLockToggle,
  edgeType,
  onEdgeTypeChange
}) => {
  const [layoutAlgo, setLayoutAlgo] = useState('dagre');
  const [layoutDirection, setLayoutDirection] = useState('TB');
  const [nodesep, setNodesep] = useState(80);
  const [ranksep, setRanksep] = useState(120);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [layouting, setLayouting] = useState(false);

  const algoInfo = LAYOUT_ALGORITHMS[layoutAlgo] || LAYOUT_ALGORITHMS.dagre;

  // Apply layout with selected algorithm (supports both sync and async)
  const handleApplyLayout = useCallback(async (algoOverride, dirOverride) => {
    const algo = algoOverride || layoutAlgo;
    const dir = dirOverride || layoutDirection;

    if (algoOverride) setLayoutAlgo(algoOverride);
    if (dirOverride) setLayoutDirection(dirOverride);

    const algoMeta = LAYOUT_ALGORITHMS[algo];
    if (algoMeta?.async) setLayouting(true);

    const elkOpts = { direction: dir, nodesep, ranksep };

    try {
      let layouted;
      const isElk = algo.startsWith('elk-');

      switch (algo) {
        case 'elk-layered':
          layouted = await applyElkLayeredLayout(nodes, edges, elkOpts);
          break;
        case 'elk-stress':
          layouted = await applyElkStressLayout(nodes, edges, elkOpts);
          break;
        case 'elk-force':
          layouted = await applyElkForceLayout(nodes, edges, elkOpts);
          break;
        case 'elk-mrtree':
          layouted = await applyElkMrTreeLayout(nodes, edges, elkOpts);
          break;
        case 'elk-radial':
          layouted = await applyElkRadialLayout(nodes, edges, elkOpts);
          break;
        case 'force':
          layouted = applyForceLayout(nodes, edges, {
            iterations: 80,
            repulsion: ranksep * 4,
            attraction: 0.03
          });
          break;
        case 'circular':
          layouted = applyCircularLayout(nodes, edges, { sortByTopology: true });
          break;
        case 'radial':
          layouted = applyRadialLayout(nodes, edges, { ringSpacing: ranksep * 2.5 });
          break;
        case 'grid':
          layouted = applyGridLayout(nodes, edges, {
            cellWidth: nodesep * 4 + 80,
            cellHeight: ranksep + 60,
            sortByTopology: true
          });
          break;
        case 'tree':
          layouted = applyTreeLayout(nodes, edges, {
            direction: dir,
            nodeWidth: 260,
            nodeHeight: 130,
            siblingGap: nodesep
          });
          break;
        case 'dagre':
        default:
          layouted = applyDagreLayout(nodes, edges, dir, nodesep, ranksep);
          break;
      }

      // ELK returns { nodes, edgeRoutes }; non-ELK returns plain array
      if (isElk && layouted.nodes) {
        setNodes(layouted.nodes);
        // Inject ELK-computed edge routes for polyline rendering
        if (setEdges && layouted.edgeRoutes?.size > 0) {
          setEdges(es => applyElkRoutes(es, layouted.edgeRoutes));
        }
      } else {
        setNodes(isElk ? (layouted.nodes || layouted) : layouted);
        // Clear any previous ELK routes when switching to non-ELK layout
        if (setEdges) {
          setEdges(es => es.map(e => {
            if (e.data?.elkRoute) {
              const { elkRoute, ...rest } = e.data;
              return { ...e, data: rest };
            }
            return e;
          }));
        }
      }

      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.15, duration: 300 });
      }, 50);
    } catch (err) {
      console.error('Layout failed:', err);
    } finally {
      setLayouting(false);
    }
  }, [nodes, edges, layoutAlgo, layoutDirection, nodesep, ranksep, setNodes, setEdges, reactFlowInstance]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!catalogGraphId) {
      onOpenSaveDialog?.();
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      if (godMode) {
        const updated = await updateGraph(catalogGraphId, {
          nodes,
          edges,
          requiredParams: requiredParams || {},
          version: graphVersion,
          name: graphMetadata?.name,
          description: graphMetadata?.description,
          type: graphMetadata?.type,
          namespace: graphMetadata?.namespace,
          tags: graphMetadata?.tags
        });
        onSaveComplete?.(updated);
      } else {
        // Create a new version under the same CatalogEntry
        const result = await createVersion(catalogGraphId, {
          nodes,
          edges,
          requiredParams: requiredParams || {},
          changelog: 'Saved from GXE editor'
        });
        onVersionChange?.(result.versionNumber);
        onSaveComplete?.(result);
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err.message || 'Save failed');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [catalogGraphId, godMode, nodes, edges, requiredParams, graphVersion, graphMetadata, onSaveComplete, onVersionChange, onOpenSaveDialog]);

  // Fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.15, duration: 300 });
  }, [reactFlowInstance]);

  // Handle algorithm change from dropdown
  const handleAlgoChange = useCallback((e) => {
    const newAlgo = e.target.value;
    setLayoutAlgo(newAlgo);
    handleApplyLayout(newAlgo);
  }, [handleApplyLayout]);

  // Handle direction button click
  const handleDirectionClick = useCallback((dir) => {
    setLayoutDirection(dir);
    handleApplyLayout(null, dir);
  }, [handleApplyLayout]);

  const dirButtons = [
    { dir: 'TB', icon: ArrowDown, title: 'Top → Bottom' },
    { dir: 'BT', icon: ArrowUp, title: 'Bottom → Top' },
    { dir: 'LR', icon: ArrowRight, title: 'Left → Right' },
    { dir: 'RL', icon: ArrowLeft, title: 'Right → Left' }
  ];

  return (
    <div className="flex items-center gap-1 px-3 border-b border-[#30363d] bg-[#161b22] select-none"
      style={{ height: 36, minHeight: 36, zIndex: 10 }}>

      {/* ── Graph Operations ── */}
      <div className="flex items-center gap-1">
        {/* Version badge */}
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
          style={{
            borderColor: catalogGraphId ? '#30363d' : '#d29922',
            color: catalogGraphId ? '#8b949e' : '#d29922',
            background: catalogGraphId ? 'transparent' : 'rgba(210,153,34,0.1)'
          }}
          title={catalogGraphId ? `Graph ID: ${catalogGraphId}` : 'Unsaved graph'}>
          {catalogGraphId ? `v${graphVersion || 1}` : 'unsaved'}
        </span>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-1 rounded hover:bg-[#30363d] transition-colors disabled:opacity-40"
          title={godMode
            ? (catalogGraphId ? 'Save (overwrite current version)' : 'Save new graph')
            : (catalogGraphId ? 'Save (create new version)' : 'Save new graph')}
          style={{ color: saving ? '#484f58' : '#3fb950' }}>
          <Save size={14} />
        </button>

        {/* Save As New */}
        <button
          onClick={() => onOpenSaveDialog?.()}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title="Save as new graph"
          style={{ color: '#8b949e' }}>
          <Copy size={14} />
        </button>

        {/* God Mode toggle */}
        <button
          onClick={() => onGodModeToggle?.()}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title={godMode
            ? 'God Mode ON — Save overwrites current version'
            : 'God Mode OFF — Save creates new version'}
          style={{
            color: godMode ? '#f85149' : '#8b949e',
            boxShadow: godMode ? '0 0 6px rgba(248,81,73,0.4)' : 'none'
          }}>
          {godMode ? <Shield size={14} /> : <ShieldOff size={14} />}
        </button>

        {/* Save error tooltip */}
        {saveError && (
          <span className="text-[10px] text-red-400 ml-1 truncate max-w-[120px]" title={saveError}>
            {saveError}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ── Layout Tools ── */}
      <div className="flex items-center gap-1">
        {/* Algorithm selector */}
        <select
          value={layoutAlgo}
          onChange={handleAlgoChange}
          className="text-[10px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 focus:border-[#58a6ff] outline-none cursor-pointer"
          style={{ height: 22, padding: '0 4px', maxWidth: 120 }}
          title="Layout algorithm">
          {Object.entries(LAYOUT_ALGORITHMS).map(([key, info]) => (
            <option key={key} value={key}>{info.label}</option>
          ))}
        </select>

        {/* Direction buttons — only for algorithms that support direction */}
        {algoInfo.hasDirection && dirButtons.map(({ dir, icon: Icon, title }) => (
          <button
            key={dir}
            onClick={() => handleDirectionClick(dir)}
            className="p-1 rounded hover:bg-[#30363d] transition-colors"
            title={title}
            style={{
              color: layoutDirection === dir ? '#58a6ff' : '#8b949e',
              background: layoutDirection === dir ? 'rgba(88,166,255,0.1)' : 'transparent'
            }}>
            <Icon size={13} />
          </button>
        ))}

        {/* Node Spacing */}
        <div className="flex items-center gap-0.5 ml-1">
          <span className="text-[9px] text-gray-500" title="Node spacing">NS</span>
          <input
            type="number"
            value={nodesep}
            onChange={(e) => setNodesep(Math.max(20, Math.min(200, Number(e.target.value))))}
            className="w-10 text-[10px] text-center bg-[#0d1117] border border-[#30363d] rounded text-gray-300 focus:border-[#58a6ff] outline-none"
            style={{ height: 20, padding: '0 2px' }}
            min={20} max={200} step={10}
          />
        </div>

        {/* Rank Spacing */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-500" title="Layer spacing">RS</span>
          <input
            type="number"
            value={ranksep}
            onChange={(e) => setRanksep(Math.max(20, Math.min(200, Number(e.target.value))))}
            className="w-10 text-[10px] text-center bg-[#0d1117] border border-[#30363d] rounded text-gray-300 focus:border-[#58a6ff] outline-none"
            style={{ height: 20, padding: '0 2px' }}
            min={20} max={200} step={10}
          />
        </div>

        {/* Re-apply Layout */}
        <button
          onClick={() => handleApplyLayout()}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title="Re-apply layout with current settings"
          style={{ color: '#8b949e' }}>
          <RotateCw size={13} />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ── View Tools ── */}
      <div className="flex items-center gap-1">
        {/* Fit View */}
        <button
          onClick={handleFitView}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title="Fit view to all nodes"
          style={{ color: '#8b949e' }}>
          <Maximize2 size={13} />
        </button>

        {/* Snap to Grid */}
        <button
          onClick={() => onSnapToGridToggle?.()}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title={snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
          style={{
            color: snapToGrid ? '#58a6ff' : '#8b949e',
            background: snapToGrid ? 'rgba(88,166,255,0.1)' : 'transparent'
          }}>
          <Grid3X3 size={13} />
        </button>

        {/* Lock Nodes */}
        <button
          onClick={() => onNodeLockToggle?.()}
          className="p-1 rounded hover:bg-[#30363d] transition-colors"
          title={nodeLock ? 'Nodes locked (click to unlock)' : 'Nodes unlocked (click to lock)'}
          style={{
            color: nodeLock ? '#d29922' : '#8b949e',
            background: nodeLock ? 'rgba(210,153,34,0.1)' : 'transparent'
          }}>
          {nodeLock ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ── Edge Routing ── */}
      <div className="flex items-center gap-1">
        <Spline size={12} style={{ color: '#8b949e' }} />
        <select
          value={edgeType || 'default'}
          onChange={(e) => onEdgeTypeChange?.(e.target.value)}
          className="text-[10px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 focus:border-[#58a6ff] outline-none cursor-pointer"
          style={{ height: 22, padding: '0 4px', maxWidth: 110 }}
          title="Edge routing style">
          {Object.entries(EDGE_TYPES).map(([key, info]) => (
            <option key={key} value={key}>{info.label}</option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ── Import SQL ── */}
      <button
        onClick={() => useImportSqlStore.getState().openDialog()}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Import from SQL Server"
        style={{ color: '#d2a8ff', fontSize: 11 }}>
        <Database size={13} />
        <span className="text-[10px]">SQL</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout spinner */}
      {layouting && (
        <span className="text-[10px] text-blue-400 ml-1 animate-pulse">layouting...</span>
      )}
    </div>
  );
};

export default GraphToolbar;
