import React, { useCallback, useEffect, useRef } from 'react';
import PipelineProgress from './PipelineProgress';
import PhaseUnderstand from './PhaseUnderstand';
import PhaseDiscover from './PhaseDiscover';
import PhaseEvaluate from './PhaseEvaluate';
import PhaseAct from './PhaseAct';
import { useGuidedAnalysis } from './useGuidedAnalysis';
import { useSession } from '../../Session/useSession';
import './GuidedMode.css';

/**
 * Guided Mode — 4-phase analysis workflow.
 *
 * Phases:
 * 1. UNDERSTAND — Structural analysis
 * 2. DISCOVER — Find clusters
 * 3. EVALUATE — Assess quality
 * 4. ACT — Consolidate / export
 */
const GuidedMode = ({ embeddingsAvailable = false }) => {
  const {
    loading,
    error,
    phase,
    data,
    runUnderstand,
    runDiscover,
    runEvaluate,
    runAct,
    rollback,
    goToNextPhase,
    goToPreviousPhase,
    goToPhase,
    restart,
  } = useGuidedAnalysis();

  const {
    session,
    startSession,
    recordStep,
    updateSessionSummary,
    finishSession,
  } = useSession();

  const sessionStarted = useRef(false);

  // Start session on mount if none active
  useEffect(() => {
    if (sessionStarted.current) return;
    if (!session) {
      sessionStarted.current = true;
      startSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback(() => {
    console.log('[GuidedMode] Analysis workflow completed');
    finishSession(data.actionResult?.afterStats || null);
  }, [finishSession, data]);

  // Wrapped callbacks that record session steps
  const handleRunUnderstand = useCallback(async (...args) => {
    const result = await runUnderstand(...args);
    recordStep('understand', 'analyze', {
      nodeCount: result?.nodeCount,
      edgeCount: result?.edgeCount,
    });
    return result;
  }, [runUnderstand, recordStep]);

  const handleRunDiscover = useCallback(async (...args) => {
    const result = await runDiscover(...args);
    if (result?.length > 0) {
      recordStep('discover', 'segment', { clustersFound: result.length });
      updateSessionSummary({ clustersFound: result.length });
    }
    return result;
  }, [runDiscover, recordStep, updateSessionSummary]);

  const handleRunEvaluate = useCallback(async (...args) => {
    const result = await runEvaluate(...args);
    const approvedCount = result?.filter?.(c => c.approved)?.length || 0;
    recordStep('evaluate', 'evaluate', { clustersEvaluated: result?.length || 0 });
    if (approvedCount > 0) {
      updateSessionSummary({ clustersApproved: approvedCount });
    }
    return result;
  }, [runEvaluate, recordStep, updateSessionSummary]);

  const handleRunAct = useCallback(async (...args) => {
    const result = await runAct(...args);
    const consolidated = result?.results?.filter?.(r => r.status === 'success')?.length || 0;
    recordStep('act', 'consolidate', { clustersConsolidated: consolidated });
    updateSessionSummary({ clustersConsolidated: consolidated });
    return result;
  }, [runAct, recordStep, updateSessionSummary]);

  const getCompletedPhases = () => {
    const completed = [];
    if (data.structuralAnalysis) completed.push('understand');
    if (data.candidates?.length > 0) completed.push('discover');
    if (data.evaluationResult) completed.push('evaluate');
    if (data.actionResult) completed.push('act');
    return completed;
  };

  const renderPhaseContent = () => {
    switch (phase) {
      case 'understand':
        return (
          <PhaseUnderstand
            data={data}
            loading={loading}
            error={error}
            onRun={handleRunUnderstand}
            onNext={goToNextPhase}
          />
        );
      case 'discover':
        return (
          <PhaseDiscover
            data={data}
            loading={loading}
            error={error}
            onRun={handleRunDiscover}
            onNext={goToNextPhase}
            onBack={goToPreviousPhase}
            embeddingsAvailable={embeddingsAvailable}
          />
        );
      case 'evaluate':
        return (
          <PhaseEvaluate
            data={data}
            loading={loading}
            error={error}
            onRun={handleRunEvaluate}
            onNext={goToNextPhase}
            onBack={goToPreviousPhase}
          />
        );
      case 'act':
        return (
          <PhaseAct
            data={data}
            loading={loading}
            onRun={handleRunAct}
            onRollback={rollback}
            onComplete={handleComplete}
            onBack={goToPreviousPhase}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="guided-mode">
      <div className="guided-mode__progress">
        <PipelineProgress
          currentPhase={phase}
          completedPhases={getCompletedPhases()}
          onPhaseClick={goToPhase}
        />
      </div>

      <div className="guided-mode__content">
        {renderPhaseContent()}
      </div>

      <div className="guided-mode__footer">
        <button className="guided-mode__restart" onClick={restart} title="Start over">
          ↺ Restart
        </button>
      </div>
    </div>
  );
};

export default GuidedMode;
