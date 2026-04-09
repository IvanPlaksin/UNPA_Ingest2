import React, { useState } from 'react';
import {
  Filter, Search, Copy, Sparkles, RefreshCw, CheckCircle2,
  ChevronDown, ChevronUp, Loader2
} from 'lucide-react';

const STRATEGY_STYLES = {
  DIRECT_REUSE:     { bg: 'bg-emerald-700/60', border: 'border-emerald-500/40', text: 'text-emerald-200', label: 'Direct Reuse' },
  CLONE_MODIFY:     { bg: 'bg-orange-700/50',  border: 'border-orange-500/40',  text: 'text-orange-200',  label: 'Clone & Modify' },
  ABSTRACT_INHERIT: { bg: 'bg-purple-700/50',  border: 'border-purple-500/40',  text: 'text-purple-200',  label: 'Reference' },
  CREATE_NEW:       { bg: 'bg-blue-700/40',    border: 'border-blue-500/30',    text: 'text-blue-200',    label: 'Create New' },
};

export default function AssistantStatusBar({
  filterStatus,
  catalogStatus,
  reuseStatus,
  retryStatus,
  isProcessing,
}) {
  const [expanded, setExpanded] = useState(true);

  const hasContent = filterStatus || catalogStatus || reuseStatus || retryStatus || isProcessing;
  if (!hasContent) return null;

  const strategyStyle = catalogStatus ? STRATEGY_STYLES[catalogStatus.strategy] || STRATEGY_STYLES.CREATE_NEW : null;

  return (
    <div className="border-b border-[#21262d] bg-[#0d1117]/80 px-3 py-1.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-gray-500 font-medium">AI Processing</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-300 p-0.5"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {/* Chips row */}
          <div className="flex flex-wrap gap-1.5">
            {/* ToolFilter chip */}
            {filterStatus && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  filterStatus.confidence >= 0.6
                    ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40'
                    : 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                }`}
                title={`Domain: ${filterStatus.domain} | Confidence: ${(filterStatus.confidence * 100).toFixed(0)}%`}
              >
                <Filter size={12} />
                Tools: {filterStatus.toolsProvided}/{filterStatus.toolsTotal}
                <span className="text-[10px] opacity-70">({filterStatus.reduction}% reduced)</span>
              </span>
            )}

            {/* Catalog strategy chip */}
            {catalogStatus && strategyStyle && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${strategyStyle.bg} ${strategyStyle.text} border ${strategyStyle.border}`}
                title={`Score: ${((catalogStatus.score || 0) * 100).toFixed(0)}% | Candidates: ${catalogStatus.candidatesCount}`}
              >
                <Search size={12} />
                {strategyStyle.label}
                {catalogStatus.score > 0 && (
                  <span className="text-[10px] opacity-70">({(catalogStatus.score * 100).toFixed(0)}%)</span>
                )}
              </span>
            )}

            {/* Retry chip */}
            {retryStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-300 border border-yellow-700/40 animate-pulse">
                <RefreshCw size={12} className="animate-spin" />
                Retry {retryStatus.attempt} — {Math.round((retryStatus.delay || 0) / 1000)}s
              </span>
            )}
          </div>

          {/* Reuse suggestion card */}
          {reuseStatus && (reuseStatus.action === 'DIRECT_REUSE' || reuseStatus.action === 'CLONE_MODIFY') && (
            <div className="p-2 bg-[#161b22] border border-[#30363d] rounded-md">
              <div className="flex items-center gap-1.5 mb-1">
                {reuseStatus.action === 'DIRECT_REUSE' ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <Copy size={14} className="text-orange-400" />
                )}
                <span className="font-semibold text-gray-200">
                  {reuseStatus.action === 'DIRECT_REUSE' ? 'Existing Graph Found' : 'Similar Template Found'}
                </span>
              </div>
              <div className="text-gray-400">
                <span className="text-gray-200 font-medium">{reuseStatus.graphName}</span>
                {reuseStatus.nodeCount > 0 && (
                  <span className="text-gray-500 ml-1">({reuseStatus.nodeCount} nodes)</span>
                )}
              </div>
              {reuseStatus.message && (
                <div className="text-[11px] text-gray-500 mt-0.5">{reuseStatus.message}</div>
              )}
            </div>
          )}

          {/* Processing bar */}
          {isProcessing && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
              <span>Processing...</span>
              <div className="flex-1 h-[2px] bg-[#21262d] rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500/60 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
