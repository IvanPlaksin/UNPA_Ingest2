import React, { useState, useEffect } from 'react';
import { X, Play, AlertCircle, Info, Loader2 } from 'lucide-react';
import { resumeExecution } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const ResumeDialog = ({ execution, onClose }) => {
  const [payload, setPayload] = useState('{}');
  const [payloadError, setPayloadError] = useState(null);
  const [resumeToken, setResumeToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const expectedSchema = execution?.metadata?.expectedPayloadSchema;
  const waitType = execution?.metadata?.waitType;
  const currentNodeId = execution?.currentNodeId;

  useEffect(() => {
    if (execution?.metadata?.resumeToken) {
      setResumeToken(execution.metadata.resumeToken);
    }
  }, [execution]);

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
    if (payload.trim() && !validatePayload(payload)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parsedPayload = payload.trim() ? JSON.parse(payload) : {};
      await resumeExecution(
        execution.executionId,
        parsedPayload,
        resumeToken || null
      );
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
            <Play size={20} />
            Resume Execution
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__info">
            <Info size={16} />
            <div>
              <strong>Execution:</strong> {execution.executionId.slice(0, 12)}...
              <br />
              <strong>Waiting at:</strong> {currentNodeId || 'Unknown'}
              {waitType && (
                <>
                  <br />
                  <strong>Wait type:</strong> {waitType}
                </>
              )}
            </div>
          </div>

          <div className="gxe-dialog__field">
            <label>Resume Token (optional)</label>
            <input
              type="text"
              value={resumeToken}
              onChange={e => setResumeToken(e.target.value)}
              placeholder="Leave empty to use default"
              className="gxe-dialog__input"
            />
            <span className="gxe-dialog__hint">
              If provided, validates that you have permission to resume
            </span>
          </div>

          <div className="gxe-dialog__field">
            <label>Payload (JSON)</label>
            <textarea
              value={payload}
              onChange={handlePayloadChange}
              placeholder='{"key": "value"}'
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
            disabled={loading || !!payloadError}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Resuming...
              </>
            ) : (
              <>
                <Play size={16} />
                Resume
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResumeDialog;
