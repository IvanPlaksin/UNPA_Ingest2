import React from 'react';

/**
 * Filter controls for node list
 */
const FilterBar = ({
  filters,
  onFilterChange,
  onClearFilters,
  availableTypes = [],
  availableLayers = [],
}) => {
  const handleChange = (key, value) => {
    onFilterChange?.({ ...filters, [key]: value });
  };

  const hasActiveFilters = filters && (
    filters.type !== 'all' ||
    filters.layer !== 'all' ||
    filters.degree !== 'any'
  );

  return (
    <div className="filter-bar">
      <div className="filter-bar__group">
        <label className="filter-bar__label">Type</label>
        <select
          className="filter-bar__select"
          value={filters?.type || 'all'}
          onChange={(e) => handleChange('type', e.target.value)}
        >
          <option value="all">All Types</option>
          {availableTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="filter-bar__group">
        <label className="filter-bar__label">Layer</label>
        <select
          className="filter-bar__select"
          value={filters?.layer || 'all'}
          onChange={(e) => handleChange('layer', e.target.value)}
        >
          <option value="all">All Layers</option>
          {availableLayers.map(layer => (
            <option key={layer} value={layer}>{layer}</option>
          ))}
        </select>
      </div>

      <div className="filter-bar__group">
        <label className="filter-bar__label">Degree</label>
        <select
          className="filter-bar__select"
          value={filters?.degree || 'any'}
          onChange={(e) => handleChange('degree', e.target.value)}
        >
          <option value="any">Any</option>
          <option value="hub">Hubs (10+)</option>
          <option value="bridge">Bridges</option>
          <option value="orphan">Orphans (0)</option>
          <option value="leaf">Leaves (1)</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button className="filter-bar__clear" onClick={onClearFilters}>
          ✕ Clear
        </button>
      )}
    </div>
  );
};

export default FilterBar;
