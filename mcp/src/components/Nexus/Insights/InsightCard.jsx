import React, { useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

const SEVERITY_INFO = {
  high:   { icon: '🔴', color: '#ef4444' },
  medium: { icon: '🟡', color: '#f59e0b' },
  low:    { icon: '🔵', color: '#3b82f6' },
};

const TYPE_ICONS = {
  warning: '⚠️',
  opportunity: '💡',
  suggestion: '💭',
};

const InsightCard = ({ insight, isExpanded, onToggle, onAction }) => {
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const setHighlight = useNexusStore(state => state.setHighlight);

  const severity = SEVERITY_INFO[insight.severity] || { icon: '⚪', color: '#94a3b8' };
  const hasAffectedNodes = insight.evidence?.affectedNodes?.length > 0;

  const handleShowOnGraph = useCallback((e) => {
    e.stopPropagation();
    const nodeIds = insight.evidence?.affectedNodes || [];
    if (nodeIds.length > 0) {
      setHighlight(nodeIds, 'glow', severity.color);
      selectAndFocus(nodeIds);
    }
  }, [insight, selectAndFocus, setHighlight, severity.color]);

  const handleSuggestedAction = useCallback((e) => {
    e.stopPropagation();
    if (onAction && insight.suggestedAction) {
      onAction(insight.suggestedAction, insight);
    }
  }, [insight, onAction]);

  return (
    <div
      className={`insight-card ${isExpanded ? 'insight-card--expanded' : ''}`}
      style={{ borderLeftColor: severity.color }}
      onClick={onToggle}
    >
      <div className="insight-card__header">
        <span className="insight-card__severity">{severity.icon}</span>
        <span className="insight-card__title">{insight.title}</span>
        <span className="insight-card__type-icon" title={insight.type}>
          {TYPE_ICONS[insight.type] || 'ℹ️'}
        </span>
      </div>

      <div className="insight-card__description">{insight.description}</div>

      {isExpanded && (
        <div className="insight-card__details">
          {insight.evidence && (
            <div className="insight-card__evidence">
              <span className="insight-card__evidence-label">Evidence:</span>
              <span className="insight-card__evidence-value">
                {insight.evidence.metric}:{' '}
                {typeof insight.evidence.value === 'number'
                  ? insight.evidence.value.toFixed(3)
                  : insight.evidence.value}
                {insight.evidence.threshold != null && (
                  <span className="insight-card__threshold">
                    {' '}(threshold: {insight.evidence.threshold})
                  </span>
                )}
              </span>
            </div>
          )}

          {hasAffectedNodes && (
            <div className="insight-card__affected">
              {insight.evidence.affectedNodes.length} node
              {insight.evidence.affectedNodes.length !== 1 ? 's' : ''} affected
            </div>
          )}

          <div className="insight-card__actions">
            {hasAffectedNodes && (
              <button className="insight-card__action-btn" onClick={handleShowOnGraph}>
                🎯 Show on graph
              </button>
            )}
            {insight.suggestedAction && (
              <button
                className="insight-card__action-btn insight-card__action-btn--primary"
                onClick={handleSuggestedAction}
              >
                ⚡ {insight.suggestedAction.title}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="insight-card__expand-indicator">
        {isExpanded ? '▲' : '▼'}
      </div>
    </div>
  );
};

export default InsightCard;
