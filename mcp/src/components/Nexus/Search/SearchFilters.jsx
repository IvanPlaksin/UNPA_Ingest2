import React from 'react';

/**
 * Search filters component (collapsible)
 */
const SearchFilters = ({
  filters,
  onChange,
  availableTypes = [],
  availableLayers = [],
  isCollapsed = true,
  onToggle,
}) => {
  const handleTypeToggle = (type) => {
    const currentTypes = filters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    onChange?.({ ...filters, types: newTypes });
  };

  const handleLayerToggle = (layer) => {
    const currentLayers = filters.layers || [];
    const newLayers = currentLayers.includes(layer)
      ? currentLayers.filter(l => l !== layer)
      : [...currentLayers, layer];
    onChange?.({ ...filters, layers: newLayers });
  };

  const handleAllLayers = () => {
    onChange?.({ ...filters, layers: [] });
  };

  const hasActiveFilters = (filters.types?.length > 0) || (filters.layers?.length > 0);

  return (
    <div className="search-filters">
      <div className="search-filters__header" onClick={onToggle}>
        <span className="search-filters__toggle-icon">
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className="search-filters__title">Filters</span>
        {hasActiveFilters && (
          <span className="search-filters__active-badge">Active</span>
        )}
      </div>

      {!isCollapsed && (
        <div className="search-filters__content">
          {availableTypes.length > 0 && (
            <div className="search-filters__group">
              <label className="search-filters__label">Types</label>
              <div className="search-filters__chips">
                {availableTypes.map(type => {
                  const isActive = filters.types?.includes(type);
                  return (
                    <button
                      key={type}
                      className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
                      onClick={() => handleTypeToggle(type)}
                    >
                      {isActive ? '☑' : '☐'} {type}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {availableLayers.length > 0 && (
            <div className="search-filters__group">
              <label className="search-filters__label">Layers</label>
              <div className="search-filters__chips">
                <button
                  className={`filter-chip ${!filters.layers?.length ? 'filter-chip--active' : ''}`}
                  onClick={handleAllLayers}
                >
                  {!filters.layers?.length ? '☑' : '☐'} All
                </button>
                {availableLayers.map(layer => {
                  const isActive = filters.layers?.includes(layer);
                  return (
                    <button
                      key={layer}
                      className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
                      onClick={() => handleLayerToggle(layer)}
                    >
                      {isActive ? '☑' : '☐'} {layer}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <button
              className="search-filters__clear"
              onClick={() => onChange?.({ types: [], layers: [] })}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchFilters;
