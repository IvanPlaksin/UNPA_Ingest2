import React, { useState, useEffect } from 'react';
import { useSession } from './useSession';
import { formatSessionSummary, getSessionDuration } from './SessionTracker';
import SessionStep from './SessionStep';
import './SessionPanel.css';

/**
 * SessionPanel - Displays current session info and history
 */
const SessionPanel = ({ isCollapsed = false }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  const { session, sessionInfo, steps, getHistory } = useSession();

  useEffect(() => {
    if (showHistory) {
      setHistory(getHistory(5));
    }
  }, [showHistory, getHistory]);

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isCollapsed) return null;

  return (
    <div className="session-panel">
      {/* Current Session */}
      {session && sessionInfo && (
        <div className="session-panel__current">
          <div className="session-panel__header">
            <span className="session-panel__title">Current Session</span>
            <span className="session-panel__duration">{sessionInfo.duration}</span>
          </div>

          {/* Phase Progress */}
          <div className="session-panel__progress">
            <div className="phase-dots">
              {['understand', 'discover', 'evaluate', 'act'].map((phase, index) => {
                const isCompleted = index < sessionInfo.phaseNumber - 1;
                const isCurrent = phase === sessionInfo.currentPhase;

                return (
                  <React.Fragment key={phase}>
                    <div
                      className={`phase-dot ${isCompleted ? 'phase-dot--completed' : ''} ${isCurrent ? 'phase-dot--current' : ''}`}
                      title={phase.charAt(0).toUpperCase() + phase.slice(1)}
                    >
                      {isCompleted ? '✓' : (index + 1)}
                    </div>
                    {index < 3 && (
                      <div className={`phase-line ${isCompleted ? 'phase-line--completed' : ''}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="session-panel__phase-label">
              Phase {sessionInfo.phaseNumber}/4: {sessionInfo.currentPhase}
            </div>
          </div>

          {/* Summary Stats */}
          {session.summary && (session.summary.clustersFound > 0 || session.summary.clustersApproved > 0 || session.summary.clustersConsolidated > 0) && (
            <div className="session-panel__summary">
              {session.summary.clustersFound > 0 && (
                <div className="summary-stat">
                  <span className="summary-stat__value">{session.summary.clustersFound}</span>
                  <span className="summary-stat__label">Found</span>
                </div>
              )}
              {session.summary.clustersApproved > 0 && (
                <div className="summary-stat">
                  <span className="summary-stat__value">{session.summary.clustersApproved}</span>
                  <span className="summary-stat__label">Approved</span>
                </div>
              )}
              {session.summary.clustersConsolidated > 0 && (
                <div className="summary-stat">
                  <span className="summary-stat__value">{session.summary.clustersConsolidated}</span>
                  <span className="summary-stat__label">Consolidated</span>
                </div>
              )}
            </div>
          )}

          {/* Recent Steps */}
          {steps && steps.length > 0 && (
            <div className="session-panel__steps">
              <div className="session-panel__steps-header">Recent Activity</div>
              <div className="session-panel__steps-list">
                {steps.slice(-3).map((step, index) => (
                  <SessionStep
                    key={step.id || index}
                    step={step}
                    isLast={index === Math.min(steps.length, 3) - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Active Session */}
      {!session && (
        <div className="session-panel__empty">
          <span className="session-panel__empty-text">
            No active session. Start Guided Mode to begin tracking.
          </span>
        </div>
      )}

      {/* History Toggle */}
      <div className="session-panel__history-toggle">
        <button
          className="session-panel__history-btn"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? '▼ Hide History' : '▶ Show History'}
        </button>
      </div>

      {/* History */}
      {showHistory && (
        <div className="session-panel__history">
          <div className="session-panel__history-header">Recent Sessions</div>

          {history.length > 0 ? (
            <div className="session-panel__history-list">
              {history.map((historySession) => (
                <div key={historySession.id} className="history-item">
                  <div className="history-item__time">
                    {formatDate(historySession.endedAt)}
                  </div>
                  <div className="history-item__summary">
                    {formatSessionSummary(historySession)}
                  </div>
                  <div className="history-item__duration">
                    {getSessionDuration(historySession)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="session-panel__history-empty">
              No completed sessions yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionPanel;
