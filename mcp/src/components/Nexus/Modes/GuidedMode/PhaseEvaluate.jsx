import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';
import EvaluationCard from './EvaluationCard';

/**
 * Phase 3: Evaluate
 *
 * Assess cluster coherence and boundaries.
 * Users approve/rename clusters before proceeding to Act.
 */
const PhaseEvaluate = ({ data, loading, error, onRun, onNext, onBack }) => {
  const [evaluations, setEvaluations] = useState([]);
  const clearHighlight = useNexusStore(state => state.clearHighlight);
  const setGuidedData = useNexusStore(state => state.setGuidedData);
  const hasAutoRun = useRef(false);

  // Initialize evaluations from data
  useEffect(() => {
    if (data?.evaluationResult?.evaluations) {
      setEvaluations(data.evaluationResult.evaluations);
    }
  }, [data?.evaluationResult]);

  // Auto-run evaluation on mount if we have selected candidates but no result
  useEffect(() => {
    if (hasAutoRun.current) return;
    const candidates = data?.selectedCandidates || data?.candidates || [];
    if (candidates.length > 0 && !data?.evaluationResult && !loading && !error) {
      hasAutoRun.current = true;
      onRun(candidates);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear highlights on unmount
  useEffect(() => {
    return () => clearHighlight();
  }, [clearHighlight]);

  const handleApprove = useCallback((clusterId, approved) => {
    setEvaluations(prev =>
      prev.map(ev => ev.id === clusterId ? { ...ev, approved } : ev)
    );
  }, []);

  const handleNameChange = useCallback((clusterId, newName) => {
    setEvaluations(prev =>
      prev.map(ev => ev.id === clusterId ? { ...ev, customName: newName } : ev)
    );
  }, []);

  const handleApproveAll = useCallback(() => {
    const allApproved = evaluations.every(ev => ev.approved);
    setEvaluations(prev => prev.map(ev => ({ ...ev, approved: !allApproved })));
  }, [evaluations]);

  const handleContinue = useCallback(() => {
    const approved = evaluations.filter(ev => ev.approved);
    setGuidedData({
      evaluationResult: { evaluations },
      approvedClusters: approved,
    });
    onNext();
  }, [evaluations, setGuidedData, onNext]);

  const approvedCount = evaluations.filter(ev => ev.approved).length;
  const avgCoherence = evaluations.length > 0
    ? evaluations.reduce((sum, ev) => sum + (ev.coherenceScore || 0), 0) / evaluations.length
    : 0;

  // Loading state with progress
  if (loading) {
    const candidates = data?.selectedCandidates || data?.candidates || [];
    return (
      <div className="phase-content phase-content--loading">
        <div className="phase-loading">
          <span className="phase-loading__spinner">⟳</span>
          <span className="phase-loading__text">
            Evaluating {candidates.length} cluster{candidates.length !== 1 ? 's' : ''}...
          </span>
          <div className="evaluate-progress">
            <div className="evaluate-progress__bar">
              <div className="evaluate-progress__fill evaluate-progress__fill--animated" />
            </div>
            <span className="evaluate-progress__label">Running coherence analysis</span>
          </div>
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
          <button className="phase-error__retry" onClick={() => {
            const candidates = data?.selectedCandidates || data?.candidates || [];
            onRun(candidates);
          }}>
            Retry Evaluation
          </button>
        </div>
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="phase-content phase-content--empty">
        <div className="phase-empty">
          <span className="phase-empty__icon">⚖️</span>
          <span className="phase-empty__text">No clusters to evaluate</span>
          <button className="phase-empty__start" onClick={onBack}>← Back to Discover</button>
        </div>
      </div>
    );
  }

  return (
    <div className="phase-content">
      {/* Summary */}
      <div className="phase-section">
        <div className="evaluate-summary">
          <div className="evaluate-summary__stat">
            <span className="evaluate-summary__value">{evaluations.length}</span>
            <span className="evaluate-summary__label">Evaluated</span>
          </div>
          <div className="evaluate-summary__stat">
            <span className="evaluate-summary__value">{approvedCount}</span>
            <span className="evaluate-summary__label">Approved</span>
          </div>
          <div className="evaluate-summary__stat">
            <span className="evaluate-summary__value" style={{
              color: avgCoherence >= 0.7 ? '#22c55e' : avgCoherence >= 0.4 ? '#f59e0b' : '#ef4444'
            }}>
              {(avgCoherence * 100).toFixed(0)}%
            </span>
            <span className="evaluate-summary__label">Avg Coherence</span>
          </div>
        </div>
      </div>

      {/* Evaluation List */}
      <div className="phase-section">
        <div className="cluster-list-header">
          <h3 className="phase-section__title">⚖️ Cluster Evaluations</h3>
          <button className="cluster-list-header__select-all" onClick={handleApproveAll}>
            {evaluations.every(ev => ev.approved) ? 'Unapprove All' : 'Approve All'}
          </button>
        </div>

        <div className="evaluation-list">
          {evaluations.map((evaluation) => (
            <EvaluationCard
              key={evaluation.id}
              evaluation={evaluation}
              onApprove={handleApprove}
              onNameChange={handleNameChange}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="phase-actions">
        <button className="phase-actions__secondary" onClick={onBack}>← Back</button>
        <button
          className="phase-actions__primary"
          onClick={handleContinue}
          disabled={approvedCount === 0}
          title={approvedCount > 0 ? `Proceed with ${approvedCount} approved clusters` : 'Approve at least one cluster'}
        >
          Proceed to Act ({approvedCount}) →
        </button>
      </div>
    </div>
  );
};

export default PhaseEvaluate;
