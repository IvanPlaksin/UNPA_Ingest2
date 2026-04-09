import React from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';

/**
 * Individual node item in the list
 */
const NodeListItem = ({
  node,
  isSelected,
  onClick,
  onDoubleClick,
}) => {
  const setHighlight = useNexusStore(state => state.setHighlight);

  const getTypeIcon = (type) => {
    const icons = {
      'CLASS': '📦', 'METHOD': '⚙️', 'PROPERTY': '📎',
      'INTERFACE': '🔌', 'ENUM': '📋', 'FILE': '📄',
      'MODULE': '📁', 'SUBGRAPH': '🗂️', 'CONCEPT': '💡',
      'PROCESS': '🔄', 'ENTITY': '🏷️',
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

  const getRoleBadge = (node) => {
    if (node.degree >= 10) return { label: 'Hub', color: '#ef4444' };
    if (node.isBridge) return { label: 'Bridge', color: '#f59e0b' };
    if (node.degree === 0) return { label: 'Orphan', color: '#64748b' };
    if (node.degree === 1) return { label: 'Leaf', color: '#94a3b8' };
    return null;
  };

  const roleBadge = getRoleBadge(node);

  const handleMouseEnter = () => {
    setHighlight([node.id], 'outline', '#6366f1');
  };

  const handleMouseLeave = () => {
    if (!isSelected) {
      setHighlight([], 'glow', '#6366f1');
    }
  };

  return (
    <div
      className={`node-list-item ${isSelected ? 'node-list-item--selected' : ''}`}
      onClick={() => onClick?.(node)}
      onDoubleClick={() => onDoubleClick?.(node)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="node-list-item__icon">
        {getTypeIcon(node.type)}
      </span>

      <div className="node-list-item__content">
        <div className="node-list-item__name">{node.name || node.label || node.id}</div>
        <div className="node-list-item__meta">
          {node.layer && (
            <span className="node-list-item__layer" style={{ color: getLayerColor(node.layer) }}>
              {node.layer}
            </span>
          )}
          {roleBadge && (
            <span
              className="node-list-item__role"
              style={{ backgroundColor: `${roleBadge.color}20`, color: roleBadge.color }}
            >
              {roleBadge.label}
            </span>
          )}
        </div>
      </div>

      <div className="node-list-item__degree" title="Connections">
        <span>{node.degree ?? '?'}</span>
        <span className="node-list-item__degree-icon">↔</span>
      </div>
    </div>
  );
};

export default NodeListItem;
