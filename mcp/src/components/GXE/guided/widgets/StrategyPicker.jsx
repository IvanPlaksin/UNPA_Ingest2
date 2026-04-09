/**
 * StrategyPicker — radio selector for segmentation strategies.
 * Migrated from Nexus StrategySelector (CONS-13b).
 * Tailwind + lucide-react, self-contained.
 */
import React from 'react';
import { Layers, Network, GitBranch } from 'lucide-react';

const STRATEGIES = [
  { id: 'community',   label: 'Community Detection', icon: Layers,    description: 'Label propagation clustering' },
  { id: 'modularity',  label: 'Modularity',          icon: Network,   description: 'Greedy modularity maximization' },
  { id: 'hierarchical', label: 'Hierarchical',        icon: GitBranch, description: 'Top-down recursive splitting' },
];

const StrategyPicker = ({ value = 'community', onChange, disabled = false }) => (
  <div className="flex flex-col gap-1.5">
    {STRATEGIES.map(s => {
      const Icon = s.icon;
      const active = value === s.id;
      return (
        <button
          key={s.id}
          disabled={disabled}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors
            ${active
              ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
              : 'bg-[#161b22] text-gray-400 hover:bg-[#21262d] hover:text-gray-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Icon size={13} className={active ? 'text-indigo-400' : 'text-gray-500'} />
          <div className="flex flex-col">
            <span className="font-medium">{s.label}</span>
            <span className="text-[10px] text-gray-500">{s.description}</span>
          </div>
        </button>
      );
    })}
  </div>
);

export default StrategyPicker;
