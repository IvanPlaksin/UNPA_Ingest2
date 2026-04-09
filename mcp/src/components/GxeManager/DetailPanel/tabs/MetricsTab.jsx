import React, { useMemo } from 'react';
import { Clock, Zap, Activity } from 'lucide-react';

const MetricCard = ({ label, value, unit, icon: Icon, color }) => (
  <div className="gxe-metric-card">
    <div className="gxe-metric-card__icon" style={{ color }}>
      <Icon size={18} />
    </div>
    <div className="gxe-metric-card__content">
      <span className="gxe-metric-card__value">{value}<span className="gxe-metric-card__unit">{unit}</span></span>
      <span className="gxe-metric-card__label">{label}</span>
    </div>
  </div>
);

const formatDuration = (ms) => {
  if (!ms && ms !== 0) return { value: '—', unit: '' };
  if (ms < 1000) return { value: ms.toString(), unit: 'ms' };
  if (ms < 60000) return { value: (ms / 1000).toFixed(1), unit: 's' };
  return { value: Math.floor(ms / 60000).toString(), unit: 'm' };
};

const MetricsTab = ({ execution }) => {
  const metrics = useMemo(() => {
    const nodeStates = execution?.nodeStates || {};
    const entries = Object.values(nodeStates);
    const total = entries.length;

    let completedCount = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    let minDuration = Infinity;

    for (const state of entries) {
      const dur = typeof state === 'object' ? state.durationMs : null;
      const status = typeof state === 'string' ? state : state?.status;

      if (['COMPLETED', 'SUCCEEDED', 'SKIPPED'].includes(status)) completedCount++;
      if (dur) {
        totalDuration += dur;
        maxDuration = Math.max(maxDuration, dur);
        minDuration = Math.min(minDuration, dur);
      }
    }

    const avgDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;
    const wallTime = execution?.startedAt
      ? (execution.completedAt || Date.now()) - execution.startedAt
      : 0;

    return { total, completedCount, avgDuration, maxDuration, minDuration: minDuration === Infinity ? 0 : minDuration, wallTime, totalDuration };
  }, [execution]);

  const wallFmt = formatDuration(metrics.wallTime);
  const avgFmt = formatDuration(metrics.avgDuration);
  const maxFmt = formatDuration(metrics.maxDuration);

  return (
    <div className="gxe-tab">
      <div className="gxe-tab__section">
        <h4 className="gxe-tab__section-title">Performance</h4>
        <div className="gxe-metrics__cards">
          <MetricCard label="Wall Time" value={wallFmt.value} unit={wallFmt.unit} icon={Clock} color="#22d3ee" />
          <MetricCard label="Avg Node" value={avgFmt.value} unit={avgFmt.unit} icon={Zap} color="#22c55e" />
          <MetricCard label="Max Node" value={maxFmt.value} unit={maxFmt.unit} icon={Activity} color="#f59e0b" />
          <MetricCard label="Nodes" value={`${metrics.completedCount}/${metrics.total}`} unit="" icon={Activity} color="#a78bfa" />
        </div>
      </div>

      {/* Per-node durations (simple bar chart) */}
      {metrics.maxDuration > 0 && (
        <div className="gxe-tab__section">
          <h4 className="gxe-tab__section-title">Node Durations</h4>
          <div className="gxe-metrics__bars">
            {Object.entries(execution?.nodeStates || {}).map(([nodeId, state]) => {
              const dur = typeof state === 'object' ? state.durationMs : null;
              if (!dur) return null;
              const pct = metrics.maxDuration > 0 ? (dur / metrics.maxDuration * 100) : 0;
              const fmt = formatDuration(dur);
              return (
                <div key={nodeId} className="gxe-metrics__bar-row">
                  <span className="gxe-metrics__bar-label">{nodeId}</span>
                  <div className="gxe-metrics__bar-track">
                    <div className="gxe-metrics__bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="gxe-metrics__bar-value">{fmt.value}{fmt.unit}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .gxe-metrics__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
        .gxe-metric-card { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 8px; background: var(--nexus-bg-secondary, #111118); border: 1px solid var(--nexus-border, #27272a); }
        .gxe-metric-card__icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; }
        .gxe-metric-card__content { display: flex; flex-direction: column; }
        .gxe-metric-card__value { font-size: 20px; font-weight: 700; color: var(--nexus-text-primary, #e4e4e7); line-height: 1.2; font-variant-numeric: tabular-nums; }
        .gxe-metric-card__unit { font-size: 12px; font-weight: 400; color: var(--nexus-text-muted, #71717a); margin-left: 2px; }
        .gxe-metric-card__label { font-size: 12px; color: var(--nexus-text-muted, #71717a); }

        .gxe-metrics__bars { display: flex; flex-direction: column; gap: 6px; }
        .gxe-metrics__bar-row { display: flex; align-items: center; gap: 8px; }
        .gxe-metrics__bar-label { width: 100px; font-size: 12px; color: var(--nexus-text-secondary, #a1a1aa); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
        .gxe-metrics__bar-track { flex: 1; height: 6px; background: var(--nexus-bg-tertiary, #18181b); border-radius: 3px; overflow: hidden; }
        .gxe-metrics__bar-fill { height: 100%; background: var(--nexus-accent-cyan, #22d3ee); border-radius: 3px; transition: width 0.3s; }
        .gxe-metrics__bar-value { width: 60px; font-size: 12px; color: var(--nexus-text-muted, #71717a); font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
};

export default MetricsTab;
