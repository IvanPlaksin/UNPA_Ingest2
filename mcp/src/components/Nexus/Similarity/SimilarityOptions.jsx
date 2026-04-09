import React from 'react';

/**
 * Similarity search options (limit, sameType, sameLayer).
 */
const SimilarityOptions = ({ options, onChange }) => {
  const handleChange = (key, value) => {
    onChange?.({ ...options, [key]: value });
  };

  return (
    <div className="similarity-options">
      <div className="similarity-options__group">
        <label className="similarity-options__label">Limit</label>
        <select
          className="similarity-options__select"
          value={options.limit}
          onChange={(e) => handleChange('limit', parseInt(e.target.value))}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>

      <div className="similarity-options__group similarity-options__group--checkbox">
        <label className="similarity-options__checkbox">
          <input
            type="checkbox"
            checked={options.sameTypeOnly}
            onChange={(e) => handleChange('sameTypeOnly', e.target.checked)}
          />
          <span>Same type only</span>
        </label>
      </div>

      <div className="similarity-options__group similarity-options__group--checkbox">
        <label className="similarity-options__checkbox">
          <input
            type="checkbox"
            checked={options.sameLayerOnly}
            onChange={(e) => handleChange('sameLayerOnly', e.target.checked)}
          />
          <span>Same layer</span>
        </label>
      </div>
    </div>
  );
};

export default SimilarityOptions;
