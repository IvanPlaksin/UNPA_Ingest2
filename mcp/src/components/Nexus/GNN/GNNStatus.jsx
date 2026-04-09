import React from 'react';

/**
 * GNN model status display.
 */
const GNNStatus = ({ status, onRefresh }) => {
  const { ready, loading, lastUpdated, modelVersion, error } = status;

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="gnn-status">
      <div className="gnn-status__indicator">
        <span className={`gnn-status__dot ${ready ? 'gnn-status__dot--ready' : 'gnn-status__dot--offline'}`}>
          {'\u25CF'}
        </span>
        <span className="gnn-status__label">
          GNN Model: {loading ? 'Loading...' : ready ? 'Ready' : 'Offline'}
        </span>
        {modelVersion && (
          <span className="gnn-status__version">v{modelVersion}</span>
        )}
      </div>

      <div className="gnn-status__meta">
        <span className="gnn-status__updated">
          Last updated: {formatLastUpdated(lastUpdated)}
        </span>
        <button
          className="gnn-status__refresh"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh model"
        >
          {loading ? '\u23F3' : '\uD83D\uDD04'} Refresh
        </button>
      </div>

      {error && (
        <div className="gnn-status__error">
          {'\u26A0\uFE0F'} {error}
        </div>
      )}
    </div>
  );
};

export default GNNStatus;
