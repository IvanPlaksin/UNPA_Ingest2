import React from 'react';

/**
 * Prediction settings controls (topK, minScore, edgeType).
 */
const PredictionSettings = ({ settings, onChange, edgeTypes = [] }) => {
  const handleChange = (key, value) => {
    onChange?.({ ...settings, [key]: value });
  };

  return (
    <div className="prediction-settings">
      <div className="prediction-settings__group">
        <label className="prediction-settings__label">Top K</label>
        <select
          className="prediction-settings__select"
          value={settings.topK}
          onChange={(e) => handleChange('topK', parseInt(e.target.value))}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>

      <div className="prediction-settings__group">
        <label className="prediction-settings__label">Min Score</label>
        <select
          className="prediction-settings__select"
          value={settings.minScore}
          onChange={(e) => handleChange('minScore', parseFloat(e.target.value))}
        >
          <option value={0.3}>0.3 (Low)</option>
          <option value={0.5}>0.5 (Medium)</option>
          <option value={0.7}>0.7 (High)</option>
          <option value={0.9}>0.9 (Very High)</option>
        </select>
      </div>

      <div className="prediction-settings__group">
        <label className="prediction-settings__label">Edge Type</label>
        <select
          className="prediction-settings__select"
          value={settings.edgeType || 'all'}
          onChange={(e) => handleChange('edgeType', e.target.value === 'all' ? null : e.target.value)}
        >
          <option value="all">All Types</option>
          {edgeTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default PredictionSettings;
