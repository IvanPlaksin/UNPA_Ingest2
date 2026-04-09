import React from 'react';

/**
 * Individual session step display
 */
const SessionStep = ({ step, isLast = false }) => {
  const getPhaseIcon = (phase) => {
    switch (phase) {
      case 'understand': return '🔍';
      case 'discover': return '🎯';
      case 'evaluate': return '⚖️';
      case 'act': return '⚡';
      default: return '•';
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      'analyze': 'Analyzed graph structure',
      'segment': 'Found clusters',
      'evaluate': 'Evaluated clusters',
      'approve': 'Approved clusters',
      'consolidate': 'Consolidated cluster',
      'export': 'Exported cluster',
      'rollback': 'Rolled back changes',
    };
    return labels[action] || action;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`session-step ${isLast ? 'session-step--last' : ''}`}>
      <div className="session-step__icon">
        {getPhaseIcon(step.phase)}
      </div>
      <div className="session-step__content">
        <div className="session-step__action">
          {getActionLabel(step.action)}
        </div>
        {step.data?.clusterName && (
          <div className="session-step__detail">
            "{step.data.clusterName}"
          </div>
        )}
      </div>
      <div className="session-step__time">
        {formatTime(step.timestamp)}
      </div>
    </div>
  );
};

export default SessionStep;
