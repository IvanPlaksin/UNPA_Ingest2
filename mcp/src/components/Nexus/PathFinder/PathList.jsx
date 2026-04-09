import React from 'react';
import PathResult from './PathResult';

/**
 * List of found paths
 */
const PathList = ({
  paths,
  loading,
  error,
  onShowPath,
  onNodeClick,
  onClearResults,
}) => {
  if (loading) {
    return (
      <div className="path-list path-list--loading">
        <span className="path-list__spinner">⟳</span>
        <span className="path-list__loading-text">Finding paths...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="path-list path-list--error">
        <span className="path-list__error-icon">⚠️</span>
        <span className="path-list__error-text">{error}</span>
      </div>
    );
  }

  if (!paths || paths.length === 0) {
    return null;
  }

  return (
    <div className="path-list">
      <div className="path-list__header">
        <span className="path-list__count">
          {paths.length} path{paths.length !== 1 ? 's' : ''} found
        </span>
        <button
          className="path-list__clear"
          onClick={onClearResults}
        >
          Clear
        </button>
      </div>

      <div className="path-list__results">
        {paths.map((path, index) => (
          <PathResult
            key={`path-${index}`}
            path={path}
            index={index}
            onShow={onShowPath}
            onNodeClick={onNodeClick}
          />
        ))}
      </div>
    </div>
  );
};

export default PathList;
