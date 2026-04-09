import React from 'react';

const PHASES = [
  { id: 'understand', label: 'Understand', icon: '🔍', description: 'Analyze structure' },
  { id: 'discover',   label: 'Discover',   icon: '🎯', description: 'Find patterns' },
  { id: 'evaluate',   label: 'Evaluate',   icon: '⚖️', description: 'Assess quality' },
  { id: 'act',        label: 'Act',         icon: '⚡', description: 'Take action' },
];

const PipelineProgress = ({ currentPhase, completedPhases = [], onPhaseClick }) => {
  const currentIndex = PHASES.findIndex(p => p.id === currentPhase);

  const getStatus = (phase, index) => {
    if (completedPhases.includes(phase.id)) return 'completed';
    if (phase.id === currentPhase) return 'active';
    if (index < currentIndex) return 'completed';
    return 'pending';
  };

  return (
    <div className="pipeline-progress">
      {PHASES.map((phase, index) => {
        const status = getStatus(phase, index);
        const clickable = status === 'completed' || status === 'active';

        return (
          <React.Fragment key={phase.id}>
            <div
              className={`pipeline-progress__phase pipeline-progress__phase--${status}`}
              onClick={() => clickable && onPhaseClick?.(phase.id)}
              title={phase.description}
            >
              <div className="pipeline-progress__node">
                {status === 'completed' ? '✓' : phase.icon}
              </div>
              <div className="pipeline-progress__label">{phase.label}</div>
            </div>

            {index < PHASES.length - 1 && (
              <div
                className={`pipeline-progress__connector ${
                  index < currentIndex ? 'pipeline-progress__connector--completed' : ''
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default PipelineProgress;
