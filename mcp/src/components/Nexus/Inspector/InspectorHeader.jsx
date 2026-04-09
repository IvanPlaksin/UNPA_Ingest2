import React from 'react';

/**
 * Header section of Node Inspector
 */
const InspectorHeader = ({ node, onClose }) => {
  const getTypeIcon = (type) => {
    const icons = {
      'CLASS': '📦', 'METHOD': '⚙️', 'PROPERTY': '📎',
      'INTERFACE': '🔌', 'ENUM': '📋', 'FILE': '📄',
      'MODULE': '📁', 'SUBGRAPH': '🗂️', 'CONCEPT': '💡',
      'PROCESS': '🔄', 'ENTITY': '🏷️', 'SERVICE': '🔧',
      'COMPONENT': '🧩', 'DATABASE': '🗄️',
    };
    return icons[type?.toUpperCase()] || '📄';
  };

  const getLayerColor = (layer) => {
    const colors = {
      'Strategic': '#f59e0b',
      'Business': '#3b82f6',
      'Code': '#22c55e',
    };
    return colors[layer] || '#64748b';
  };

  const name = node.name || node.label || node.id;
  const type = node.type || 'Unknown';
  const layer = node.layer || 'Unknown';
  const degree = node.degree ?? (node.inDegree || 0) + (node.outDegree || 0);

  return (
    <div className="inspector-header">
      <button className="inspector-header__close" onClick={onClose} title="Close inspector">
        ✕
      </button>

      <div className="inspector-header__icon">
        {getTypeIcon(type)}
      </div>

      <div className="inspector-header__info">
        <h2 className="inspector-header__name" title={name}>{name}</h2>
        <div className="inspector-header__meta">
          <span className="inspector-header__type">{type}</span>
          <span className="inspector-header__separator">•</span>
          <span className="inspector-header__layer" style={{ color: getLayerColor(layer) }}>
            {layer} Layer
          </span>
        </div>
        <div className="inspector-header__stats">
          <span className="inspector-header__connections">
            {degree} connection{degree !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

export default InspectorHeader;
