/**
 * GodModeToggle Component
 * UN ProjectAdvisor - Immutable Graph God Mode Control
 *
 * Features:
 * - 3-second hold confirmation for activation
 * - Auto-disable timer display
 * - Warning banner when active
 * - Reason requirement (min 10 chars)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface GodModeStatus {
  active: boolean;
  sessionId?: string;
  activatedAt?: string;
  autoDisableAt?: string;
  remainingMinutes?: number;
  reason?: string;
}

interface GodModeToggleProps {
  apiBaseUrl?: string;
  onActivate?: (session: GodModeStatus) => void;
  onDeactivate?: () => void;
  onError?: (error: string) => void;
}

export const GodModeToggle: React.FC<GodModeToggleProps> = ({
  apiBaseUrl = '/api/v1/graph',
  onActivate,
  onDeactivate,
  onError
}) => {
  const [status, setStatus] = useState<GodModeStatus>({ active: false });
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number | null>(null);

  const HOLD_DURATION_MS = 3000;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/god-mode/status`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch God Mode status:', error);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (!status.active || !status.autoDisableAt) return;

    const updateRemaining = () => {
      const remaining = Math.ceil((new Date(status.autoDisableAt!).getTime() - Date.now()) / 60000);
      if (remaining <= 0) {
        setStatus({ active: false });
        onDeactivate?.();
      } else {
        setStatus(prev => ({ ...prev, remainingMinutes: remaining }));
      }
    };

    const interval = setInterval(updateRemaining, 10000);
    return () => clearInterval(interval);
  }, [status.active, status.autoDisableAt, onDeactivate]);

  const handleActivate = async () => {
    if (reason.trim().length < 10) {
      onError?.('Reason must be at least 10 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/god-mode/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason })
      });

      const data = await response.json();
      if (data.success) {
        setStatus({ active: true, ...data.data });
        setShowConfirmation(false);
        setReason('');
        setAcknowledged(false);
        onActivate?.(data.data);
      } else {
        onError?.(data.error);
      }
    } catch (error) {
      onError?.('Failed to activate God Mode');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/god-mode/deactivate`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        setStatus({ active: false });
        onDeactivate?.();
      } else {
        onError?.(data.error);
      }
    } catch (error) {
      onError?.('Failed to deactivate God Mode');
    } finally {
      setLoading(false);
    }
  };

  const handleHoldStart = () => {
    if (!acknowledged || reason.trim().length < 10) return;

    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current!;
      const progress = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(holdTimerRef.current!);
        handleActivate();
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  };

  const toggleClick = () => {
    if (status.active) {
      handleDeactivate();
    } else {
      setShowConfirmation(true);
    }
  };

  return (
    <div className="god-mode-toggle">
      {status.active && (
        <div className="god-mode-banner">
          <span className="god-mode-icon">⚠️</span>
          <span className="god-mode-text">
            GOD MODE ACTIVE - {status.remainingMinutes} min remaining
          </span>
        </div>
      )}

      <div className="god-mode-control">
        <label className="toggle-label">
          <span className="label-text">Dangerous Operations Mode</span>
          <button
            className={`toggle-switch ${status.active ? 'active' : ''}`}
            onClick={toggleClick}
            disabled={loading}
            aria-pressed={status.active}
          >
            <span className="toggle-slider" />
          </button>
        </label>
      </div>

      {showConfirmation && !status.active && (
        <div className="god-mode-modal-overlay">
          <div className="god-mode-modal">
            <div className="modal-header">
              <span className="warning-icon">⚠️</span>
              <h3>Enable God Mode</h3>
            </div>

            <div className="modal-content">
              <div className="warning-box">
                <p><strong>Warning:</strong> God Mode allows physical deletion and mutation of graph data.</p>
                <ul>
                  <li>All actions are permanently logged</li>
                  <li>Deleted data is recoverable for 30 days</li>
                  <li>Session auto-disables after 30 minutes</li>
                </ul>
              </div>

              <div className="form-group">
                <label htmlFor="god-mode-reason">
                  Reason for enabling God Mode (required):
                </label>
                <textarea
                  id="god-mode-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you need God Mode (min 10 characters)..."
                  rows={3}
                />
                <span className="char-count">
                  {reason.length}/10 minimum characters
                </span>
              </div>

              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>I understand the risks and accept responsibility</span>
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowConfirmation(false);
                  setReason('');
                  setAcknowledged(false);
                }}
              >
                Cancel
              </button>

              <button
                className={`btn-confirm ${holdProgress > 0 ? 'holding' : ''}`}
                disabled={!acknowledged || reason.trim().length < 10 || loading}
                onMouseDown={handleHoldStart}
                onMouseUp={handleHoldEnd}
                onMouseLeave={handleHoldEnd}
                onTouchStart={handleHoldStart}
                onTouchEnd={handleHoldEnd}
                style={{
                  background: holdProgress > 0
                    ? `linear-gradient(to right, #dc2626 ${holdProgress}%, #991b1b ${holdProgress}%)`
                    : undefined
                }}
              >
                {loading ? 'Activating...' : holdProgress > 0 ? `Hold ${Math.ceil((HOLD_DURATION_MS - (holdProgress / 100 * HOLD_DURATION_MS)) / 1000)}s...` : 'Hold to Confirm (3s)'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .god-mode-toggle {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .god-mode-banner {
          background: linear-gradient(90deg, #dc2626, #b91c1c);
          color: white;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        .god-mode-control {
          padding: 12px;
          background: #1f2937;
          border-radius: 8px;
        }

        .toggle-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .label-text {
          color: #f3f4f6;
          font-weight: 500;
        }

        .toggle-switch {
          width: 48px;
          height: 24px;
          background: #374151;
          border: none;
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-switch.active {
          background: #dc2626;
        }

        .toggle-slider {
          position: absolute;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: transform 0.2s;
        }

        .toggle-switch.active .toggle-slider {
          transform: translateX(24px);
        }

        .god-mode-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .god-mode-modal {
          background: #1f2937;
          border-radius: 12px;
          width: 90%;
          max-width: 480px;
          color: #f3f4f6;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          border-bottom: 1px solid #374151;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
        }

        .warning-icon {
          font-size: 1.5rem;
        }

        .modal-content {
          padding: 20px;
        }

        .warning-box {
          background: #7f1d1d;
          border: 1px solid #dc2626;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .warning-box p {
          margin: 0 0 12px 0;
        }

        .warning-box ul {
          margin: 0;
          padding-left: 20px;
        }

        .warning-box li {
          margin: 4px 0;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .form-group textarea {
          width: 100%;
          padding: 12px;
          background: #374151;
          border: 1px solid #4b5563;
          border-radius: 6px;
          color: #f3f4f6;
          font-size: 14px;
          resize: vertical;
          box-sizing: border-box;
        }

        .form-group textarea:focus {
          outline: none;
          border-color: #6b7280;
        }

        .char-count {
          display: block;
          text-align: right;
          font-size: 12px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .checkbox-group {
          margin-bottom: 16px;
        }

        .checkbox-group label {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
          margin-top: 3px;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          padding: 20px;
          border-top: 1px solid #374151;
        }

        .btn-cancel, .btn-confirm {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cancel {
          background: #374151;
          color: #f3f4f6;
        }

        .btn-cancel:hover {
          background: #4b5563;
        }

        .btn-confirm {
          background: #991b1b;
          color: white;
        }

        .btn-confirm:hover:not(:disabled) {
          background: #b91c1c;
        }

        .btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-confirm.holding {
          cursor: progress;
        }
      `}</style>
    </div>
  );
};

export default GodModeToggle;
