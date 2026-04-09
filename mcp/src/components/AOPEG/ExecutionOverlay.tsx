/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Execution Overlay
 * Floating panel showing execution progress and status - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import {
  Play,
  Square,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface NodeExecutionState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  retryAttempt?: number;
}

export interface ExecutionOverlayState {
  isRunning: boolean;
  executionId: string | null;
  startedAt: Date | null;

  // Node states
  nodeStates: Map<string, NodeExecutionState>;

  // Progress
  totalNodes: number;
  completedNodes: number;
  currentNodeId: string | null;

  // Error
  error: string | null;
}

interface ExecutionOverlayProps {
  executionState: ExecutionOverlayState;
  onCancel: () => void;
  onClose?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatElapsedTime(startedAt: Date | null): string {
  if (!startedAt) return '0s';
  const elapsed = Date.now() - startedAt.getTime();
  return formatDuration(elapsed);
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const ExecutionOverlay: React.FC<ExecutionOverlayProps> = ({
  executionState,
  onCancel,
  onClose,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const [elapsedTime, setElapsedTime] = React.useState('0s');

  const {
    isRunning,
    executionId,
    startedAt,
    nodeStates,
    totalNodes,
    completedNodes,
    currentNodeId,
    error,
  } = executionState;

  // Update elapsed time every second
  React.useEffect(() => {
    if (!isRunning || !startedAt) return;

    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, startedAt]);

  // Calculate progress
  const progress = useMemo(() => {
    if (totalNodes === 0) return 0;
    return Math.round((completedNodes / totalNodes) * 100);
  }, [completedNodes, totalNodes]);

  // Get status color and icon
  const statusConfig = useMemo(() => {
    if (error) {
      return {
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        borderColor: 'border-red-500/30',
        icon: XCircle,
        label: 'Failed',
      };
    }
    if (!isRunning && completedNodes === totalNodes && totalNodes > 0) {
      return {
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        borderColor: 'border-green-500/30',
        icon: CheckCircle,
        label: 'Completed',
      };
    }
    return {
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30',
      icon: Loader2,
      label: 'Running',
    };
  }, [isRunning, error, completedNodes, totalNodes]);

  // Don't show if no execution
  if (!executionId && !isRunning && !error) {
    return null;
  }

  const StatusIcon = statusConfig.icon;
  const nodeStatesList = Array.from(nodeStates.values());

  return (
    <div className="absolute top-4 right-4 w-80 bg-[#21262d]/95 backdrop-blur-sm rounded-lg border border-[#30363d] shadow-xl shadow-black/30 z-50">
      {/* Header */}
      <div className={`p-4 border-b border-[#30363d] ${statusConfig.bgColor} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${isRunning ? 'animate-spin' : ''}`} />
            <span className={`font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
          {executionId && (
            <span className="text-xs text-[#6e7681] font-mono">
              {executionId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Progress Section */}
      <div className="p-4">
        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-[#8b949e] mb-1">
            <span>Progress</span>
            <span>{completedNodes}/{totalNodes} nodes</span>
          </div>
          <div className="h-2 bg-[#161b22] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                error ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Current node */}
        {currentNodeId && isRunning && (
          <div className="flex items-center gap-2 text-sm mb-3">
            <Play className="w-3 h-3 text-blue-400" />
            <span className="text-[#8b949e]">Current:</span>
            <span className="text-[#f0f6fc] truncate">{currentNodeId}</span>
          </div>
        )}

        {/* Elapsed time */}
        <div className="flex items-center gap-2 text-sm mb-3">
          <Clock className="w-3 h-3 text-[#6e7681]" />
          <span className="text-[#8b949e]">Elapsed:</span>
          <span className="text-[#f0f6fc]">{elapsedTime}</span>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* Expandable node list */}
        {nodeStatesList.length > 0 && (
          <div className="border-t border-[#30363d] pt-3 mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full text-sm text-[#8b949e] hover:text-[#f0f6fc]"
            >
              <span>Node Details</span>
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {expanded && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {nodeStatesList.map((nodeState) => (
                  <div
                    key={nodeState.nodeId}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-[#161b22] rounded"
                  >
                    <span className="text-[#8b949e] truncate max-w-[150px]">
                      {nodeState.nodeId}
                    </span>
                    <span
                      className={`${
                        nodeState.status === 'completed'
                          ? 'text-green-400'
                          : nodeState.status === 'failed'
                          ? 'text-red-400'
                          : nodeState.status === 'running'
                          ? 'text-blue-400'
                          : nodeState.status === 'retrying'
                          ? 'text-amber-400'
                          : 'text-[#6e7681]'
                      }`}
                    >
                      {nodeState.status}
                      {nodeState.duration && ` (${formatDuration(nodeState.duration)})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-[#30363d] flex gap-2">
        {isRunning ? (
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
          >
            <Square className="w-4 h-4" />
            Cancel
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-[#30363d] hover:bg-[#3d444d] text-[#f0f6fc] rounded text-sm transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default ExecutionOverlay;
