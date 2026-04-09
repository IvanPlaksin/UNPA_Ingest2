import React, { useState, useCallback } from 'react';

/**
 * Toolbar with search, filters toggle, and layout options
 */
const ExploreToolbar = ({
  searchQuery,
  onSearchChange,
  showFilters,
  onToggleFilters,
  onSearchFocus,
  onSettingsClick,
}) => {
  const [localQuery, setLocalQuery] = useState(searchQuery || '');

  const handleSearch = useCallback((e) => {
    const value = e.target.value;
    setLocalQuery(value);
    onSearchChange?.(value);
  }, [onSearchChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLocalQuery('');
      onSearchChange?.('');
    }
  }, [onSearchChange]);

  return (
    <div className="explore-toolbar">
      <div className="explore-toolbar__search">
        <span className="explore-toolbar__search-icon" onClick={onSearchFocus} style={{ cursor: 'pointer' }}>🔍</span>
        <input
          type="text"
          className="explore-toolbar__search-input"
          placeholder="Search nodes..."
          value={localQuery}
          onChange={handleSearch}
          onKeyDown={handleKeyDown}
        />
        {localQuery && (
          <button
            className="explore-toolbar__search-clear"
            onClick={() => { setLocalQuery(''); onSearchChange?.(''); }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="explore-toolbar__actions">
        <button
          className={`explore-toolbar__btn ${showFilters ? 'explore-toolbar__btn--active' : ''}`}
          onClick={onToggleFilters}
          title="Toggle filters"
        >
          <span>🎚️</span>
          <span>Filters</span>
          {showFilters && <span className="explore-toolbar__btn-indicator">▲</span>}
        </button>

        <button
          className="explore-toolbar__btn explore-toolbar__btn--icon"
          onClick={onSettingsClick}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};

export default ExploreToolbar;
