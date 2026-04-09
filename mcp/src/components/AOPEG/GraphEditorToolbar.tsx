/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Graph Editor Toolbar
 * Top toolbar for graph editor actions - Dark Theme
 * With Immutable Graph God Mode integration
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import {
  Save,
  Play,
  Square,
  Download,
  Upload,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize,
  CheckCircle,
  AlertTriangle,
  FileText,
  Shield,
  ShieldAlert,
  LayoutGrid,
} from 'lucide-react';
import { ValidationResult } from '../../types/aopeg.types';
import { GodModeToggle } from '../ImmutableGraph';

interface GodModeSession {
  active: boolean;
  sessionId?: string;
  activatedAt?: string;
  autoDisableAt?: string;
  remainingMinutes?: number;
  reason?: string;
}

interface GraphEditorToolbarProps {
  // Graph info
  graphName: string;
  onNameChange: (name: string) => void;
  domain: string;
  onDomainChange: (domain: string) => void;

  // State
  isDirty: boolean;
  isSaving: boolean;
  isExecuting: boolean;
  isLayouting?: boolean;
  validationResult?: ValidationResult;

  // Actions
  onSave: () => void;
  onValidate: () => void;
  onExecute: () => void;
  onCancel: () => void;
  onExport: () => void;
  onImport: () => void;

  // View controls
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout?: () => void;

  // Edit controls (optional)
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;

  // God Mode (optional - for immutable graph operations)
  showGodMode?: boolean;
  onGodModeActivate?: (session: GodModeSession) => void;
  onGodModeDeactivate?: () => void;
  onGodModeError?: (error: string) => void;
}

const DOMAINS = ['common', 'ai', 'ingestion', 'rag', 'validation', 'storage', 'custom'];

export const GraphEditorToolbar: React.FC<GraphEditorToolbarProps> = ({
  graphName,
  onNameChange,
  domain,
  onDomainChange,
  isDirty,
  isSaving,
  isExecuting,
  isLayouting,
  validationResult,
  onSave,
  onValidate,
  onExecute,
  onCancel,
  onExport,
  onImport,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showGodMode = false,
  onGodModeActivate,
  onGodModeDeactivate,
  onGodModeError,
}) => {
  const [showGodModePanel, setShowGodModePanel] = useState(false);
  const [godModeActive, setGodModeActive] = useState(false);

  const handleGodModeActivate = (session: GodModeSession) => {
    setGodModeActive(true);
    setShowGodModePanel(false);
    onGodModeActivate?.(session);
  };

  const handleGodModeDeactivate = () => {
    setGodModeActive(false);
    onGodModeDeactivate?.();
  };

  return (
    <div className="h-14 bg-[#161b22] border-b border-[#30363d] flex items-center px-4 gap-4">
      {/* Graph Name */}
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-[#8b949e]" />
        <input
          type="text"
          value={graphName}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-base font-semibold bg-transparent border-none text-[#f0f6fc]
                     focus:outline-none focus:ring-2 focus:ring-[#388bfd] rounded px-2 py-1 w-64
                     placeholder-[#6e7681]"
          placeholder="Graph name..."
        />
      </div>

      {/* Domain selector */}
      <select
        value={domain}
        onChange={(e) => onDomainChange(e.target.value)}
        className="h-8 px-3 text-sm bg-[#21262d] border border-[#30363d] rounded-md text-[#f0f6fc]
                   focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent"
      >
        {DOMAINS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Status badges */}
      {isDirty && (
        <span className="text-xs text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded">
          Unsaved
        </span>
      )}

      {validationResult && (
        <span
          className={`
            flex items-center gap-1 text-xs px-2 py-1 rounded border
            ${validationResult.valid
              ? 'text-green-400 bg-green-500/20 border-green-500/30'
              : 'text-red-400 bg-red-500/20 border-red-500/30'}
          `}
        >
          {validationResult.valid ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          {validationResult.valid ? 'Valid' : `${validationResult.errors.length} errors`}
        </span>
      )}

      <div className="flex-1" />

      {/* Undo/Redo */}
      {onUndo && onRedo && (
        <div className="flex items-center gap-1 border-r border-[#30363d] pr-4">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc]
                       disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e]
                       transition-colors"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc]
                       disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8b949e]
                       transition-colors"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Zoom & Layout controls */}
      <div className="flex items-center gap-1 border-r border-[#30363d] pr-4">
        <button
          onClick={onZoomOut}
          className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomIn}
          className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onFitView}
          className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
          title="Fit view"
        >
          <Maximize className="w-4 h-4" />
        </button>
        {onAutoLayout && (
          <button
            onClick={onAutoLayout}
            disabled={isLayouting}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors
              ${isLayouting
                ? 'text-blue-400 bg-blue-500/20 cursor-wait'
                : 'text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc]'}
            `}
            title="Auto Layout (ELK Sugiyama)"
          >
            <LayoutGrid className={`w-4 h-4 ${isLayouting ? 'animate-spin' : ''}`} />
            {isLayouting ? 'Laying out...' : 'Auto Layout'}
          </button>
        )}
      </div>

      {/* Import/Export */}
      <div className="flex items-center gap-1 border-r border-[#30363d] pr-4">
        <button
          onClick={onImport}
          className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
          title="Import graph"
        >
          <Upload className="w-4 h-4" />
        </button>
        <button
          onClick={onExport}
          className="p-2 rounded text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] transition-colors"
          title="Export graph"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* God Mode Control */}
      {showGodMode && (
        <div className="relative flex items-center gap-1 border-r border-[#30363d] pr-4">
          <button
            onClick={() => setShowGodModePanel(!showGodModePanel)}
            className={`
              flex items-center gap-2 p-2 rounded transition-colors
              ${godModeActive
                ? 'text-red-400 bg-red-500/20 hover:bg-red-500/30 animate-pulse'
                : 'text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc]'}
            `}
            title={godModeActive ? 'God Mode Active - Click to manage' : 'Enable God Mode for destructive operations'}
          >
            {godModeActive ? (
              <ShieldAlert className="w-4 h-4" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            <span className="text-xs font-medium">
              {godModeActive ? 'GOD MODE' : 'Safe'}
            </span>
          </button>

          {/* God Mode Panel Dropdown */}
          {showGodModePanel && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowGodModePanel(false)}
              />
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[320px]">
                <GodModeToggle
                  onActivate={handleGodModeActivate}
                  onDeactivate={handleGodModeDeactivate}
                  onError={onGodModeError}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Main actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onValidate}
          className="flex items-center gap-2 h-8 px-3 text-sm rounded-md
                     text-[#f0f6fc] bg-[#21262d] border border-[#30363d]
                     hover:bg-[#30363d] hover:border-[#3d444d] transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Validate
        </button>

        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className={`
            flex items-center gap-2 h-8 px-3 text-sm rounded-md transition-colors
            ${isDirty && !isSaving
              ? 'text-[#f0f6fc] bg-blue-600 hover:bg-blue-700'
              : 'text-[#6e7681] bg-[#21262d] border border-[#30363d] cursor-not-allowed opacity-50'}
          `}
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        {isExecuting ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 h-8 px-4 text-sm rounded-md
                       text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            <Square className="w-4 h-4" />
            Cancel
          </button>
        ) : (
          <button
            onClick={onExecute}
            className="flex items-center gap-2 h-8 px-4 text-sm rounded-md
                       text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            Execute
          </button>
        )}
      </div>
    </div>
  );
};

export default GraphEditorToolbar;
