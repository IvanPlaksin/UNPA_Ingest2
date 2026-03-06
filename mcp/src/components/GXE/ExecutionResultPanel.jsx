/**
 * ExecutionResultPanel Component
 *
 * Visualizes graph execution results using Span Tree + Summary Panel pattern.
 * Based on distributed tracing visualization (like Jaeger/Temporal) adapted for GXE.
 *
 * Features:
 * - Hierarchical execution trace with time-based spans
 * - Visual representation of parallel branches
 * - Status indicators for each node (pending/running/done/error)
 * - Collapsible details for each span
 * - Summary panel with errors and metrics
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  CheckCircle, AlertCircle, Clock, ChevronRight, ChevronDown,
  Play, Pause, XCircle, SkipForward, Cpu, Brain, Briefcase,
  GitBranch, Layers, Zap, Terminal, ArrowRight, AlertTriangle,
  Activity, FileJson, Copy, ExternalLink
} from 'lucide-react';

// Node kind configurations
const NODE_KINDS = {
  input: { color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.1)', Icon: Terminal, label: 'Input' },
  output: { color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.1)', Icon: ArrowRight, label: 'Output' },
  executor: { color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', Icon: Zap, label: 'Executor' },
  ai: { color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.1)', Icon: Brain, label: 'AI' },
  business: { color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)', Icon: Briefcase, label: 'Business' },
  condition: { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', Icon: GitBranch, label: 'Condition' },
  actor: { color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.1)', Icon: Layers, label: 'Actor' }
};

// Status configurations
const STATUS_CONFIG = {
  pending: { color: '#6b7280', Icon: Clock, label: 'Pending' },
  running: { color: '#eab308', Icon: Activity, label: 'Running', animate: true },
  done: { color: '#22c55e', Icon: CheckCircle, label: 'Done' },
  error: { color: '#ef4444', Icon: XCircle, label: 'Error' },
  skipped: { color: '#6b7280', Icon: SkipForward, label: 'Skipped' }
};

/**
 * Main ExecutionResultPanel Component
 */
const ExecutionResultPanel = ({
  result,
  nodes,
  edges,
  nodeStates,
  executionOrder,
  stats,
  onNodeClick,
  onClose
}) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [viewMode, setViewMode] = useState('trace'); // 'trace' | 'timeline' | 'json'

  // Calculate execution metrics
  const executionMetrics = useMemo(() => {
    if (!result || !executionOrder) return null;

    const totalDuration = result.executionTime || 0;
    const completedNodes = executionOrder.filter(id => {
      const node = nodes?.find(n => n.id === id);
      return node?.data?.status === 'done';
    }).length;

    const errorNodes = executionOrder.filter(id => {
      const node = nodes?.find(n => n.id === id);
      return node?.data?.status === 'error';
    });

    // Calculate node durations for timeline
    const nodeDurations = {};
    let maxDuration = 0;
    executionOrder.forEach(id => {
      const node = nodes?.find(n => n.id === id);
      const duration = node?.data?.duration || 0;
      nodeDurations[id] = duration;
      if (duration > maxDuration) maxDuration = duration;
    });

    return {
      totalDuration,
      completedNodes,
      totalNodes: executionOrder.length,
      errorNodes,
      nodeDurations,
      maxDuration: maxDuration || totalDuration
    };
  }, [result, executionOrder, nodes]);

  // Toggle node expansion
  const toggleNode = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    onNodeClick?.(nodeId);
  }, [selectedNodeId, onNodeClick]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Activity className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No Execution Result</p>
        <p className="text-xs text-gray-600 mt-1">Execute a graph to see the trace here</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117]">
      {/* Header with view toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          {['trace', 'timeline', 'json'].map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-[#30363d] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              {mode === 'trace' ? 'Span Tree' : mode === 'timeline' ? 'Timeline' : 'JSON'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Overall status badge */}
        <StatusBadge result={result} />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            {executionMetrics?.completedNodes}/{executionMetrics?.totalNodes}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {result.executionTime}ms
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 w-full flex overflow-hidden">
        {viewMode === 'trace' && (
          <>
            {/* Span Tree (left side ~70%) */}
            <div className="flex-1 overflow-auto border-r border-[#30363d]">
              <SpanTree
                nodes={nodes}
                edges={edges}
                executionOrder={executionOrder}
                nodeStates={nodeStates}
                expandedNodes={expandedNodes}
                selectedNodeId={selectedNodeId}
                onToggle={toggleNode}
                onSelect={handleNodeSelect}
                totalDuration={executionMetrics?.totalDuration || 1}
              />
            </div>

            {/* Summary Panel (right side ~30%) */}
            <div className="w-80 overflow-auto bg-[#161b22]">
              <SummaryPanel
                result={result}
                executionMetrics={executionMetrics}
                selectedNodeId={selectedNodeId}
                nodes={nodes}
                nodeStates={nodeStates}
                onSelectNode={handleNodeSelect}
              />
            </div>
          </>
        )}

        {viewMode === 'timeline' && (
          <TimelineView
            nodes={nodes}
            executionOrder={executionOrder}
            nodeStates={nodeStates}
            totalDuration={executionMetrics?.totalDuration || 1}
            onNodeClick={handleNodeSelect}
          />
        )}

        {viewMode === 'json' && (
          <JsonView result={result} nodeStates={nodeStates} />
        )}
      </div>
    </div>
  );
};

/**
 * Status Badge Component
 */
const StatusBadge = ({ result }) => {
  const status = result.success ? 'success' : result.cancelled ? 'cancelled' : 'error';
  const config = {
    success: { bg: 'bg-green-500/20', text: 'text-green-400', Icon: CheckCircle, label: 'Success' },
    cancelled: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', Icon: AlertTriangle, label: 'Cancelled' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400', Icon: XCircle, label: 'Failed' }
  }[status];

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <config.Icon className="w-3.5 h-3.5" />
      {config.label}
    </div>
  );
};

/**
 * Span Tree Component - Hierarchical execution trace
 */
const SpanTree = ({
  nodes,
  edges,
  executionOrder,
  nodeStates,
  expandedNodes,
  selectedNodeId,
  onToggle,
  onSelect,
  totalDuration
}) => {
  // Calculate depth for indentation (based on incoming edges)
  const getNodeDepth = useCallback((nodeId) => {
    // Simple depth calculation based on position in execution order
    const idx = executionOrder?.indexOf(nodeId) || 0;
    if (nodeId === 'input') return 0;
    if (nodeId === 'output') return 0;
    // Check if node is in parallel (multiple incoming edges at same time)
    const incomingEdges = edges?.filter(e => e.target === nodeId) || [];
    return incomingEdges.length > 1 ? 1 : 0;
  }, [executionOrder, edges]);

  if (!executionOrder || executionOrder.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No execution trace available
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      {executionOrder.map((nodeId, index) => {
        const node = nodes?.find(n => n.id === nodeId);
        if (!node) return null;

        const nodeData = node.data || {};
        const state = nodeStates?.[nodeId];
        const isExpanded = expandedNodes.has(nodeId);
        const isSelected = selectedNodeId === nodeId;
        const depth = getNodeDepth(nodeId);

        return (
          <SpanRow
            key={nodeId}
            nodeId={nodeId}
            nodeData={nodeData}
            state={state}
            index={index}
            totalNodes={executionOrder.length}
            totalDuration={totalDuration}
            depth={depth}
            isExpanded={isExpanded}
            isSelected={isSelected}
            onToggle={() => onToggle(nodeId)}
            onSelect={() => onSelect(nodeId)}
          />
        );
      })}
    </div>
  );
};

/**
 * Individual Span Row Component
 */
const SpanRow = ({
  nodeId,
  nodeData,
  state,
  index,
  totalNodes,
  totalDuration,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect
}) => {
  const kind = nodeData.kind || 'executor';
  const kindConfig = NODE_KINDS[kind] || NODE_KINDS.executor;
  const status = nodeData.status || 'pending';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const duration = nodeData.duration || 0;
  const durationPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;

  const KindIcon = kindConfig.Icon;
  const StatusIcon = statusConfig.Icon;

  // Check if has details to show
  const hasDetails = state || nodeData.description || nodeData.error;

  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-[#30363d] hover:border-[#484f58]'
      }`}
      style={{ marginLeft: depth * 24 }}
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
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
        </button>

        {/* Step number */}
        <span className="w-6 text-xs text-gray-500 font-mono text-right">
          {index + 1}.
        </span>

        {/* Kind icon */}
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ backgroundColor: kindConfig.bgColor }}
        >
          <KindIcon className="w-3.5 h-3.5" style={{ color: kindConfig.color }} />
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate">
              {nodeData.label || nodeId}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium"
              style={{
                backgroundColor: kindConfig.bgColor,
                color: kindConfig.color
              }}
            >
              {kind}
            </span>
          </div>
        </div>

        {/* Duration bar */}
        <div className="w-32 h-2 bg-[#21262d] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.max(durationPercent, 2)}%`,
              backgroundColor: statusConfig.color
            }}
          />
        </div>

        {/* Duration text */}
        <span className="w-16 text-xs text-gray-400 text-right font-mono">
          {duration}ms
        </span>

        {/* Status icon */}
        <div className="w-6 flex justify-center">
          <StatusIcon
            className={`w-4 h-4 ${statusConfig.animate ? 'animate-pulse' : ''}`}
            style={{ color: statusConfig.color }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-1 border-t border-[#30363d] bg-[#0d1117]/50">
          <div className="ml-11 space-y-2">
            {nodeData.description && (
              <div className="text-xs text-gray-400">
                {nodeData.description}
              </div>
            )}

            {nodeData.error && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                <pre className="text-xs text-red-300 whitespace-pre-wrap">
                  {nodeData.error}
                </pre>
              </div>
            )}

            {state && (
              <div className="p-2 rounded bg-[#161b22] border border-[#30363d]">
                <div className="text-xs text-gray-400 font-medium mb-1">Result</div>
                <pre className="text-xs text-cyan-300 whitespace-pre-wrap max-h-32 overflow-auto">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Summary Panel Component
 */
const SummaryPanel = ({
  result,
  executionMetrics,
  selectedNodeId,
  nodes,
  nodeStates,
  onSelectNode
}) => {
  const selectedNode = selectedNodeId ? nodes?.find(n => n.id === selectedNodeId) : null;
  const selectedState = selectedNodeId ? nodeStates?.[selectedNodeId] : null;

  return (
    <div className="p-4 space-y-4">
      {/* Overall Summary */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Execution Summary
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Status"
            value={result.success ? 'Success' : result.cancelled ? 'Cancelled' : 'Failed'}
            color={result.success ? '#22c55e' : result.cancelled ? '#eab308' : '#ef4444'}
          />
          <MetricCard
            label="Duration"
            value={`${result.executionTime}ms`}
            color="#3b82f6"
          />
          <MetricCard
            label="Completed"
            value={`${executionMetrics?.completedNodes || 0}/${executionMetrics?.totalNodes || 0}`}
            color="#22c55e"
          />
          <MetricCard
            label="Errors"
            value={executionMetrics?.errorNodes?.length || 0}
            color={executionMetrics?.errorNodes?.length > 0 ? '#ef4444' : '#6b7280'}
          />
        </div>
      </div>

      {/* Errors Section */}
      {executionMetrics?.errorNodes?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Errors ({executionMetrics.errorNodes.length})
          </h3>
          <div className="space-y-2">
            {executionMetrics.errorNodes.map(nodeId => {
              const node = nodes?.find(n => n.id === nodeId);
              const nodeData = node?.data || {};
              return (
                <button
                  key={nodeId}
                  onClick={() => onSelectNode(nodeId)}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    selectedNodeId === nodeId
                      ? 'border-red-500/50 bg-red-500/10'
                      : 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
                  }`}
                >
                  <div className="text-xs text-red-400 font-medium">
                    {nodeData.label || nodeId}
                  </div>
                  {nodeData.error && (
                    <div className="text-[10px] text-red-300/70 truncate mt-0.5">
                      {nodeData.error}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Node Details */}
      {selectedNode && (
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Selected Node
          </h3>
          <div className="p-3 rounded border border-blue-500/30 bg-blue-500/5">
            <div className="text-sm text-white font-medium mb-1">
              {selectedNode.data?.label || selectedNode.id}
            </div>
            <div className="text-xs text-gray-400 mb-2">
              {selectedNode.data?.kind} • {selectedNode.data?.duration || 0}ms
            </div>
            {selectedNode.data?.description && (
              <div className="text-xs text-gray-500 mb-2">
                {selectedNode.data.description}
              </div>
            )}
            {selectedState && (
              <div className="mt-2 pt-2 border-t border-[#30363d]">
                <div className="text-[10px] text-gray-400 uppercase mb-1">Result</div>
                <pre className="text-[10px] text-cyan-300 max-h-24 overflow-auto">
                  {JSON.stringify(selectedState, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Output Preview */}
      {result.output && (
        <div>
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Final Output
          </h3>
          <div className="p-2 rounded border border-green-500/30 bg-green-500/5">
            <pre className="text-[10px] text-green-300 max-h-32 overflow-auto">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Metric Card Component
 */
const MetricCard = ({ label, value, color }) => (
  <div className="p-2 rounded bg-[#0d1117] border border-[#30363d]">
    <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    <div className="text-sm font-bold" style={{ color }}>{value}</div>
  </div>
);

/**
 * Timeline View Component - Gantt-style visualization
 */
const TimelineView = ({ nodes, executionOrder, nodeStates, totalDuration, onNodeClick }) => {
  if (!executionOrder || executionOrder.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No timeline data available
      </div>
    );
  }

  // Calculate cumulative start times
  let cumulativeTime = 0;
  const nodeTimings = executionOrder.map(nodeId => {
    const node = nodes?.find(n => n.id === nodeId);
    const duration = node?.data?.duration || 0;
    const startTime = cumulativeTime;
    cumulativeTime += duration;
    return { nodeId, startTime, duration };
  });

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Time axis header */}
      <div className="flex items-center mb-4 ml-48">
        <div className="flex-1 relative h-6">
          {[0, 25, 50, 75, 100].map(percent => (
            <div
              key={percent}
              className="absolute text-[10px] text-gray-500"
              style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
            >
              {Math.round((percent / 100) * totalDuration)}ms
            </div>
          ))}
        </div>
      </div>

      {/* Timeline rows */}
      <div className="space-y-1">
        {nodeTimings.map(({ nodeId, startTime, duration }) => {
          const node = nodes?.find(n => n.id === nodeId);
          const nodeData = node?.data || {};
          const kind = nodeData.kind || 'executor';
          const kindConfig = NODE_KINDS[kind] || NODE_KINDS.executor;
          const status = nodeData.status || 'pending';
          const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

          const leftPercent = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
          const widthPercent = totalDuration > 0 ? Math.max((duration / totalDuration) * 100, 1) : 1;

          return (
            <div
              key={nodeId}
              className="flex items-center h-8 cursor-pointer hover:bg-[#21262d]/50 rounded"
              onClick={() => onNodeClick(nodeId)}
            >
              {/* Label */}
              <div className="w-48 flex items-center gap-2 pr-3">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: kindConfig.bgColor }}
                >
                  <kindConfig.Icon className="w-3 h-3" style={{ color: kindConfig.color }} />
                </div>
                <span className="text-xs text-white truncate">
                  {nodeData.label || nodeId}
                </span>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 relative h-6">
                <div
                  className="absolute h-full rounded flex items-center px-2"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundColor: statusConfig.color + '40',
                    borderLeft: `3px solid ${statusConfig.color}`
                  }}
                >
                  <span className="text-[10px] text-white font-mono whitespace-nowrap">
                    {duration}ms
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * JSON View Component
 */
const JsonView = ({ result, nodeStates }) => {
  const [copied, setCopied] = useState(false);

  const fullData = {
    result,
    nodeStates
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(fullData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Raw Execution Data
        </h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-[#21262d] rounded transition-colors"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-green-300 font-mono bg-[#161b22] p-4 rounded border border-[#30363d] overflow-auto">
        {JSON.stringify(fullData, null, 2)}
      </pre>
    </div>
  );
};

export default ExecutionResultPanel;
