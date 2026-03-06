/**
 * BottomPanel - Collapsible/resizable bottom panel with tabs
 *
 * Tab 1: Execution Results (ResultPanel)
 * Tab 2: Generation Log (real-time generation events)
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  CheckCircle, AlertCircle, Terminal, ChevronDown, ChevronUp,
  GripVertical, X, Clock, Activity, Zap, Brain, FileCode,
  Layers, Database, Search, Code, Settings, Loader2, Sparkles,
  MessageSquare
} from 'lucide-react';
import ExecutionResultPanel from './ExecutionResultPanel';
import AnalysisLogTab from './AnalysisLogTab';
import GraphAnalystChat from './GraphAnalystChat';
import LiveExecutionTab from './LiveExecutionTab';

const STORAGE_KEY = 'gxe-bottom-panel-state';

// Generation event types with colors
const EVENT_TYPES = {
  text_analysis: { label: 'Text Analysis', color: '#3b82f6', Icon: FileCode },
  ai_request: { label: 'AI Request', color: '#f59e0b', Icon: Brain },
  ai_response: { label: 'AI Response', color: '#22c55e', Icon: Brain },
  tool_call: { label: 'Tool Call', color: '#8b5cf6', Icon: Zap },
  tool_result: { label: 'Tool Result', color: '#a855f7', Icon: Zap },
  json_parse: { label: 'JSON Parse', color: '#06b6d4', Icon: Code },
  graph_build: { label: 'Graph Build', color: '#10b981', Icon: Layers },
  validation: { label: 'Validation', color: '#14b8a6', Icon: CheckCircle },
  gnn: { label: 'GNN Processing', color: '#ec4899', Icon: Database },
  fallback: { label: 'Fallback', color: '#f97316', Icon: Settings },
  error: { label: 'Error', color: '#ef4444', Icon: AlertCircle },
  info: { label: 'Info', color: '#6b7280', Icon: Terminal },
  complete: { label: 'Complete', color: '#22c55e', Icon: CheckCircle },
  // Knowledge graph extraction event types
  parsing: { label: 'Parsing', color: '#14b8a6', Icon: FileCode },
  chunking: { label: 'Chunking', color: '#3b82f6', Icon: Layers },
  extraction: { label: 'Extraction', color: '#a855f7', Icon: Brain },
  extraction_result: { label: 'Extraction Result', color: '#8b5cf6', Icon: Search },
  deduplication: { label: 'Deduplication', color: '#f59e0b', Icon: Zap },
  ai_analysis: { label: 'AI Analysis', color: '#ec4899', Icon: Brain },
  anomaly: { label: 'Anomaly', color: '#f97316', Icon: AlertCircle },
  prompt_optimization: { label: 'Prompt Optimization', color: '#8b5cf6', Icon: Sparkles }
};

// Load saved state
const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

// Save state
const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
};

const BottomPanel = ({
  // Result tab props
  result,
  showResult,
  onCloseResult,
  nodes,
  edges,
  nodeStates,
  executionOrder,
  stats,
  isExecuting,
  onNodeClick,
  // Generation log props
  generationEvents,
  isGenerating,
  onClearLog,
  // Analysis tab props
  analysisEvents,
  isAnalyzing,
  onClearAnalysis,
  onNodeHighlight,
  // Live Execution tab props
  liveExecutionEvents,
  liveExecutionStatus,
  liveExecutionProgress,
  waitingInputs,
  onResumeInput,
  onCancelExecution,
  onClearLiveLog,
  executionError,
  // Live Execution launch props
  canExecute,
  onExecute,
  requiredParams,
  paramValues,
  onParamChange,
  nodesCount,
  edgesCount,
  // Graph Analyst Chat props
  graphNodes,
  graphEdges,
  namespace,
  // Mutation callbacks
  onApplyMutations,
  // AI Execution Assistant props
  assistantRef,
  isAssistantOpen,
  onToggleAssistant,
  assistantWidth,
  onAssistantWidthChange,
  onAssistantStreamingComplete,
}) => {
  const savedState = loadSavedState();

  const [isCollapsed, setIsCollapsed] = useState(savedState?.isCollapsed ?? true);
  const [height, setHeight] = useState(savedState?.height ?? 300);
  const [activeTab, setActiveTab] = useState(savedState?.activeTab ?? 'generation');

  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const logEndRef = useRef(null);

  // Save state when changed
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveState({ isCollapsed, height, activeTab });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [isCollapsed, height, activeTab]);

  // Auto-scroll log
  useEffect(() => {
    if (activeTab === 'generation') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [generationEvents, activeTab]);

  // Auto-expand when generating starts
  useEffect(() => {
    if (isGenerating && isCollapsed) {
      setIsCollapsed(false);
      setActiveTab('generation');
    }
  }, [isGenerating]);

  // Auto-expand when result is available
  useEffect(() => {
    if (showResult && isCollapsed) {
      setIsCollapsed(false);
      setActiveTab('result');
    }
  }, [showResult]);

  // Auto-expand when execution starts (switch to live execution tab)
  useEffect(() => {
    if (isExecuting) {
      setIsCollapsed(false);
      setActiveTab('liveExec');
    }
  }, [isExecuting]);

  // Auto-switch when waiting for input
  useEffect(() => {
    if (waitingInputs?.length > 0) {
      setIsCollapsed(false);
      setActiveTab('liveExec');
    }
  }, [waitingInputs]);

  // Auto-expand when analysis starts
  useEffect(() => {
    if (isAnalyzing && isCollapsed) {
      setIsCollapsed(false);
      setActiveTab('analysis');
    }
  }, [isAnalyzing]);

  // Resize handlers
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
  }, [height]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(150, Math.min(600, startHeight.current + delta)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Count events by status
  const eventCounts = {
    total: generationEvents?.length || 0,
    errors: generationEvents?.filter(e => e.type === 'error').length || 0,
    aiCalls: generationEvents?.filter(e => e.type === 'ai_request').length || 0
  };
  const analysisEventCount = analysisEvents?.length || 0;
  const analysisErrors = analysisEvents?.filter(e => e.type === 'error' || e.status === 'error').length || 0;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-[#161b22] border-t border-[#30363d] z-40 flex flex-col"
      style={{ height: isCollapsed ? 40 : height }}
    >
      {/* Resize handle */}
      {!isCollapsed && (
        <div
          className="h-2 cursor-ns-resize flex items-center justify-center hover:bg-[#30363d] select-none"
          onMouseDown={handleResizeStart}
        >
          <GripVertical className="w-4 h-4 text-gray-600 rotate-90" />
        </div>
      )}

      {/* Header with tabs */}
      <div className="flex items-center border-b border-[#30363d] bg-[#0d1117]">
        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="px-3 py-2 hover:bg-[#21262d] text-gray-400"
        >
          {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Tab buttons */}
        <button
          onClick={() => { setActiveTab('generation'); setIsCollapsed(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'generation'
              ? 'text-blue-400 border-blue-400 bg-[#161b22]'
              : 'text-gray-400 border-transparent hover:text-white hover:bg-[#21262d]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Generation Log
          {isGenerating && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
          {eventCounts.total > 0 && (
            <span className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px]">
              {eventCounts.total}
            </span>
          )}
          {eventCounts.errors > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
              {eventCounts.errors} err
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('analysis'); setIsCollapsed(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'analysis'
              ? 'text-purple-400 border-purple-400 bg-[#161b22]'
              : 'text-gray-400 border-transparent hover:text-white hover:bg-[#21262d]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Analysis
          {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
          {analysisEventCount > 0 && (
            <span className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px]">
              {analysisEventCount}
            </span>
          )}
          {analysisErrors > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
              {analysisErrors} err
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('liveExec'); setIsCollapsed(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'liveExec'
              ? 'text-yellow-400 border-yellow-400 bg-[#161b22]'
              : 'text-gray-400 border-transparent hover:text-white hover:bg-[#21262d]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Live Execution
          {isExecuting && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
          {waitingInputs?.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] animate-pulse">
              {waitingInputs.length} input
            </span>
          )}
          {!isExecuting && liveExecutionEvents?.length > 0 && (
            <span className="px-1.5 py-0.5 bg-[#30363d] rounded text-[10px]">
              {liveExecutionEvents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('result'); setIsCollapsed(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'result'
              ? 'text-green-400 border-green-400 bg-[#161b22]'
              : 'text-gray-400 border-transparent hover:text-white hover:bg-[#21262d]'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Execution Result
          {result?.success === false && (
            <AlertCircle className="w-3 h-3 text-red-400" />
          )}
        </button>

        <button
          onClick={() => { setActiveTab('chat'); setIsCollapsed(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'chat'
              ? 'text-cyan-400 border-cyan-400 bg-[#161b22]'
              : 'text-gray-400 border-transparent hover:text-white hover:bg-[#21262d]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Graph Analyst
        </button>

        <div className="flex-1" />

        {/* Stats */}
        {!isCollapsed && activeTab === 'generation' && eventCounts.aiCalls > 0 && (
          <div className="flex items-center gap-2 px-3 text-xs text-gray-500">
            <Brain className="w-3 h-3" />
            <span>{eventCounts.aiCalls} AI call(s)</span>
          </div>
        )}

        {/* Clear button for generation log */}
        {!isCollapsed && activeTab === 'generation' && eventCounts.total > 0 && (
          <button
            onClick={onClearLog}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#21262d]"
          >
            Clear
          </button>
        )}

        {/* Clear button for analysis */}
        {!isCollapsed && activeTab === 'analysis' && analysisEventCount > 0 && (
          <button
            onClick={onClearAnalysis}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#21262d]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="flex-1 w-full overflow-hidden">
          {activeTab === 'generation' ? (
            <GenerationLogTab
              events={generationEvents}
              isGenerating={isGenerating}
              logEndRef={logEndRef}
            />
          ) : activeTab === 'analysis' ? (
            <AnalysisLogTab
              events={analysisEvents}
              isAnalyzing={isAnalyzing}
              onNodeClick={onNodeHighlight}
            />
          ) : activeTab === 'liveExec' ? (
            <LiveExecutionTab
              executionEvents={liveExecutionEvents || []}
              isExecuting={isExecuting}
              executionStatus={liveExecutionStatus || 'idle'}
              executionProgress={liveExecutionProgress || { completed: 0, total: 0 }}
              waitingInputs={waitingInputs || []}
              onResumeInput={onResumeInput}
              onCancelExecution={onCancelExecution}
              onNodeClick={onNodeClick}
              onClearLog={onClearLiveLog}
              executionError={executionError}
              canExecute={canExecute}
              onExecute={onExecute}
              requiredParams={requiredParams}
              paramValues={paramValues}
              onParamChange={onParamChange}
              nodesCount={nodesCount || 0}
              edgesCount={edgesCount || 0}
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              onApplyMutations={onApplyMutations}
              // AI Execution Assistant
              assistantRef={assistantRef}
              isAssistantOpen={isAssistantOpen}
              onToggleAssistant={onToggleAssistant}
              assistantWidth={assistantWidth}
              onAssistantWidthChange={onAssistantWidthChange}
              namespace={namespace}
              onAssistantStreamingComplete={onAssistantStreamingComplete}
            />
          ) : activeTab === 'chat' ? (
            <GraphAnalystChat
              nodes={graphNodes}
              edges={graphEdges}
              namespace={namespace}
            />
          ) : (
            <ExecutionResultPanel
              result={result}
              nodes={nodes}
              edges={edges}
              nodeStates={nodeStates}
              executionOrder={executionOrder}
              stats={stats}
              onNodeClick={onNodeClick}
              onClose={onCloseResult}
            />
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION LOG TAB - Span Tree Style (matches ExecutionResultPanel)
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationLogTab = ({ events, isGenerating, logEndRef }) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [viewMode, setViewMode] = useState('trace'); // 'trace' | 'json'

  // Calculate generation metrics
  const metrics = useMemo(() => {
    if (!events || events.length === 0) return null;

    const totalDuration = events.reduce((sum, e) => sum + (e.duration || 0), 0);
    const errorEvents = events.filter(e => e.type === 'error' || e.status === 'error');
    const aiCalls = events.filter(e => e.type === 'ai_request' || e.type === 'ai_response');
    const toolCalls = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result');
    const totalTokens = events.reduce((sum, e) => sum + (e.tokens || 0), 0);

    return {
      totalEvents: events.length,
      totalDuration,
      errorCount: errorEvents.length,
      errorEvents,
      aiCallCount: Math.ceil(aiCalls.length / 2),
      toolCallCount: Math.ceil(toolCalls.length / 2),
      totalTokens,
      isComplete: events.some(e => e.type === 'complete'),
      hasErrors: errorEvents.length > 0
    };
  }, [events]);

  const toggleExpand = useCallback((eventId) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  }, []);

  const selectedEvent = selectedEventId
    ? events?.find((e, idx) => (e.id || idx) === selectedEventId)
    : null;

  if (!events || events.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#0d1117]">
        <Activity className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No Generation Events</p>
        <p className="text-xs text-gray-600 mt-1">Events will appear here when you build a graph</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header with view toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          {['trace', 'json'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-[#30363d] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {mode === 'trace' ? 'Event Trace' : 'JSON'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Status badge */}
        <GenerationStatusBadge isGenerating={isGenerating} metrics={metrics} />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {metrics?.totalEvents || 0}
          </span>
          {metrics?.totalTokens > 0 && (
            <span className="flex items-center gap-1">
              <Code className="w-3 h-3" />
              {metrics.totalTokens} tok
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {metrics?.totalDuration || 0}ms
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'trace' ? (
          <>
            {/* Event Trace (left side) */}
            <div className="flex-1 overflow-auto border-r border-[#30363d]">
              <div className="p-3 space-y-1">
                {events.map((event, idx) => {
                  const eventId = event.id || idx;
                  return (
                    <GenerationSpanRow
                      key={eventId}
                      event={event}
                      index={idx}
                      totalEvents={events.length}
                      totalDuration={metrics?.totalDuration || 1}
                      isExpanded={expandedIds.has(eventId)}
                      isSelected={selectedEventId === eventId}
                      onToggle={() => toggleExpand(eventId)}
                      onSelect={() => setSelectedEventId(selectedEventId === eventId ? null : eventId)}
                    />
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Summary Panel (right side) */}
            <div className="w-80 overflow-auto bg-[#161b22]">
              <GenerationSummaryPanel
                metrics={metrics}
                isGenerating={isGenerating}
                selectedEvent={selectedEvent}
                onSelectEvent={setSelectedEventId}
                events={events}
              />
            </div>
          </>
        ) : (
          <GenerationJsonView events={events} />
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION STATUS BADGE
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationStatusBadge = ({ isGenerating, metrics }) => {
  if (isGenerating) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Generating
      </div>
    );
  }

  if (metrics?.hasErrors) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
        <AlertCircle className="w-3.5 h-3.5" />
        Failed
      </div>
    );
  }

  if (metrics?.isComplete) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
        <CheckCircle className="w-3.5 h-3.5" />
        Complete
      </div>
    );
  }

  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════
   AI ANALYSIS DETAILS - Rich rendering for Claude Opus analysis result
   ═══════════════════════════════════════════════════════════════════════════ */

const AIAnalysisDetails = ({ analysis }) => {
  if (!analysis) return null;

  const score = analysis.completenessScore;
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const scoreBg = score >= 80 ? 'bg-green-500/20 border-green-500/30' : score >= 50 ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-red-500/20 border-red-500/30';

  return (
    <div className="space-y-3">
      {/* Completeness Score & Summary */}
      <div className={`p-3 rounded border ${scoreBg}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-300">Graph Completeness</span>
          {score != null && (
            <span className={`text-lg font-bold ${scoreColor}`}>{score}%</span>
          )}
        </div>
        {/* Progress bar */}
        {score != null && (
          <div className="h-2 bg-[#21262d] rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${
                score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        )}
        {analysis.summary && (
          <p className="text-xs text-gray-400 leading-relaxed">{analysis.summary}</p>
        )}
      </div>

      {/* Missing Entities */}
      {analysis.missingEntities?.length > 0 && (
        <div className="p-2 rounded bg-[#161b22] border border-orange-500/30">
          <div className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Missing Entities ({analysis.missingEntities.length})
          </div>
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {analysis.missingEntities.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-medium shrink-0">
                  {e.type || 'entity'}
                </span>
                <span className="text-white font-medium">{e.name}</span>
                {e.evidence && (
                  <span className="text-gray-500 italic truncate">"{e.evidence}"</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing Relations */}
      {analysis.missingRelations?.length > 0 && (
        <div className="p-2 rounded bg-[#161b22] border border-amber-500/30">
          <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Missing Relationships ({analysis.missingRelations.length})
          </div>
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {analysis.missingRelations.map((r, i) => (
              <div key={i} className="text-xs flex items-center gap-1.5">
                <span className="text-cyan-300">{r.source}</span>
                <span className="text-gray-500">→</span>
                <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">
                  {r.type}
                </span>
                <span className="text-gray-500">→</span>
                <span className="text-cyan-300">{r.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incorrect Items */}
      {analysis.incorrectItems?.length > 0 && (
        <div className="p-2 rounded bg-[#161b22] border border-red-500/30">
          <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Issues Found ({analysis.incorrectItems.length})
          </div>
          <div className="space-y-1.5 max-h-32 overflow-auto">
            {analysis.incorrectItems.map((item, i) => (
              <div key={i} className="text-xs">
                <span className="text-red-300 font-medium">{item.item}</span>
                <span className="text-gray-500"> — {item.issue}</span>
                {item.suggestion && (
                  <span className="text-green-400 ml-1">Fix: {item.suggestion}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations?.length > 0 && (
        <div className="p-2 rounded bg-[#161b22] border border-purple-500/30">
          <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1">
            <Brain className="w-3 h-3" />
            Recommendations ({analysis.recommendations.length})
          </div>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improved Prompt */}
      {analysis.improvedPrompt && (
        <div className="p-2 rounded bg-[#161b22] border border-blue-500/30">
          <div className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Suggested Improved Prompt
          </div>
          <pre className="text-xs text-blue-200 whitespace-pre-wrap max-h-32 overflow-auto leading-relaxed">
            {analysis.improvedPrompt}
          </pre>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION SPAN ROW (matches SpanRow style)
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationSpanRow = ({
  event,
  index,
  totalEvents,
  totalDuration,
  isExpanded,
  isSelected,
  onToggle,
  onSelect
}) => {
  const config = EVENT_TYPES[event.type] || EVENT_TYPES.info;
  const Icon = config.Icon;
  const duration = event.duration || 0;
  const durationPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;

  const hasDetails = event.input || event.output || event.error;
  const isRunning = event.status === 'running';
  const isError = event.type === 'error' || event.status === 'error';

  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-[#30363d] hover:border-[#484f58]'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onSelect}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[#30363d] ${
            !hasDetails ? 'invisible' : ''
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-gray-400 rotate-180" />
          )}
        </button>

        {/* Step number */}
        <span className="w-6 text-xs text-gray-500 font-mono text-right">
          {index + 1}.
        </span>

        {/* Type icon */}
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ backgroundColor: config.color + '20' }}
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: config.color }} />
          ) : (
            <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate">
              {event.title || config.label}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium"
              style={{
                backgroundColor: config.color + '20',
                color: config.color
              }}
            >
              {event.type}
            </span>
          </div>
          {event.subtitle && (
            <div className="text-xs text-gray-500 truncate">{event.subtitle}</div>
          )}
        </div>

        {/* Duration bar */}
        <div className="w-32 h-2 bg-[#21262d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.max(durationPercent, 2)}%`,
              backgroundColor: isError ? '#ef4444' : config.color
            }}
          />
        </div>

        {/* Duration text */}
        <span className="w-16 text-xs text-gray-400 text-right font-mono">
          {duration}ms
        </span>

        {/* Status icon */}
        <div className="w-6 flex justify-center">
          {isError ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : isRunning ? (
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-400" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-1 border-t border-[#30363d] bg-[#0d1117]/50">
          <div className="ml-11 space-y-2">
            {event.error && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                <pre className="text-xs text-red-300 whitespace-pre-wrap max-h-32 overflow-auto">
                  {typeof event.error === 'string' ? event.error : JSON.stringify(event.error, null, 2)}
                </pre>
              </div>
            )}

            {event.input && (
              <div className="p-2 rounded bg-[#161b22] border border-[#30363d]">
                <div className="text-xs text-gray-400 font-medium mb-1">Input</div>
                <pre className="text-xs text-cyan-300 whitespace-pre-wrap max-h-32 overflow-auto">
                  {typeof event.input === 'string'
                    ? (event.input.length > 500 ? event.input.slice(0, 500) + '...' : event.input)
                    : JSON.stringify(event.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Rich AI Analysis rendering */}
            {event.type === 'ai_analysis' && event.output && typeof event.output === 'object' && !event.output.parseError ? (
              <AIAnalysisDetails analysis={event.output} />
            ) : event.output && (
              <div className="p-2 rounded bg-[#161b22] border border-[#30363d]">
                <div className="text-xs text-gray-400 font-medium mb-1">Output</div>
                <pre className="text-xs text-green-300 whitespace-pre-wrap max-h-48 overflow-auto">
                  {typeof event.output === 'string'
                    ? (event.output.length > 500 ? event.output.slice(0, 500) + '...' : event.output)
                    : JSON.stringify(event.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION SUMMARY PANEL (matches SummaryPanel style)
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationSummaryPanel = ({ metrics, isGenerating, selectedEvent, onSelectEvent, events }) => {
  // Find AI analysis event if exists
  const aiAnalysisEvent = events?.find(e => e.type === 'ai_analysis' && e.output && typeof e.output === 'object' && e.output.completenessScore != null);
  const aiAnalysis = aiAnalysisEvent?.output;

  return (
    <div className="p-4 space-y-4">
      {/* Overall Summary */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Generation Summary
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <GenerationMetricCard
            label="Status"
            value={isGenerating ? 'Running' : metrics?.isComplete ? 'Complete' : metrics?.hasErrors ? 'Failed' : 'Idle'}
            color={isGenerating ? '#eab308' : metrics?.isComplete ? '#22c55e' : metrics?.hasErrors ? '#ef4444' : '#6b7280'}
          />
          <GenerationMetricCard
            label="Duration"
            value={`${metrics?.totalDuration || 0}ms`}
            color="#3b82f6"
          />
          <GenerationMetricCard
            label="AI Calls"
            value={metrics?.aiCallCount || 0}
            color="#f59e0b"
          />
          <GenerationMetricCard
            label="Tool Calls"
            value={metrics?.toolCallCount || 0}
            color="#8b5cf6"
          />
          {metrics?.totalTokens > 0 && (
            <>
              <GenerationMetricCard
                label="Tokens"
                value={metrics.totalTokens}
                color="#06b6d4"
              />
              <GenerationMetricCard
                label="Errors"
                value={metrics?.errorCount || 0}
                color={metrics?.errorCount > 0 ? '#ef4444' : '#6b7280'}
              />
            </>
          )}
        </div>
      </div>

      {/* AI Analysis Summary (shown when available) */}
      {aiAnalysis && (
        <div>
          <h3 className="text-xs font-semibold text-pink-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI Quality Analysis
          </h3>
          <div className="space-y-2">
            {/* Score */}
            <div className={`p-2.5 rounded border ${
              aiAnalysis.completenessScore >= 80 ? 'border-green-500/30 bg-green-500/5' :
              aiAnalysis.completenessScore >= 50 ? 'border-yellow-500/30 bg-yellow-500/5' :
              'border-red-500/30 bg-red-500/5'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 uppercase">Completeness</span>
                <span className={`text-base font-bold ${
                  aiAnalysis.completenessScore >= 80 ? 'text-green-400' :
                  aiAnalysis.completenessScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {aiAnalysis.completenessScore}%
                </span>
              </div>
              <div className="h-1.5 bg-[#21262d] rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    aiAnalysis.completenessScore >= 80 ? 'bg-green-500' :
                    aiAnalysis.completenessScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${aiAnalysis.completenessScore}%` }}
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-1.5">
              {aiAnalysis.missingEntities?.length > 0 && (
                <div className="p-1.5 rounded bg-orange-500/10 border border-orange-500/20 text-center">
                  <div className="text-sm font-bold text-orange-400">{aiAnalysis.missingEntities.length}</div>
                  <div className="text-[9px] text-orange-300/70">Missing Entities</div>
                </div>
              )}
              {aiAnalysis.missingRelations?.length > 0 && (
                <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                  <div className="text-sm font-bold text-amber-400">{aiAnalysis.missingRelations.length}</div>
                  <div className="text-[9px] text-amber-300/70">Missing Relations</div>
                </div>
              )}
              {aiAnalysis.incorrectItems?.length > 0 && (
                <div className="p-1.5 rounded bg-red-500/10 border border-red-500/20 text-center">
                  <div className="text-sm font-bold text-red-400">{aiAnalysis.incorrectItems.length}</div>
                  <div className="text-[9px] text-red-300/70">Issues</div>
                </div>
              )}
              {aiAnalysis.recommendations?.length > 0 && (
                <div className="p-1.5 rounded bg-purple-500/10 border border-purple-500/20 text-center">
                  <div className="text-sm font-bold text-purple-400">{aiAnalysis.recommendations.length}</div>
                  <div className="text-[9px] text-purple-300/70">Recommendations</div>
                </div>
              )}
            </div>

            {/* Summary text */}
            {aiAnalysis.summary && (
              <p className="text-[10px] text-gray-400 leading-relaxed p-2 bg-[#0d1117] rounded border border-[#30363d]">
                {aiAnalysis.summary}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Errors Section */}
      {metrics?.errorEvents?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Errors ({metrics.errorEvents.length})
          </h3>
          <div className="space-y-2">
            {metrics.errorEvents.map((event, idx) => (
              <button
                key={event.id || idx}
                onClick={() => onSelectEvent(event.id || idx)}
                className="w-full text-left p-2 rounded border transition-colors border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
              >
                <div className="text-xs text-red-400 font-medium">
                  {event.title || 'Error'}
                </div>
                {event.error && (
                  <div className="text-[10px] text-red-300/70 truncate mt-0.5">
                    {typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Event Details */}
      {selectedEvent && (
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Selected Event
          </h3>
          <div className="p-3 rounded border border-blue-500/30 bg-blue-500/5">
            <div className="text-sm text-white font-medium mb-1">
              {selectedEvent.title || EVENT_TYPES[selectedEvent.type]?.label || selectedEvent.type}
            </div>
            <div className="text-xs text-gray-400 mb-2">
              {selectedEvent.type} • {selectedEvent.duration || 0}ms
            </div>
            {selectedEvent.subtitle && (
              <div className="text-xs text-gray-500 mb-2">
                {selectedEvent.subtitle}
              </div>
            )}
            {/* Rich rendering for AI analysis selected event */}
            {selectedEvent.type === 'ai_analysis' && selectedEvent.output && typeof selectedEvent.output === 'object' && !selectedEvent.output.parseError ? (
              <AIAnalysisDetails analysis={selectedEvent.output} />
            ) : selectedEvent.output && (
              <div className="mt-2 pt-2 border-t border-[#30363d]">
                <div className="text-[10px] text-gray-400 uppercase mb-1">Output</div>
                <pre className="text-[10px] text-green-300 max-h-24 overflow-auto">
                  {typeof selectedEvent.output === 'string'
                    ? selectedEvent.output.slice(0, 300)
                    : JSON.stringify(selectedEvent.output, null, 2).slice(0, 300)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION METRIC CARD
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationMetricCard = ({ label, value, color }) => (
  <div className="p-2 rounded bg-[#0d1117] border border-[#30363d]">
    <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    <div className="text-sm font-bold" style={{ color }}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   GENERATION JSON VIEW
   ═══════════════════════════════════════════════════════════════════════════ */

const GenerationJsonView = ({ events }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Raw Generation Events
        </h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-[#21262d] rounded transition-colors"
        >
          <Code className="w-3 h-3" />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-green-300 font-mono bg-[#161b22] p-4 rounded border border-[#30363d] overflow-auto">
        {JSON.stringify(events, null, 2)}
      </pre>
    </div>
  );
};

export default BottomPanel;
