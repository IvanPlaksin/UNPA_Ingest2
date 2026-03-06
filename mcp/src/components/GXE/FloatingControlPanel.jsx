/**
 * FloatingControlPanel - Draggable/resizable floating window with tabs
 *
 * Tab 1 (Execution): Input Parameters, Execution Log, Execute/Cancel buttons
 * Tab 2 (Generator): Task input, Build Graph button
 * Tab 3 (Graph Info): Graph metadata editing (name, description, type, namespace, tags)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play, Pause, Send, Upload, Terminal, Loader2, Eye, X,
  CheckCircle, AlertCircle, Brain, Zap, ChevronRight, Clock,
  GripVertical, Maximize2, Minimize2, Move, FileCode, Tag, Folder,
  Atom, Wrench, Briefcase, Layers, Plus, RotateCcw, Sparkles,
  Settings2, Thermometer, Hash, FileText, Database, HardDrive,
  Server, Globe, Type
} from 'lucide-react';

// Graph type definitions (matching SaveGraphDialog)
const GRAPH_TYPES = {
  ATOMIC: 'atomic',
  TOOL: 'tool',
  BUSINESS: 'business',
  COMPOSITE: 'composite',
  TEMPLATE: 'template'
};

const GRAPH_TYPE_INFO = {
  atomic: { label: 'Atomic', description: 'Single operation' },
  tool: { label: 'Tool', description: 'Reusable tool' },
  business: { label: 'Business', description: 'Business logic' },
  composite: { label: 'Composite', description: 'Combined operations' },
  template: { label: 'Template', description: 'Reusable template' }
};

const TYPE_ICONS = {
  atomic: Atom,
  tool: Wrench,
  business: Briefcase,
  composite: Layers,
  template: FileCode
};

const STORAGE_KEY = 'gxe-control-panel-state';

// Load saved state from localStorage
const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load panel state:', e);
  }
  return null;
};

// Save state to localStorage
const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save panel state:', e);
  }
};

const FloatingControlPanel = ({
  // Execution tab props
  phase,
  requiredParams,
  paramValues,
  onParamChange,
  log,
  selectedNode,
  nodeStates,
  nodesWithCallbacks,
  onNodeSelect,
  stats,
  finalResult,
  showResult,
  onShowResult,
  canExecute,
  onExecute,
  onCancel,
  executionError,
  executionSummary,
  // Generator tab props
  taskText,
  onTaskTextChange,
  onBuildGraph,
  parentContext,
  generationStages,
  generationMode,
  onGenerationModeChange,
  aiAnalysisResult,
  dataSources,
  selectedSources,
  onSelectedSourcesChange,
  // Graph Info tab props
  graphMetadata,
  onGraphMetadataChange,
  nodesCount,
  edgesCount,
  // AI Settings tab props
  aiSettings,
  onAiSettingsChange,
  onOpenPromptEditor,
  availableModels,
  // Common props
  isGenerating,
  isExecuting
}) => {
  // Load initial state from localStorage or use defaults
  const savedState = loadSavedState();

  const [activeTab, setActiveTab] = useState(savedState?.activeTab || 'execution');
  const [position, setPosition] = useState(savedState?.position || { x: 20, y: 100 });
  const [size, setSize] = useState(savedState?.size || { width: 400, height: 500 });
  const [isMinimized, setIsMinimized] = useState(savedState?.isMinimized || false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const panelRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const logEndRef = useRef(null);

  // Save state to localStorage when it changes
  useEffect(() => {
    // Debounce save to avoid excessive writes during drag/resize
    const timeoutId = setTimeout(() => {
      saveState({ position, size, isMinimized, activeTab });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [position, size, isMinimized, activeTab]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setPosition({
        x: Math.max(0, e.clientX - dragStart.current.x),
        y: Math.max(0, e.clientY - dragStart.current.y)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Resize handlers
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      width: size.width,
      height: size.height,
      x: e.clientX,
      y: e.clientY
    };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeStart.current.x;
      const deltaY = e.clientY - resizeStart.current.y;
      setSize({
        width: Math.max(320, resizeStart.current.width + deltaX),
        height: Math.max(300, resizeStart.current.height + deltaY)
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Log icon helper
  const logIcon = (type) => ({
    start: <Play className="w-4 h-4 text-blue-400" />,
    ai: <Brain className="w-4 h-4 text-yellow-400" />,
    execute: <Zap className="w-4 h-4 text-yellow-400" />,
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
    complete: <CheckCircle className="w-4 h-4 text-green-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    warning: <AlertCircle className="w-4 h-4 text-yellow-400" />,
    input: <Upload className="w-4 h-4 text-cyan-400" />,
  }[type] || <ChevronRight className="w-4 h-4 text-gray-400" />);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 44 : size.height,
        transition: isDragging || isResizing ? 'none' : 'height 0.2s ease'
      }}
    >
      {/* Header with drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#30363d] cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <Move className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-300 flex-1">Control Panel</span>

        {/* Stats indicator */}
        {phase !== 'input' && !isMinimized && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{stats.done}/{stats.total}</span>
            <Clock className="w-3 h-3" />
            <span>{stats.ms}ms</span>
          </div>
        )}

        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 hover:bg-[#30363d] rounded text-gray-400"
        >
          {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
      </div>

      {!isMinimized && (
        <>
          {/* Tab buttons */}
          <div className="flex border-b border-[#30363d] bg-[#0d1117]">
            <button
              onClick={() => setActiveTab('execution')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'execution'
                  ? 'text-green-400 border-b-2 border-green-400 bg-[#161b22]'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Execution
              </div>
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'generator'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-[#161b22]'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Generator
              </div>
            </button>
            <button
              onClick={() => setActiveTab('graphInfo')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'graphInfo'
                  ? 'text-purple-400 border-b-2 border-purple-400 bg-[#161b22]'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                Graph Info
              </div>
            </button>
            <button
              onClick={() => setActiveTab('aiSettings')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'aiSettings'
                  ? 'text-yellow-400 border-b-2 border-yellow-400 bg-[#161b22]'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                AI
              </div>
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'execution' ? (
              <ExecutionTab
                phase={phase}
                requiredParams={requiredParams}
                paramValues={paramValues}
                onParamChange={onParamChange}
                log={log}
                selectedNode={selectedNode}
                nodeStates={nodeStates}
                nodesWithCallbacks={nodesWithCallbacks}
                onNodeSelect={onNodeSelect}
                logIcon={logIcon}
                logEndRef={logEndRef}
                isExecuting={isExecuting}
                isGenerating={isGenerating}
                canExecute={canExecute}
                onExecute={onExecute}
                onCancel={onCancel}
                finalResult={finalResult}
                showResult={showResult}
                onShowResult={onShowResult}
                executionError={executionError}
                executionSummary={executionSummary}
              />
            ) : activeTab === 'generator' ? (
              <GeneratorTab
                taskText={taskText}
                onTaskTextChange={onTaskTextChange}
                onBuildGraph={onBuildGraph}
                parentContext={parentContext}
                generationStages={generationStages}
                generationMode={generationMode}
                onGenerationModeChange={onGenerationModeChange}
                aiAnalysisResult={aiAnalysisResult}
                isGenerating={isGenerating}
                isExecuting={isExecuting}
                dataSources={dataSources}
                selectedSources={selectedSources}
                onSelectedSourcesChange={onSelectedSourcesChange}
              />
            ) : activeTab === 'graphInfo' ? (
              <GraphInfoTab
                graphMetadata={graphMetadata}
                onGraphMetadataChange={onGraphMetadataChange}
                parentContext={parentContext}
                nodesCount={nodesCount}
                edgesCount={edgesCount}
              />
            ) : (
              <AISettingsTab
                aiSettings={aiSettings}
                onAiSettingsChange={onAiSettingsChange}
                onOpenPromptEditor={onOpenPromptEditor}
                availableModels={availableModels}
              />
            )}
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeStart}
          >
            <GripVertical className="w-4 h-4 text-gray-600 rotate-[-45deg] translate-x-1 translate-y-1" />
          </div>
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   EXECUTION TAB
   ═══════════════════════════════════════════════════════════════════════════ */

const ExecutionTab = ({
  phase,
  requiredParams,
  paramValues,
  onParamChange,
  log,
  selectedNode,
  nodeStates,
  nodesWithCallbacks,
  onNodeSelect,
  logIcon,
  logEndRef,
  isExecuting,
  isGenerating,
  canExecute,
  onExecute,
  onCancel,
  finalResult,
  showResult,
  onShowResult,
  executionError,
  executionSummary
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Input Parameters */}
      {Object.keys(requiredParams).length > 0 && (
        <div className="p-3 border-b border-[#30363d] max-h-[200px] overflow-auto">
          <h3 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            Input Parameters
          </h3>
          <div className="flex flex-col gap-2">
            {Object.entries(requiredParams).map(([k, s]) => (
              <div key={k}>
                <label className="text-xs text-gray-500 mb-1 block">{s.label || k}</label>
                {s.type === 'select' ? (
                  <select
                    value={paramValues[k] || ''}
                    onChange={ev => onParamChange(k, ev.target.value)}
                    disabled={isExecuting}
                    className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select...</option>
                    {(s.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <textarea
                    value={paramValues[k] || ''}
                    onChange={ev => onParamChange(k, ev.target.value)}
                    placeholder={s.placeholder}
                    disabled={isExecuting}
                    rows={s.type === 'textarea' ? 3 : 2}
                    className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node state inspector */}
      {selectedNode && nodeStates[selectedNode.id] && (
        <div className="p-3 border-b border-[#30363d]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-400 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              {selectedNode.data?.label}
            </h3>
            <button onClick={() => onNodeSelect(null)} className="p-0.5 hover:bg-[#30363d] rounded">
              <X className="w-3 h-3 text-gray-400" />
            </button>
          </div>
          <pre className="text-[10px] text-green-300 bg-[#0d1117] p-2 rounded border border-[#30363d] max-h-24 overflow-auto">
            {JSON.stringify(nodeStates[selectedNode.id], null, 2)}
          </pre>
        </div>
      )}

      {/* Execution Log */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-[#30363d]">
          <Terminal className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-400">Execution Log</span>
          {(isExecuting || isGenerating) && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />}
        </div>
        <div className="flex-1 overflow-auto px-3 py-2">
          {log.map((l, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-[10px] py-1 px-1.5 rounded cursor-pointer
                ${l.nodeId && selectedNode?.id === l.nodeId ? 'bg-blue-500/20' : 'hover:bg-[#21262d]'}`}
              onClick={() => l.nodeId && onNodeSelect(nodesWithCallbacks.find(n => n.id === l.nodeId))}
            >
              {logIcon(l.type)}
              <span className="text-gray-500 font-mono shrink-0">
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              <span className={`flex-1 ${
                l.type === 'error' ? 'text-red-400' :
                l.type === 'complete' ? 'text-green-400 font-medium' :
                l.type === 'ai' ? 'text-yellow-300 italic' :
                l.type === 'success' ? 'text-green-300' : 'text-gray-300'
              }`}>
                {l.msg}
              </span>
            </div>
          ))}
          {log.length === 0 && (
            <div className="text-center text-gray-600 text-xs py-6">
              Build a graph first, then execute
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Execution Error */}
      {executionError && (
        <div className="mx-3 mb-2 p-2 bg-red-500/10 border border-red-500/40 rounded text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{executionError}</span>
        </div>
      )}

      {/* Execution Summary */}
      {executionSummary && !isExecuting && (
        <div className="mx-3 mb-2 p-2 bg-green-500/10 border border-green-500/40 rounded text-xs text-green-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            {executionSummary.successCount} completed, {executionSummary.failedCount} failed, {executionSummary.skippedCount} skipped ({executionSummary.totalDurationMs}ms)
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-3 border-t border-[#30363d] flex gap-2">
        {isExecuting ? (
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            <Pause className="w-4 h-4" />
            Cancel
          </button>
        ) : (
          <button
            onClick={onExecute}
            disabled={!canExecute}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Execute
          </button>
        )}

        {finalResult && !showResult && (
          <button
            onClick={onShowResult}
            className="px-3 py-2 bg-green-600/20 border border-green-500/30 text-green-400 rounded text-sm hover:bg-green-600/30 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            Result
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION PROGRESS COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const STAGE_ICONS = {
  // Execution graph stages
  analyze: Brain,
  schema: Layers,
  nodes: Zap,
  edges: ChevronRight,
  validate: CheckCircle,
  prompt_opt: Sparkles,
  // Knowledge graph stages
  parse: FileCode,
  chunk: Layers,
  extract: Brain,
  deduplicate: Zap,
  graph_build: Atom,
  ai_analysis: Sparkles
};

const STAGE_COLORS = {
  pending: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-500', icon: 'text-gray-500' },
  running: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', icon: 'text-blue-400' },
  done: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: 'text-green-400' },
  error: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-400' }
};

const GenerationProgress = ({ stages, isGenerating }) => {
  console.log('[GenerationProgress] Rendering', stages.length, 'stages:', stages.map(s => `${s.id}:${s.status}`).join(', '));
  const completedCount = stages.filter(s => s.status === 'done').length;
  const totalDuration = stages.reduce((sum, s) => sum + (s.stats?.duration || 0), 0);
  const hasError = stages.some(s => s.status === 'error');

  // Calculate overall progress percentage
  const progressPercent = (completedCount / stages.length) * 100;

  return (
    <div className="mb-4 p-3 bg-[#0d1117] border border-[#30363d] rounded-lg">
      {/* Header with progress bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Generation Progress</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{completedCount}/{stages.length}</span>
          {totalDuration > 0 && (
            <>
              <span>•</span>
              <Clock className="w-3 h-3" />
              <span>{totalDuration}ms</span>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#21262d] rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${hasError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-green-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stages list */}
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const Icon = STAGE_ICONS[stage.id] || Zap;
          const colors = STAGE_COLORS[stage.status] || STAGE_COLORS.pending;
          const isLast = idx === stages.length - 1;

          return (
            <div key={stage.id} className="relative">
              {/* Connector line */}
              {!isLast && (
                <div className={`absolute left-[11px] top-[26px] w-0.5 h-4 ${
                  stage.status === 'done' ? 'bg-green-500/50' : 'bg-[#30363d]'
                }`} />
              )}

              <div className={`flex items-center gap-2 p-2 rounded border ${colors.bg} ${colors.border}`}>
                {/* Status indicator */}
                <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                  stage.status === 'running' ? 'bg-blue-500/30' :
                  stage.status === 'done' ? 'bg-green-500/20' :
                  stage.status === 'error' ? 'bg-red-500/20' : 'bg-[#21262d]'
                }`}>
                  {stage.status === 'running' ? (
                    <Loader2 className={`w-3.5 h-3.5 ${colors.icon} animate-spin`} />
                  ) : stage.status === 'done' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  ) : stage.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Icon className={`w-3.5 h-3.5 ${colors.icon}`} />
                  )}
                </div>

                {/* Stage info */}
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${colors.text}`}>{stage.label}</div>
                  {stage.stats && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {stage.stats.duration != null && (
                        <span className="text-[10px] text-gray-500">{stage.stats.duration}ms</span>
                      )}
                      {stage.stats.count != null && (
                        <span className="text-[10px] text-gray-500">
                          {stage.stats.count} {stage.id === 'nodes' ? 'nodes' : 'edges'}
                        </span>
                      )}
                      {stage.stats.tokens != null && (
                        <span className="text-[10px] text-gray-500">{stage.stats.tokens} tokens</span>
                      )}
                      {stage.stats.complexity && (
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          stage.stats.complexity === 'complex' ? 'bg-orange-500/20 text-orange-400' :
                          stage.stats.complexity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {stage.stats.complexity}
                        </span>
                      )}
                      {stage.stats.types != null && (
                        <span className="text-[10px] text-gray-500">{stage.stats.types} types</span>
                      )}
                      {stage.stats.source && (
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          stage.stats.source === 'ai' ? 'bg-yellow-500/20 text-yellow-400' :
                          stage.stats.source === 'rules' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {stage.stats.source === 'ai' ? 'AI' : stage.stats.source === 'rules' ? 'Rules' : 'Local'}
                        </span>
                      )}
                      {stage.stats.completenessScore != null && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          stage.stats.completenessScore >= 80 ? 'bg-green-500/20 text-green-400' :
                          stage.stats.completenessScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {stage.stats.completenessScore}%
                        </span>
                      )}
                      {stage.stats.missingEntities != null && stage.stats.missingEntities > 0 && (
                        <span className="text-[10px] text-orange-400">
                          -{stage.stats.missingEntities} entities
                        </span>
                      )}
                      {stage.stats.missingRelations != null && stage.stats.missingRelations > 0 && (
                        <span className="text-[10px] text-orange-400">
                          -{stage.stats.missingRelations} relations
                        </span>
                      )}
                      {stage.stats.recommendations != null && stage.stats.recommendations > 0 && (
                        <span className="text-[10px] text-purple-400">
                          {stage.stats.recommendations} tips
                        </span>
                      )}
                      {stage.stats.error && (
                        <span className="text-[10px] text-red-400 truncate">{stage.stats.error}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   AI ANALYSIS REPORT (prominent display in Generator tab)
   ═══════════════════════════════════════════════════════════════════════════ */

const AIAnalysisReport = ({ analysis }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!analysis) return null;

  const score = analysis.completenessScore;
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const borderColor = score >= 80 ? 'border-green-500/40' : score >= 50 ? 'border-yellow-500/40' : 'border-red-500/40';
  const bgColor = score >= 80 ? 'bg-green-500/5' : score >= 50 ? 'bg-yellow-500/5' : 'bg-red-500/5';
  const barColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className={`mb-3 rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-pink-400" />
          <span className="text-xs font-semibold text-gray-200">AI Quality Analysis</span>
        </div>
        <div className="flex items-center gap-2">
          {score != null && (
            <span className={`text-sm font-bold ${scoreColor}`}>{score}%</span>
          )}
          <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Progress bar */}
          {score != null && (
            <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
            </div>
          )}

          {/* Summary */}
          {analysis.summary && (
            <p className="text-[11px] text-gray-400 leading-relaxed">{analysis.summary}</p>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {analysis.missingEntities?.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20">
                <AlertCircle className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="text-[10px] text-orange-300">
                  <strong>{analysis.missingEntities.length}</strong> missing entities
                </span>
              </div>
            )}
            {analysis.missingRelations?.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-300">
                  <strong>{analysis.missingRelations.length}</strong> missing relations
                </span>
              </div>
            )}
            {analysis.incorrectItems?.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                <span className="text-[10px] text-red-300">
                  <strong>{analysis.incorrectItems.length}</strong> issues
                </span>
              </div>
            )}
            {analysis.recommendations?.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20">
                <Brain className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="text-[10px] text-purple-300">
                  <strong>{analysis.recommendations.length}</strong> recommendations
                </span>
              </div>
            )}
          </div>

          {/* Missing entities list */}
          {analysis.missingEntities?.length > 0 && (
            <div className="space-y-1 max-h-24 overflow-auto">
              <div className="text-[10px] text-orange-400 font-semibold">Missing Entities:</div>
              {analysis.missingEntities.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1 py-0.5 rounded bg-orange-500/15 text-orange-300">{e.type || 'entity'}</span>
                  <span className="text-white">{e.name}</span>
                  {e.evidence && <span className="text-gray-600 truncate italic">"{e.evidence}"</span>}
                </div>
              ))}
            </div>
          )}

          {/* Missing relations list */}
          {analysis.missingRelations?.length > 0 && (
            <div className="space-y-1 max-h-24 overflow-auto">
              <div className="text-[10px] text-amber-400 font-semibold">Missing Relations:</div>
              {analysis.missingRelations.map((r, i) => (
                <div key={i} className="text-[10px] flex items-center gap-1">
                  <span className="text-cyan-300">{r.source}</span>
                  <span className="text-gray-600">→</span>
                  <span className="px-1 py-0.5 rounded bg-purple-500/15 text-purple-300">{r.type}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-cyan-300">{r.target}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations?.length > 0 && (
            <div className="space-y-1 max-h-24 overflow-auto">
              <div className="text-[10px] text-purple-400 font-semibold">Recommendations:</div>
              {analysis.recommendations.map((rec, i) => (
                <div key={i} className="text-[10px] text-gray-300 flex items-start gap-1">
                  <span className="text-purple-400 shrink-0">•</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          )}

          {/* Improved prompt */}
          {analysis.improvedPrompt && (
            <div>
              <div className="text-[10px] text-blue-400 font-semibold mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Improved Prompt:
              </div>
              <pre className="text-[10px] text-blue-200 bg-[#0d1117] p-2 rounded border border-blue-500/20 whitespace-pre-wrap max-h-20 overflow-auto leading-relaxed">
                {analysis.improvedPrompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATOR TAB
   ═══════════════════════════════════════════════════════════════════════════ */

// Icon mapping for connector types
const SOURCE_TYPE_ICONS = {
  mssql: Database,
  filesystem: HardDrive,
  tfs: Server,
  sharepoint: Globe,
};

const GeneratorTab = ({
  taskText,
  onTaskTextChange,
  onBuildGraph,
  parentContext,
  generationStages,
  generationMode,
  onGenerationModeChange,
  aiAnalysisResult,
  isGenerating,
  isExecuting,
  dataSources = [],
  selectedSources = [],
  onSelectedSourcesChange,
}) => {
  const handleKeyDown = (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !isGenerating && !isExecuting) {
      ev.preventDefault();
      onBuildGraph();
    }
  };

  const isKGMode = generationMode === 'knowledge';

  // Check if any stage has been started (not all pending)
  const hasStartedGeneration = generationStages?.some(s => s.status !== 'pending');
  const generationComplete = generationStages?.every(s => s.status === 'done');

  // Data source selection helpers
  const hasConnectorSources = selectedSources.some(s => s !== '__text__');
  const isTextSelected = selectedSources.includes('__text__');

  const toggleSource = (sourceId) => {
    if (isGenerating || isExecuting) return;
    const next = selectedSources.includes(sourceId)
      ? selectedSources.filter(s => s !== sourceId)
      : [...selectedSources, sourceId];
    onSelectedSourcesChange?.(next);
  };

  // Build button enabled condition: has text OR has connector sources
  const canBuild = isKGMode
    ? (taskText.trim() || hasConnectorSources)
    : taskText.trim();

  return (
    <div className="flex-1 flex flex-col p-4 overflow-auto">
      {/* Mode toggle */}
      <div className="mb-3 flex rounded-lg border border-[#30363d] overflow-hidden">
        <button
          onClick={() => onGenerationModeChange?.('execution')}
          disabled={isGenerating || isExecuting}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            !isKGMode
              ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/50'
              : 'bg-[#0d1117] text-gray-400 border-r border-[#30363d] hover:text-gray-300 hover:bg-[#161b22]'
          } disabled:opacity-50`}
        >
          <Zap className="w-3.5 h-3.5" />
          Execution Graph
        </button>
        <button
          onClick={() => onGenerationModeChange?.('knowledge')}
          disabled={isGenerating || isExecuting}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            isKGMode
              ? 'bg-purple-600/30 text-purple-300'
              : 'bg-[#0d1117] text-gray-400 hover:text-gray-300 hover:bg-[#161b22]'
          } disabled:opacity-50`}
        >
          <Atom className="w-3.5 h-3.5" />
          Knowledge Graph
        </button>
      </div>

      {/* Parent context indicator */}
      {parentContext && (
        <div className="mb-3 flex items-center gap-2 px-2 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded text-xs text-purple-300">
          <Brain className="w-3.5 h-3.5" />
          Sub-graph of: {parentContext.nodeLabel}
        </div>
      )}

      {/* Data Sources picker — shown only in Knowledge Graph mode */}
      {isKGMode && (
        <div className="mb-3">
          <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
            <Database className="w-3 h-3" />
            Data Sources
          </label>
          <div className="flex flex-wrap gap-1.5">
            {/* Text Input — always-available pseudo-source */}
            <button
              onClick={() => toggleSource('__text__')}
              disabled={isGenerating || isExecuting}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all
                ${isTextSelected
                  ? 'bg-purple-600/25 border-purple-500/60 text-purple-300'
                  : 'bg-[#0d1117] border-[#30363d] text-gray-500 hover:text-gray-300 hover:border-[#484f58]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Type className="w-3 h-3" />
              Text Input
              {isTextSelected && <CheckCircle className="w-3 h-3 text-purple-400" />}
            </button>

            {/* Registered connectors */}
            {dataSources.map(src => {
              const isSelected = selectedSources.includes(src.name);
              const TypeIcon = SOURCE_TYPE_ICONS[src.type] || Database;
              const isConnected = src.connected || src.status === 'connected';
              return (
                <button
                  key={src.name}
                  onClick={() => toggleSource(src.name)}
                  disabled={isGenerating || isExecuting}
                  title={`${src.name} (${src.type})${isConnected ? '' : ' — not connected'}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all
                    ${isSelected
                      ? 'bg-cyan-600/25 border-cyan-500/60 text-cyan-300'
                      : 'bg-[#0d1117] border-[#30363d] text-gray-500 hover:text-gray-300 hover:border-[#484f58]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <TypeIcon className="w-3 h-3" />
                  <span className="max-w-[80px] truncate">{src.name}</span>
                  {/* Connection status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                  {isSelected && <CheckCircle className="w-3 h-3 text-cyan-400" />}
                </button>
              );
            })}

            {dataSources.length === 0 && (
              <span className="text-[10px] text-gray-600 italic px-1">
                No connectors registered
              </span>
            )}
          </div>
          {/* Selection summary */}
          {hasConnectorSources && (
            <div className="mt-1.5 text-[10px] text-cyan-400/70">
              {selectedSources.filter(s => s !== '__text__').length} source(s) selected
              {isTextSelected ? ' + text input' : ''}
            </div>
          )}
        </div>
      )}

      {/* Generation Progress (shown during/after generation) */}
      {(isGenerating || hasStartedGeneration) && generationStages && (
        <GenerationProgress stages={generationStages} isGenerating={isGenerating} />
      )}

      {/* AI Analysis Report (auto-shown when analysis completes) */}
      {aiAnalysisResult && (
        <AIAnalysisReport analysis={aiAnalysisResult} />
      )}

      {/* Task description - conditionally show based on state */}
      {(!hasStartedGeneration || generationComplete || !isGenerating) && (
        <div className="mb-3">
          <label className="text-xs text-gray-400 mb-2 block">
            {isKGMode
              ? (hasConnectorSources ? 'Additional Context (optional)' : 'Text for Knowledge Extraction')
              : 'Task Description'}
          </label>
          <textarea
            value={taskText}
            onChange={ev => onTaskTextChange(ev.target.value)}
            placeholder={parentContext
              ? `Describe the internal logic for "${parentContext.nodeLabel}"...`
              : isKGMode
                ? (hasConnectorSources
                  ? 'Optionally add text context to guide extraction...'
                  : 'Paste or type text to extract entities and relationships from...')
                : 'Describe your task... (e.g., "Analyze support ticket and suggest solution")'}
            disabled={isGenerating || isExecuting}
            rows={hasStartedGeneration ? 3 : (isKGMode && hasConnectorSources ? 3 : 6)}
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50"
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {/* Tips - only show when not generating */}
      {!hasStartedGeneration && (
        <div className="mb-4 text-[10px] text-gray-500">
          <p className="mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {isKGMode ? (
              <>
                <li>Select data sources to extract knowledge from</li>
                <li>Combine multiple sources for richer graphs</li>
                <li>Entities (people, places, concepts) will be extracted</li>
                <li>Press Enter to submit (Shift+Enter for new line)</li>
              </>
            ) : (
              <>
                <li>Be specific about inputs and outputs</li>
                <li>Describe the workflow steps</li>
                <li>Mention any conditions or branching</li>
                <li>Press Enter to submit (Shift+Enter for new line)</li>
              </>
            )}
          </ul>
        </div>
      )}

      <div className="flex-1" />

      {/* Build button */}
      <button
        onClick={onBuildGraph}
        disabled={!canBuild || isGenerating || isExecuting}
        className={`w-full py-2.5 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium ${
          isKGMode
            ? 'bg-purple-600 hover:bg-purple-700'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isKGMode ? 'Extracting Knowledge...' : 'Building Graph...'}
          </>
        ) : generationComplete ? (
          <>
            <RotateCcw className="w-4 h-4" />
            {isKGMode ? 'Re-Extract' : 'Rebuild Graph'}
          </>
        ) : (
          <>
            {isKGMode ? <Atom className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isKGMode ? 'Extract Knowledge Graph' : 'Build Graph'}
          </>
        )}
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GRAPH INFO TAB
   ═══════════════════════════════════════════════════════════════════════════ */

const GraphInfoTab = ({
  graphMetadata,
  onGraphMetadataChange,
  parentContext,
  nodesCount,
  edgesCount
}) => {
  const metadata = graphMetadata || {
    name: '',
    description: '',
    type: GRAPH_TYPES.ATOMIC,
    namespace: 'default',
    tags: []
  };

  const [newTag, setNewTag] = useState('');

  const handleChange = (field, value) => {
    onGraphMetadataChange?.({
      ...metadata,
      [field]: value
    });
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed && !metadata.tags.includes(trimmed)) {
      handleChange('tags', [...metadata.tags, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    handleChange('tags', metadata.tags.filter(t => t !== tagToRemove));
  };

  const TypeIcon = TYPE_ICONS[metadata.type] || FileCode;

  return (
    <div className="flex-1 flex flex-col p-4 overflow-auto">
      {/* Sub-graph indicator */}
      {parentContext && (
        <div className="mb-3 flex items-center gap-2 px-2 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded text-xs text-purple-300">
          <Layers className="w-3.5 h-3.5" />
          Sub-graph of: {parentContext.nodeLabel}
        </div>
      )}

      {/* Graph Name */}
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1.5 block">Graph Name</label>
        <input
          type="text"
          value={metadata.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Enter graph name..."
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1.5 block">Description</label>
        <textarea
          value={metadata.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Describe what this graph does..."
          rows={3}
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none resize-none"
        />
      </div>

      {/* Type Selection */}
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1.5 block">Graph Type</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(GRAPH_TYPE_INFO).map(([key, info]) => {
            const Icon = TYPE_ICONS[key] || FileCode;
            const isSelected = metadata.type === key;
            return (
              <button
                key={key}
                onClick={() => handleChange('type', key)}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors ${
                  isSelected
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                    : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:border-[#484f58] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{info.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Namespace */}
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
          <Folder className="w-3 h-3" />
          Namespace
        </label>
        <input
          type="text"
          value={metadata.namespace}
          onChange={(e) => handleChange('namespace', e.target.value)}
          placeholder="default"
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-sm text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Tags */}
      <div className="mb-3">
        <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          Tags
        </label>

        {/* Selected tags */}
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
          {metadata.tags.length === 0 ? (
            <span className="text-xs text-gray-600 italic">No tags</span>
          ) : (
            metadata.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-300"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Add new tag */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Add tag..."
            className="flex-1 px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            className="px-2 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-xs text-gray-300 hover:bg-[#30363d] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Graph Stats */}
      <div className="mt-auto pt-3 border-t border-[#30363d]">
        <div className="p-2.5 bg-[#0d1117] rounded border border-[#30363d]">
          <div className="text-xs text-gray-400 mb-2">Graph Preview</div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-gray-300">Nodes: <strong className="text-white">{nodesCount || 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-gray-300">Edges: <strong className="text-white">{edgesCount || 0}</strong></span>
            </div>
          </div>
          {metadata.type && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
              <TypeIcon className="w-3.5 h-3.5" />
              <span>{GRAPH_TYPE_INFO[metadata.type]?.label || metadata.type}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * AISettingsTab — consolidated AI configuration
 * ═══════════════════════════════════════════════════════════════════════════ */
const AISettingsTab = ({ aiSettings, onAiSettingsChange, onOpenPromptEditor, availableModels }) => {
  const settings = aiSettings || {};
  const models = availableModels || [
    { id: 'claude-sonnet', name: 'Claude Sonnet' },
    { id: 'claude-haiku', name: 'Claude Haiku' },
    { id: 'claude-opus', name: 'Claude Opus' }
  ];

  const handleChange = (field, value) => {
    onAiSettingsChange?.({ ...settings, [field]: value });
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {/* Model Selection */}
      <div>
        <label className="block text-[11px] text-[#8b949e] uppercase tracking-wider mb-1.5">
          <div className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Model</div>
        </label>
        <select
          value={settings.selectedModel || 'claude-sonnet'}
          onChange={(e) => handleChange('selectedModel', e.target.value)}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-yellow-500/50"
        >
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name || m.id}</option>
          ))}
        </select>
      </div>

      {/* Temperature */}
      <div>
        <label className="block text-[11px] text-[#8b949e] uppercase tracking-wider mb-1.5">
          <div className="flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5" />
            Temperature
            <span className="ml-auto text-yellow-400 font-mono">{(settings.temperature ?? 0.3).toFixed(2)}</span>
          </div>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.temperature ?? 0.3}
          onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
          className="w-full h-1.5 bg-[#21262d] rounded-full appearance-none cursor-pointer accent-yellow-400"
        />
        <div className="flex justify-between text-[10px] text-[#484f58] mt-0.5">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <label className="block text-[11px] text-[#8b949e] uppercase tracking-wider mb-1.5">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            Max Tokens
          </div>
        </label>
        <input
          type="number"
          min="256"
          max="16384"
          step="256"
          value={settings.maxTokens ?? 4096}
          onChange={(e) => handleChange('maxTokens', parseInt(e.target.value, 10) || 4096)}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] font-mono outline-none focus:border-yellow-500/50"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={settings.useTools ?? true}
            onChange={(e) => handleChange('useTools', e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-[#0d1117] border-[#30363d] accent-yellow-400"
          />
          <div>
            <div className="text-xs text-[#e6edf3] group-hover:text-white">MCP Tools</div>
            <div className="text-[10px] text-[#484f58]">Enable agentic mode with tool use</div>
          </div>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={settings.useSDA ?? true}
            onChange={(e) => handleChange('useSDA', e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-[#0d1117] border-[#30363d] accent-yellow-400"
          />
          <div>
            <div className="text-xs text-[#e6edf3] group-hover:text-white">SDA Pipeline</div>
            <div className="text-[10px] text-[#484f58]">Use TaskPlanner for structured decomposition</div>
          </div>
        </label>
      </div>

      {/* System Prompt */}
      <div className="pt-2 border-t border-[#21262d]">
        <button
          onClick={onOpenPromptEditor}
          className="w-full flex items-center gap-2 px-3 py-2 rounded border border-[#30363d] bg-[#0d1117] hover:bg-[#21262d] hover:border-yellow-500/30 transition-colors group"
        >
          <FileText className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
          <div className="text-left flex-1">
            <div className="text-xs text-[#e6edf3]">Edit System Prompt</div>
            <div className="text-[10px] text-[#484f58]">Versioned prompt with history</div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#484f58] group-hover:text-[#8b949e]" />
        </button>
      </div>
    </div>
  );
};

export default FloatingControlPanel;
