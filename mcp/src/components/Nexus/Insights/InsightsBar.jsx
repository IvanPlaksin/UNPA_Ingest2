import React, { useState, useCallback } from 'react';
import { useInsights } from './useInsights';
import InsightCard from './InsightCard';
import './InsightsBar.css';

/**
 * InsightsBar — Displays proactive insights about the graph.
 *
 * Features:
 * - Summary badges (high/medium/low counts)
 * - Expandable insight cards
 * - Auto-refresh indicator
 * - Manual refresh button
 */
const InsightsBar = ({ onInsightAction }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedInsightId, setExpandedInsightId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const { insights, loading, error, timeSinceUpdate, summary, refresh } = useInsights();

  const handleToggleInsight = useCallback((insightId) => {
    setExpandedInsightId(prev => (prev === insightId ? null : insightId));
  }, []);

  const handleInsightAction = useCallback((action, insight) => {
    if (onInsightAction) onInsightAction(action, insight);
  }, [onInsightAction]);

  const visibleInsights = showAll ? insights : insights.slice(0, 3);
  const hasMore = insights.length > 3;

  return (
    <div className={`insights-bar ${isExpanded ? '' : 'insights-bar--collapsed'}`}>
      {/* Header */}
      <div className="insights-bar__header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="insights-bar__title">
          <span className="insights-bar__icon">💡</span>
          <span>Insights</span>
        </div>

        <div className="insights-bar__summary">
          {summary.high > 0 && (
            <span className="insights-bar__badge insights-bar__badge--high">🔴 {summary.high}</span>
          )}
          {summary.medium > 0 && (
            <span className="insights-bar__badge insights-bar__badge--medium">🟡 {summary.medium}</span>
          )}
          {summary.low > 0 && (
            <span className="insights-bar__badge insights-bar__badge--low">🔵 {summary.low}</span>
          )}
          {summary.total === 0 && !loading && (
            <span className="insights-bar__badge insights-bar__badge--empty">✓ No issues</span>
          )}
        </div>

        <div className="insights-bar__controls">
          {timeSinceUpdate && (
            <span className="insights-bar__time" title="Last updated">{timeSinceUpdate}</span>
          )}
          <button
            className={`insights-bar__refresh-btn ${loading ? 'insights-bar__refresh-btn--loading' : ''}`}
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={loading}
            title="Refresh insights"
          >
            ↻
          </button>
        </div>

        <span className="insights-bar__expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="insights-bar__content">
          {loading && insights.length === 0 && (
            <div className="insights-bar__loading">
              <span className="insights-bar__spinner">⟳</span>
              <span>Analyzing graph...</span>
            </div>
          )}

          {error && (
            <div className="insights-bar__error">
              <span>⚠️ {error}</span>
              <button onClick={refresh}>Retry</button>
            </div>
          )}

          {!loading && !error && insights.length === 0 && (
            <div className="insights-bar__empty">
              <span className="insights-bar__empty-icon">✨</span>
              <span>No issues detected. Your graph looks healthy!</span>
            </div>
          )}

          {insights.length > 0 && (
            <div className="insights-bar__list">
              {visibleInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  isExpanded={expandedInsightId === insight.id}
                  onToggle={() => handleToggleInsight(insight.id)}
                  onAction={handleInsightAction}
                />
              ))}
              {hasMore && (
                <button className="insights-bar__show-more" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show less' : `Show ${insights.length - 3} more...`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InsightsBar;
