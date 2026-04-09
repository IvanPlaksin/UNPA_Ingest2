import React from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';

const ClusterCard = ({ cluster, isSelected, onSelect, onPreview }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const addVisualCluster = useNexusStore(state => state.addVisualCluster);
  const removeVisualCluster = useNexusStore(state => state.removeVisualCluster);

  const getStarRating = (score) => {
    const normalized = Math.min(100, Math.max(0, score)) / 20;
    const fullStars = Math.floor(normalized);
    const halfStar = normalized - fullStars >= 0.5;
    return (
      <span className="cluster-card__stars">
        {'★'.repeat(fullStars)}
        {halfStar && '☆'}
        {'☆'.repeat(Math.max(0, 5 - fullStars - (halfStar ? 1 : 0)))}
      </span>
    );
  };

  const handlePreview = (e) => {
    e.stopPropagation();
    if (cluster.nodeIds?.length > 0) {
      setHighlight(cluster.nodeIds, 'glow', '#6366f1');
      selectAndFocus(cluster.nodeIds);
      addVisualCluster({
        id: `preview-${cluster.id}`,
        nodeIds: cluster.nodeIds,
        color: '#6366f1',
        label: cluster.name,
        opacity: 0.2,
      });
      if (onPreview) onPreview(cluster);
    }
  };

  const handleMouseLeave = () => {
    removeVisualCluster(`preview-${cluster.id}`);
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    onSelect(cluster, !isSelected);
  };

  const strategyLabels = { community: 'Community', ontology: 'Ontology', semantic: 'Semantic' };

  return (
    <div
      className={`cluster-card ${isSelected ? 'cluster-card--selected' : ''}`}
      onMouseLeave={handleMouseLeave}
    >
      <div className="cluster-card__checkbox" onClick={handleSelect}>
        {isSelected ? '☑' : '☐'}
      </div>

      <div className="cluster-card__content">
        <div className="cluster-card__header">
          <span className="cluster-card__name">{cluster.name}</span>
          <span className="cluster-card__score">{getStarRating(cluster.score)}</span>
        </div>

        <div className="cluster-card__meta">
          <span className="cluster-card__nodes">{cluster.nodeCount} nodes</span>
          <span className="cluster-card__separator">•</span>
          <span className="cluster-card__strategy">
            {strategyLabels[cluster.strategy] || cluster.strategy}
          </span>
          {cluster.metrics?.isolation > 0 && (
            <>
              <span className="cluster-card__separator">•</span>
              <span className="cluster-card__isolation">
                Isolation: {(cluster.metrics.isolation * 100).toFixed(0)}%
              </span>
            </>
          )}
        </div>
      </div>

      <div className="cluster-card__actions">
        <button className="cluster-card__action-btn" onClick={handlePreview} title="Preview on graph">
          👁
        </button>
        <button
          className="cluster-card__action-btn cluster-card__action-btn--select"
          onClick={handleSelect}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
};

export default ClusterCard;
