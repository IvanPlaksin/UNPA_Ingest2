import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertCircle, Info, CheckCircle2, Clock } from 'lucide-react';

const LOG_LEVELS = {
  info:    { icon: Info,         color: '#22d3ee' },
  success: { icon: CheckCircle2, color: '#22c55e' },
  warning: { icon: AlertCircle,  color: '#f59e0b' },
  error:   { icon: AlertCircle,  color: '#ef4444' },
  debug:   { icon: Clock,        color: '#71717a' },
};

/**
 * Builds log entries from execution events.
 * In production, this would be fed from SSE event stream.
 * For now, we derive entries from execution metadata.
 */
const buildLogEntries = (execution) => {
  const logs = [];

  if (execution.createdAt) {
    logs.push({ ts: execution.createdAt, level: 'info', message: `Execution created (${execution.triggerType || 'MANUAL'})`, source: 'system' });
  }
  if (execution.startedAt) {
    logs.push({ ts: execution.startedAt, level: 'info', message: 'Execution started', source: 'system' });
  }

  // Node state transitions
  const nodeStates = execution.nodeStates || {};
  for (const [nodeId, stateOrObj] of Object.entries(nodeStates)) {
    const status = typeof stateOrObj === 'string' ? stateOrObj : stateOrObj?.status;
    const startedAt = typeof stateOrObj === 'object' ? stateOrObj.startedAt : null;
    const completedAt = typeof stateOrObj === 'object' ? stateOrObj.completedAt : null;
    const error = typeof stateOrObj === 'object' ? stateOrObj.error : null;

    if (startedAt) {
      logs.push({ ts: startedAt, level: 'debug', message: `Node ${nodeId} started`, source: nodeId });
    }
    if (status === 'COMPLETED' || status === 'SUCCEEDED') {
      logs.push({ ts: completedAt || startedAt, level: 'success', message: `Node ${nodeId} completed`, source: nodeId });
    }
    if (status === 'FAILED') {
      logs.push({ ts: completedAt || startedAt, level: 'error', message: `Node ${nodeId} failed: ${error || 'Unknown error'}`, source: nodeId });
    }
    if (status === 'SKIPPED') {
      logs.push({ ts: startedAt, level: 'debug', message: `Node ${nodeId} skipped`, source: nodeId });
    }
  }

  if (execution.completedAt) {
    const level = execution.status === 'COMPLETED' ? 'success' : execution.status === 'FAILED' ? 'error' : 'info';
    logs.push({ ts: execution.completedAt, level, message: `Execution ${execution.status.toLowerCase()}`, source: 'system' });
  }

  if (execution.error) {
    logs.push({ ts: execution.completedAt || Date.now(), level: 'error', message: execution.error, source: 'system' });
  }

  return logs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
};

const LogsTab = ({ execution }) => {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState(null);

  const allLogs = useMemo(() => buildLogEntries(execution), [execution]);

  const filteredLogs = useMemo(() => {
    let logs = allLogs;
    if (levelFilter) logs = logs.filter(l => l.level === levelFilter);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l => l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q));
    }
    return logs;
  }, [allLogs, levelFilter, search]);

  return (
    <div className="gxe-tab gxe-logs">
      {/* Toolbar */}
      <div className="gxe-logs__toolbar">
        <div className="gxe-logs__search">
          <Search size={14} />
          <input type="text" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="gxe-logs__filters">
          {Object.keys(LOG_LEVELS).map(level => (
            <button key={level}
              className={`gxe-logs__filter-btn ${levelFilter === level ? 'active' : ''}`}
              style={levelFilter === level ? { color: LOG_LEVELS[level].color, borderColor: LOG_LEVELS[level].color } : {}}
              onClick={() => setLevelFilter(levelFilter === level ? null : level)}>
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div className="gxe-logs__entries">
        {filteredLogs.length === 0 ? (
          <div className="gxe-tab__empty">No log entries{search || levelFilter ? ' matching filters' : ''}</div>
        ) : (
          filteredLogs.map((log, i) => {
            const cfg = LOG_LEVELS[log.level] || LOG_LEVELS.info;
            const Icon = cfg.icon;
            return (
              <div key={i} className="gxe-logs__entry">
                <span className="gxe-logs__time">{log.ts ? new Date(log.ts).toLocaleTimeString() : '—'}</span>
                <Icon size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                <span className="gxe-logs__source">[{log.source}]</span>
                <span className="gxe-logs__message">{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .gxe-logs { display: flex; flex-direction: column; gap: 8px; }
        .gxe-logs__toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .gxe-logs__search { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--nexus-bg-tertiary, #18181b); border: 1px solid var(--nexus-border, #27272a); border-radius: 6px; color: var(--nexus-text-secondary, #a1a1aa); flex: 1; min-width: 150px; }
        .gxe-logs__search:focus-within { border-color: var(--nexus-accent-cyan, #22d3ee); }
        .gxe-logs__search input { flex: 1; background: none; border: none; outline: none; color: var(--nexus-text-primary, #e4e4e7); font-size: 12px; }
        .gxe-logs__filters { display: flex; gap: 4px; }
        .gxe-logs__filter-btn { padding: 4px 8px; border: 1px solid var(--nexus-border, #27272a); border-radius: 4px; background: none; color: var(--nexus-text-muted, #71717a); font-size: 11px; text-transform: uppercase; cursor: pointer; transition: all 0.15s; }
        .gxe-logs__filter-btn:hover { background: var(--nexus-bg-hover, #27272a); }
        .gxe-logs__filter-btn.active { background: rgba(255,255,255,0.05); }
        .gxe-logs__entries { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
        .gxe-logs__entry { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(39,39,42,0.5); }
        .gxe-logs__time { color: var(--nexus-text-muted, #71717a); white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 75px; }
        .gxe-logs__source { color: var(--nexus-text-muted, #71717a); white-space: nowrap; }
        .gxe-logs__message { color: var(--nexus-text-primary, #e4e4e7); word-break: break-word; }
      `}</style>
    </div>
  );
};

export default LogsTab;
