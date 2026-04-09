/**
 * DiscoverPhase — Phase 2: community detection + cluster selection.
 * Migrated from Nexus PhaseDiscover (CONS-13b).
 * Self-contained: no nexusStore, uses onHighlight callback.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, CheckSquare, Square } from 'lucide-react';
import StrategyPicker from '../widgets/StrategyPicker';
import ClusterCard from '../widgets/ClusterCard';

const DiscoverPhase = ({ data, loading, error, onRun, onNext, onBack, onHighlight, embeddingsAvailable = false }) => {
  const [strategy, setStrategy] = useState('community');
  const hasAutoRun = useRef(false);

  // Auto-run on mount if no candidates
  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!data?.candidates?.length && !loading && !error) {
      hasAutoRun.current = true;
      onRun(strategy);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = data?.candidates || [];
  const selected = data?.selectedCandidates || [];
  const selectedSet = new Set(selected.map(c => c.id || c));

  const handleToggle = useCallback((cluster) => {
    const cid = cluster.id || cluster;
    const isSelected = selectedSet.has(cid);
    // We need to update via mergeData pattern — but we only have onRun.
    // Store selection in parent data via a custom approach:
    // The useGuidedAnalysis hook exposes mergeData, but it's not passed here.
    // Instead, we manage selection locally and pass it up via onNext.
    // This is cleaner for self-contained design.
    setLocalSelection(prev => {
      if (isSelected) return prev.filter(c => (c.id || c) !== cid);
      return [...prev, cluster];
    });
  }, [selectedSet]);

  // Local selection state (self-contained)
  const [localSelection, setLocalSelection] = useState([]);

  // Sync with parent data if it has selections
  useEffect(() => {
    if (data?.selectedCandidates?.length > 0 && localSelection.length === 0) {
      setLocalSelection(data.selectedCandidates);
    }
  }, [data?.selectedCandidates]); // eslint-disable-line react-hooks/exhaustive-deps

  const localSelectedSet = new Set(localSelection.map(c => c.id || c));

  const handleSelectAll = () => setLocalSelection([...candidates]);
  const handleSelectNone = () => setLocalSelection([]);

  const handleNext = () => {
    // Pass selected clusters to next phase via data merge
    if (data && typeof data === 'object') {
      data.selectedCandidates = localSelection;
    }
    onNext?.();
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <RefreshCw size={18} className="text-indigo-400 animate-spin" />
        <span className="text-xs text-gray-400">Detecting communities...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="text-xs text-red-400">{error}</span>
        <button onClick={() => onRun(strategy)} className="px-3 py-1 rounded text-xs bg-[#21262d] text-gray-300 hover:bg-[#30363d]">
          Retry
        </button>
      </div>
    );
  }

  // Empty / pre-run state
  if (candidates.length === 0) {
    return (
      <div className="space-y-3">
        <div>
          <h4 className="text-[11px] font-medium text-gray-400 mb-2">Strategy</h4>
          <StrategyPicker value={strategy} onChange={setStrategy} />
        </div>
        <button
          onClick={() => onRun(strategy)}
          className="w-full py-2 rounded text-xs font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
        >
          <Search size={12} className="inline mr-1" />
          Run Discovery
        </button>
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
          <ChevronLeft size={10} /> Back
        </button>
      </div>
    );
  }

  // Results
  return (
    <div className="space-y-3">
      {/* Strategy + Re-run */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-400 mb-2">Strategy</h4>
        <StrategyPicker value={strategy} onChange={setStrategy} disabled={loading} />
        <button
          onClick={() => onRun(strategy)}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500 hover:text-indigo-400 transition-colors"
        >
          <RefreshCw size={9} /> Re-run with different strategy
        </button>
      </div>

      {/* Cluster List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-medium text-gray-400">
            Clusters ({candidates.length})
          </h4>
          <div className="flex gap-1.5">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-300"
              title="Select all"
            >
              <CheckSquare size={10} /> All
            </button>
            <button
              onClick={handleSelectNone}
              className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-300"
              title="Deselect all"
            >
              <Square size={10} /> None
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
          {candidates.map((cluster, i) => (
            <ClusterCard
              key={cluster.id || i}
              cluster={cluster}
              selected={localSelectedSet.has(cluster.id || cluster)}
              onToggle={() => {
                const cid = cluster.id || cluster;
                setLocalSelection(prev =>
                  localSelectedSet.has(cid)
                    ? prev.filter(c => (c.id || c) !== cid)
                    : [...prev, cluster]
                );
              }}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      </div>

      {/* Selection Summary */}
      {localSelection.length > 0 && (
        <div className="text-[10px] text-gray-500 bg-[#161b22] rounded px-2 py-1.5 border border-[#21262d]">
          {localSelection.length} cluster{localSelection.length !== 1 ? 's' : ''} selected
          ({localSelection.reduce((sum, c) => sum + (c.nodeIds?.length || c.nodes?.length || 0), 0)} total nodes)
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
          <ChevronLeft size={10} /> Back
        </button>
        <button
          onClick={handleNext}
          disabled={localSelection.length === 0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${localSelection.length > 0
              ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
              : 'bg-[#21262d] text-gray-600 cursor-not-allowed'}`}
        >
          Evaluate <ChevronRight size={10} />
        </button>
      </div>
    </div>
  );
};

export default DiscoverPhase;
