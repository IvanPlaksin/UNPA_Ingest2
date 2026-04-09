import React from 'react';
import {
  X, Play, Pause, Square, RotateCcw, Loader2,
  Clock, CheckCircle2, AlertCircle, Timer, Zap, GitBranch
} from 'lucide-react';

const STATUS_COLORS = {
  RUNNING: 'var(--nexus-accent-cyan, #22d3ee)',
  PAUSED: 'var(--nexus-warning, #f59e0b)',
  QUEUED: 'var(--nexus-text-muted, #71717a)',
  COMPLETED: 'var(--nexus-success, #22c55e)',
  FAILED: 'var(--nexus-error, #ef4444)',
  CANCELLED: 'var(--nexus-text-muted, #71717a)',
  TIMED_OUT: '#f97316',
  INITIALIZING: 'var(--nexus-accent-cyan, #22d3ee)',
  COMPENSATING: '#e879f9',
};

const STATUS_ICONS = {
  RUNNING: Loader2, PAUSED: Pause, QUEUED: Clock,
  COMPLETED: CheckCircle2, FAILED: AlertCircle, CANCELLED: Square,
  TIMED_OUT: Timer, INITIALIZING: Loader2, COMPENSATING: RotateCcw,
};

const formatDuration = (startedAt, completedAt) => {
  if (!startedAt) return '—';
  const diff = (completedAt || Date.now()) - startedAt;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const DetailHeader = ({ execution, onClose }) => {
  if (!execution) return null;

  const StatusIcon = STATUS_ICONS[execution.status] || Clock;
  const statusColor = STATUS_COLORS[execution.status] || '#71717a';
  const isActive = ['RUNNING', 'INITIALIZING'].includes(execution.status);

  return (
    <div className="gxe-detail-header">
      <div className="gxe-detail-header__left">
        <div className="gxe-detail-header__status" style={{ color: statusColor }}>
          <StatusIcon size={18} className={isActive ? 'spinning' : ''} />
          <span className="gxe-detail-header__status-text">{execution.status}</span>
        </div>
        <h2 className="gxe-detail-header__title">{execution.graphId}</h2>
        <span className="gxe-detail-header__id">{execution.executionId?.slice(0, 12)}</span>
      </div>

      <div className="gxe-detail-header__meta">
        <span className="gxe-detail-header__meta-item">
          <Zap size={12} />
          {execution.triggerType || 'MANUAL'}
        </span>
        <span className="gxe-detail-header__meta-item">
          {execution.priority || 'NORMAL'}
        </span>
        <span className="gxe-detail-header__meta-item">
          <Clock size={12} />
          {formatDuration(execution.startedAt, execution.completedAt)}
        </span>
      </div>

      <button className="gxe-detail-header__close" onClick={onClose} title="Close">
        <X size={18} />
      </button>
    </div>
  );
};

export default DetailHeader;
