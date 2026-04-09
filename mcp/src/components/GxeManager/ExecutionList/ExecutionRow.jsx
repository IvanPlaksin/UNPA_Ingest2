import React, { useMemo, useState, useCallback } from 'react';
import {
  Play, Pause, Square, MoreHorizontal,
  Clock, Zap, GitBranch, ChevronRight,
  AlertCircle, CheckCircle2, Loader2, Timer
} from 'lucide-react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';
import {
  pauseExecution,
  resumeExecution,
  cancelExecution
} from '../../../services/gxeManager.service';

import './ExecutionRow.css';

const STATUS_ICONS = {
  RUNNING: Loader2,
  PAUSED: Pause,
  QUEUED: Clock,
  INITIALIZING: Loader2,
  COMPLETING: Loader2,
  COMPLETED: CheckCircle2,
  FAILED: AlertCircle,
  CANCELLED: Square,
  TIMED_OUT: Timer
};

const PRIORITY_LABELS = {
  CRITICAL:   { label: 'CRIT', class: 'critical' },
  HIGH:       { label: 'HIGH', class: 'high' },
  NORMAL:     { label: 'NORM', class: 'normal' },
  LOW:        { label: 'LOW',  class: 'low' },
  BACKGROUND: { label: 'BG',   class: 'background' }
};

const TRIGGER_ICONS = {
  MANUAL: Zap, CRON: Clock, SIGNAL: GitBranch,
  DEPENDENCY: GitBranch, INTERVAL: Clock, ONCE: Clock
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

const formatDuration = (startedAt, completedAt) => {
  if (!startedAt) return '—';
  const diff = (completedAt || Date.now()) - startedAt;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
};

const QuickActions = ({ execution, onAction }) => {
  const [loading, setLoading] = useState(null);

  const handleAction = async (e, action, fn) => {
    e.stopPropagation();
    if (action === 'cancel' && !window.confirm('Cancel this execution?')) return;
    setLoading(action);
    try {
      await fn(execution.executionId);
      onAction?.(action);
    } catch (err) {
      console.error(`${action} failed:`, err);
    } finally {
      setLoading(null);
    }
  };

  const status = execution.status;

  return (
    <div className="gxe-row__actions" onClick={e => e.stopPropagation()}>
      {status === 'RUNNING' && (
        <button className="gxe-row__action-btn gxe-row__action-btn--pause"
          onClick={e => handleAction(e, 'pause', pauseExecution)}
          disabled={loading === 'pause'} title="Pause">
          {loading === 'pause' ? <Loader2 size={14} className="spinning" /> : <Pause size={14} />}
        </button>
      )}
      {status === 'PAUSED' && (
        <button className="gxe-row__action-btn gxe-row__action-btn--resume"
          onClick={e => handleAction(e, 'resume', resumeExecution)}
          disabled={loading === 'resume'} title="Resume">
          {loading === 'resume' ? <Loader2 size={14} className="spinning" /> : <Play size={14} />}
        </button>
      )}
      {['RUNNING', 'PAUSED', 'QUEUED'].includes(status) && (
        <button className="gxe-row__action-btn gxe-row__action-btn--cancel"
          onClick={e => handleAction(e, 'cancel', cancelExecution)}
          disabled={loading === 'cancel'} title="Cancel">
          {loading === 'cancel' ? <Loader2 size={14} className="spinning" /> : <Square size={14} />}
        </button>
      )}
      <button className="gxe-row__action-btn gxe-row__action-btn--more" title="More actions">
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
};

const ProgressBar = ({ execution }) => {
  const progress = useMemo(() => {
    const nodeStates = execution.nodeStates || {};
    const total = Object.keys(nodeStates).length;
    if (total === 0) return 0;
    const completed = Object.values(nodeStates).filter(
      s => ['SUCCEEDED', 'SKIPPED', 'COMPLETED'].includes(s)
    ).length;
    return Math.round((completed / total) * 100);
  }, [execution.nodeStates]);

  const isPaused = execution.status === 'PAUSED';
  const isFailed = execution.status === 'FAILED';

  return (
    <div className="gxe-row__progress">
      <div
        className={`gxe-row__progress-bar ${isPaused ? 'paused' : ''} ${isFailed ? 'failed' : ''}`}
        style={{ width: `${progress}%` }}
      />
      <span className="gxe-row__progress-text">{progress}%</span>
    </div>
  );
};

const ExecutionRow = ({ execution, isSelected, isNew }) => {
  const setSelectedExecutionId = useGxeManagerStore(state => state.setSelectedExecutionId);

  const StatusIcon = STATUS_ICONS[execution.status] || Clock;
  const TriggerIcon = TRIGGER_ICONS[execution.triggerType] || Zap;
  const priorityConfig = PRIORITY_LABELS[execution.priority] || PRIORITY_LABELS.NORMAL;

  const handleClick = useCallback(() => {
    setSelectedExecutionId(execution.executionId);
  }, [execution.executionId, setSelectedExecutionId]);

  const nodeStats = useMemo(() => {
    const states = execution.nodeStates || {};
    const total = Object.keys(states).length;
    const completed = Object.values(states).filter(
      s => ['SUCCEEDED', 'SKIPPED', 'COMPLETED'].includes(s)
    ).length;
    const failed = Object.values(states).filter(s => s === 'FAILED').length;
    return { total, completed, failed };
  }, [execution.nodeStates]);

  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(execution.status);
  const isActive = ['RUNNING', 'INITIALIZING'].includes(execution.status);

  return (
    <div
      className={`gxe-row gxe-row--${execution.status?.toLowerCase()} ${isSelected ? 'selected' : ''} ${isNew ? 'new' : ''} ${isTerminal ? 'terminal' : ''}`}
      onClick={handleClick}
    >
      <div className="gxe-row__status-bar">
        {isActive && <span className="gxe-row__pulse" />}
      </div>

      <div className="gxe-row__content">
        <div className="gxe-row__line1">
          <StatusIcon size={16} className={`gxe-row__status-icon ${isActive ? 'spinning' : ''}`} />
          <span className="gxe-row__graph-name">{execution.graphId}</span>
          <span className="gxe-row__exec-id">{execution.executionId.slice(0, 8)}</span>
        </div>

        <div className="gxe-row__line2">
          <span className={`gxe-row__priority gxe-row__priority--${priorityConfig.class}`}>
            {priorityConfig.label}
          </span>
          <span className="gxe-row__trigger">
            <TriggerIcon size={12} />
            {execution.triggerType}
          </span>
          <span className="gxe-row__time">
            {formatRelativeTime(execution.startedAt || execution.createdAt)}
          </span>
          {execution.startedAt && (
            <span className="gxe-row__duration">
              {formatDuration(execution.startedAt, execution.completedAt)}
            </span>
          )}
        </div>

        <div className="gxe-row__line3">
          <span className="gxe-row__nodes">
            {nodeStats.completed}/{nodeStats.total} nodes
            {nodeStats.failed > 0 && (
              <span className="gxe-row__nodes-failed"> ({nodeStats.failed} failed)</span>
            )}
          </span>
          <ProgressBar execution={execution} />
        </div>
      </div>

      <QuickActions execution={execution} />
      <ChevronRight size={16} className="gxe-row__chevron" />
    </div>
  );
};

export default ExecutionRow;
