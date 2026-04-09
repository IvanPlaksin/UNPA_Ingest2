import React from 'react';
import SimilarNode from './SimilarNode';

/**
 * List of similar nodes with loading/error states.
 */
const SimilarNodesList = ({ results, loading, error, onShow, onCompare }) => {
  if (loading) {
    return (
      <div className="similar-nodes-list similar-nodes-list--loading">
        <span className="similar-nodes-list__spinner">{'\uD83D\uDC65'}</span>
        <span className="similar-nodes-list__loading-text">Finding similar nodes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="similar-nodes-list similar-nodes-list--error">
        <span className="similar-nodes-list__error-icon">{'\u26A0\uFE0F'}</span>
        <span className="similar-nodes-list__error-text">{error}</span>
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  return (
    <div className="similar-nodes-list">
      <div className="similar-nodes-list__header">
        <span className="similar-nodes-list__count">
          {results.length} similar node{results.length !== 1 ? 's' : ''} found
        </span>
      </div>

      <div className="similar-nodes-list__results">
        {results.map((result, index) => (
          <SimilarNode
            key={result.node?.id || index}
            result={result}
            onShow={onShow}
            onCompare={onCompare}
          />
        ))}
      </div>
    </div>
  );
};

export default SimilarNodesList;
