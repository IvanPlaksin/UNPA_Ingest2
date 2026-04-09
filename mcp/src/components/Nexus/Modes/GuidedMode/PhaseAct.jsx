import React, { useState, useCallback } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';
import ActionCard from './ActionCard';
import ExecutionLog from './ExecutionLog';
import ResultSummary from './ResultSummary';

/**
 * Phase 4: Act
 *
 * Execute actions on approved clusters (consolidate, export)
 * with checkpoint/rollback support.
 */
const PhaseAct = ({ data, loading, onRun, onRollback, onComplete, onBack }) => {
  const [clusterStatuses, setClusterStatuses] = useState({});
  const [logs, setLogs] = useState([]);
  const [executionResult, setExecutionResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const clearHighlight = useNexusStore(state => state.clearHighlight);
  const resetGuidedMode = useNexusStore(state => state.resetGuidedMode);

  const approvedClusters = data?.approvedClusters || [];

  const addLog = useCallback((entry) => {
    setLogs(prev => [...prev, { ...entry, timestamp: Date.now() }]);
  }, []);

  const handleConsolidateAll = useCallback(async () => {
    if (approvedClusters.length === 0) return;
    setIsExecuting(true);
    setLogs([]);

    const initialStatuses = {};
    approvedClusters.forEach(c => { initialStatuses[c.customName || c.name] = 'pending'; });
    setClusterStatuses(initialStatuses);

    try {
      const result = await onRun(approvedClusters, {
        action: 'consolidate',
        onProgress: (p) => {
          setClusterStatuses(prev => ({ ...prev, [p.currentCluster]: 'processing' }));
        },
        onLog: (log) => {
          addLog(log);
          if (log.type === 'success' && log.message.includes('consolidated')) {
            const name = log.message.match(/"([^"]+)"/)?.[1];
            if (name) setClusterStatuses(prev => ({ ...prev, [name]: 'success' }));
          }
          if (log.type === 'error' && log.message.startsWith('Failed:')) {
            const name = log.message.match(/"([^"]+)"/)?.[1];
            if (name) setClusterStatuses(prev => ({ ...prev, [name]: 'error' }));
          }
        },
      });
      setExecutionResult(result);
    } catch (err) {
      addLog({ type: 'error', message: err.message });
    } finally {
      setIsExecuting(false);
    }
  }, [approvedClusters, onRun, addLog]);

  const handleConsolidateSingle = useCallback(async (cluster) => {
    const name = cluster.customName || cluster.name;
    setClusterStatuses(prev => ({ ...prev, [name]: 'processing' }));
    addLog({ type: 'info', message: `Processing "${name}"...` });

    try {
      await onRun([cluster], { action: 'consolidate', onLog: addLog });
      setClusterStatuses(prev => ({ ...prev, [name]: 'success' }));
    } catch (err) {
      setClusterStatuses(prev => ({ ...prev, [name]: 'error' }));
      addLog({ type: 'error', message: err.message });
    }
  }, [onRun, addLog]);

  const handleExport = useCallback(async (cluster) => {
    const name = cluster.customName || cluster.name;
    addLog({ type: 'info', message: `Exporting "${name}"...` });

    try {
      const result = await onRun([cluster], { action: 'export', onLog: addLog });
      const exportData = result?.actions?.[0]?.result;
      if (exportData) {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      addLog({ type: 'success', message: `Exported "${name}"` });
    } catch (err) {
      addLog({ type: 'error', message: err.message });
    }
  }, [onRun, addLog]);

  const handleRollback = useCallback(async (checkpointId) => {
    addLog({ type: 'info', message: `Rolling back to ${checkpointId}...` });
    try {
      await onRollback?.(checkpointId);
      addLog({ type: 'success', message: 'Rollback completed' });
      setClusterStatuses({});
      setExecutionResult(null);
    } catch (err) {
      addLog({ type: 'error', message: `Rollback failed: ${err.message}` });
    }
  }, [onRollback, addLog]);

  const handleComplete = useCallback(() => {
    clearHighlight();
    resetGuidedMode();
    onComplete?.();
  }, [clearHighlight, resetGuidedMode, onComplete]);

  if (approvedClusters.length === 0) {
    return (
      <div className="phase-content phase-content--empty">
        <div className="phase-empty">
          <span className="phase-empty__icon">📋</span>
          <span className="phase-empty__text">No clusters approved for action. Go back to approve clusters first.</span>
          <button className="phase-empty__start" onClick={onBack}>← Back to Evaluate</button>
        </div>
      </div>
    );
  }

  const hasCompleted = executionResult?.actions?.some(a => a.success);
  const allCompleted = approvedClusters.every(c =>
    clusterStatuses[c.customName || c.name] === 'success'
  );

  return (
    <div className="phase-content">
      {/* Summary */}
      <div className="phase-section">
        <div className="act-summary">
          <span className="act-summary__count">
            {approvedClusters.length} cluster{approvedClusters.length !== 1 ? 's' : ''} ready
          </span>
          <span className="act-summary__nodes">
            ({approvedClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)} nodes total)
          </span>
        </div>
      </div>

      {/* Cluster List */}
      <div className="phase-section">
        <h3 className="phase-section__title">📦 Approved Clusters</h3>
        <div className="action-list">
          {approvedClusters.map((cluster, i) => (
            <ActionCard
              key={cluster.id || i}
              cluster={cluster}
              status={clusterStatuses[cluster.customName || cluster.name] || 'pending'}
              onConsolidate={handleConsolidateSingle}
              onExport={handleExport}
              disabled={isExecuting}
            />
          ))}
        </div>
      </div>

      {/* Batch Actions */}
      <div className="phase-section">
        <div className="batch-actions">
          <button
            className="batch-actions__btn batch-actions__btn--primary"
            onClick={handleConsolidateAll}
            disabled={isExecuting || allCompleted}
          >
            {isExecuting ? '⏳ Processing...' : '📦 Consolidate All'}
          </button>
        </div>
      </div>

      {/* Execution Log */}
      {logs.length > 0 && (
        <div className="phase-section">
          <ExecutionLog logs={logs} />
        </div>
      )}

      {/* Result Summary */}
      {executionResult && (
        <div className="phase-section">
          <ResultSummary
            beforeStats={executionResult.beforeStats}
            afterStats={executionResult.afterStats}
            checkpoint={executionResult.checkpoint}
            onRollback={handleRollback}
            canRollback={!executionResult.checkpoint?.mock}
          />
        </div>
      )}

      {/* Actions */}
      <div className="phase-actions">
        <button className="phase-actions__secondary" onClick={onBack} disabled={isExecuting}>← Back</button>
        <button className="phase-actions__primary" onClick={handleComplete} disabled={isExecuting}>
          {hasCompleted ? '✓ Complete & Close' : 'Close'}
        </button>
      </div>
    </div>
  );
};

export default PhaseAct;
