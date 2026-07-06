/**
 * AnalysisLogTab - Real-time analysis event trace + graph comparison view.
 *
 * Three view modes:
 *  - Event Trace: span-tree style log of analysis operations
 *  - Comparison: before/after graph diff with change list
 *  - JSON: raw event data export
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle, AlertCircle, Terminal, ChevronDown, ChevronUp,
  Clock, Zap, Brain, Layers, Database, Search, Code, Loader2,
  ArrowRight, GitCompare, Minus, Plus, RefreshCw, ShieldCheck,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// EVENT TYPE CONFIG
// ═══════════════════════════════════════════════════════════════

const ANALYSIS_EVENT_TYPES = {
  structural_analysis: { label: 'Structural Analysis', color: '#3b82f6', Icon: Search },
  community_detection: { label: 'Community Detection', color: '#8b5cf6', Icon: Layers },
  coherence_evaluation: { label: 'Coherence Eval', color: '#14b8a6', Icon: Brain },
  extraction: { label: 'Extraction', color: '#f59e0b', Icon: Zap },
  consolidation: { label: 'Consolidation', color: '#10b981', Icon: Database },
  ai_validation: { label: 'AI Validation', color: '#f97316', Icon: ShieldCheck },
  checkpoint: { label: 'Checkpoint', color: '#6366f1', Icon: CheckCircle },
  info: { label: 'Info', color: '#94a3b8', Icon: Terminal },
  error: { label: 'Error', color: '#ef4444', Icon: AlertCircle },
  complete: { label: 'Complete', color: '#22c55e', Icon: CheckCircle },
};

const PHASE_LABELS = {
  understand: 'Understand',
  discover: 'Discover',
  evaluate: 'Evaluate',
  act: 'Act',
};

// ═══════════════════════════════════════════════════════════════
// DIFF COMPUTATION
// ═══════════════════════════════════════════════════════════════

const computeAnalysisDiff = (events) => {
  const completeEvt = events.find(e => e.type === 'complete' && e.phase === 'act');
  if (!completeEvt?.output) return null;

  const { beforeStats, afterStats, actions, errors } = completeEvt.output;
  const consolidations = events.filter(e => e.type === 'consolidation' && e.status === 'done');

  return {
    before: beforeStats || { nodeCount: 0, edgeCount: 0 },
    after: afterStats || { nodeCount: 0, edgeCount: 0 },
    changes: [
      ...consolidations.map(e => ({
        type: 'consolidation',
        clusterName: e.output?.clusterName || e.subtitle || 'Cluster',
        nodeCount: e.output?.nodeCount || 0,
        subgraphId: e.output?.subgraphId,
      })),
      ...(actions || []).filter(a => a.success && a.result?.subgraphId).map(a => ({
        type: 'subgraph_created',
        clusterName: a.clusterName,
        subgraphId: a.result.subgraphId,
        nodeCount: a.result.nodeCount || 0,
      })),
    ],
    errors: errors || [],
    validations: events
      .filter(e => e.type === 'ai_validation' && e.status === 'done' && e.output)
      .map(e => ({
        clusterName: e.title?.replace(/^Validating "/, '').replace(/"$/, '') || 'SubGraph',
        ...e.output,
      })),
    metrics: {
      nodeDelta: (afterStats?.nodeCount || 0) - (beforeStats?.nodeCount || 0),
      edgeDelta: (afterStats?.edgeCount || 0) - (beforeStats?.edgeCount || 0),
      clustersProcessed: consolidations.length || actions?.filter(a => a.success).length || 0,
    },
  };
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const AnalysisLogTab = ({ events, isAnalyzing, onNodeClick }) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [viewMode, setViewMode] = useState('trace'); // 'trace' | 'comparison' | 'json'
  const logEndRef = useRef(null);

  const diff = useMemo(() => computeAnalysisDiff(events || []), [events]);
  const hasCompletion = !!diff;

  // Auto-scroll on new events
  useEffect(() => {
    if (viewMode === 'trace') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, viewMode]);

  const metrics = useMemo(() => {
    if (!events || events.length === 0) return null;
    const totalDuration = events.reduce((sum, e) => sum + (e.duration || 0), 0);
    const errorEvents = events.filter(e => e.type === 'error' || e.status === 'error');
    const phases = [...new Set(events.map(e => e.phase).filter(Boolean))];
    return {
      totalEvents: events.length,
      totalDuration,
      errorCount: errorEvents.length,
      errorEvents,
      phases,
      isComplete: events.some(e => e.type === 'complete'),
      hasErrors: errorEvents.length > 0,
    };
  }, [events]);

  const toggleExpand = useCallback((eventId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(eventId) ? next.delete(eventId) : next.add(eventId);
      return next;
    });
  }, []);

  const selectedEvent = selectedEventId
    ? events?.find(e => e.id === selectedEventId)
    : null;

  // Empty state
  if (!events || events.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#0d1117]">
        <Search className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No Analysis Events</p>
        <p className="text-xs text-gray-600 mt-1">Events will appear when you run Guided Analysis</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header with view toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          {['trace', 'comparison', 'json'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              disabled={mode === 'comparison' && !hasCompletion}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-[#30363d] text-white'
                  : mode === 'comparison' && !hasCompletion
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {mode === 'trace' ? 'Event Trace' : mode === 'comparison' ? 'Comparison' : 'JSON'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Status badge */}
        <AnalysisStatusBadge isAnalyzing={isAnalyzing} metrics={metrics} />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Search className="w-3 h-3" />
            {metrics?.totalEvents || 0}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {metrics?.totalDuration || 0}ms
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'trace' ? (
          <>
            {/* Event trace (left) */}
            <div className="flex-1 overflow-auto border-r border-[#30363d]">
              <div className="p-3 space-y-1">
                {events.map((event, idx) => (
                  <AnalysisSpanRow
                    key={event.id || idx}
                    event={event}
                    index={idx}
                    totalDuration={metrics?.totalDuration || 1}
                    isExpanded={expandedIds.has(event.id)}
                    isSelected={selectedEventId === event.id}
                    onToggle={() => toggleExpand(event.id)}
                    onSelect={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
                    onNodeClick={onNodeClick}
                  />
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Summary panel (right) */}
            <div className="w-80 overflow-auto bg-[#161b22]">
              <AnalysisSummaryPanel
                metrics={metrics}
                isAnalyzing={isAnalyzing}
                selectedEvent={selectedEvent}
                diff={diff}
              />
            </div>
          </>
        ) : viewMode === 'comparison' ? (
          <AnalysisComparisonView diff={diff} events={events} onNodeClick={onNodeClick} />
        ) : (
          <AnalysisJsonView events={events} />
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════════

const AnalysisStatusBadge = ({ isAnalyzing, metrics }) => {
  if (isAnalyzing) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analyzing
      </div>
    );
  }
  if (metrics?.hasErrors) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
        <AlertCircle className="w-3.5 h-3.5" />
        Errors
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

// ═══════════════════════════════════════════════════════════════
// SPAN ROW
// ═══════════════════════════════════════════════════════════════

const AnalysisSpanRow = ({
  event, index, totalDuration,
  isExpanded, isSelected, onToggle, onSelect, onNodeClick,
}) => {
  const config = ANALYSIS_EVENT_TYPES[event.type] || ANALYSIS_EVENT_TYPES.info;
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
          ? 'border-purple-500/50 bg-purple-500/5'
          : 'border-[#30363d] hover:border-[#484f58]'
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={onSelect}>
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[#30363d] ${
            !hasDetails ? 'invisible' : ''
          }`}
        >
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronUp className="w-3.5 h-3.5 text-gray-400 rotate-180" />}
        </button>

        {/* Step number */}
        <span className="w-6 text-xs text-gray-500 font-mono text-right">{index + 1}.</span>

        {/* Type icon */}
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ backgroundColor: config.color + '20' }}
        >
          {isRunning
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: config.color }} />
            : <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate">
              {event.title || config.label}
            </span>
            {event.phase && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#30363d] text-gray-400 uppercase">
                {PHASE_LABELS[event.phase] || event.phase}
              </span>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium"
              style={{ backgroundColor: config.color + '20', color: config.color }}
            >
              {event.type}
            </span>
          </div>
          {event.subtitle && (
            <div className="text-xs text-gray-500 truncate">{event.subtitle}</div>
          )}
        </div>

        {/* Node refs */}
        {event.nodeRefs?.length > 0 && onNodeClick && (
          <div className="flex items-center gap-1">
            {event.nodeRefs.slice(0, 3).map(nid => (
              <button
                key={nid}
                onClick={(e) => { e.stopPropagation(); onNodeClick([nid]); }}
                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 truncate max-w-[80px]"
                title={`Highlight node: ${nid}`}
              >
                {nid}
              </button>
            ))}
          </div>
        )}

        {/* Duration bar */}
        <div className="w-24 h-2 bg-[#21262d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.max(durationPercent, 2)}%`,
              backgroundColor: isError ? '#ef4444' : config.color,
            }}
          />
        </div>

        {/* Duration text */}
        <span className="w-16 text-xs text-gray-400 text-right font-mono">
          {duration > 0 ? `${duration}ms` : isRunning ? '...' : ''}
        </span>

        {/* Status icon */}
        <div className="w-6 flex justify-center">
          {isError ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : isRunning ? (
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
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
                  {typeof event.input === 'string' ? event.input : JSON.stringify(event.input, null, 2)}
                </pre>
              </div>
            )}
            {event.output && (
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

// ═══════════════════════════════════════════════════════════════
// SUMMARY PANEL (right side of trace view)
// ═══════════════════════════════════════════════════════════════

const AnalysisSummaryPanel = ({ metrics, isAnalyzing, selectedEvent, diff }) => {
  return (
    <div className="p-4 space-y-4">
      {/* Phase progress */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Analysis Progress
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Status"
            value={isAnalyzing ? 'Running' : metrics?.isComplete ? 'Complete' : metrics?.hasErrors ? 'Failed' : 'Idle'}
            color={isAnalyzing ? '#a855f7' : metrics?.isComplete ? '#22c55e' : metrics?.hasErrors ? '#ef4444' : '#6b7280'}
          />
          <MetricCard label="Duration" value={`${metrics?.totalDuration || 0}ms`} color="#3b82f6" />
          <MetricCard label="Events" value={metrics?.totalEvents || 0} color="#8b5cf6" />
          <MetricCard
            label="Errors"
            value={metrics?.errorCount || 0}
            color={metrics?.errorCount > 0 ? '#ef4444' : '#6b7280'}
          />
        </div>
      </div>

      {/* Phase badges */}
      {metrics?.phases?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Phases Completed
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {metrics.phases.map(phase => (
              <span
                key={phase}
                className="px-2 py-1 text-[10px] rounded-full bg-purple-500/20 text-purple-300 font-medium uppercase"
              >
                {PHASE_LABELS[phase] || phase}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick diff summary if available */}
      {diff && (
        <div>
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <GitCompare className="w-3 h-3" />
            Result
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard label="Nodes" value={`${diff.metrics.nodeDelta >= 0 ? '+' : ''}${diff.metrics.nodeDelta}`} color={diff.metrics.nodeDelta <= 0 ? '#22c55e' : '#f59e0b'} />
            <MetricCard label="Edges" value={`${diff.metrics.edgeDelta >= 0 ? '+' : ''}${diff.metrics.edgeDelta}`} color={diff.metrics.edgeDelta <= 0 ? '#22c55e' : '#f59e0b'} />
            <MetricCard label="Clusters" value={diff.metrics.clustersProcessed} color="#8b5cf6" />
            <MetricCard label="Errors" value={diff.errors.length} color={diff.errors.length > 0 ? '#ef4444' : '#6b7280'} />
          </div>
        </div>
      )}

      {/* Errors section */}
      {metrics?.errorEvents?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Errors ({metrics.errorEvents.length})
          </h3>
          <div className="space-y-2">
            {metrics.errorEvents.map((event, idx) => (
              <div key={event.id || idx} className="p-2 rounded border border-red-500/30 bg-red-500/5">
                <div className="text-xs text-red-400 font-medium">{event.title || 'Error'}</div>
                {event.error && (
                  <div className="text-[10px] text-red-300/70 truncate mt-0.5">
                    {typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected event */}
      {selectedEvent && (
        <div>
          <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Selected Event
          </h3>
          <div className="p-3 rounded border border-purple-500/30 bg-purple-500/5">
            <div className="text-sm text-white font-medium mb-1">
              {selectedEvent.title || ANALYSIS_EVENT_TYPES[selectedEvent.type]?.label || selectedEvent.type}
            </div>
            <div className="text-xs text-gray-400 mb-2">
              {selectedEvent.type} {selectedEvent.duration ? `| ${selectedEvent.duration}ms` : ''} {selectedEvent.phase ? `| ${PHASE_LABELS[selectedEvent.phase] || selectedEvent.phase}` : ''}
            </div>
            {selectedEvent.subtitle && (
              <div className="text-xs text-gray-500 mb-2">{selectedEvent.subtitle}</div>
            )}
            {selectedEvent.output && (
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

const MetricCard = ({ label, value, color }) => (
  <div className="p-2 rounded bg-[#0d1117] border border-[#30363d]">
    <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    <div className="text-sm font-bold" style={{ color }}>{value}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// COMPARISON VIEW
// ═══════════════════════════════════════════════════════════════

const AnalysisComparisonView = ({ diff, events, onNodeClick }) => {
  if (!diff) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p className="text-sm">No comparison data yet. Run a full analysis cycle to see results.</p>
      </div>
    );
  }

  const { before, after, changes, errors, metrics, validations = [] } = diff;

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {/* Stats comparison */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
          <GitCompare className="w-3.5 h-3.5" />
          Graph Statistics
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {/* Header */}
          <div className="text-[10px] text-gray-500 uppercase font-medium">Metric</div>
          <div className="text-[10px] text-gray-500 uppercase font-medium text-center">Before</div>
          <div className="text-[10px] text-gray-500 uppercase font-medium text-center">After</div>
          <div className="text-[10px] text-gray-500 uppercase font-medium text-center">Change</div>

          {/* Nodes row */}
          <div className="text-xs text-gray-300 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            Nodes
          </div>
          <div className="text-sm text-white text-center font-mono">{before.nodeCount}</div>
          <div className="text-sm text-white text-center font-mono">{after.nodeCount}</div>
          <DeltaBadge value={metrics.nodeDelta} base={before.nodeCount} />

          {/* Edges row */}
          <div className="text-xs text-gray-300 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            Edges
          </div>
          <div className="text-sm text-white text-center font-mono">{before.edgeCount}</div>
          <div className="text-sm text-white text-center font-mono">{after.edgeCount}</div>
          <DeltaBadge value={metrics.edgeDelta} base={before.edgeCount} />
        </div>
      </div>

      {/* Consolidation summary */}
      {metrics.clustersProcessed > 0 && (
        <div className="p-3 rounded border border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center gap-2 text-sm text-purple-300 font-medium">
            <Layers className="w-4 h-4" />
            {metrics.clustersProcessed} cluster{metrics.clustersProcessed !== 1 ? 's' : ''} consolidated
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {Math.abs(metrics.nodeDelta)} node{Math.abs(metrics.nodeDelta) !== 1 ? 's' : ''} replaced by SubGraph proxy node{metrics.clustersProcessed !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Change list */}
      {changes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Changes
          </h3>
          <div className="space-y-2">
            {changes.map((change, idx) => (
              <ChangeItem key={idx} change={change} onNodeClick={onNodeClick} />
            ))}
          </div>
        </div>
      )}

      {/* AI Validation Results */}
      {validations.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            AI Validation ({validations.length})
          </h3>
          <div className="space-y-3">
            {validations.map((v, idx) => (
              <ValidationCard key={idx} validation={v} />
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Errors ({errors.length})
          </h3>
          <div className="space-y-2">
            {errors.map((err, idx) => (
              <div key={idx} className="p-2 rounded border border-red-500/30 bg-red-500/5">
                <div className="text-xs text-red-400 font-medium">{err.clusterName || 'Unknown'}</div>
                <div className="text-[10px] text-red-300/70 mt-0.5">{err.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="p-3 rounded border border-[#30363d] bg-[#161b22]">
        <h4 className="text-xs text-gray-400 font-medium mb-2">What happened?</h4>
        <ul className="space-y-1.5 text-xs text-gray-500">
          {metrics.clustersProcessed > 0 && (
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5 shrink-0">1.</span>
              <span>Selected clusters were consolidated into SubGraph nodes in the knowledge graph.</span>
            </li>
          )}
          {metrics.nodeDelta < 0 && (
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5 shrink-0">2.</span>
              <span>{Math.abs(metrics.nodeDelta)} internal nodes were archived and replaced by proxy SubGraph nodes.</span>
            </li>
          )}
          {metrics.edgeDelta < 0 && (
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5 shrink-0">3.</span>
              <span>{Math.abs(metrics.edgeDelta)} internal edges were removed. Boundary edges were rewired to SubGraph proxies.</span>
            </li>
          )}
          {metrics.nodeDelta === 0 && metrics.edgeDelta === 0 && (
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5 shrink-0">-</span>
              <span>No changes detected to the graph structure.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

const DeltaBadge = ({ value, base }) => {
  if (value === 0) return <div className="text-xs text-gray-500 text-center">-</div>;
  const percent = base > 0 ? Math.round((value / base) * 100) : 0;
  const isNeg = value < 0;
  return (
    <div className={`text-xs text-center font-mono flex items-center justify-center gap-1 ${
      isNeg ? 'text-green-400' : 'text-orange-400'
    }`}>
      {isNeg ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
      {Math.abs(value)} ({value > 0 ? '+' : ''}{percent}%)
    </div>
  );
};

const ChangeItem = ({ change, onNodeClick }) => {
  const isConsolidation = change.type === 'consolidation';
  const isSubgraph = change.type === 'subgraph_created';

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded border ${
      isConsolidation
        ? 'border-red-500/20 bg-red-500/5'
        : isSubgraph
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-[#30363d]'
    }`}>
      {/* Icon */}
      <div className={`w-7 h-7 rounded flex items-center justify-center ${
        isConsolidation ? 'bg-red-500/20' : isSubgraph ? 'bg-green-500/20' : 'bg-[#30363d]'
      }`}>
        {isConsolidation
          ? <Minus className="w-3.5 h-3.5 text-red-400" />
          : isSubgraph
            ? <Plus className="w-3.5 h-3.5 text-green-400" />
            : <RefreshCw className="w-3.5 h-3.5 text-orange-400" />}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white font-medium truncate">
          {isConsolidation
            ? `"${change.clusterName}" consolidated`
            : isSubgraph
              ? `SubGraph "${change.clusterName}" created`
              : change.clusterName}
        </div>
        <div className="text-[10px] text-gray-500">
          {change.nodeCount > 0 && `${change.nodeCount} nodes`}
          {change.subgraphId && ` | ID: ${change.subgraphId}`}
        </div>
      </div>

      {/* Highlight button */}
      {change.subgraphId && onNodeClick && (
        <button
          onClick={() => onNodeClick([change.subgraphId])}
          className="text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
        >
          Highlight
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AI VALIDATION COMPONENTS
// ═══════════════════════════════════════════════════════════════

const ScoreBadge = ({ score }) => {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return <span className="text-sm font-bold" style={{ color }}>{pct}%</span>;
};

const ScoreBar = ({ label, score }) => {
  const pct = ((score || 0) * 100).toFixed(0);
  const color = score >= 0.8 ? '#22c55e' : score >= 0.6 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
};

const ValidationCard = ({ validation }) => (
  <div className="p-3 rounded border border-orange-500/30 bg-orange-500/5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-orange-300 font-medium truncate flex-1">{validation.clusterName}</span>
      <ScoreBadge score={validation.qualityScore} />
    </div>

    <div className="space-y-1.5 mb-2">
      <ScoreBar label="Structure" score={validation.structuralIntegrity} />
      <ScoreBar label="Boundary" score={validation.boundaryCorrectness} />
      <ScoreBar label="Coherence" score={validation.semanticCoherence} />
      <ScoreBar label="Naming" score={validation.namingQuality} />
    </div>

    {validation.issues?.length > 0 && (
      <div className="mt-2 pt-2 border-t border-[#30363d]">
        <div className="text-[10px] text-red-400 uppercase font-medium mb-1">Issues ({validation.issues.length})</div>
        <div className="space-y-1">
          {validation.issues.map((issue, i) => (
            <div key={i} className="text-xs text-gray-400 flex gap-1.5">
              <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {validation.recommendations?.length > 0 && (
      <div className="mt-2 pt-2 border-t border-[#30363d]">
        <div className="text-[10px] text-blue-400 uppercase font-medium mb-1">Recommendations</div>
        <div className="space-y-1">
          {validation.recommendations.map((rec, i) => (
            <div key={i} className="text-xs text-gray-400 flex gap-1.5">
              <ArrowRight className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
              <span>{rec}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {validation.summary && (
      <div className="mt-2 pt-2 border-t border-[#30363d] text-xs text-gray-500 italic">
        {validation.summary}
      </div>
    )}

    <div className="mt-2 flex items-center gap-2">
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-gray-500">
        {validation.method || 'unknown'}
      </span>
      {validation.subgraphId && (
        <span className="text-[10px] text-gray-600 truncate">
          {validation.subgraphId}
        </span>
      )}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// JSON VIEW
// ═══════════════════════════════════════════════════════════════

const AnalysisJsonView = ({ events }) => {
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
          Raw Analysis Events
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

export default AnalysisLogTab;
