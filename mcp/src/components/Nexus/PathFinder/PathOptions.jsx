import React from 'react';

/**
 * Path finding options
 */
const PathOptions = ({ options, onChange }) => {
  const handleChange = (key, value) => {
    onChange?.({ ...options, [key]: value });
  };

  return (
    <div className="path-options">
      <div className="path-options__group">
        <label className="path-options__label">Max depth</label>
        <select
          className="path-options__select"
          value={options.maxDepth}
          onChange={(e) => handleChange('maxDepth', parseInt(e.target.value))}
        >
          <option value={2}>2 hops</option>
          <option value={3}>3 hops</option>
          <option value={4}>4 hops</option>
          <option value={5}>5 hops</option>
          <option value={6}>6 hops</option>
          <option value={8}>8 hops</option>
          <option value={10}>10 hops</option>
        </select>
      </div>

      <div className="path-options__group">
        <label className="path-options__label">Direction</label>
        <select
          className="path-options__select"
          value={options.direction}
          onChange={(e) => handleChange('direction', e.target.value)}
        >
          <option value="any">Any</option>
          <option value="outgoing">Outgoing only</option>
          <option value="incoming">Incoming only</option>
        </select>
      </div>

      <div className="path-options__group">
        <label className="path-options__label">Limit</label>
        <select
          className="path-options__select"
          value={options.limit}
          onChange={(e) => handleChange('limit', parseInt(e.target.value))}
        >
          <option value={5}>5 paths</option>
          <option value={10}>10 paths</option>
          <option value={20}>20 paths</option>
          <option value={50}>50 paths</option>
        </select>
      </div>
    </div>
  );
};

export default PathOptions;
