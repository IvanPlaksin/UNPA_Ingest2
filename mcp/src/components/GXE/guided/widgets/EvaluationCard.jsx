/**
 * EvaluationCard — coherence/isolation evaluation for a cluster.
 * Migrated from Nexus EvaluationCard (CONS-13b).
 * Tailwind + lucide-react, self-contained.
 */
import React, { useState } from 'react';
import { Check, Eye, Pencil } from 'lucide-react';

const ScoreBar = ({ label, value, color = 'indigo' }) => {
  const pct = Math.round((value ?? 0) * 100);
  const colors = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] || colors.indigo}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
};

const EvaluationCard = ({ evaluation, approved = false, onApprove, onRename, onHighlight }) => {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const name = evaluation.name || evaluation.label || `Cluster ${evaluation.id || '?'}`;
  const coherence = evaluation.coherenceScore ?? evaluation.coherence ?? 0;
  const isolation = evaluation.isolationScore ?? evaluation.isolation ?? 0;
  const purpose = evaluation.purpose || evaluation.aiPurpose || '';
  const method = evaluation.method || evaluation.strategy || '';
  const boundaryIn = evaluation.boundaryEdgesIn ?? evaluation.inbound ?? 0;
  const boundaryOut = evaluation.boundaryEdgesOut ?? evaluation.outbound ?? 0;
  const nodeCount = evaluation.nodeIds?.length || evaluation.nodeCount || 0;

  const coherenceColor = coherence >= 0.7 ? 'emerald' : coherence >= 0.4 ? 'amber' : 'red';
  const isolationColor = isolation >= 0.7 ? 'emerald' : isolation >= 0.4 ? 'amber' : 'red';

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== name) {
      onRename?.(evaluation.id, editName.trim());
    }
    setEditing(false);
  };

  return (
    <div className={`rounded border transition-colors
      ${approved
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : 'bg-[#161b22] border-[#30363d]'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#21262d]">
        {/* Approve checkbox */}
        <button
          onClick={() => onApprove?.(evaluation.id, !approved)}
          className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
            ${approved
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-[#484f58] hover:border-emerald-500/50'}`}
        >
          {approved && <Check size={10} />}
        </button>

        {/* Name (editable) */}
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-gray-200 truncate">{name}</span>
        )}

        {/* Actions */}
        <button
          onClick={() => { setEditName(name); setEditing(true); }}
          className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
          title="Rename"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onHighlight?.(evaluation.nodeIds || [])}
          className="p-0.5 text-gray-500 hover:text-indigo-400 transition-colors"
          title="Highlight on canvas"
        >
          <Eye size={11} />
        </button>
      </div>

      {/* Scores */}
      <div className="px-2.5 py-2 space-y-1.5">
        <ScoreBar label="Coherence" value={coherence} color={coherenceColor} />
        <ScoreBar label="Isolation" value={isolation} color={isolationColor} />
      </div>

      {/* Details */}
      <div className="px-2.5 pb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <span>{nodeCount} nodes</span>
        {(boundaryIn > 0 || boundaryOut > 0) && (
          <span>boundary: {boundaryIn}↓ {boundaryOut}↑</span>
        )}
        {method && (
          <span className="px-1 py-0.5 rounded bg-[#21262d]">{method}</span>
        )}
      </div>

      {/* AI Purpose */}
      {purpose && (
        <div className="px-2.5 pb-2">
          <div className="text-[10px] text-gray-500 italic">&ldquo;{purpose}&rdquo;</div>
        </div>
      )}
    </div>
  );
};

export default EvaluationCard;
