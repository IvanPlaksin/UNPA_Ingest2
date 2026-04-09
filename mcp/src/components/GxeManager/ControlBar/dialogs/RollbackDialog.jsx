import React, { useState, useEffect } from 'react';
import {
  X, RotateCcw, AlertTriangle, Clock,
  Loader2, RefreshCw, SkipForward
} from 'lucide-react';
import { rollbackExecution, fetchCheckpoints } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const ROLLBACK_MODES = [
  {
    id: 'TO_CHECKPOINT',
    label: 'Rollback to Checkpoint',
    description: 'Restore execution state to a previous checkpoint and continue from there',
    icon: Clock
  },
  {
    id: 'RETRY_FAILED',
    label: 'Retry Failed Nodes',
    description: 'Reset failed nodes to PENDING and retry them',
    icon: RefreshCw
  },
  {
    id: 'SKIP_FAILED',
    label: 'Skip Failed Nodes',
    description: 'Mark failed nodes as SKIPPED and continue execution',
    icon: SkipForward
  }
];

const RollbackDialog = ({ execution, onClose }) => {
  const [mode, setMode] = useState('TO_CHECKPOINT');
  const [checkpoints, setCheckpoints] = useState([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [runCompensation, setRunCompensation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkpointsLoading, setCheckpointsLoading] = useState(true);
  const [error, setError] = useState(null);

  const failedNodes = Object.entries(execution?.nodeStates || {})
    .filter(([_, state]) => {
      const status = typeof state === 'string' ? state : state?.status;
      return status === 'FAILED';
    })
    .map(([nodeId]) => nodeId);

  useEffect(() => {
    const loadCheckpoints = async () => {
      setCheckpointsLoading(true);
      try {
        const data = await fetchCheckpoints(execution.executionId);
        setCheckpoints(data);
        if (data.length > 0) {
          setSelectedCheckpoint(data[0].checkpointId);
        }
      } catch (err) {
        console.error('Failed to load checkpoints:', err);
      } finally {
        setCheckpointsLoading(false);
      }
    };
    loadCheckpoints();
  }, [execution.executionId]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await rollbackExecution(execution.executionId, {
        mode,
        checkpointId: mode === 'TO_CHECKPOINT' ? selectedCheckpoint : undefined,
        runCompensation
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="gxe-dialog-overlay" onClick={onClose}>
      <div className="gxe-dialog" onClick={e => e.stopPropagation()}>
        <div className="gxe-dialog__header">
          <h2>
            <RotateCcw size={20} />
            Rollback Execution
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__warning">
            <AlertTriangle size={16} />
            <div>
              Rollback will modify the execution state. This action may re-run nodes or skip them.
              Make sure you understand the implications.
            </div>
          </div>

          <div className="gxe-dialog__field">
            <label>Rollback Mode</label>
            <div className="gxe-dialog__radio-group">
              {ROLLBACK_MODES.map(option => {
                const Icon = option.icon;
                const isDisabled =
                  (option.id === 'RETRY_FAILED' || option.id === 'SKIP_FAILED') &&
                  failedNodes.length === 0;

                return (
                  <label
                    key={option.id}
                    className={`gxe-dialog__radio ${mode === option.id ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="rollbackMode"
                      value={option.id}
                      checked={mode === option.id}
                      onChange={() => setMode(option.id)}
                      disabled={isDisabled}
                    />
                    <div className="gxe-dialog__radio-content">
                      <span className="gxe-dialog__radio-label">
                        <Icon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {option.label}
                      </span>
                      <span className="gxe-dialog__radio-desc">{option.description}</span>
                      {isDisabled && (
                        <span className="gxe-dialog__radio-desc" style={{ color: 'var(--nexus-text-muted)' }}>
                          (No failed nodes)
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {mode === 'TO_CHECKPOINT' && (
            <div className="gxe-dialog__field">
              <label>Select Checkpoint</label>
              {checkpointsLoading ? (
                <div className="gxe-dialog__loading">
                  <Loader2 size={16} className="spinning" />
                  Loading checkpoints...
                </div>
              ) : checkpoints.length === 0 ? (
                <div className="gxe-dialog__hint">No checkpoints available</div>
              ) : (
                <select
                  className="gxe-dialog__select"
                  value={selectedCheckpoint || ''}
                  onChange={e => setSelectedCheckpoint(e.target.value)}
                >
                  {checkpoints.map(cp => (
                    <option key={cp.checkpointId} value={cp.checkpointId}>
                      {formatTimestamp(cp.timestamp)} — Node: {cp.nodeId} ({cp.completedNodes} nodes completed)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {(mode === 'RETRY_FAILED' || mode === 'SKIP_FAILED') && failedNodes.length > 0 && (
            <div className="gxe-dialog__field">
              <label>Failed Nodes ({failedNodes.length})</label>
              <div className="gxe-dialog__node-list">
                {failedNodes.map(nodeId => (
                  <code key={nodeId} className="gxe-dialog__node-tag">{nodeId}</code>
                ))}
              </div>
            </div>
          )}

          {execution?.transactionId && (
            <div className="gxe-dialog__field">
              <label className="gxe-dialog__checkbox">
                <input
                  type="checkbox"
                  checked={runCompensation}
                  onChange={e => setRunCompensation(e.target.checked)}
                />
                <span>Run compensation for completed steps</span>
              </label>
              <span className="gxe-dialog__hint">
                If enabled, will execute compensation graphs for steps that need to be undone
              </span>
            </div>
          )}

          {error && (
            <div className="gxe-dialog__error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="gxe-dialog__footer">
          <button
            className="gxe-dialog__btn gxe-dialog__btn--secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="gxe-dialog__btn gxe-dialog__btn--primary"
            onClick={handleSubmit}
            disabled={loading || (mode === 'TO_CHECKPOINT' && !selectedCheckpoint)}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Processing...
              </>
            ) : (
              <>
                <RotateCcw size={16} />
                Rollback
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RollbackDialog;
