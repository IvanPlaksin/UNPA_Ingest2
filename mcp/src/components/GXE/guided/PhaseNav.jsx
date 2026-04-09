/**
 * PhaseNav — phase navigation indicator for GXE Guided Mode.
 *
 * Migrated from Nexus/Modes/GuidedMode/PipelineProgress.jsx (CONS-13).
 * Tailwind + lucide-react, GXE dark theme.
 */

import React from 'react';
import { Search, Target, Scale, Zap, Check } from 'lucide-react';

const PHASES = [
  { id: 'understand', label: 'Understand', Icon: Search,  description: 'Analyze structure' },
  { id: 'discover',   label: 'Discover',   Icon: Target,  description: 'Find patterns' },
  { id: 'evaluate',   label: 'Evaluate',   Icon: Scale,   description: 'Assess quality' },
  { id: 'act',        label: 'Act',         Icon: Zap,     description: 'Take action' },
];

const PhaseNav = ({ currentPhase, completedPhases = [], onPhaseClick }) => {
  const currentIndex = PHASES.findIndex(p => p.id === currentPhase);

  const getStatus = (phase, index) => {
    if (completedPhases.includes(phase.id)) return 'completed';
    if (phase.id === currentPhase) return 'active';
    if (index < currentIndex) return 'completed';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {PHASES.map((phase, index) => {
        const status = getStatus(phase, index);
        const clickable = status === 'completed' || status === 'active';
        const { Icon } = phase;

        const colors = {
          completed: 'bg-green-500/20 text-green-400 border-green-500/40',
          active:    'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 ring-1 ring-indigo-500/30',
          pending:   'bg-[#21262d] text-gray-600 border-[#30363d] opacity-50',
        };

        return (
          <React.Fragment key={phase.id}>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-all ${colors[status]} ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
              onClick={() => clickable && onPhaseClick?.(phase.id)}
              title={phase.description}
            >
              {status === 'completed'
                ? <Check size={12} className="text-green-400" />
                : <Icon size={12} />
              }
              <span>{phase.label}</span>
            </button>

            {index < PHASES.length - 1 && (
              <div className={`w-4 h-px ${index < currentIndex ? 'bg-green-500/50' : 'bg-[#30363d]'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default PhaseNav;
