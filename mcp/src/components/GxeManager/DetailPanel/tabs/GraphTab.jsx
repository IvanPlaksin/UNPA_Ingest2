import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import MiniGraphView from '../../../GXE/MiniGraphView';
import { getGraphById, listGraphs } from '../../../../services/graphCatalog.service';

const getNodeStatus = (s) => typeof s === 'object' && s !== null ? s.status : s;

// Execution-state palette overrides
const STATE_PALETTE = {
  SUCCEEDED:     { bg: '#0f2e1a', border: '#22c55e', text: '#86efac', glow: 'rgba(34,197,94,.5)' },
  COMPLETED:     { bg: '#0f2e1a', border: '#22c55e', text: '#86efac', glow: 'rgba(34,197,94,.5)' },
  SKIPPED:       { bg: '#1e1e2e', border: '#64748b', text: '#94a3b8', glow: 'rgba(100,116,139,.3)' },
  FAILED:        { bg: '#2e0f0f', border: '#ef4444', text: '#fca5a5', glow: 'rgba(239,68,68,.5)' },
  RUNNING:       { bg: '#0f1e2e', border: '#22d3ee', text: '#67e8f9', glow: 'rgba(34,211,238,.6)' },
  EXECUTING:     { bg: '#0f1e2e', border: '#22d3ee', text: '#67e8f9', glow: 'rgba(34,211,238,.6)' },
  WAITING_INPUT: { bg: '#1e0f2e', border: '#a78bfa', text: '#c4b5fd', glow: 'rgba(167,139,250,.6)' },
  WAITING:       { bg: '#1e0f2e', border: '#a78bfa', text: '#c4b5fd', glow: 'rgba(167,139,250,.6)' },
  PENDING:       { bg: '#1e293b', border: '#334155', text: '#64748b', glow: 'rgba(100,116,139,.15)' },
  CANCELLED:     { bg: '#1e1e2e', border: '#71717a', text: '#a1a1aa', glow: 'rgba(113,113,122,.3)' },
};

async function fetchGraphForExecution(execution) {
  if (!execution?.graphId) return null;
  try {
    return await getGraphById(execution.graphId);
  } catch {
    // Fallback: search by graph name
    const name = execution.metadata?.graphName;
    if (name) {
      try {
        const result = await listGraphs({ search: name, limit: 1 });
        return result?.data?.[0] || null;
      } catch { /* ignore */ }
    }
    return null;
  }
}

function applyStateToNodes(graphNodes, nodeStates) {
  if (!graphNodes || !nodeStates) return graphNodes;
  return graphNodes.map(node => {
    const state = nodeStates[node.id];
    const status = state ? getNodeStatus(state) : 'PENDING';
    const palette = STATE_PALETTE[status] || STATE_PALETTE.PENDING;
    return {
      ...node,
      data: {
        ...node.data,
        _palette: palette,
        extraInfo: status,
      },
    };
  });
}

const GraphTab = ({ execution }) => {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchGraphForExecution(execution).then(g => {
      if (cancelled) return;
      setGraph(g);
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setError(err.message);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [execution?.graphId]);

  const stateNodes = useMemo(() => {
    if (!graph?.nodes) return null;
    return applyStateToNodes(graph.nodes, execution?.nodeStates);
  }, [graph, execution?.nodeStates]);

  if (loading) {
    return (
      <div className="gxe-tab__empty">
        <Loader2 size={20} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: 8 }}>Loading graph...</span>
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="gxe-tab__empty">
        Graph definition not available for {execution?.graphId}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {graph.description && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: '#a1a1aa', borderBottom: '1px solid #27272a' }}>
          {graph.description}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 300 }}>
        <MiniGraphView nodes={stateNodes} edges={graph.edges} />
      </div>
    </div>
  );
};

export default GraphTab;
