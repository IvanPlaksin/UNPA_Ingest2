/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG Node Component
 * Custom React Flow node for AOPEG graph editor - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Loader2,
  Check,
  X,
  RefreshCw,
  Clock,
  Zap,
  Wrench,
  Brain,
  Download,
  Search,
  CheckCircle,
  Database,
  Box,
  Sparkles,
} from 'lucide-react';
import { AOPEGNodeData, DOMAIN_COLORS } from '../../types/aopeg.types';
import type { PortConfig, PortSide } from './utils/portAssigner';

// ────────────────────────────────────────────────────────────────────────────
// ICON MAP
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  common: Wrench,
  ai: Brain,
  ingestion: Download,
  rag: Search,
  validation: CheckCircle,
  storage: Database,
  search: Sparkles,
  cosmos: Sparkles,
  default: Box,
};

// ────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ────────────────────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ data: AOPEGNodeData }> = ({ data }) => {
  if (data.isRunning) {
    return (
      <div className="absolute -top-2 -right-2 bg-blue-500 rounded-full p-1.5 shadow-lg shadow-blue-500/50 animate-pulse">
        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
      </div>
    );
  }

  if (data.isRetrying) {
    return (
      <div className="absolute -top-2 -right-2 bg-amber-500 rounded-full p-1.5 shadow-lg shadow-amber-500/50">
        <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
      </div>
    );
  }

  if (data.isCompleted) {
    return (
      <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1.5 shadow-lg shadow-green-500/50 animate-[pop-in_0.3s_ease-out]">
        <Check className="w-3.5 h-3.5 text-white" />
      </div>
    );
  }

  if (data.isFailed) {
    return (
      <div className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1.5 shadow-lg shadow-red-500/50">
        <X className="w-3.5 h-3.5 text-white" />
      </div>
    );
  }

  return null;
};

// ────────────────────────────────────────────────────────────────────────────
// METRICS DISPLAY
// ────────────────────────────────────────────────────────────────────────────

const MetricsDisplay: React.FC<{ metrics: AOPEGNodeData['metrics'] }> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div className="mt-2 pt-2 border-t border-[#30363d] flex items-center gap-3 text-xs text-[#8b949e]">
      <div className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        <span>{metrics.duration}ms</span>
      </div>
      {metrics.qualityScore !== undefined && (
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>{(metrics.qualityScore * 100).toFixed(0)}%</span>
        </div>
      )}
      {metrics.retryCount !== undefined && metrics.retryCount > 0 && (
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          <span>×{metrics.retryCount}</span>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN NODE COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const AOPEGNode: React.FC<NodeProps<AOPEGNodeData>> = memo(
  ({ data, selected, isConnectable }) => {
    const colors = DOMAIN_COLORS[data.domain] || DOMAIN_COLORS.default;
    const IconComponent =
      DOMAIN_ICON_COMPONENTS[data.domain] || DOMAIN_ICON_COMPONENTS.default;

    // Dynamic port configs (injected by portAssigner)
    const portConfigs: PortConfig[] = (data as any).portConfigs || [];
    const targetPorts = portConfigs.filter((p) => p.type === 'target');
    const sourcePorts = portConfigs.filter((p) => p.type === 'source');
    const hasDynamicPorts = portConfigs.length > 0;

    // Map PortSide → ReactFlow Position
    const sideToPosition: Record<PortSide, Position> = {
      left: Position.Left,
      right: Position.Right,
      top: Position.Top,
      bottom: Position.Bottom,
    };

    // For horizontal sides (left/right), offset is vertical (top%).
    // For vertical sides (top/bottom), offset is horizontal (left%).
    const portStyle = (port: PortConfig) => {
      if (port.position === 'left' || port.position === 'right') {
        return { top: `${port.offsetPercent * 100}%` };
      }
      return { left: `${port.offsetPercent * 100}%` };
    };

    // Status-based styling
    let statusStyles = '';
    if (data.isRunning) {
      statusStyles = 'ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20';
    } else if (data.isRetrying) {
      statusStyles = 'ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/20';
    } else if (data.isCompleted) {
      statusStyles = 'ring-2 ring-green-500/50 shadow-lg shadow-green-500/20';
    } else if (data.isFailed) {
      statusStyles = 'ring-2 ring-red-500/50 shadow-lg shadow-red-500/20';
    }

    return (
      <div
        className={`
          relative px-4 py-3 rounded-lg min-w-[180px] max-w-[220px]
          ${colors.bg} ${colors.border}
          ${selected ? 'ring-2 ring-[#388bfd] shadow-lg shadow-[#388bfd]/20' : 'shadow-lg shadow-black/30'}
          ${statusStyles}
          transition-all duration-200 ease-in-out
          hover:shadow-xl hover:shadow-black/40
        `}
        style={{ backgroundColor: '#21262d' }}
      >
        {/* Dynamic Target Handles (side determined by peer position) */}
        {hasDynamicPorts ? (
          targetPorts.map((port) => (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={sideToPosition[port.position]}
              isConnectable={isConnectable}
              style={portStyle(port)}
              className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-[#21262d] hover:!bg-emerald-300 hover:!scale-150 transition-all"
            />
          ))
        ) : (
          <Handle
            type="target"
            position={Position.Left}
            isConnectable={isConnectable}
            className="!w-2.5 !h-2.5 !bg-[#6e7681] !border-2 !border-[#21262d] hover:!bg-[#f0f6fc] transition-colors"
          />
        )}

        {/* Status Badge */}
        <StatusBadge data={data} />

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${colors.iconBg} shadow-md`}>
            <IconComponent className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-[#f0f6fc] truncate">
              {data.displayName}
            </h4>
            <p className="text-xs text-[#8b949e] truncate mt-0.5">
              {data.executorType}
            </p>
          </div>
        </div>

        {/* Description */}
        {data.description && (
          <p className="mt-2 text-xs text-[#8b949e] line-clamp-2">
            {data.description}
          </p>
        )}

        {/* Error Message */}
        {data.errorMessage && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {data.errorMessage}
          </div>
        )}

        {/* Metrics */}
        <MetricsDisplay metrics={data.metrics} />

        {/* Config indicators */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6e7681]">
          {data.timeout && (
            <span
              title={`Timeout: ${data.timeout}ms`}
              className="flex items-center gap-1"
            >
              <Clock className="w-3 h-3" />
              {data.timeout / 1000}s
            </span>
          )}
          {data.retryPolicy?.maxRetries > 0 && (
            <span
              title={`Max retries: ${data.retryPolicy.maxRetries}`}
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {data.retryPolicy.maxRetries}
            </span>
          )}
          {data.qualityThreshold && (
            <span
              title={`Quality threshold: ${data.qualityThreshold * 100}%`}
              className="flex items-center gap-1"
            >
              <Zap className="w-3 h-3" />
              {data.qualityThreshold * 100}%
            </span>
          )}
        </div>

        {/* Dynamic Source Handles (side determined by peer position) */}
        {hasDynamicPorts ? (
          sourcePorts.map((port) => (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={sideToPosition[port.position]}
              isConnectable={isConnectable}
              style={portStyle(port)}
              className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-[#21262d] hover:!bg-blue-300 hover:!scale-150 transition-all"
            />
          ))
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            isConnectable={isConnectable}
            className="!w-2.5 !h-2.5 !bg-[#6e7681] !border-2 !border-[#21262d] hover:!bg-[#f0f6fc] transition-colors"
          />
        )}
      </div>
    );
  }
);

AOPEGNode.displayName = 'AOPEGNode';

export default AOPEGNode;
