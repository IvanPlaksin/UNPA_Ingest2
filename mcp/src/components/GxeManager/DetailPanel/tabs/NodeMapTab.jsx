import React, { useMemo } from 'react';
import { CheckCircle2, AlertCircle, Clock, Loader2, SkipForward } from 'lucide-react';

const STATUS_COLORS = {
  COMPLETED: '#22c55e', SUCCEEDED: '#22c55e', FAILED: '#ef4444',
  RUNNING: '#22d3ee', PENDING: '#71717a', WAITING: '#a78bfa', SKIPPED: '#52525b',
};

const NodeMapTab = ({ execution }) => {
  const nodes = useMemo(() => {
    const nodeStates = execution?.nodeStates || {};
    return Object.entries(nodeStates).map(([nodeId, stateOrObj]) => {
      const status = typeof stateOrObj === 'string' ? stateOrObj : stateOrObj?.status || 'PENDING';
      return { nodeId, status };
    });
  }, [execution?.nodeStates]);

  if (nodes.length === 0) {
    return <div className="gxe-tab__empty">No node data available. Node map will show execution graph topology.</div>;
  }

  return (
    <div className="gxe-tab">
      <h4 className="gxe-tab__section-title">Node Status Map</h4>
      <div className="gxe-nodemap">
        {nodes.map(({ nodeId, status }) => {
          const color = STATUS_COLORS[status] || '#71717a';
          return (
            <div key={nodeId} className="gxe-nodemap__node" style={{ borderColor: color }}>
              <div className="gxe-nodemap__dot" style={{ background: color }} />
              <span className="gxe-nodemap__id">{nodeId}</span>
              <span className="gxe-nodemap__status" style={{ color }}>{status}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .gxe-nodemap { display: flex; flex-wrap: wrap; gap: 8px; }
        .gxe-nodemap__node { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; background: var(--nexus-bg-secondary, #111118); border: 1px solid; font-size: 13px; }
        .gxe-nodemap__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .gxe-nodemap__id { font-weight: 600; color: var(--nexus-text-primary, #e4e4e7); }
        .gxe-nodemap__status { font-size: 11px; font-weight: 500; text-transform: uppercase; }
      `}</style>
    </div>
  );
};

export default NodeMapTab;
