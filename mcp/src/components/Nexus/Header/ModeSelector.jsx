import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

const MODES = [
  {
    id: 'guided',
    icon: '🎯',
    shortLabel: 'Guide',
    description: 'Step-by-step analysis',
  },
  {
    id: 'explore',
    icon: '🔍',
    shortLabel: 'Explore',
    description: 'All tools available',
  },
  {
    id: 'tasks',
    icon: '📋',
    shortLabel: 'Tasks',
    description: 'Goal-oriented workflows',
  },
  {
    id: 'quick',
    icon: '⚡',
    shortLabel: 'Quick',
    description: 'Fast actions',
  },
];

const ModeSelector = () => {
  const mode = useNexusStore(state => state.mode);
  const setMode = useNexusStore(state => state.setMode);

  return (
    <div className="mode-selector">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`mode-selector__btn ${mode === m.id ? 'mode-selector__btn--active' : ''}`}
          onClick={() => setMode(m.id)}
          title={m.description}
        >
          <span className="mode-selector__icon">{m.icon}</span>
          <span className="mode-selector__label">{m.shortLabel}</span>
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
