/**
 * EvaluatePhase — Phase 3: coherence evaluation + approve/rename.
 * Migrated from Nexus PhaseEvaluate (CONS-13b).
 * Self-contained: no nexusStore, uses onHighlight callback.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Scale, ChevronLeft, ChevronRight, RefreshCw, CheckCircle } from 'lucide-react';
import EvaluationCard from '../widgets/EvaluationCard';

const EvaluatePhase = ({ data, loading, error, onRun, onNext, onBack, onHighlight }) => {
  const hasAutoRun = useRef(false);

  // Auto-run on mount if candidates exist but no evaluation yet
  useEffect(() => {
    if (hasAutoRun.current) return;
    const clusters = data?.selectedCandidates || data?.candidates || [];
    if (clusters.length > 0 && !data?.evaluationResult && !loading && !error) {
      hasAutoRun.current = true;
      onRun(clusters);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const evaluations = data?.evaluationResult?.evaluations || [];

  // Local approval state
  const [approvedIds, setApprovedIds] = useState(new Set());
  const [renames, setRenames] = useState({});

  // Sync approvals from parent data
  useEffect(() => {
    if (data?.approvedClusters?.length > 0 && approvedIds.size === 0) {
      setApprovedIds(new Set(data.approvedClusters.map(c => c.id || c)));
    }
  }, [data?.approvedClusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = useCallback((id, approved) => {
    setApprovedIds(prev => {
      const next = new Set(prev);
      if (approved) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleRename = useCallback((id, newName) => {
    setRenames(prev => ({ ...prev, [id]: newName }));
  }, []);

  const handleNext = () => {
    // Build approved clusters list with renames applied
    const approved = evaluations
      .filter(e => approvedIds.has(e.id))
      .map(e => ({
        ...e,
        name: renames[e.id] || e.name || e.label,
      }));
    if (data && typeof data === 'object') {
      data.approvedClusters = approved;
    }
    onNext?.();
  };

  // Stats
  const avgCoherence = evaluations.length > 0
    ? evaluations.reduce((s, e) => s + (e.coherenceScore ?? e.coherence ?? 0), 0) / evaluations.length
    : 0;
  const avgIsolation = evaluations.length > 0
    ? evaluations.reduce((s, e) => s + (e.isolationScore ?? e.isolation ?? 0), 0) / evaluations.length
    : 0;

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <RefreshCw size={18} className="text-indigo-400 animate-spin" />
        <span className="text-xs text-gray-400">Evaluating cluster coherence...</span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="text-xs text-red-400">{error}</span>
        <button
          onClick={() => onRun(data?.selectedCandidates || data?.candidates || [])}
          className="px-3 py-1 rounded text-xs bg-[#21262d] text-gray-300 hover:bg-[#30363d]"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty
  if (evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Scale size={20} className="text-gray-500" />
        <span className="text-xs text-gray-400">No evaluations yet</span>
        <button
          onClick={() => onRun(data?.selectedCandidates || data?.candidates || [])}
          className="px-3 py-1.5 rounded text-xs bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
        >
          Run Evaluation
        </button>
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
          <ChevronLeft size={10} /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#161b22] rounded px-2 py-1.5 border border-[#21262d] text-center">
          <div className="text-sm font-semibold text-gray-200">{evaluations.length}</div>
          <div className="text-[9px] text-gray-500">Evaluated</div>
        </div>
        <div className="bg-[#161b22] rounded px-2 py-1.5 border border-[#21262d] text-center">
          <div className="text-sm font-semibold text-emerald-400">{(avgCoherence * 100).toFixed(0)}%</div>
          <div className="text-[9px] text-gray-500">Avg Coherence</div>
        </div>
        <div className="bg-[#161b22] rounded px-2 py-1.5 border border-[#21262d] text-center">
          <div className="text-sm font-semibold text-amber-400">{(avgIsolation * 100).toFixed(0)}%</div>
          <div className="text-[9px] text-gray-500">Avg Isolation</div>
        </div>
      </div>

      {/* Evaluation Cards */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-medium text-gray-400">
            Clusters ({evaluations.length})
          </h4>
          <div className="flex items-center gap-1 text-[10px] text-emerald-400">
            <CheckCircle size={10} />
            <span>{approvedIds.size} approved</span>
          </div>
        </div>

        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
          {evaluations.map((evaluation, i) => (
            <EvaluationCard
              key={evaluation.id || i}
              evaluation={{
                ...evaluation,
                name: renames[evaluation.id] || evaluation.name || evaluation.label,
              }}
              approved={approvedIds.has(evaluation.id)}
              onApprove={handleApprove}
              onRename={handleRename}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      </div>

      {/* Re-evaluate */}
      <button
        onClick={() => onRun(data?.selectedCandidates || data?.candidates || [])}
        className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-indigo-400 transition-colors"
      >
        <RefreshCw size={9} /> Re-evaluate
      </button>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
          <ChevronLeft size={10} /> Back
        </button>
        <button
          onClick={handleNext}
          disabled={approvedIds.size === 0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${approvedIds.size > 0
              ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
              : 'bg-[#21262d] text-gray-600 cursor-not-allowed'}`}
        >
          Act <ChevronRight size={10} />
        </button>
      </div>
    </div>
  );
};

export default EvaluatePhase;
