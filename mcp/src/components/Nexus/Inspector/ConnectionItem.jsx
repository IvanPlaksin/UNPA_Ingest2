import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

/**
 * Single connection/edge item
 */
const ConnectionItem = ({ edge, direction, onNodeClick }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);

  const connectedNode = direction === 'incoming'
    ? edge.sourceNode || { id: edge.source, name: edge.source }
    : edge.targetNode || { id: edge.target, name: edge.target };

  const edgeType = edge.type || edge.label || edge.relationship || 'RELATES_TO';

  const getEdgeTypeColor = (type) => {
    const colors = {
      'DEPENDS_ON': '#ef4444', 'USES': '#3b82f6', 'CALLS': '#22c55e',
      'PRODUCES': '#f59e0b', 'CONTAINS': '#8b5cf6', 'IMPLEMENTS': '#06b6d4',
      'EXTENDS': '#ec4899', 'REFERENCES': '#64748b',
    };
    return colors[type?.toUpperCase()] || '#64748b';
  };

  const handleMouseEnter = () => setHighlight([connectedNode.id], 'outline', '#6366f1');
  const handleMouseLeave = () => setHighlight([], 'glow', '#6366f1');
  const handleClick = () => onNodeClick?.(connectedNode);

  return (
    <div
      className="connection-item"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <span className={`connection-item__direction connection-item__direction--${direction}`}>
        {direction === 'incoming' ? '←' : '→'}
      </span>

      <span
        className="connection-item__type"
        style={{
          backgroundColor: `${getEdgeTypeColor(edgeType)}20`,
          color: getEdgeTypeColor(edgeType),
        }}
      >
        {edgeType}
      </span>

      <span className="connection-item__node">
        {connectedNode.name || connectedNode.label || connectedNode.id}
      </span>

      <span className="connection-item__navigate">›</span>
    </div>
  );
};

export default ConnectionItem;
