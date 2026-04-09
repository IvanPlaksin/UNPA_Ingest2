/**
 * ActPhase — Phase 4: apply recommended actions to graph.
 * Migrated from Nexus PhaseAct (CONS-13c).
 * Self-contained: no nexusStore, onHighlight + onComplete callbacks.
 */
import React, { useState, useMemo } from 'react';
import {
  Trash2, GitMerge, Link, AlertTriangle,
  Eye, Rocket, ChevronLeft, RefreshCw, CheckCircle, Undo2,
} from 'lucide-react';

/* ── Sub-components ─────────────────────────────────────── */

const SEVERITY_STYLES = {
  high:   'border-red-500/30 bg-red-500/10',
  medium: 'border-amber-500/30 bg-amber-500/10',
  low:    'border-blue-500/30 bg-blue-500/10',
};

const RecommendationCard = ({ rec, selected, onToggle, onView }) => {
  const Icon = rec.icon;
  return (
    <div className={`rounded border p-2 transition-colors ${SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.low}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className={`w-3.5 h-3.5 mt-0.5 rounded-sm border flex items-center justify-center flex-shrink-0 text-[9px] transition-colors
            ${selected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#484f58] hover:border-emerald-500/50'}`}
        >
          {selected && '✓'}
        </button>
        <Icon size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-200">{rec.title}</div>
          <div className="text-[10px] text-gray-500 truncate">{rec.description}</div>
        </div>
        <button
          onClick={onView}
          className="p-0.5 text-gray-500 hover:text-indigo-400 transition-colors flex-shrink-0"
          title="Highlight on canvas"
        >
          <Eye size={12} />
        </button>
      </div>
    </div>
  );
};

const PreviewStat = ({ label, before, after, delta }) => (
  <div className="bg-[#161b22] rounded px-2 py-1.5 border border-[#21262d] text-center">
    <div className="text-[10px] text-gray-500">{label}</div>
    <div className="text-xs text-gray-200">
      {before} &rarr; {after}
      {delta !== 0 && (
        <span className={`ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          ({delta > 0 ? '+' : ''}{delta})
        </span>
      )}
    </div>
  </div>
);

/* ── Main component ─────────────────────────────────────── */

const ActPhase = ({ data, loading, onRun, onRollback, onComplete, onBack, onHighlight }) => {
  const [selectedRecs, setSelectedRecs] = useState(new Set());
  const [applied, setApplied] = useState(false);

  const approvedClusters = data?.approvedClusters || [];
  const evaluation = data?.evaluationResult || {};
  const evaluations = evaluation.evaluations || [];
  const actionResult = data?.actionResult;

  // Build recommendations from analysis data
  const recommendations = useMemo(() => {
    const recs = [];

    // 1. Orphan nodes (from understand phase)
    const orphans = data?.structuralAnalysis?.analysis?.orphanNodes || [];
    if (orphans.length > 0) {
      recs.push({
        id: 'remove-orphans',
        type: 'delete',
        severity: 'high',
        icon: Trash2,
        title: `Remove ${orphans.length} orphan node${orphans.length !== 1 ? 's' : ''}`,
        description: orphans.slice(0, 5).map(o => o.name || o.id || o).join(', '),
        targets: orphans.map(o => o.id || o),
        impact: { nodes: -orphans.length, edges: 0, clusters: 0 },
      });
    }

    // 2. Weak clusters to merge (coherence < 0.4)
    const weak = evaluations.filter(e => (e.coherenceScore ?? e.coherence ?? 1) < 0.4);
    if (weak.length >= 2) {
      recs.push({
        id: 'merge-weak',
        type: 'merge',
        severity: 'medium',
        icon: GitMerge,
        title: `Merge ${weak.length} weak clusters`,
        description: weak.map(w => w.name || w.label || w.id).join(' + '),
        targets: weak.map(w => w.id),
        impact: { nodes: 0, edges: 0, clusters: -(weak.length - 1) },
      });
    }

    // 3. Consolidate approved clusters
    if (approvedClusters.length > 0) {
      const totalNodes = approvedClusters.reduce((s, c) => s + (c.nodeIds?.length || c.nodeCount || 0), 0);
      recs.push({
        id: 'consolidate-approved',
        type: 'consolidate',
        severity: 'low',
        icon: Link,
        title: `Consolidate ${approvedClusters.length} approved cluster${approvedClusters.length !== 1 ? 's' : ''}`,
        description: `${totalNodes} nodes across approved clusters`,
        targets: approvedClusters.map(c => c.id),
        impact: { nodes: 0, edges: 0, clusters: 0 },
      });
    }

    return recs;
  }, [data, evaluations, approvedClusters]);

  const toggleRec = (id) => {
    setSelectedRecs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Preview stats
  const nodeCount = data?.structuralAnalysis?.analysis?.nodeCount || 0;
  const edgeCount = data?.structuralAnalysis?.analysis?.edgeCount || 0;
  const clusterCount = approvedClusters.length || evaluations.length || 0;

  const preview = useMemo(() => {
    let dn = 0, de = 0, dc = 0;
    recommendations.forEach(rec => {
      if (selectedRecs.has(rec.id)) {
        dn += rec.impact.nodes || 0;
        de += rec.impact.edges || 0;
        dc += rec.impact.clusters || 0;
      }
    });
    return {
      nodes:    { before: nodeCount,    after: nodeCount + dn,    delta: dn },
      edges:    { before: edgeCount,    after: edgeCount + de,    delta: de },
      clusters: { before: clusterCount, after: clusterCount + dc, delta: dc },
    };
  }, [selectedRecs, recommendations, nodeCount, edgeCount, clusterCount]);

  const handleApply = async () => {
    const selected = recommendations.filter(r => selectedRecs.has(r.id));
    const clusters = selected.flatMap(r => r.targets);
    await onRun(clusters, { recommendations: selected });
    setApplied(true);
  };

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <RefreshCw size={18} className="text-indigo-400 animate-spin" />
        <span className="text-xs text-gray-400">Applying changes...</span>
      </div>
    );
  }

  // Applied / complete
  if (applied && actionResult) {
    const successCount = actionResult.actions?.filter(a => a.success)?.length || 0;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-6 gap-2">
          <CheckCircle size={28} className="text-emerald-400" />
          <span className="text-sm font-medium text-gray-200">Changes Applied</span>
          <span className="text-[10px] text-gray-500">
            {successCount} action{successCount !== 1 ? 's' : ''} completed successfully
          </span>
        </div>

        {/* Rollback */}
        {actionResult.checkpointId && (
          <button
            onClick={() => onRollback?.(actionResult.checkpointId)}
            className="flex items-center gap-1 mx-auto text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Undo2 size={10} /> Rollback to checkpoint
          </button>
        )}

        {/* Complete */}
        <div className="flex items-center justify-between pt-2">
          <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
            <ChevronLeft size={10} /> Back
          </button>
          <button
            onClick={() => onComplete?.()}
            className="px-4 py-1.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Recommendations */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-400 mb-2">Recommended Actions</h4>
        {recommendations.length > 0 ? (
          <div className="space-y-1.5">
            {recommendations.map(rec => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                selected={selectedRecs.has(rec.id)}
                onToggle={() => toggleRec(rec.id)}
                onView={() => onHighlight?.(rec.targets)}
              />
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 italic py-3 text-center">
            No recommendations — graph looks healthy
          </div>
        )}
      </div>

      {/* Preview */}
      {selectedRecs.size > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-gray-400 mb-2">Preview Changes</h4>
          <div className="grid grid-cols-3 gap-2">
            <PreviewStat label="Nodes" {...preview.nodes} />
            <PreviewStat label="Edges" {...preview.edges} />
            <PreviewStat label="Clusters" {...preview.clusters} />
          </div>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-400">
            <AlertTriangle size={10} />
            <span>Changes will modify the graph</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300">
          <ChevronLeft size={10} /> Back
        </button>
        <button
          onClick={handleApply}
          disabled={selectedRecs.size === 0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${selectedRecs.size > 0
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : 'bg-[#21262d] text-gray-600 cursor-not-allowed'}`}
        >
          <Rocket size={11} /> Apply Changes
        </button>
      </div>
    </div>
  );
};

export default ActPhase;
