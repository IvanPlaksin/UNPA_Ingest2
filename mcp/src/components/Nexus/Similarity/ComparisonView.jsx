import React from 'react';

/**
 * Side-by-side comparison of two nodes.
 */
const ComparisonView = ({ referenceNode, comparedNode, onClose }) => {
  if (!referenceNode || !comparedNode) return null;

  const compareValue = (refVal, compVal) => {
    if (refVal === compVal) return 'match';
    if (typeof refVal === 'number' && typeof compVal === 'number') {
      const diff = Math.abs(refVal - compVal);
      const max = Math.max(refVal, compVal);
      if (max > 0 && diff / max < 0.2) return 'similar';
    }
    return 'different';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'match': return '\u2713';
      case 'similar': return '~';
      case 'different': return '\u2717';
      default: return '?';
    }
  };

  const refName = referenceNode.name || referenceNode.label || referenceNode.id;
  const compName = comparedNode.name || comparedNode.label || comparedNode.id;

  const properties = [
    { label: 'Type', ref: referenceNode.type, comp: comparedNode.type },
    { label: 'Layer', ref: referenceNode.layer, comp: comparedNode.layer },
    { label: 'Degree', ref: referenceNode.degree ?? 0, comp: comparedNode.degree ?? 0 },
  ];

  return (
    <div className="comparison-view">
      <div className="comparison-view__header">
        <span className="comparison-view__title">Comparison</span>
        <button className="comparison-view__close" onClick={onClose}>{'\u2715'}</button>
      </div>

      <div className="comparison-view__names">
        <span className="comparison-view__name comparison-view__name--ref">{refName}</span>
        <span className="comparison-view__vs">vs</span>
        <span className="comparison-view__name comparison-view__name--comp">{compName}</span>
      </div>

      <div className="comparison-view__properties">
        {properties.map(prop => {
          const status = compareValue(prop.ref, prop.comp);
          return (
            <div key={prop.label} className="comparison-view__row">
              <span className="comparison-view__label">{prop.label}</span>
              <span className="comparison-view__value comparison-view__value--ref">
                {prop.ref ?? 'N/A'}
              </span>
              <span className={`comparison-view__status comparison-view__status--${status}`}>
                {getStatusIcon(status)}
              </span>
              <span className="comparison-view__value comparison-view__value--comp">
                {prop.comp ?? 'N/A'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ComparisonView;
