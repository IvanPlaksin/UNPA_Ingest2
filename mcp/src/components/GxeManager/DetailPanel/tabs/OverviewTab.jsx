import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';

const getStatus = (s) => typeof s === 'object' && s !== null ? s.status : s;

const OverviewTab = ({ execution }) => {
  const nodeStats = useMemo(() => {
    if (!execution) return { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
    const states = execution.nodeStates || {};
    const entries = Object.entries(states);
    const total = entries.length;
    const completed = entries.filter(([, s]) => ['COMPLETED', 'SUCCEEDED', 'SKIPPED', 'CANCELLED'].includes(getStatus(s))).length;
    const failed = entries.filter(([, s]) => getStatus(s) === 'FAILED').length;
    const running = entries.filter(([, s]) => ['RUNNING', 'EXECUTING'].includes(getStatus(s))).length;
    const pending = entries.filter(([, s]) => ['PENDING', 'READY', 'QUEUED'].includes(getStatus(s))).length;
    return { total, completed, failed, running, pending };
  }, [execution?.nodeStates]);

  if (!execution) return null;

  const progress = nodeStats.total > 0
    ? Math.round((nodeStats.completed / nodeStats.total) * 100)
    : 0;

  return (
    <div className="gxe-tab">
      {/* Execution Info */}
      <div className="gxe-tab__section">
        <h4 className="gxe-tab__section-title">Execution Info</h4>
        {execution._graphDescription && (
          <div className="gxe-tab__field" style={{ marginBottom: 12 }}>
            <span className="gxe-tab__label">Description</span>
            <span className="gxe-tab__value" style={{ fontStyle: 'italic', color: '#a1a1aa' }}>{execution._graphDescription}</span>
          </div>
        )}
        <div className="gxe-tab__grid">
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Graph ID</span>
            <span className="gxe-tab__value gxe-tab__value--mono">{execution.graphId}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Graph Version</span>
            <span className="gxe-tab__value">
              {execution._catalogEntryId && execution._resolvedVersion ? (
                <>
                  <a
                    href={`/gxe?graphId=${execution._catalogEntryId}&version=${execution._resolvedVersion}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gxe-tab__link"
                  >
                    v{execution._resolvedVersion}
                  </a>
                  {(!execution.graphVersion || execution.graphVersion === 'latest') && (
                    <span style={{ color: '#71717a', marginLeft: 4 }}>(latest)</span>
                  )}
                </>
              ) : (
                execution.graphVersion || 'latest'
              )}
            </span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Status</span>
            <span className="gxe-tab__value">{execution.status}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Priority</span>
            <span className="gxe-tab__value">{execution.priority || 'NORMAL'}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Trigger Type</span>
            <span className="gxe-tab__value">{execution.triggerType || 'MANUAL'}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Current Node</span>
            <span className="gxe-tab__value gxe-tab__value--mono">{execution.currentNodeId || '—'}</span>
          </div>
        </div>
      </div>

      {/* Timing */}
      <div className="gxe-tab__section">
        <h4 className="gxe-tab__section-title">Timing</h4>
        <div className="gxe-tab__grid">
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Created</span>
            <span className="gxe-tab__value">{execution.createdAt ? new Date(execution.createdAt).toLocaleString() : '—'}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Started</span>
            <span className="gxe-tab__value">{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '—'}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Completed</span>
            <span className="gxe-tab__value">{execution.completedAt ? new Date(execution.completedAt).toLocaleString() : '—'}</span>
          </div>
          <div className="gxe-tab__field">
            <span className="gxe-tab__label">Timeout At</span>
            <span className="gxe-tab__value">{execution.timeoutAt ? new Date(execution.timeoutAt).toLocaleString() : '—'}</span>
          </div>
        </div>
      </div>

      {/* Node Progress */}
      <div className="gxe-tab__section">
        <h4 className="gxe-tab__section-title">Node Progress</h4>
        <div className="gxe-overview__progress-container">
          <div className="gxe-overview__progress-bar">
            <div className="gxe-overview__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="gxe-overview__progress-text">{progress}%</span>
        </div>
        <div className="gxe-overview__node-stats">
          <span className="gxe-overview__node-stat">
            <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
            {nodeStats.completed} completed
          </span>
          <span className="gxe-overview__node-stat">
            <Clock size={12} style={{ color: '#22d3ee' }} />
            {nodeStats.running} running
          </span>
          <span className="gxe-overview__node-stat">
            <AlertCircle size={12} style={{ color: '#ef4444' }} />
            {nodeStats.failed} failed
          </span>
          <span className="gxe-overview__node-stat">
            <Zap size={12} style={{ color: '#71717a' }} />
            {nodeStats.pending} pending
          </span>
        </div>
      </div>

      {/* Error */}
      {execution.error && (
        <div className="gxe-tab__section">
          <h4 className="gxe-tab__section-title">Error</h4>
          <div className="gxe-overview__error">
            <AlertCircle size={16} />
            <span>{execution.error}</span>
          </div>
        </div>
      )}

      {/* Relations */}
      {(execution.parentExecutionId || execution.transactionId) && (
        <div className="gxe-tab__section">
          <h4 className="gxe-tab__section-title">Relations</h4>
          <div className="gxe-tab__grid">
            {execution.parentExecutionId && (
              <div className="gxe-tab__field">
                <span className="gxe-tab__label">Parent Execution</span>
                <span className="gxe-tab__value gxe-tab__value--mono">{execution.parentExecutionId}</span>
              </div>
            )}
            {execution.transactionId && (
              <div className="gxe-tab__field">
                <span className="gxe-tab__label">Transaction ID</span>
                <span className="gxe-tab__value gxe-tab__value--mono">{execution.transactionId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .gxe-overview__progress-container { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .gxe-overview__progress-bar { flex: 1; height: 8px; background: var(--nexus-bg-tertiary, #18181b); border-radius: 4px; overflow: hidden; }
        .gxe-overview__progress-fill { height: 100%; background: var(--nexus-accent-cyan, #22d3ee); border-radius: 4px; transition: width 0.3s; }
        .gxe-overview__progress-text { font-size: 14px; font-weight: 600; color: var(--nexus-text-primary, #e4e4e7); min-width: 40px; }
        .gxe-overview__node-stats { display: flex; gap: 16px; flex-wrap: wrap; }
        .gxe-overview__node-stat { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--nexus-text-secondary, #a1a1aa); }
        .gxe-overview__error { display: flex; align-items: flex-start; gap: 8px; padding: 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); color: var(--nexus-error, #ef4444); font-size: 13px; }
      `}</style>
    </div>
  );
};

export default OverviewTab;
