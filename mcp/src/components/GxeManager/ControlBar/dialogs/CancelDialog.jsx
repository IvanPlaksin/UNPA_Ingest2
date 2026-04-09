import React, { useState } from 'react';
import { X, Square, AlertTriangle, Loader2 } from 'lucide-react';
import { cancelExecution } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const CancelDialog = ({ execution, onClose }) => {
  const [reason, setReason] = useState('');
  const [runCompensation, setRunCompensation] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const graphId = execution?.graphId || '';
  const requireConfirm = execution?.priority === 'CRITICAL' || execution?.priority === 'HIGH';
  const confirmRequired = requireConfirm && confirmText !== graphId;

  const handleSubmit = async () => {
    if (confirmRequired) return;

    setLoading(true);
    setError(null);

    try {
      await cancelExecution(execution.executionId, {
        reason: reason || 'Cancelled by operator',
        runCompensation
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gxe-dialog-overlay" onClick={onClose}>
      <div className="gxe-dialog" onClick={e => e.stopPropagation()}>
        <div className="gxe-dialog__header">
          <h2>
            <Square size={20} />
            Cancel Execution
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__danger">
            <AlertTriangle size={16} />
            <div>
              <strong>This action cannot be undone.</strong>
              <br />
              Cancelling will stop the execution immediately. Any in-progress node operations
              will be terminated.
            </div>
          </div>

          <div className="gxe-dialog__info">
            <div style={{ flex: 1 }}>
              <strong>Graph:</strong> {graphId}
              <br />
              <strong>Status:</strong> {execution.status}
              <br />
              <strong>Priority:</strong> {execution.priority}
            </div>
          </div>

          <div className="gxe-dialog__field">
            <label>Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why are you cancelling this execution?"
              className="gxe-dialog__input"
            />
          </div>

          {execution?.transactionId && (
            <div className="gxe-dialog__field">
              <label className="gxe-dialog__checkbox">
                <input
                  type="checkbox"
                  checked={runCompensation}
                  onChange={e => setRunCompensation(e.target.checked)}
                />
                <span>Run compensation (undo completed steps)</span>
              </label>
              <span className="gxe-dialog__hint">
                This will execute compensation graphs to undo any side effects
              </span>
            </div>
          )}

          {requireConfirm && (
            <div className="gxe-dialog__field">
              <label>Type the graph name to confirm: <code>{graphId}</code></label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={graphId}
                className={`gxe-dialog__input ${confirmText && confirmText !== graphId ? 'error' : ''}`}
              />
              {confirmText && confirmText !== graphId && (
                <span className="gxe-dialog__error-hint">Graph name doesn't match</span>
              )}
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
            Keep Running
          </button>
          <button
            className="gxe-dialog__btn gxe-dialog__btn--danger"
            onClick={handleSubmit}
            disabled={loading || confirmRequired}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Cancelling...
              </>
            ) : (
              <>
                <Square size={16} />
                Cancel Execution
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelDialog;
