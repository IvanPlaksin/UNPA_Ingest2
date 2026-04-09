import React from 'react';
import { SIMILARITY_METHODS } from '../../../services/nexus.service';

/**
 * Similarity method selector (structural/properties/hybrid).
 */
const SimilarityMethod = ({ selectedMethod, onChange }) => {
  const methods = Object.values(SIMILARITY_METHODS);
  const selected = SIMILARITY_METHODS[selectedMethod];

  return (
    <div className="similarity-method">
      <div className="similarity-method__options">
        {methods.map(method => (
          <button
            key={method.id}
            className={`similarity-method__btn ${selectedMethod === method.id ? 'similarity-method__btn--selected' : ''}`}
            onClick={() => onChange(method.id)}
          >
            <span className="similarity-method__btn-icon">{method.icon}</span>
            <span className="similarity-method__btn-name">{method.name}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="similarity-method__description">
          <span className="similarity-method__info-icon">{'\u2139\uFE0F'}</span>
          <span>{selected.description}</span>
        </div>
      )}
    </div>
  );
};

export default SimilarityMethod;
