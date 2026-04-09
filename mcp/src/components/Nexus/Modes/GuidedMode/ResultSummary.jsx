import React from 'react';

const ResultSummary = ({ beforeStats, afterStats, checkpoint, onRollback, canRollback = true }) => {
  if (!beforeStats || !afterStats) return null;

  const nodeDiff = afterStats.nodeCount - beforeStats.nodeCount;
  const edgeDiff = afterStats.edgeCount - beforeStats.edgeCount;
  const nodePercent = beforeStats.nodeCount > 0 ? Math.round((nodeDiff / beforeStats.nodeCount) * 100) : 0;
  const edgePercent = beforeStats.edgeCount > 0 ? Math.round((edgeDiff / beforeStats.edgeCount) * 100) : 0;

  const formatDiff = (value, percent) => {
    if (value === 0) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value} (${sign}${percent}%)`;
  };

  return (
    <div className="result-summary">
      <div className="result-summary__header">
        <span className="result-summary__title">📊 Result Summary</span>
        {checkpoint && (
          <span className="result-summary__checkpoint">Checkpoint: {checkpoint.checkpointId}</span>
        )}
      </div>

      <div className="result-summary__comparison">
        <div className="result-summary__column">
          <div className="result-summary__column-title">Before</div>
          <div className="result-summary__stat">
            <span className="result-summary__stat-value">{beforeStats.nodeCount}</span>
            <span className="result-summary__stat-label">nodes</span>
          </div>
          <div className="result-summary__stat">
            <span className="result-summary__stat-value">{beforeStats.edgeCount}</span>
            <span className="result-summary__stat-label">edges</span>
          </div>
        </div>

        <div className="result-summary__arrow">→</div>

        <div className="result-summary__column">
          <div className="result-summary__column-title">After</div>
          <div className="result-summary__stat">
            <span className="result-summary__stat-value">{afterStats.nodeCount}</span>
            <span className="result-summary__stat-label">nodes</span>
          </div>
          <div className="result-summary__stat">
            <span className="result-summary__stat-value">{afterStats.edgeCount}</span>
            <span className="result-summary__stat-label">edges</span>
          </div>
        </div>

        <div className="result-summary__column result-summary__column--diff">
          <div className="result-summary__column-title">Change</div>
          <div className={`result-summary__stat ${nodeDiff < 0 ? 'result-summary__stat--positive' : ''}`}>
            <span className="result-summary__stat-value">{formatDiff(nodeDiff, nodePercent)}</span>
          </div>
          <div className={`result-summary__stat ${edgeDiff < 0 ? 'result-summary__stat--positive' : ''}`}>
            <span className="result-summary__stat-value">{formatDiff(edgeDiff, edgePercent)}</span>
          </div>
        </div>
      </div>

      {canRollback && checkpoint && !checkpoint.mock && (
        <div className="result-summary__actions">
          <button className="result-summary__rollback" onClick={() => onRollback?.(checkpoint.checkpointId)}>
            ↩ Rollback to checkpoint
          </button>
        </div>
      )}
    </div>
  );
};

export default ResultSummary;
