import React, { useState, useEffect, useCallback } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';
import StrategySelector from './StrategySelector';
import ClusterCard from './ClusterCard';

/**
 * Phase 2: Discover
 *
 * Find clusters/communities in the graph using various strategies.
 */
const PhaseDiscover = ({ data, loading, error, onRun, onNext, onBack, embeddingsAvailable = false }) => {
  const [strategy, setStrategy] = useState('community');
  const [selectedClusters, setSelectedClusters] = useState([]);

  const clearHighlight = useNexusStore(state => state.clearHighlight);
  const clearVisualClusters = useNexusStore(state => state.clearVisualClusters);
  const setGuidedData = useNexusStore(state => state.setGuidedData);

  const clusters = data?.candidates || [];
  const discoveryResult = data?.discoveryResult;

  // Clear visual state when leaving
  useEffect(() => {
    return () => {
      clearHighlight();
      clearVisualClusters();
    };
  }, [clearHighlight, clearVisualClusters]);

  const handleRunDiscovery = useCallback(() => {
    onRun(strategy);
  }, [onRun, strategy]);

  const handleSelectCluster = useCallback((cluster, selected) => {
    setSelectedClusters(prev =>
      selected
        ? [...prev, cluster]
        : prev.filter(c => c.id !== cluster.id)
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedClusters.length === clusters.length) {
      setSelectedClusters([]);
    } else {
      setSelectedClusters([...clusters]);
    }
  }, [clusters, selectedClusters.length]);

  const handleContinue = useCallback(() => {
    setGuidedData({
      selectedCandidate: selectedClusters.length === 1 ? selectedClusters[0] : null,
      candidates: clusters,
      selectedCandidates: selectedClusters,
    });
    onNext();
  }, [selectedClusters, clusters, setGuidedData, onNext]);

  const hasSelection = selectedClusters.length > 0;

  // Empty state — no discovery run yet
  if (!discoveryResult && !loading && !error) {
    return (
      <div className="phase-content">
        <div className="phase-section">
          <StrategySelector
            selectedStrategy={strategy}
            onSelect={setStrategy}
            disabled={loading}
            embeddingsAvailable={embeddingsAvailable}
          />
        </div>

        <div className="phase-section phase-section--centered">
          <div className="phase-empty">
            <span className="phase-empty__icon">🎯</span>
            <span className="phase-empty__text">
              Select a strategy and discover clusters in your graph
            </span>
            <button className="phase-empty__start" onClick={handleRunDiscovery}>
              Find Clusters
            </button>
          </div>
        </div>

        <div className="phase-actions">
          <button className="phase-actions__secondary" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="phase-content phase-content--loading">
        <div className="phase-loading">
          <span className="phase-loading__spinner">⟳</span>
          <span className="phase-loading__text">
            Finding clusters using {strategy} strategy...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="phase-content phase-content--error">
        <div className="phase-error">
          <span className="phase-error__icon">⚠️</span>
          <span className="phase-error__text">{error}</span>
          <button className="phase-error__retry" onClick={handleRunDiscovery}>Retry</button>
        </div>
      </div>
    );
  }

  // Results state
  return (
    <div className="phase-content">
      {/* Strategy Selector */}
      <div className="phase-section">
        <StrategySelector
          selectedStrategy={strategy}
          onSelect={setStrategy}
          disabled={loading}
        />
        <button className="strategy-run-btn" onClick={handleRunDiscovery} disabled={loading}>
          🔄 Re-run
        </button>
      </div>

      {/* Results Summary */}
      <div className="phase-section">
        <div className="discover-summary">
          <span className="discover-summary__count">
            {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} found
          </span>
          {discoveryResult?.totalNodes > 0 && (
            <span className="discover-summary__total">
              covering {discoveryResult.totalNodes} nodes
            </span>
          )}
        </div>
      </div>

      {/* Cluster List */}
      <div className="phase-section">
        <div className="cluster-list-header">
          <h3 className="phase-section__title">📦 Cluster Candidates</h3>
          <button className="cluster-list-header__select-all" onClick={handleSelectAll}>
            {selectedClusters.length === clusters.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {clusters.length > 0 ? (
          <div className="cluster-list">
            {clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                isSelected={selectedClusters.some(c => c.id === cluster.id)}
                onSelect={handleSelectCluster}
              />
            ))}
          </div>
        ) : (
          <div className="cluster-list-empty">
            <span>No clusters found with current strategy.</span>
            <span>Try a different strategy or adjust parameters.</span>
          </div>
        )}
      </div>

      {/* Selection Summary */}
      {hasSelection && (
        <div className="phase-section">
          <div className="selection-summary">
            <span className="selection-summary__icon">✓</span>
            <span className="selection-summary__text">
              {selectedClusters.length} cluster{selectedClusters.length !== 1 ? 's' : ''} selected
              ({selectedClusters.reduce((sum, c) => sum + c.nodeCount, 0)} nodes total)
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="phase-actions">
        <button className="phase-actions__secondary" onClick={onBack}>← Back</button>
        <button
          className="phase-actions__primary"
          onClick={handleContinue}
          disabled={!hasSelection}
          title={hasSelection ? 'Evaluate selected clusters' : 'Select at least one cluster'}
        >
          Evaluate Selected →
        </button>
      </div>
    </div>
  );
};

export default PhaseDiscover;
