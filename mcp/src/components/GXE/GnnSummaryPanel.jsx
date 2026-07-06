import React, { useState } from 'react';
import { Sparkles, GitBranch, Tags, Users, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import useImportSqlStore from '../../stores/importSqlStore';

// ═══════════════════════════════════════════════════════════════════════
// GnnSummaryPanel
//
// Compact bottom bar showing GNN analysis results summary.
// Expandable sections for predictions, classifications, communities.
// ═══════════════════════════════════════════════════════════════════════

const pillStyle = (color, active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
  background: active ? color + '25' : 'transparent',
  color: active ? color : '#8b949e',
  border: `1px solid ${active ? color + '50' : '#30363d'}`,
  cursor: 'pointer',
  transition: 'all 0.15s',
});

const GnnSummaryPanel = ({ visible, onToggleOverlay, overlayVisible, onRerun }) => {
  const gnnResults = useImportSqlStore(s => s.gnnResults);
  const gnnStatus = useImportSqlStore(s => s.gnnStatus);
  const clearGnnResults = useImportSqlStore(s => s.clearGnnResults);
  const [expanded, setExpanded] = useState(null); // 'predictions' | 'classifications' | 'communities' | null

  if (!visible || gnnStatus !== 'complete' || !gnnResults) return null;

  const predCount = gnnResults.predictions?.predictions?.length || 0;
  const classCount = Object.keys(gnnResults.classifications?.classifications || gnnResults.classifications || {}).length;
  const commCount = gnnResults.communities?.clusters?.length || gnnResults.communities?.totalCommunities || 0;

  return (
    <div style={{
      position: 'absolute',
      bottom: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: 10,
      padding: '6px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      zIndex: 20,
      minWidth: 400,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Icon */}
      <Sparkles size={14} style={{ color: '#d2a8ff', flexShrink: 0 }} />
      <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, marginRight: 4 }}>GNN</span>
      {(gnnResults.predictions?.fallback || gnnResults.classifications?.fallback || gnnResults.communities?.fallback) && (
        <span style={{ color: '#d29922', fontSize: 12, fontWeight: 500, padding: '1px 5px', borderRadius: 4, border: '1px solid #d2992240', background: '#d2992210' }}>heuristic</span>
      )}

      {/* Stat pills */}
      {predCount > 0 && (
        <span
          style={pillStyle('#58a6ff', expanded === 'predictions')}
          onClick={() => setExpanded(expanded === 'predictions' ? null : 'predictions')}
        >
          <GitBranch size={11} />
          Links: {predCount}
        </span>
      )}

      {classCount > 0 && (
        <span
          style={pillStyle('#3fb950', expanded === 'classifications')}
          onClick={() => setExpanded(expanded === 'classifications' ? null : 'classifications')}
        >
          <Tags size={11} />
          Categories: {classCount}
        </span>
      )}

      {commCount > 0 && (
        <span
          style={pillStyle('#d2a8ff', expanded === 'communities')}
          onClick={() => setExpanded(expanded === 'communities' ? null : 'communities')}
        >
          <Users size={11} />
          Groups: {commCount}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toggle overlay visibility */}
      <button
        onClick={onToggleOverlay}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: overlayVisible ? '#d2a8ff' : '#8b949e', padding: 2,
        }}
        title={overlayVisible ? 'Hide GNN overlay' : 'Show GNN overlay'}
      >
        {overlayVisible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      {/* Re-run */}
      {onRerun && (
        <button
          onClick={onRerun}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', padding: 2 }}
          title="Re-run GNN analysis"
        >
          <RotateCcw size={13} />
        </button>
      )}

      {/* Close */}
      <button
        onClick={clearGnnResults}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', padding: 2 }}
        title="Dismiss GNN results"
      >
        <X size={13} />
      </button>

      {/* Expanded detail dropdown */}
      {expanded && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: 12,
          maxHeight: 280,
          overflowY: 'auto',
          width: 360,
          fontSize: 13,
          color: '#e6edf3',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {expanded === 'predictions' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#58a6ff' }}>
                Predicted Links ({predCount})
              </div>
              {(gnnResults.predictions?.predictions || []).slice(0, 20).map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>{p.source}</span>
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <span style={{ color: '#8b949e' }}>{p.target}</span>
                  <span style={{ marginLeft: 'auto', color: '#58a6ff', fontWeight: 600 }}>
                    {Math.round((p.probability || p.score || 0) * 100)}%
                  </span>
                </div>
              ))}
            </>
          )}

          {expanded === 'classifications' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#3fb950' }}>
                Node Classifications ({classCount})
              </div>
              {Object.entries(gnnResults.classifications?.classifications || gnnResults.classifications || {}).slice(0, 20).map(([nodeId, info]) => (
                <div key={nodeId} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>{nodeId}</span>
                  <span style={{ marginLeft: 'auto', color: '#3fb950', fontWeight: 600 }}>
                    {info?.category || info?.label || '—'}
                  </span>
                  <span style={{ color: '#94a3b8' }}>
                    {info?.confidence ? `${Math.round(info.confidence * 100)}%` : ''}
                  </span>
                </div>
              ))}
            </>
          )}

          {expanded === 'communities' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#d2a8ff' }}>
                Communities ({commCount})
              </div>
              {(gnnResults.communities?.clusters || []).slice(0, 10).map((c, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #21262d' }}>
                  <div style={{ fontWeight: 500, color: '#d2a8ff' }}>
                    {c.label || `Community ${c.communityId ?? i + 1}`}
                    <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                      ({c.nodeCount || c.nodes?.length || c.nodeIds?.length || 0} nodes)
                    </span>
                  </div>
                  <div style={{ color: '#8b949e', fontSize: 13, marginTop: 2 }}>
                    {(c.nodeDetails || c.nodeIds || c.nodes || []).slice(0, 5).map(n => (typeof n === 'string' ? n : n.name || n.id)).join(', ')}
                    {(c.nodeCount || 0) > 5 ? ', ...' : ''}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GnnSummaryPanel;
