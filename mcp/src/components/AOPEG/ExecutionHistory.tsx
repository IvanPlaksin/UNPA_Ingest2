/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Execution History
 * Collapsible panel showing past executions - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  ChevronDown,
  ChevronUp,
  Play,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionRecord {
  id: string;
  graphId: string;
  graphVersion: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  startTime: string;
  endTime?: string;
  totalDuration?: number;
  nodesExecuted: number;
  totalNodes: number;
  finalQualityScore?: number;
  error?: string;
}

interface ExecutionHistoryProps {
  executions: ExecutionRecord[];
  isLoading?: boolean;
  onSelectExecution: (executionId: string) => void;
  onRefresh?: () => void;
  onReplay?: (executionId: string) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusConfig(status: ExecutionRecord['status']) {
  switch (status) {
    case 'COMPLETED':
      return {
        icon: CheckCircle,
        color: 'text-green-400',
        bg: 'bg-green-500/20',
        border: 'border-green-500/30',
        label: 'Completed',
      };
    case 'FAILED':
      return {
        icon: XCircle,
        color: 'text-red-400',
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
        label: 'Failed',
      };
    case 'CANCELLED':
      return {
        icon: Ban,
        color: 'text-[#6e7681]',
        bg: 'bg-[#21262d]',
        border: 'border-[#30363d]',
        label: 'Cancelled',
      };
    case 'RUNNING':
      return {
        icon: Play,
        color: 'text-blue-400',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
        label: 'Running',
      };
    case 'QUEUED':
      return {
        icon: Clock,
        color: 'text-amber-400',
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/30',
        label: 'Queued',
      };
    default:
      return {
        icon: Clock,
        color: 'text-[#6e7681]',
        bg: 'bg-[#21262d]',
        border: 'border-[#30363d]',
        label: status,
      };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ITEM
// ────────────────────────────────────────────────────────────────────────────

const ExecutionItem: React.FC<{
  execution: ExecutionRecord;
  onClick: () => void;
  onReplay?: () => void;
}> = ({ execution, onClick, onReplay }) => {
  const statusConfig = getStatusConfig(execution.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div
      onClick={onClick}
      className="p-3 bg-[#21262d] border border-[#30363d] rounded-lg cursor-pointer hover:border-[#388bfd] transition-colors group"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
          <span className={`text-xs px-2 py-0.5 rounded ${statusConfig.bg} ${statusConfig.border} border ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
        <span className="text-xs text-[#6e7681]">
          {formatTimeAgo(execution.startTime)}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs text-[#8b949e]">
        {/* Duration */}
        {execution.totalDuration && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(execution.totalDuration)}
          </span>
        )}

        {/* Nodes */}
        <span className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          {execution.nodesExecuted}/{execution.totalNodes} nodes
        </span>

        {/* Quality Score */}
        {execution.finalQualityScore !== undefined && (
          <span className="text-green-400">
            {Math.round(execution.finalQualityScore * 100)}%
          </span>
        )}
      </div>

      {/* Error */}
      {execution.error && (
        <p className="mt-2 text-xs text-red-400 truncate">
          {execution.error}
        </p>
      )}

      {/* Replay button */}
      {onReplay && execution.status === 'COMPLETED' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplay();
          }}
          className="mt-2 flex items-center gap-1 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
        >
          <RefreshCw className="w-3 h-3" />
          Replay
        </button>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  executions,
  isLoading,
  onSelectExecution,
  onRefresh,
  onReplay,
}) => {
  const [expanded, setExpanded] = React.useState(true);

  // Group executions by status
  const stats = useMemo(() => {
    const completed = executions.filter((e) => e.status === 'COMPLETED').length;
    const failed = executions.filter((e) => e.status === 'FAILED').length;
    return { completed, failed, total: executions.length };
  }, [executions]);

  return (
    <div className="border-t border-[#30363d]">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[#21262d]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#8b949e]" />
          <span className="text-sm font-medium text-[#f0f6fc]">
            Execution History
          </span>
          <span className="text-xs text-[#6e7681]">
            ({stats.total})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stats.total > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400">{stats.completed} passed</span>
              {stats.failed > 0 && (
                <span className="text-red-400">{stats.failed} failed</span>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#6e7681]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#6e7681]" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-3 pt-0">
          {/* Refresh button */}
          {onRefresh && (
            <div className="flex justify-end mb-2">
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#f0f6fc] disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && executions.length === 0 && (
            <div className="py-8 text-center text-[#6e7681] text-sm">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
              Loading...
            </div>
          )}

          {/* Empty state */}
          {!isLoading && executions.length === 0 && (
            <div className="py-8 text-center text-[#6e7681] text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No executions yet</p>
              <p className="text-xs mt-1">Run the graph to see execution history</p>
            </div>
          )}

          {/* Executions list */}
          {executions.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {executions.map((execution) => (
                <ExecutionItem
                  key={execution.id}
                  execution={execution}
                  onClick={() => onSelectExecution(execution.id)}
                  onReplay={onReplay ? () => onReplay(execution.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExecutionHistory;
