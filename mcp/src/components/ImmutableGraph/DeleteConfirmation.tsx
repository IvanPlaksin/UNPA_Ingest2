/**
 * DeleteConfirmation Component
 * UN ProjectAdvisor - Two-phase deletion confirmation
 *
 * Features:
 * - Two-phase deletion (mark, wait, confirm)
 * - 5-second minimum delay
 * - Visual countdown
 * - Tombstone creation notification
 */

import React, { useState, useEffect } from 'react';

interface DeleteConfirmationProps {
  entityId: string;
  entityType: 'NODE' | 'EDGE';
  entityName?: string;
  apiBaseUrl?: string;
  onDeleted?: () => void;
  onCancel?: () => void;
  onError?: (error: string) => void;
}

type Phase = 'initial' | 'marked' | 'waiting' | 'ready' | 'deleting' | 'deleted';

export const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  entityId,
  entityType,
  entityName,
  apiBaseUrl = '/api/v1/graph',
  onDeleted,
  onCancel,
  onError
}) => {
  const [phase, setPhase] = useState<Phase>('initial');
  const [reason, setReason] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'waiting' || waitSeconds <= 0) return;

    const timer = setInterval(() => {
      setWaitSeconds(prev => {
        if (prev <= 1) {
          setPhase('ready');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, waitSeconds]);

  const handleMarkForDeletion = async () => {
    if (reason.trim().length < 5) {
      onError?.('Please provide a reason for deletion');
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/god-mode/delete/${entityId}/mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, reason })
      });

      const data = await response.json();

      if (data.success) {
        setPendingId(data.data.pendingId);
        setWaitSeconds(data.data.waitSeconds);
        setPhase('waiting');
      } else {
        onError?.(data.error);
      }
    } catch (error) {
      onError?.('Failed to mark for deletion');
    }
  };

  const handleConfirmDeletion = async () => {
    setPhase('deleting');

    try {
      const response = await fetch(`${apiBaseUrl}/god-mode/delete/${entityId}/confirm`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setPhase('deleted');
        setTimeout(() => onDeleted?.(), 1500);
      } else {
        if (data.data?.waitSeconds) {
          setWaitSeconds(data.data.waitSeconds);
          setPhase('waiting');
        } else {
          onError?.(data.error);
          setPhase('ready');
        }
      }
    } catch (error) {
      onError?.('Failed to confirm deletion');
      setPhase('ready');
    }
  };

  return (
    <div className="delete-confirmation">
      <div className="delete-header">
        <span className="delete-icon">🗑️</span>
        <h3>Delete {entityType.toLowerCase()}</h3>
      </div>

      <div className="delete-target">
        <strong>Target:</strong> {entityName || entityId}
      </div>

      {phase === 'initial' && (
        <div className="delete-phase-initial">
          <div className="warning-message">
            <p>⚠️ This action will permanently delete this {entityType.toLowerCase()}.</p>
            <p>A tombstone will be created allowing recovery within 30 days.</p>
          </div>

          <div className="form-group">
            <label>Reason for deletion:</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being deleted?"
              rows={2}
            />
          </div>

          <div className="actions">
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
            <button
              className="btn-danger"
              onClick={handleMarkForDeletion}
              disabled={reason.trim().length < 5}
            >
              Mark for Deletion
            </button>
          </div>
        </div>
      )}

      {phase === 'waiting' && (
        <div className="delete-phase-waiting">
          <div className="countdown">
            <div className="countdown-circle">
              <span className="countdown-number">{waitSeconds}</span>
            </div>
            <p>Waiting for confirmation window...</p>
          </div>

          <div className="info-message">
            Two-phase deletion requires a {waitSeconds > 0 ? `${waitSeconds} second` : ''} delay before confirmation.
          </div>

          <div className="actions">
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <div className="delete-phase-ready">
          <div className="ready-message">
            <span className="check-icon">✓</span>
            <p>Ready for final confirmation</p>
          </div>

          <div className="warning-final">
            <strong>Final warning:</strong> This will permanently delete the {entityType.toLowerCase()}.
          </div>

          <div className="actions">
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
            <button className="btn-danger-final" onClick={handleConfirmDeletion}>
              Confirm Permanent Deletion
            </button>
          </div>
        </div>
      )}

      {phase === 'deleting' && (
        <div className="delete-phase-deleting">
          <div className="spinner" />
          <p>Deleting...</p>
        </div>
      )}

      {phase === 'deleted' && (
        <div className="delete-phase-deleted">
          <div className="success-icon">✓</div>
          <p>Successfully deleted</p>
          <p className="tombstone-note">Tombstone created - recoverable for 30 days</p>
        </div>
      )}

      <style>{`
        .delete-confirmation {
          background: #1f2937;
          border-radius: 12px;
          padding: 24px;
          color: #f3f4f6;
          max-width: 400px;
        }

        .delete-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .delete-header h3 {
          margin: 0;
          text-transform: capitalize;
        }

        .delete-icon {
          font-size: 1.5rem;
        }

        .delete-target {
          background: #374151;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          word-break: break-all;
        }

        .warning-message, .warning-final {
          background: #7f1d1d;
          border: 1px solid #dc2626;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .warning-message p {
          margin: 0 0 8px 0;
        }

        .warning-message p:last-child {
          margin-bottom: 0;
        }

        .info-message {
          background: #1e3a5f;
          border: 1px solid #3b82f6;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
          text-align: center;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
        }

        .form-group textarea {
          width: 100%;
          padding: 10px;
          background: #374151;
          border: 1px solid #4b5563;
          border-radius: 6px;
          color: #f3f4f6;
          resize: vertical;
          box-sizing: border-box;
        }

        .countdown {
          text-align: center;
          margin-bottom: 16px;
        }

        .countdown-circle {
          width: 80px;
          height: 80px;
          border: 4px solid #dc2626;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .countdown-number {
          font-size: 2rem;
          font-weight: bold;
          color: #dc2626;
        }

        .ready-message {
          text-align: center;
          margin-bottom: 16px;
        }

        .check-icon {
          display: inline-block;
          width: 48px;
          height: 48px;
          background: #065f46;
          border-radius: 50%;
          line-height: 48px;
          font-size: 1.5rem;
          margin-bottom: 8px;
        }

        .actions {
          display: flex;
          gap: 12px;
        }

        .btn-cancel, .btn-danger, .btn-danger-final {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-cancel {
          background: #374151;
          color: #f3f4f6;
        }

        .btn-danger {
          background: #991b1b;
          color: white;
        }

        .btn-danger-final {
          background: #dc2626;
          color: white;
          animation: pulse-danger 1s infinite;
        }

        @keyframes pulse-danger {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0); }
        }

        .btn-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .delete-phase-deleting, .delete-phase-deleted {
          text-align: center;
          padding: 24px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #374151;
          border-top-color: #dc2626;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .success-icon {
          width: 64px;
          height: 64px;
          background: #065f46;
          border-radius: 50%;
          line-height: 64px;
          font-size: 2rem;
          margin: 0 auto 16px;
        }

        .tombstone-note {
          color: #9ca3af;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
};

export default DeleteConfirmation;
