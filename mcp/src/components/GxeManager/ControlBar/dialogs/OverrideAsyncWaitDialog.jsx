import React, { useState } from 'react';
import {
  X, FastForward, AlertTriangle, Info,
  Loader2, AlertCircle
} from 'lucide-react';
import { overrideAsyncWait } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const OverrideAsyncWaitDialog = ({ execution, onClose }) => {
  const [payload, setPayload] = useState('{}');
  const [payloadError, setPayloadError] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentNodeId = execution?.currentNodeId;
  const expectedSchema = execution?.metadata?.expectedPayloadSchema;
  const waitType = execution?.metadata?.waitType;

  const validatePayload = (value) => {
    try {
      JSON.parse(value);
      setPayloadError(null);
      return true;
    } catch (e) {
      setPayloadError('Invalid JSON: ' + e.message);
      return false;
    }
  };

  const handlePayloadChange = (e) => {
    const value = e.target.value;
    setPayload(value);
    if (value.trim()) {
      validatePayload(value);
    } else {
      setPayloadError(null);
    }
  };

  const handleSubmit = async () => {
    if (!reason || reason.length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }
    if (!validatePayload(payload)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parsedPayload = JSON.parse(payload);
      await overrideAsyncWait(
        execution.executionId,
        currentNodeId,
        parsedPayload,
        reason
      );
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isReasonValid = reason.length >= 10;

  return (
    <div className="gxe-dialog-overlay" onClick={onClose}>
      <div className="gxe-dialog" onClick={e => e.stopPropagation()}>
        <div className="gxe-dialog__header">
          <h2>
            <FastForward size={20} />
            Override Async Wait
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__warning">
            <AlertTriangle size={16} />
            <div>
              <strong>Manual override bypasses normal input flow.</strong>
              <br />
              This action will be logged for audit purposes. Make sure you provide
              accurate data and a clear reason.
            </div>
          </div>

          <div className="gxe-dialog__info">
            <Info size={16} />
            <div>
              <strong>Waiting node:</strong> <code>{currentNodeId}</code>
              {waitType && (
                <>
                  <br />
                  <strong>Wait type:</strong> {waitType}
                </>
              )}
            </div>
          </div>

          <div className="gxe-dialog__field">
            <label>Override Payload (JSON) *</label>
            <textarea
              value={payload}
              onChange={handlePayloadChange}
              placeholder='{"approved": true, "comment": "..."}'
              rows={6}
              className={`gxe-dialog__textarea ${payloadError ? 'error' : ''}`}
            />
            {payloadError && (
              <span className="gxe-dialog__error-hint">{payloadError}</span>
            )}
            {expectedSchema && (
              <div className="gxe-dialog__schema">
                <strong>Expected schema:</strong>
                <pre>{JSON.stringify(expectedSchema, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="gxe-dialog__field">
            <label>Reason (required, min 10 characters) *</label>
            <input
              type="text"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null); }}
              placeholder="e.g., Customer confirmed via phone call #12345"
              className={`gxe-dialog__input ${!isReasonValid && reason.length > 0 ? 'error' : ''}`}
            />
            <span className="gxe-dialog__hint">
              {reason.length}/10 characters minimum
            </span>
          </div>

          {error && (
            <div className="gxe-dialog__error">
              <AlertCircle size={16} />
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
            disabled={loading || !isReasonValid || !!payloadError}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Processing...
              </>
            ) : (
              <>
                <FastForward size={16} />
                Override & Resume
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverrideAsyncWaitDialog;
