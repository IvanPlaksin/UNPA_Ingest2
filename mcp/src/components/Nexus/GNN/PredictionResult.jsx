import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

const TYPE_ICONS = {
  CLASS: '\uD83D\uDCE6',
  METHOD: '\u2699\uFE0F',
  SERVICE: '\uD83D\uDD27',
  INTERFACE: '\uD83D\uDD0C',
  FILE: '\uD83D\uDCC4',
};

const LAYER_COLORS = {
  Strategic: '#f59e0b',
  Business: '#3b82f6',
  Code: '#22c55e',
};

/**
 * Single prediction result with score, type, and action buttons.
 */
const PredictionResult = ({ prediction, sourceNode, onShow, onAdd }) => {
  const { targetId, targetName, targetType, targetLayer, score, edgeType } = prediction;

  const setHighlight = useNexusStore(state => state.setHighlight);

  const getScoreColor = (s) => {
    if (s >= 0.8) return '#22c55e';
    if (s >= 0.6) return '#f59e0b';
    return '#64748b';
  };

  const handleMouseEnter = () => {
    setHighlight([targetId], 'outline', '#f59e0b');
  };

  const handleMouseLeave = () => {
    setHighlight([], 'outline', '#f59e0b');
  };

  const handleShow = (e) => {
    e.stopPropagation();
    setHighlight([sourceNode?.id, targetId].filter(Boolean), 'glow', '#f59e0b');
    onShow?.(prediction);
  };

  const handleAdd = (e) => {
    e.stopPropagation();
    onAdd?.(prediction);
  };

  const scorePercent = Math.round(score * 100);

  return (
    <div
      className="prediction-result"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="prediction-result__arrow">{'\u2192'}</div>

      <div className="prediction-result__icon">
        {TYPE_ICONS[targetType?.toUpperCase()] || '\uD83D\uDCC4'}
      </div>

      <div className="prediction-result__content">
        <div className="prediction-result__header">
          <span className="prediction-result__name">{targetName || targetId}</span>
          <span
            className="prediction-result__score"
            style={{ color: getScoreColor(score) }}
          >
            {scorePercent}%
          </span>
        </div>

        <div className="prediction-result__meta">
          <span className="prediction-result__type">{targetType}</span>
          {targetLayer && (
            <>
              <span className="prediction-result__separator">{'\u2022'}</span>
              <span
                className="prediction-result__layer"
                style={{ color: LAYER_COLORS[targetLayer] || '#64748b' }}
              >
                {targetLayer}
              </span>
            </>
          )}
        </div>

        <div className="prediction-result__edge">
          Predicted: <span className="prediction-result__edge-type">{edgeType}</span>
        </div>
      </div>

      <div className="prediction-result__actions">
        <button
          className="prediction-result__btn"
          onClick={handleShow}
          title="Show on graph"
        >
          Show
        </button>
        <button
          className="prediction-result__btn prediction-result__btn--primary"
          onClick={handleAdd}
          title="Add edge to graph"
        >
          Add
        </button>
      </div>
    </div>
  );
};

export default PredictionResult;
