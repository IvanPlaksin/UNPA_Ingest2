import React from 'react';
import PredictionResult from './PredictionResult';

/**
 * List of GNN prediction results with loading/error states.
 */
const PredictionsList = ({
  predictions,
  sourceNode,
  loading,
  error,
  onShow,
  onAdd,
  onShowAll,
  onExport,
}) => {
  if (loading) {
    return (
      <div className="predictions-list predictions-list--loading">
        <span className="predictions-list__spinner">{'\uD83D\uDD2E'}</span>
        <span className="predictions-list__loading-text">Running predictions...</span>
      </div>
    );
  }

  if (error && predictions.length === 0) {
    return (
      <div className="predictions-list predictions-list--error">
        <span className="predictions-list__error-icon">{'\u26A0\uFE0F'}</span>
        <span className="predictions-list__error-text">{error}</span>
      </div>
    );
  }

  if (!predictions || predictions.length === 0) {
    return null;
  }

  return (
    <div className="predictions-list">
      <div className="predictions-list__header">
        <span className="predictions-list__count">
          {predictions.length} predicted link{predictions.length !== 1 ? 's' : ''}
        </span>
        {error && (
          <span className="predictions-list__warning" title={error}>
            {'\u26A0\uFE0F'} Demo mode
          </span>
        )}
      </div>

      <div className="predictions-list__results">
        {predictions.map((prediction, index) => (
          <PredictionResult
            key={`${prediction.targetId}-${index}`}
            prediction={prediction}
            sourceNode={sourceNode}
            onShow={onShow}
            onAdd={onAdd}
          />
        ))}
      </div>

      <div className="predictions-list__footer">
        <button className="predictions-list__btn" onClick={onShowAll}>
          Show All on Graph
        </button>
        <button
          className="predictions-list__btn predictions-list__btn--secondary"
          onClick={onExport}
        >
          Export Predictions
        </button>
      </div>
    </div>
  );
};

export default PredictionsList;
