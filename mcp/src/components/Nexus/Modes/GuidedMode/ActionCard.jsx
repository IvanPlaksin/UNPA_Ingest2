import React from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';

const ActionCard = ({ cluster, status = 'pending', onConsolidate, onExport, disabled = false }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);

  const handlePreview = () => {
    if (cluster.nodeIds?.length > 0) {
      setHighlight(cluster.nodeIds, 'glow', '#6366f1');
      selectAndFocus(cluster.nodeIds);
    }
  };

  const statusIcons = { pending: '○', processing: '⏳', success: '✓', error: '✗' };
  const clusterName = cluster.customName || cluster.name;

  return (
    <div className={`action-card ${status !== 'pending' ? `action-card--${status}` : ''}`}>
      <div className="action-card__status">
        <span className={`action-card__status-icon action-card__status-icon--${status}`}>
          {statusIcons[status] || '○'}
        </span>
      </div>

      <div className="action-card__info">
        <div className="action-card__name">{clusterName}</div>
        <div className="action-card__meta">
          <span>{cluster.nodeCount} nodes</span>
          {cluster.coherenceScore > 0 && (
            <>
              <span className="action-card__separator">•</span>
              <span>Coherence: {Math.round(cluster.coherenceScore * 100)}%</span>
            </>
          )}
          {cluster.metrics?.isolation > 0 && (
            <>
              <span className="action-card__separator">•</span>
              <span>Isolation: {Math.round(cluster.metrics.isolation * 100)}%</span>
            </>
          )}
        </div>
      </div>

      <div className="action-card__actions">
        <button className="action-card__btn" onClick={handlePreview} title="Preview on graph">👁</button>
        <button
          className="action-card__btn action-card__btn--primary"
          onClick={() => onConsolidate?.(cluster)}
          disabled={disabled || status === 'processing' || status === 'success'}
          title="Consolidate into SubGraph"
        >📦</button>
        <button
          className="action-card__btn"
          onClick={() => onExport?.(cluster)}
          disabled={disabled || status === 'processing'}
          title="Export as JSON"
        >📥</button>
      </div>
    </div>
  );
};

export default ActionCard;
