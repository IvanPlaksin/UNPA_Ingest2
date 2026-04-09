/**
 * ExecutionOverlay — GXE canvas execution progress overlay.
 *
 * Migrated from AOPEG/ExecutionOverlay.tsx (CONS-11).
 * Shows: floating progress card + status during execution.
 * Works with existing GXE nodeStates and phase state.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Play, Square, CheckCircle, XCircle, Clock,
  Loader2, ChevronDown, ChevronUp, AlertTriangle, Pause,
} from 'lucide-react';

// ── Helpers ──
function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const STATUS_COLORS = {
  pending:  'text-gray-500',
  running:  'text-blue-400',
  done:     'text-green-400',
  error:    'text-red-400',
  waiting:  'text-amber-400',
  skipped:  'text-gray-600',
};

// ── ExecutionOverlay ──
const ExecutionOverlay = ({
  phase,
  nodeStates = {},
  stats = { done: 0, total: 0, ms: 0 },
  executionOrder = [],
  onCancel,
  onPause,
  onResume,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => phase === 'executing' ? Date.now() : null);

  const isExecuting = phase === 'executing';

  // Elapsed timer
  useEffect(() => {
    if (!isExecuting) return;
    const start = startTime || Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [isExecuting, startTime]);

  // Compute stats
  const computed = useMemo(() => {
    const entries = Object.entries(nodeStates);
    const total = entries.length || stats.total;
    const done = entries.filter(([, s]) => s.status === 'done').length || stats.done;
    const errors = entries.filter(([, s]) => s.status === 'error');
    const running = entries.find(([, s]) => s.status === 'running');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, errors, running, pct };
  }, [nodeStates, stats]);

  // Don't render if not executing and no results
  if (phase !== 'executing' && phase !== 'done') return null;

  const isDone = phase === 'done';
  const hasErrors = computed.errors.length > 0;

  const statusColor = hasErrors ? 'text-red-400' : isDone ? 'text-green-400' : 'text-blue-400';
  const statusBg = hasErrors ? 'bg-red-500/10' : isDone ? 'bg-green-500/10' : 'bg-blue-500/10';
  const StatusIcon = hasErrors ? XCircle : isDone ? CheckCircle : Loader2;

  return (
    <div className="absolute top-16 right-4 w-72 bg-[#161b22]/95 backdrop-blur-sm rounded-lg border border-[#30363d] shadow-xl shadow-black/30 z-40">
      {/* Header */}
      <div className={`px-3 py-2 border-b border-[#30363d] ${statusBg} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon size={16} className={`${statusColor} ${isExecuting && !hasErrors ? 'animate-spin' : ''}`} />
            <span className={`text-xs font-semibold ${statusColor}`}>
              {hasErrors ? 'Failed' : isDone ? 'Completed' : 'Executing'}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 tabular-nums">
            {fmtDuration(elapsed || stats.ms)}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="px-3 py-2">
        {/* Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Progress</span>
            <span>{computed.done}/{computed.total} nodes</span>
          </div>
          <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${hasErrors ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${computed.pct}%` }}
            />
          </div>
        </div>

        {/* Current node */}
        {computed.running && isExecuting && (
          <div className="flex items-center gap-1.5 text-[11px] mb-1.5">
            <Play size={10} className="text-blue-400" />
            <span className="text-gray-500">Current:</span>
            <span className="text-gray-200 truncate">{computed.running[0]}</span>
          </div>
        )}

        {/* Elapsed */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <Clock size={10} className="text-gray-600" />
          <span className="text-gray-500">Elapsed:</span>
          <span className="text-gray-300 tabular-nums">{fmtDuration(elapsed || stats.ms)}</span>
        </div>

        {/* Errors */}
        {hasErrors && (
          <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
            {computed.errors.slice(0, 3).map(([nodeId, state]) => (
              <div key={nodeId} className="flex items-start gap-1.5 text-[10px] text-red-400 mb-1">
                <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
                <span className="truncate"><strong>{nodeId}</strong>: {state.error || 'Failed'}</span>
              </div>
            ))}
            {computed.errors.length > 3 && (
              <div className="text-[10px] text-red-400/60">+{computed.errors.length - 3} more errors</div>
            )}
          </div>
        )}

        {/* Expandable node list */}
        {Object.keys(nodeStates).length > 0 && (
          <div className="border-t border-[#21262d] pt-2 mt-2">
            <button
              className="flex items-center justify-between w-full text-[10px] text-gray-500 hover:text-gray-300"
              onClick={() => setExpanded(!expanded)}
            >
              <span>Node Details</span>
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {expanded && (
              <div className="mt-1.5 max-h-32 overflow-y-auto space-y-0.5">
                {(executionOrder.length > 0 ? executionOrder : Object.keys(nodeStates)).map(nodeId => {
                  const state = nodeStates[nodeId];
                  if (!state) return null;
                  return (
                    <div key={nodeId} className="flex items-center justify-between text-[10px] py-0.5 px-1.5 rounded bg-[#0d1117]">
                      <span className="text-gray-400 truncate max-w-[140px]">{nodeId}</span>
                      <span className={STATUS_COLORS[state.status] || 'text-gray-500'}>
                        {state.status}
                        {state.duration ? ` ${fmtDuration(state.duration)}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {isExecuting && (
        <div className="px-3 py-2 border-t border-[#21262d] flex gap-2">
          {onPause && (
            <button
              onClick={onPause}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <Pause size={11} /> Pause
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              <Square size={11} /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExecutionOverlay;
