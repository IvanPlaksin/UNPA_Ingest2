import React from 'react';
import { SEARCH_MODES } from '../../../services/nexus.service';

/**
 * Search mode selector (text/semantic/hybrid)
 */
const SearchModeSelector = ({
  selectedMode,
  onChange,
  embeddingsAvailable = false,
}) => {
  const modes = Object.values(SEARCH_MODES);

  return (
    <div className="search-mode-selector">
      <div className="search-mode-selector__modes">
        {modes.map(mode => {
          const isDisabled = mode.requiresEmbeddings && !embeddingsAvailable;
          const isSelected = selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              className={`search-mode-btn ${isSelected ? 'search-mode-btn--selected' : ''} ${isDisabled ? 'search-mode-btn--disabled' : ''}`}
              onClick={() => !isDisabled && onChange?.(mode.id)}
              disabled={isDisabled}
              title={isDisabled ? 'Requires embeddings' : mode.description}
            >
              <span className="search-mode-btn__icon">{mode.icon}</span>
              <span className="search-mode-btn__name">{mode.name}</span>
              {isDisabled && (
                <span className="search-mode-btn__badge">AI</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SearchModeSelector;
