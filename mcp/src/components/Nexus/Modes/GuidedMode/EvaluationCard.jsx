import React, { useState, useCallback } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';

/**
 * Individual cluster evaluation card with coherence/isolation bars,
 * approve checkbox, name editing, and preview.
 */
const EvaluationCard = ({ evaluation, onApprove, onNameChange }) => {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(evaluation.customName || evaluation.name);

  const setHighlight = useNexusStore(state => state.setHighlight);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);

  const coherence = evaluation.coherenceScore || 0;
  const isolation = evaluation.metrics?.isolation || 0;
  const density = evaluation.metrics?.density || 0;
  const internalEdges = evaluation.metrics?.internalEdges || 0;
  const externalEdges = evaluation.metrics?.externalEdges || 0;

  const getScoreColor = (score) => {
    if (score >= 0.7) return '#22c55e';
    if (score >= 0.4) return '#f59e0b';
    return '#ef4444';
  };

  const handlePreview = useCallback((e) => {
    e.stopPropagation();
    if (evaluation.nodeIds?.length > 0) {
      setHighlight(evaluation.nodeIds, 'glow', getScoreColor(coherence));
      selectAndFocus(evaluation.nodeIds);
    }
  }, [evaluation.nodeIds, coherence, setHighlight, selectAndFocus]);

  const handleApprove = useCallback((e) => {
    e.stopPropagation();
    onApprove(evaluation.id, !evaluation.approved);
  }, [evaluation.id, evaluation.approved, onApprove]);

  const handleNameSubmit = useCallback(() => {
    setEditing(false);
    if (nameValue.trim() && nameValue !== evaluation.customName) {
      onNameChange(evaluation.id, nameValue.trim());
    }
  }, [evaluation.id, evaluation.customName, nameValue, onNameChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') { setEditing(false); setNameValue(evaluation.customName || evaluation.name); }
  }, [handleNameSubmit, evaluation.customName, evaluation.name]);

  return (
    <div className={`evaluation-card ${evaluation.approved ? 'evaluation-card--approved' : ''}`}>
      {/* Approve checkbox */}
      <div className="evaluation-card__approve" onClick={handleApprove}>
        {evaluation.approved ? '☑' : '☐'}
      </div>

      <div className="evaluation-card__body">
        {/* Name */}
        <div className="evaluation-card__header">
          {editing ? (
            <input
              className="evaluation-card__name-input"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <span
              className="evaluation-card__name"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {evaluation.customName || evaluation.name}
              <span className="evaluation-card__edit-icon">✎</span>
            </span>
          )}
          <span className="evaluation-card__node-count">{evaluation.nodeCount} nodes</span>
        </div>

        {/* Coherence bar */}
        <div className="evaluation-card__metric">
          <div className="evaluation-card__metric-header">
            <span className="evaluation-card__metric-label">Coherence</span>
            <span className="evaluation-card__metric-value" style={{ color: getScoreColor(coherence) }}>
              {(coherence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="evaluation-card__bar">
            <div
              className="evaluation-card__bar-fill"
              style={{ width: `${coherence * 100}%`, backgroundColor: getScoreColor(coherence) }}
            />
          </div>
        </div>

        {/* Isolation bar */}
        <div className="evaluation-card__metric">
          <div className="evaluation-card__metric-header">
            <span className="evaluation-card__metric-label">Isolation</span>
            <span className="evaluation-card__metric-value" style={{ color: getScoreColor(isolation) }}>
              {(isolation * 100).toFixed(0)}%
            </span>
          </div>
          <div className="evaluation-card__bar">
            <div
              className="evaluation-card__bar-fill"
              style={{ width: `${isolation * 100}%`, backgroundColor: getScoreColor(isolation) }}
            />
          </div>
        </div>

        {/* Boundary stats */}
        {(internalEdges > 0 || externalEdges > 0) && (
          <div className="evaluation-card__boundaries">
            <span className="evaluation-card__boundary">
              ↔ {internalEdges} internal
            </span>
            <span className="evaluation-card__boundary">
              ↗ {externalEdges} boundary
            </span>
            {density > 0 && (
              <span className="evaluation-card__boundary">
                ◆ {density.toFixed(3)} density
              </span>
            )}
          </div>
        )}

        {/* AI reasoning */}
        {evaluation.sharedPurpose && (
          <div className="evaluation-card__purpose">
            <span className="evaluation-card__purpose-label">Purpose:</span>
            {evaluation.sharedPurpose}
          </div>
        )}

        {/* Method badge */}
        <div className="evaluation-card__footer">
          <span className="evaluation-card__method">
            {evaluation.evaluationMethod === 'llm' ? '🤖 AI' : '📐 Heuristic'}
          </span>
          <button className="evaluation-card__preview-btn" onClick={handlePreview}>
            👁 Preview
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationCard;
