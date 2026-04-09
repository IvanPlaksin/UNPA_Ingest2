/**
 * UnderstandPhase — Phase 1 of GXE Guided Mode.
 *
 * Migrated from Nexus/Modes/GuidedMode/PhaseUnderstand.jsx (CONS-13).
 * Shows structural analysis: metrics grid + key findings.
 * Self-contained: no nexusStore dependency.
 * Tailwind + lucide-react, GXE dark theme.
 */

import React, { useEffect, useRef } from 'react';
import {
  Loader2, AlertTriangle, Search, BarChart3,
  Key, Network, ArrowRight, RotateCcw, CheckCircle,
} from 'lucide-react';

const UnderstandPhase = ({ data, loading, error, onRun, onNext, onHighlight }) => {
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

  const handleHighlight = (nodeIds, color) => {
    if (nodeIds?.length > 0) onHighlight?.(nodeIds, color);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-indigo-400 animate-spin mr-2" />
        <span className="text-sm text-gray-400">Analyzing graph structure...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle size={24} className="text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
        <button onClick={onRun} className="px-3 py-1.5 rounded-md text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
          Retry Analysis
        </button>
      </div>
    );
  }

  // Empty state
  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Search size={24} className="text-gray-500" />
        <span className="text-sm text-gray-400">Ready to analyze your graph</span>
        <button onClick={onRun} className="px-4 py-2 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500">
          Start Analysis
        </button>
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
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
          <BarChart3 size={13} className="text-indigo-400" /> Graph Overview
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Nodes', value: nodeCount },
            { label: 'Edges', value: edgeCount },
            { label: 'Density', value: density.toFixed(3) },
            { label: 'Components', value: componentCount },
          ].map(m => (
            <div key={m.label} className="bg-[#0d1117] rounded-lg p-2.5 border border-[#21262d] text-center">
              <div className="text-lg font-bold text-white tabular-nums">{m.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Key Findings */}
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 mb-2">
          <Key size={13} className="text-amber-400" /> Key Findings
        </h3>
        <div className="space-y-1.5">
          {hubs.length > 0 && (
            <FindingItem
              color="amber"
              title="Hub Concentration"
              description={`Top hub: "${hubs[0]?.name || hubs[0]?.id || hubs[0]}" with ${hubs[0]?.degree || '?'} connections`}
              onClick={() => handleHighlight(hubs.slice(0, 5).map(h => h.id || h), '#f59e0b')}
            />
          )}
          {bridges.length > 5 && (
            <FindingItem
              color="yellow"
              title="Bridge Edges"
              description={`${bridges.length} critical edges detected (fragile connectivity)`}
              onClick={() => {
                const nodes = bridges.slice(0, 10).flatMap(b => [b.source, b.target]).filter(Boolean);
                handleHighlight([...new Set(nodes)], '#f59e0b');
              }}
            />
          )}
          {orphans.length > 0 && (
            <FindingItem
              color="blue"
              title="Orphan Nodes"
              description={`${orphans.length} node${orphans.length !== 1 ? 's' : ''} with no connections`}
              onClick={() => handleHighlight(orphans.slice(0, 10).map(o => o.id || o), '#3b82f6')}
            />
          )}
          {componentCount > 1 && (
            <FindingItem
              color="orange"
              title="Disconnected Graph"
              description={`${componentCount} separate components detected`}
            />
          )}
          {hubs.length === 0 && bridges.length <= 5 && orphans.length === 0 && componentCount === 1 && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-green-500/10 border border-green-500/20">
              <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-medium text-green-400">Healthy Structure</div>
                <div className="text-[10px] text-green-400/70">No significant structural issues detected</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Insights count */}
      {insights.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0d1117] border border-[#21262d]">
          <Network size={12} className="text-indigo-400" />
          <span className="text-[11px] text-gray-400">
            <strong className="text-gray-200">{insights.length}</strong> insight{insights.length !== 1 ? 's' : ''} available in the Insights panel
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[#21262d]">
        <button onClick={onRun} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-gray-400 hover:text-gray-200 hover:bg-[#21262d] transition-colors">
          <RotateCcw size={11} /> Re-analyze
        </button>
        <button onClick={onNext} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
          Continue to Discover <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
};

// ── Finding Item ──
const FINDING_COLORS = {
  amber:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
  yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
};

const FindingItem = ({ color, title, description, onClick }) => (
  <div
    className={`flex items-center gap-2 p-2.5 rounded-md border ${FINDING_COLORS[color] || FINDING_COLORS.amber} ${onClick ? 'cursor-pointer hover:brightness-110' : ''}`}
    onClick={onClick}
  >
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium">{title}</div>
      <div className="text-[10px] opacity-70">{description}</div>
    </div>
    {onClick && <ArrowRight size={12} className="flex-shrink-0 opacity-50" />}
  </div>
);

export default UnderstandPhase;
