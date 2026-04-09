/**
 * GuidedModeWizard — GXE 4-phase analysis workflow.
 *
 * Migrated from Nexus/Modes/GuidedMode (CONS-13).
 * Self-contained: local state via useGuidedAnalysis hook.
 * Phases: Understand → Discover → Evaluate → Act
 * Tailwind + lucide-react, GXE dark theme.
 */

import React, { useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import PhaseNav from './PhaseNav';
import UnderstandPhase from './phases/UnderstandPhase';
import DiscoverPhase from './phases/DiscoverPhase';
import EvaluatePhase from './phases/EvaluatePhase';
import ActPhase from './phases/ActPhase';
import { useGuidedAnalysis } from './useGuidedAnalysis';

const GuidedModeWizard = ({ namespace = 'GXE', onHighlight, onComplete }) => {
  const {
    loading, error, phase, data,
    runUnderstand, runDiscover, runEvaluate, runAct, rollback,
    goToNextPhase, goToPreviousPhase, goToPhase, restart,
  } = useGuidedAnalysis(namespace);

  const getCompletedPhases = useCallback(() => {
    const completed = [];
    if (data.structuralAnalysis) completed.push('understand');
    if (data.candidates?.length > 0) completed.push('discover');
    if (data.evaluationResult) completed.push('evaluate');
    if (data.actionResult) completed.push('act');
    return completed;
  }, [data]);

  const renderPhaseContent = () => {
    switch (phase) {
      case 'understand':
        return (
          <UnderstandPhase
            data={data}
            loading={loading}
            error={error}
            onRun={runUnderstand}
            onNext={goToNextPhase}
            onHighlight={onHighlight}
          />
        );
      case 'discover':
        return (
          <DiscoverPhase
            data={data}
            loading={loading}
            error={error}
            onRun={runDiscover}
            onNext={goToNextPhase}
            onBack={goToPreviousPhase}
            onHighlight={onHighlight}
            embeddingsAvailable={false}
          />
        );
      case 'evaluate':
        return (
          <EvaluatePhase
            data={data}
            loading={loading}
            error={error}
            onRun={runEvaluate}
            onNext={goToNextPhase}
            onBack={goToPreviousPhase}
            onHighlight={onHighlight}
          />
        );
      case 'act':
        return (
          <ActPhase
            data={data}
            loading={loading}
            onRun={runAct}
            onRollback={rollback}
            onComplete={onComplete}
            onBack={goToPreviousPhase}
            onHighlight={onHighlight}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Phase Navigation */}
      <div className="border-b border-[#21262d] bg-[#0d1117]">
        <PhaseNav
          currentPhase={phase}
          completedPhases={getCompletedPhases()}
          onPhaseClick={goToPhase}
        />
      </div>

      {/* Phase Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {renderPhaseContent()}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#21262d] bg-[#0d1117]">
        <button
          onClick={restart}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-300 hover:bg-[#21262d] transition-colors"
          title="Start over"
        >
          <RotateCcw size={10} /> Restart
        </button>
      </div>
    </div>
  );
};

export default GuidedModeWizard;
