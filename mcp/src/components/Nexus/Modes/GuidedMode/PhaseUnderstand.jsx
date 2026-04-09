import React, { useEffect, useRef } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';

/**
 * Phase 1: Understand
 *
 * Shows structural analysis results:
 * - Graph overview (nodes, edges, density)
 * - Key findings (hubs, bridges, orphans)
 */
const PhaseUnderstand = ({ data, loading, error, onRun, onNext }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const hasAutoRun = useRef(false);

  // Auto-run on mount if no data
  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!data?.structuralAnalysis && !loading && !error) {
      hasAutoRun.current = true;
      onRun();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = data?.structuralAnalysis?.analysis;
  const insights = data?.structuralAnalysis?.insights || [];

  const handleHighlightNodes = (nodeIds, color = '#6366f1') => {
    if (nodeIds?.length > 0) {
      setHighlight(nodeIds, 'glow', color);
      selectAndFocus(nodeIds);
    }
  };

  if (loading) {
    return (
      <div className="phase-content phase-content--loading">
        <div className="phase-loading">
          <span className="phase-loading__spinner">⟳</span>
          <span className="phase-loading__text">Analyzing graph structure...</span>
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
          <button className="phase-error__retry" onClick={onRun}>Retry Analysis</button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="phase-content phase-content--empty">
        <div className="phase-empty">
          <span className="phase-empty__icon">🔍</span>
          <span className="phase-empty__text">Ready to analyze your graph</span>
          <button className="phase-empty__start" onClick={onRun}>Start Analysis</button>
        </div>
      </div>
    );
  }

  const nodeCount = analysis.nodeCount || 0;
  const edgeCount = analysis.edgeCount || 0;
  const density = analysis.density || 0;
  const componentCount = analysis.componentCount || analysis.connectedComponents?.length || 1;

  const hubs = analysis.hubNodes || analysis.hubs || [];
  const bridges = analysis.bridgeEdges || analysis.bridges || [];
  const orphans = analysis.orphanNodes || [];

  return (
    <div className="phase-content">
      {/* Graph Overview */}
      <div className="phase-section">
        <h3 className="phase-section__title">📊 Graph Overview</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-card__value">{nodeCount}</div>
            <div className="metric-card__label">Nodes</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{edgeCount}</div>
            <div className="metric-card__label">Edges</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{density.toFixed(3)}</div>
            <div className="metric-card__label">Density</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{componentCount}</div>
            <div className="metric-card__label">Components</div>
          </div>
        </div>
      </div>

      {/* Key Findings */}
      <div className="phase-section">
        <h3 className="phase-section__title">🔑 Key Findings</h3>
        <div className="findings-list">
          {hubs.length > 0 && (
            <div
              className="finding-item finding-item--warning"
              onClick={() => handleHighlightNodes(hubs.slice(0, 5).map(h => h.id || h), '#f59e0b')}
            >
              <span className="finding-item__icon">🔴</span>
              <div className="finding-item__content">
                <div className="finding-item__title">Hub Concentration</div>
                <div className="finding-item__description">
                  Top hub: &quot;{hubs[0]?.name || hubs[0]?.id || hubs[0]}&quot;{' '}
                  with {hubs[0]?.degree || '?'} connections
                </div>
              </div>
              <span className="finding-item__action">→</span>
            </div>
          )}

          {bridges.length > 5 && (
            <div
              className="finding-item finding-item--caution"
              onClick={() => {
                const nodes = bridges.slice(0, 10).flatMap(b => [b.source, b.target]).filter(Boolean);
                handleHighlightNodes([...new Set(nodes)], '#f59e0b');
              }}
            >
              <span className="finding-item__icon">🟡</span>
              <div className="finding-item__content">
                <div className="finding-item__title">Bridge Edges</div>
                <div className="finding-item__description">
                  {bridges.length} critical edges detected (fragile connectivity)
                </div>
              </div>
              <span className="finding-item__action">→</span>
            </div>
          )}

          {orphans.length > 0 && (
            <div
              className="finding-item finding-item--info"
              onClick={() => handleHighlightNodes(orphans.slice(0, 10).map(o => o.id || o), '#3b82f6')}
            >
              <span className="finding-item__icon">🔵</span>
              <div className="finding-item__content">
                <div className="finding-item__title">Orphan Nodes</div>
                <div className="finding-item__description">
                  {orphans.length} node{orphans.length !== 1 ? 's' : ''} with no connections
                </div>
              </div>
              <span className="finding-item__action">→</span>
            </div>
          )}

          {componentCount > 1 && (
            <div className="finding-item finding-item--warning">
              <span className="finding-item__icon">🟠</span>
              <div className="finding-item__content">
                <div className="finding-item__title">Disconnected Graph</div>
                <div className="finding-item__description">
                  {componentCount} separate components detected
                </div>
              </div>
            </div>
          )}

          {hubs.length === 0 && bridges.length <= 5 && orphans.length === 0 && componentCount === 1 && (
            <div className="finding-item finding-item--success">
              <span className="finding-item__icon">✅</span>
              <div className="finding-item__content">
                <div className="finding-item__title">Healthy Structure</div>
                <div className="finding-item__description">
                  No significant structural issues detected
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Insights Summary */}
      {insights.length > 0 && (
        <div className="phase-section">
          <h3 className="phase-section__title">💡 Insights Generated</h3>
          <div className="insights-summary-mini">
            <span className="insights-summary-mini__count">{insights.length}</span>
            <span className="insights-summary-mini__label">
              insight{insights.length !== 1 ? 's' : ''} available in the Insights panel
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="phase-actions">
        <button className="phase-actions__secondary" onClick={onRun}>↻ Re-analyze</button>
        <button className="phase-actions__primary" onClick={onNext}>Continue to Discover →</button>
      </div>
    </div>
  );
};

export default PhaseUnderstand;
