import React, { useMemo } from 'react';
import { CheckCircle2, AlertCircle, Clock, Loader2, SkipForward } from 'lucide-react';

const NODE_STATUS_CONFIG = {
  COMPLETED:  { icon: CheckCircle2, color: '#22c55e', label: 'Completed' },
  SUCCEEDED:  { icon: CheckCircle2, color: '#22c55e', label: 'Completed' },
  FAILED:     { icon: AlertCircle,  color: '#ef4444', label: 'Failed' },
  RUNNING:    { icon: Loader2,      color: '#22d3ee', label: 'Running' },
  PENDING:    { icon: Clock,        color: '#71717a', label: 'Pending' },
  WAITING:    { icon: Clock,        color: '#a78bfa', label: 'Waiting' },
  SKIPPED:    { icon: SkipForward,  color: '#71717a', label: 'Skipped' },
};

const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString() : '—';
const formatDuration = (ms) => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

const TimelineEntry = ({ nodeId, status, startedAt, completedAt, durationMs, error }) => {
  const cfg = NODE_STATUS_CONFIG[status] || NODE_STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  const isActive = status === 'RUNNING';

  return (
    <div className="gxe-timeline__entry">
      <div className="gxe-timeline__dot" style={{ background: cfg.color }}>
        <Icon size={12} className={isActive ? 'spinning' : ''} style={{ color: '#fff' }} />
      </div>
      <div className="gxe-timeline__line" />
      <div className="gxe-timeline__content">
        <div className="gxe-timeline__row1">
          <span className="gxe-timeline__node-id">{nodeId}</span>
          <span className="gxe-timeline__status" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        <div className="gxe-timeline__row2">
          <span>{formatTime(startedAt)}</span>
          {completedAt && <span>→ {formatTime(completedAt)}</span>}
          <span className="gxe-timeline__duration">{formatDuration(durationMs)}</span>
        </div>
        {error && <div className="gxe-timeline__error">{error}</div>}
      </div>
    </div>
  );
};

const TimelineTab = ({ execution }) => {
  const entries = useMemo(() => {
    const nodeStates = execution?.nodeStates || {};
    return Object.entries(nodeStates).map(([nodeId, stateOrObj]) => {
      if (typeof stateOrObj === 'string') {
        return { nodeId, status: stateOrObj };
      }
      return { nodeId, ...stateOrObj };
    }).sort((a, b) => (a.startedAt || Infinity) - (b.startedAt || Infinity));
  }, [execution?.nodeStates]);

  if (entries.length === 0) {
    return <div className="gxe-tab__empty">No node execution data available</div>;
  }

  return (
    <div className="gxe-tab">
      <div className="gxe-timeline">
        {entries.map((entry) => (
          <TimelineEntry key={entry.nodeId} {...entry} />
        ))}
      </div>

      <style>{`
        .gxe-timeline { position: relative; padding-left: 20px; }
        .gxe-timeline__entry { display: flex; gap: 12px; margin-bottom: 16px; position: relative; }
        .gxe-timeline__dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; z-index: 1; }
        .gxe-timeline__line { position: absolute; left: 11px; top: 24px; bottom: -16px; width: 2px; background: var(--nexus-border, #27272a); }
        .gxe-timeline__entry:last-child .gxe-timeline__line { display: none; }
        .gxe-timeline__content { flex: 1; min-width: 0; }
        .gxe-timeline__row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
        .gxe-timeline__node-id { font-weight: 600; font-size: 13px; color: var(--nexus-text-primary, #e4e4e7); }
        .gxe-timeline__status { font-size: 12px; font-weight: 500; }
        .gxe-timeline__row2 { display: flex; gap: 8px; font-size: 12px; color: var(--nexus-text-muted, #71717a); font-variant-numeric: tabular-nums; }
        .gxe-timeline__duration { color: var(--nexus-text-secondary, #a1a1aa); font-weight: 500; }
        .gxe-timeline__error { margin-top: 4px; padding: 6px 10px; border-radius: 4px; background: rgba(239, 68, 68, 0.1); color: var(--nexus-error, #ef4444); font-size: 12px; }
        .gxe-timeline .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default TimelineTab;
