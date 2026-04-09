import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

const TYPE_ICONS = {
  CLASS: '\uD83D\uDCE6', METHOD: '\u2699\uFE0F', SERVICE: '\uD83D\uDD27',
  INTERFACE: '\uD83D\uDD0C', FILE: '\uD83D\uDCC4',
};
const LAYER_COLORS = { Strategic: '#f59e0b', Business: '#3b82f6', Code: '#22c55e' };

/**
 * Single similar node result with similarity score and actions.
 */
const SimilarNode = ({ result, onShow, onCompare }) => {
  const { node, similarity, matchReasons = [] } = result;

  const setHighlight = useNexusStore(state => state.setHighlight);

  const getSimilarityColor = (s) => {
    if (s >= 0.8) return '#22c55e';
    if (s >= 0.5) return '#f59e0b';
    return '#64748b';
  };

  const handleMouseEnter = () => setHighlight([node.id], 'outline', '#22c55e');
  const handleMouseLeave = () => setHighlight([], 'outline', '#22c55e');

  const handleShow = (e) => {
    e.stopPropagation();
    setHighlight([node.id], 'glow', '#22c55e');
    onShow?.(node);
  };

  const handleCompare = (e) => {
    e.stopPropagation();
    onCompare?.(node);
  };

  const name = node.name || node.label || node.id;
  const degree = node.degree ?? 0;
  const simPercent = Math.round(similarity * 100);

  return (
    <div
      className="similar-node"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="similar-node__icon">
        {TYPE_ICONS[node.type?.toUpperCase()] || '\uD83D\uDCC4'}
      </div>

      <div className="similar-node__content">
        <div className="similar-node__header">
          <span className="similar-node__name">{name}</span>
          <span
            className="similar-node__similarity"
            style={{ color: getSimilarityColor(similarity) }}
          >
            {simPercent}%
          </span>
        </div>

        <div className="similar-node__meta">
          <span className="similar-node__type">{node.type}</span>
          {node.layer && (
            <>
              <span className="similar-node__separator">{'\u2022'}</span>
              <span
                className="similar-node__layer"
                style={{ color: LAYER_COLORS[node.layer] || '#64748b' }}
              >
                {node.layer}
              </span>
            </>
          )}
          <span className="similar-node__separator">{'\u2022'}</span>
          <span className="similar-node__degree">{degree} connections</span>
        </div>

        {matchReasons.length > 0 && (
          <div className="similar-node__reasons">
            Match: {matchReasons.join(', ')}
          </div>
        )}
      </div>

      <div className="similar-node__actions">
        <button className="similar-node__btn" onClick={handleShow} title="Show on graph">Show</button>
        <button className="similar-node__btn" onClick={handleCompare} title="Compare with reference">Compare</button>
      </div>
    </div>
  );
};

export default SimilarNode;
