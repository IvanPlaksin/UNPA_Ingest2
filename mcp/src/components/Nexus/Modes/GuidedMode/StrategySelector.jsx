import React from 'react';
import { SEGMENTATION_STRATEGIES } from '../../../../services/nexus.service';

const StrategySelector = ({
  selectedStrategy,
  onSelect,
  disabled = false,
  embeddingsAvailable = false,
}) => {
  const strategies = Object.values(SEGMENTATION_STRATEGIES);

  return (
    <div className="strategy-selector">
      <div className="strategy-selector__label">Clustering Strategy</div>
      <div className="strategy-selector__options">
        {strategies.map((strategy) => {
          const isDisabled = disabled || (strategy.requiresEmbeddings && !embeddingsAvailable);
          const isSelected = selectedStrategy === strategy.id;

          return (
            <button
              key={strategy.id}
              className={`strategy-option ${isSelected ? 'strategy-option--selected' : ''} ${isDisabled ? 'strategy-option--disabled' : ''}`}
              onClick={() => !isDisabled && onSelect(strategy.id)}
              disabled={isDisabled}
              title={strategy.description}
            >
              <span className="strategy-option__icon">{strategy.icon}</span>
              <span className="strategy-option__name">{strategy.name}</span>
              {strategy.requiresEmbeddings && !embeddingsAvailable && (
                <span className="strategy-option__badge">Needs embeddings</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StrategySelector;
