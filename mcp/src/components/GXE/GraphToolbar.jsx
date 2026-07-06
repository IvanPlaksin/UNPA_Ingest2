/**
 * GraphToolbar Component
 * Toolbar for GXE graph operations, layout formatting, and view controls.
 * Rendered at the top of each active graph tab.
 *
 * Layout logic is delegated to the parent via useGXELayout hook.
 * Advanced settings are organized into popovers for progressive disclosure.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Save, Copy, Shield, ShieldOff,
  ArrowDown, ArrowUp, ArrowRight, ArrowLeft,
  RotateCw, Maximize2, Grid3X3, Lock, Unlock,
  Spline, Database, LayoutGrid, Loader2,
  ChevronDown, Eye, Settings2, Sparkles, Settings, Hexagon, Bug
} from 'lucide-react';
import { BookOpen, Search, GitCompare, Bot } from 'lucide-react';
import useImportSqlStore from '../../stores/importSqlStore';
import { useCatalogStore } from '../../stores/catalogStore';
import { updateGraph, createVersion } from '../../services/graphCatalog.service';
import { LAYOUT_ALGORITHMS, EDGE_TYPES } from '../../utils/graph-layouts';

// ────────────────────────────────────────────────────────────────────────────
// Popover — lightweight click-outside-aware dropdown
// ────────────────────────────────────────────────────────────────────────────

const Popover = ({ trigger, children, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div
          className="absolute top-[calc(100%+4px)] bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl p-3 z-50"
          style={{
            minWidth: 220,
            [align === 'right' ? 'right' : 'left']: 0,
          }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// GraphToolbar
// ────────────────────────────────────────────────────────────────────────────

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
  onEdgeTypeChange,
  // Layout engine (from useGXELayout in parent)
  onApplyLayout,
  isLayouting,
  layoutOptions,
  onLayoutOptionsChange,
  // AI Layout (from useAILayout in parent)
  onApplyAILayout,
  isAILayouting,
  aiLayoutError,
  aiLayoutMetadata,
  onOpenAILayoutSettings,
  // Hex Layout (from useHexLayout in parent)
  gridType = 'rectangular',
  onGridTypeChange,
  hexOptions = { hexSize: 100, channelCapacity: 3, allow45Degree: true },
  onHexOptionsChange,
  onApplyHexLayout,
  onApplyAIHexLayout,
  isHexLayouting,
  isAIHexLayouting,
  aiHexLayoutError,
  aiHexLayoutMetadata,
  onSaveHexDefaults,
  // Debug road map overlay
  showDebugRoadMap = false,
  onDebugRoadMapToggle,
  // Search panel toggle
  onToggleSearch,
  // Similarity panel toggle
  onToggleSimilarity,
  // Assistant panel toggle
  onToggleAssistant,
  // Properties panel toggle
  onToggleProperties,
  // Dynamic ports toggle
  dynamicPortsEnabled,
  onToggleDynamicPorts,
  // Guided Mode toggle
  onToggleGuidedMode,
  // GNN Panel toggle
  onToggleGNNPanel,
}) => {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Layout option accessors
  const layoutAlgo = layoutOptions?.algorithm || 'dagre';
  const layoutDirection = layoutOptions?.direction || 'TB';
  const nodesep = layoutOptions?.nodeSpacing || 80;
  const ranksep = layoutOptions?.rankSpacing || 120;
  const algoInfo = LAYOUT_ALGORITHMS[layoutAlgo] || LAYOUT_ALGORITHMS.dagre;

  // Update parent layout options and trigger re-layout
  const updateAndApply = useCallback((patch) => {
    const newOpts = { ...layoutOptions, ...patch };
    onLayoutOptionsChange?.(newOpts);
    setTimeout(() => onApplyLayout?.(patch), 0);
  }, [layoutOptions, onLayoutOptionsChange, onApplyLayout]);

  const handleAlgoChange = useCallback((e) => {
    updateAndApply({ algorithm: e.target.value });
  }, [updateAndApply]);

  const handleDirectionClick = useCallback((dir) => {
    updateAndApply({ direction: dir });
  }, [updateAndApply]);

  const handleNodeSpacingChange = useCallback((e) => {
    const val = Math.max(20, Math.min(200, Number(e.target.value)));
    onLayoutOptionsChange?.({ ...layoutOptions, nodeSpacing: val });
  }, [layoutOptions, onLayoutOptionsChange]);

  const handleRankSpacingChange = useCallback((e) => {
    const val = Math.max(20, Math.min(200, Number(e.target.value)));
    onLayoutOptionsChange?.({ ...layoutOptions, rankSpacing: val });
  }, [layoutOptions, onLayoutOptionsChange]);

  const handleAutoLayout = useCallback(() => {
    onApplyLayout?.();
  }, [onApplyLayout]);

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
          nodes, edges,
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
        const result = await createVersion(catalogGraphId, {
          nodes, edges,
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

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.15, duration: 300 });
  }, [reactFlowInstance]);

  const dirButtons = [
    { dir: 'TB', icon: ArrowDown, label: 'TB' },
    { dir: 'BT', icon: ArrowUp, label: 'BT' },
    { dir: 'LR', icon: ArrowRight, label: 'LR' },
    { dir: 'RL', icon: ArrowLeft, label: 'RL' }
  ];

  // ── popover button style helper ──
  const popBtn = "flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#21262d] transition-colors text-[10px] cursor-pointer";

  return (
    <div className="flex items-center gap-1 px-3 border-b border-[#30363d] bg-[#161b22] select-none"
      style={{ height: 36, minHeight: 36, zIndex: 10 }}>

      {/* ══════ Graph Operations ══════ */}
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
            ? 'God Mode ON \u2014 Save overwrites current version'
            : 'God Mode OFF \u2014 Save creates new version'}
          style={{
            color: godMode ? '#f85149' : '#8b949e',
            boxShadow: godMode ? '0 0 6px rgba(248,81,73,0.4)' : 'none'
          }}>
          {godMode ? <Shield size={14} /> : <ShieldOff size={14} />}
        </button>

        {saveError && (
          <span className="text-[10px] text-red-400 ml-1 truncate max-w-[120px]" title={saveError}>
            {saveError}
          </span>
        )}
      </div>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ Auto Layout (prominent quick action) ══════ */}
      <button
        onClick={handleAutoLayout}
        disabled={isLayouting}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#21262d] transition-colors disabled:opacity-50"
        title="Auto Layout (apply current algorithm)"
        style={{
          color: isLayouting ? '#58a6ff' : '#3fb950',
          cursor: isLayouting ? 'wait' : 'pointer',
          background: isLayouting ? 'rgba(88,166,255,0.08)' : 'transparent',
        }}>
        {isLayouting
          ? <Loader2 size={13} className="animate-spin" />
          : <LayoutGrid size={13} />}
        <span className="text-[10px] font-medium">
          {isLayouting ? 'Laying out...' : 'Auto'}
        </span>
      </button>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ Layout Settings Popover ══════ */}
      <Popover
        trigger={
          <button className={popBtn} style={{ color: '#8b949e' }}
            title="Layout settings">
            <Settings2 size={13} />
            <span>Layout</span>
            <ChevronDown size={10} />
          </button>
        }>
        <div className="space-y-3">
          {/* Section: Grid Type Toggle */}
          <div className="pb-2 border-b border-[#30363d]">
            <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Grid Type</label>
            <div className="flex gap-1">
              <button
                onClick={() => onGridTypeChange?.('rectangular')}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded transition-colors"
                style={{
                  color: gridType === 'rectangular' ? '#fff' : '#8b949e',
                  background: gridType === 'rectangular' ? '#6366f1' : '#0d1117',
                  border: `1px solid ${gridType === 'rectangular' ? '#6366f1' : '#30363d'}`,
                }}>
                <Grid3X3 size={11} />
                Rect
              </button>
              <button
                onClick={() => onGridTypeChange?.('hexagonal')}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded transition-colors"
                style={{
                  color: gridType === 'hexagonal' ? '#fff' : '#8b949e',
                  background: gridType === 'hexagonal' ? '#6366f1' : '#0d1117',
                  border: `1px solid ${gridType === 'hexagonal' ? '#6366f1' : '#30363d'}`,
                }}>
                <Hexagon size={11} />
                Hex
              </button>
            </div>
          </div>

          {/* ── Rectangular mode settings ── */}
          {gridType === 'rectangular' && (
            <>
              {/* Section: Algorithm */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Algorithm</label>
                <select
                  value={layoutAlgo}
                  onChange={handleAlgoChange}
                  disabled={isLayouting}
                  className="w-full text-[11px] bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none cursor-pointer disabled:opacity-50">
                  {Object.entries(LAYOUT_ALGORITHMS).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
              </div>

              {/* Section: Direction */}
              {algoInfo.hasDirection && (
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Direction</label>
                  <div className="flex gap-1">
                    {dirButtons.map(({ dir, icon: Icon, label }) => (
                      <button
                        key={dir}
                        onClick={() => handleDirectionClick(dir)}
                        disabled={isLayouting}
                        className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50"
                        style={{
                          color: layoutDirection === dir ? '#58a6ff' : '#8b949e',
                          background: layoutDirection === dir ? 'rgba(88,166,255,0.15)' : '#0d1117',
                          border: `1px solid ${layoutDirection === dir ? '#58a6ff' : '#30363d'}`,
                        }}>
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section: Spacing */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Node Gap</label>
                  <input
                    type="number"
                    value={nodesep}
                    onChange={handleNodeSpacingChange}
                    className="w-full text-[11px] text-center bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none"
                    min={20} max={200} step={10}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Layer Gap</label>
                  <input
                    type="number"
                    value={ranksep}
                    onChange={handleRankSpacingChange}
                    className="w-full text-[11px] text-center bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none"
                    min={20} max={200} step={10}
                  />
                </div>
              </div>

              {/* Section: Edge Routing */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Edge Routing</label>
                <select
                  value={edgeType || 'default'}
                  onChange={(e) => onEdgeTypeChange?.(e.target.value)}
                  className="w-full text-[11px] bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none cursor-pointer">
                  {Object.entries(EDGE_TYPES).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
              </div>

              {/* Re-apply button */}
              <button
                onClick={() => onApplyLayout?.()}
                disabled={isLayouting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(63,185,80,0.15)',
                  color: '#3fb950',
                  border: '1px solid rgba(63,185,80,0.3)',
                }}>
                <RotateCw size={12} />
                Re-apply Layout
              </button>
            </>
          )}

          {/* ── Hexagonal mode settings ── */}
          {gridType === 'hexagonal' && (
            <>
              {/* Hex Cell Size */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-300">Cell Size</label>
                <input
                  type="number"
                  value={hexOptions.hexSize}
                  onChange={(e) => onHexOptionsChange?.({ hexSize: parseInt(e.target.value) || 100 })}
                  min={60} max={200} step={10}
                  className="w-16 text-[11px] text-center bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none"
                />
              </div>

              {/* Channel Capacity */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-300">Channel Capacity</label>
                <input
                  type="number"
                  value={hexOptions.channelCapacity}
                  onChange={(e) => onHexOptionsChange?.({ channelCapacity: parseInt(e.target.value) || 3 })}
                  min={1} max={10}
                  className="w-16 text-[11px] text-center bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none"
                />
              </div>

              {/* Edge Routing */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Edge Routing</label>
                <select
                  value={hexOptions.hexEdgeRouting || 'default'}
                  onChange={(e) => onHexOptionsChange?.({ hexEdgeRouting: e.target.value })}
                  className="w-full text-[11px] bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-gray-300 focus:border-[#58a6ff] outline-none cursor-pointer">
                  {Object.entries(EDGE_TYPES).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                  <option value="hex-roadmap">Road Map</option>
                </select>
              </div>

              {/* Apply Hex Layout button */}
              <button
                onClick={() => onApplyHexLayout?.()}
                disabled={isHexLayouting || isAIHexLayouting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.3)',
                }}>
                {isHexLayouting ? <Loader2 size={12} className="animate-spin" /> : <Hexagon size={12} />}
                Apply Hex Layout
              </button>

              {/* AI Hex Layout button */}
              <button
                onClick={() => onApplyAIHexLayout?.()}
                disabled={isAIHexLayouting || isHexLayouting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                title={aiHexLayoutError
                  ? `AI Hex error: ${aiHexLayoutError}`
                  : aiHexLayoutMetadata
                    ? `Last: ${aiHexLayoutMetadata.model}, ${aiHexLayoutMetadata.layoutTime}ms, ${aiHexLayoutMetadata.tokensUsed} tokens`
                    : 'Use AI (Claude) to compute optimal hex positions'}
                style={{
                  background: isAIHexLayouting ? 'rgba(168,85,247,0.15)' : 'rgba(139,92,246,0.12)',
                  color: aiHexLayoutError ? '#f85149' : '#a78bfa',
                  border: `1px solid ${aiHexLayoutError ? 'rgba(248,81,73,0.3)' : 'rgba(139,92,246,0.3)'}`,
                }}>
                {isAIHexLayouting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI Hex Layout
              </button>
              {aiHexLayoutMetadata && !isAIHexLayouting && (
                <span className="text-[9px] text-gray-600 text-center block" title={`${aiHexLayoutMetadata.model}: ${aiHexLayoutMetadata.inputTokens}+${aiHexLayoutMetadata.outputTokens} tokens`}>
                  AI: {aiHexLayoutMetadata.layoutTime}ms · {aiHexLayoutMetadata.tokensUsed} tok
                </span>
              )}

              {/* Save hex settings as default */}
              <button
                onClick={() => onSaveHexDefaults?.()}
                className="w-full px-3 py-1 text-[10px] rounded transition-colors"
                style={{
                  background: '#0d1117',
                  color: '#8b949e',
                  border: '1px solid #30363d',
                }}>
                Save as Default
              </button>

              {/* Debug: Road Map overlay — only shown when Road Map routing is active */}
              {hexOptions.hexEdgeRouting === 'hex-roadmap' && (
                <div className="pt-1 border-t border-[#30363d]">
                  <label className="text-[9px] uppercase tracking-wider text-gray-500 mb-1 block">Debug</label>
                  <button
                    onClick={() => onDebugRoadMapToggle?.()}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d] transition-colors text-[11px]"
                    title="Show/hide road map graph overlay (rails, ports, landing points)"
                    style={{ color: showDebugRoadMap ? '#f59e0b' : '#6b7280' }}>
                    <Bug size={13} />
                    <span className="flex-1 text-left">Road Map Overlay</span>
                    {showDebugRoadMap && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">ON</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Popover>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ View Popover ══════ */}
      <Popover
        trigger={
          <button className={popBtn} style={{ color: '#8b949e' }}
            title="View settings">
            <Eye size={13} />
            <span>View</span>
            <ChevronDown size={10} />
          </button>
        }>
        <div className="space-y-1.5" style={{ minWidth: 180 }}>
          {/* Fit View */}
          <button
            onClick={handleFitView}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d] transition-colors text-[11px] text-gray-300">
            <Maximize2 size={13} style={{ color: '#8b949e' }} />
            Fit to View
          </button>

          {/* Snap to Grid */}
          <button
            onClick={() => onSnapToGridToggle?.()}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d] transition-colors text-[11px]"
            style={{ color: snapToGrid ? '#58a6ff' : '#c9d1d9' }}>
            <Grid3X3 size={13} />
            <span className="flex-1 text-left">Snap to Grid</span>
            {snapToGrid && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">ON</span>}
          </button>

          {/* Lock Nodes */}
          <button
            onClick={() => onNodeLockToggle?.()}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d] transition-colors text-[11px]"
            style={{ color: nodeLock ? '#d29922' : '#c9d1d9' }}>
            {nodeLock ? <Lock size={13} /> : <Unlock size={13} />}
            <span className="flex-1 text-left">Lock Nodes</span>
            {nodeLock && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">ON</span>}
          </button>
        </div>
      </Popover>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ Import SQL ══════ */}
      <button
        onClick={() => useImportSqlStore.getState().openDialog()}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Import from SQL Server"
        style={{ color: '#d2a8ff', fontSize: 13 }}>
        <Database size={13} />
        <span className="text-[10px]">SQL</span>
      </button>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ AI Layout ══════ */}
      <button
        onClick={() => onApplyAILayout?.()}
        disabled={isAILayouting}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#21262d] transition-colors disabled:opacity-50"
        title={aiLayoutError
          ? `AI Layout error: ${aiLayoutError}`
          : aiLayoutMetadata
            ? `Last: ${aiLayoutMetadata.model}, ${aiLayoutMetadata.layoutTime}ms, ${aiLayoutMetadata.tokensUsed} tokens`
            : 'Compute layout using AI (Claude)'}
        style={{
          color: isAILayouting ? '#c084fc' : aiLayoutError ? '#f85149' : '#a78bfa',
          cursor: isAILayouting ? 'wait' : 'pointer',
          background: isAILayouting ? 'rgba(168,85,247,0.08)' : 'transparent',
        }}>
        {isAILayouting
          ? <Loader2 size={13} className="animate-spin" />
          : <Sparkles size={13} />}
        <span className="text-[10px] font-medium">
          {isAILayouting ? 'AI...' : 'AI Layout'}
        </span>
      </button>

      {/* AI Layout Settings */}
      <button
        onClick={() => onOpenAILayoutSettings?.()}
        className="p-1 rounded hover:bg-[#21262d] transition-colors"
        title="AI Layout settings (model, prompt, temperature)"
        style={{ color: '#8b949e' }}>
        <Settings size={12} />
      </button>

      <div className="w-px h-5 bg-[#30363d] mx-1" />

      {/* ══════ Tool Catalog ══════ */}
      <button
        onClick={() => useCatalogStore.getState().toggle()}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Tool Catalog (Ctrl+K)"
        style={{ color: '#f0883e', fontSize: 13 }}>
        <BookOpen size={13} />
        <span className="text-[10px]">Catalog</span>
      </button>

      {/* ══════ Search ══════ */}
      <button
        onClick={onToggleSearch}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Search Graph (Ctrl+F)"
        style={{ color: '#58a6ff', fontSize: 13 }}>
        <Search size={13} />
        <span className="text-[10px]">Search</span>
      </button>

      {/* ══════ Similarity ══════ */}
      <button
        onClick={onToggleSimilarity}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Similarity Explorer"
        style={{ color: '#a78bfa', fontSize: 13 }}>
        <GitCompare size={13} />
        <span className="text-[10px]">Similar</span>
      </button>

      {/* ══════ AI Assistant ══════ */}
      <button
        onClick={onToggleAssistant}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="AI Graph Assistant"
        style={{ color: '#7ee787', fontSize: 13 }}>
        <Bot size={13} />
        <span className="text-[10px]">Assistant</span>
      </button>

      {/* ══════ Guided Mode ══════ */}
      <button
        onClick={onToggleGuidedMode}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Guided Analysis (4 phases)"
        style={{ color: '#c084fc', fontSize: 13 }}>
        <Search size={13} />
        <span className="text-[10px]">Guided</span>
      </button>

      {/* ══════ GNN ══════ */}
      <button
        onClick={onToggleGNNPanel}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="GNN Intelligence (predictions + settings)"
        style={{ color: '#a78bfa', fontSize: 13 }}>
        <Sparkles size={13} />
        <span className="text-[10px]">GNN</span>
      </button>

      {/* ══════ Properties ══════ */}
      <button
        onClick={onToggleProperties}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#30363d] transition-colors"
        title="Properties Panel (Ctrl+I)"
        style={{ color: '#f78166', fontSize: 13 }}>
        <Settings size={13} />
        <span className="text-[10px]">Props</span>
      </button>

      {/* ══════ Dynamic Ports Toggle ══════ */}
      <button
        onClick={onToggleDynamicPorts}
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${dynamicPortsEnabled ? 'bg-cyan-500/20 ring-1 ring-cyan-500/40' : 'hover:bg-[#30363d]'}`}
        title="Toggle dynamic multi-handle ports"
        style={{ color: dynamicPortsEnabled ? '#22d3ee' : '#8b949e', fontSize: 13 }}>
        <Spline size={13} />
        <span className="text-[10px]">Ports</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout status (right-aligned) */}
      {isLayouting && (
        <span className="text-[10px] text-blue-400 ml-1 animate-pulse">layouting...</span>
      )}
      {isAILayouting && (
        <span className="text-[10px] text-purple-400 ml-1 animate-pulse">AI computing...</span>
      )}
      {aiLayoutMetadata && !isAILayouting && (
        <span className="text-[9px] text-gray-600 ml-1" title={`${aiLayoutMetadata.model}: ${aiLayoutMetadata.inputTokens}+${aiLayoutMetadata.outputTokens} tokens`}>
          AI: {aiLayoutMetadata.layoutTime}ms
        </span>
      )}
    </div>
  );
};

export default GraphToolbar;
