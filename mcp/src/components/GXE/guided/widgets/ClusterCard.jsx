/**
 * ClusterCard — selectable cluster preview for Discover phase.
 * Migrated from Nexus ClusterCard (CONS-13b).
 * Tailwind + lucide-react, self-contained. Uses onHighlight callback.
 */
import React from 'react';
import { Eye, Star } from 'lucide-react';

const ClusterCard = ({ cluster, selected = false, onToggle, onHighlight }) => {
  const name = cluster.name || cluster.label || `Cluster ${cluster.id || '?'}`;
  const nodeCount = cluster.nodeIds?.length || cluster.nodes?.length || 0;
  const strategy = cluster.strategy || cluster.method || '';
  const score = cluster.score ?? cluster.quality ?? null;

  return (
    <div
      className={`rounded border transition-colors cursor-pointer
        ${selected
          ? 'bg-indigo-500/10 border-indigo-500/40'
          : 'bg-[#161b22] border-[#30363d] hover:border-[#484f58]'}`}
      onClick={() => onToggle?.(cluster)}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Checkbox */}
        <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 text-[9px]
          ${selected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-[#484f58]'}`}
        >
          {selected && '✓'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-200 truncate">{name}</span>
            {strategy && (
              <span className="px-1 py-0.5 rounded text-[9px] bg-[#21262d] text-gray-500 flex-shrink-0">
                {strategy}
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Score */}
        {score !== null && (
          <div className="flex items-center gap-0.5 text-amber-400 flex-shrink-0" title="Quality score">
            <Star size={10} fill="currentColor" />
            <span className="text-[10px]">{typeof score === 'number' ? score.toFixed(1) : score}</span>
          </div>
        )}

        {/* Preview */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHighlight?.(cluster.nodeIds || cluster.nodes?.map(n => n.id || n) || []);
          }}
          className="p-1 rounded text-gray-500 hover:text-indigo-400 hover:bg-[#21262d] transition-colors flex-shrink-0"
          title="Highlight nodes on canvas"
        >
          <Eye size={12} />
        </button>
      </div>
    </div>
  );
};

export default ClusterCard;
