import React, { useState } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

/**
 * Single path result display
 */
const PathResult = ({ path, index, onShow, onNodeClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const setHighlight = useNexusStore(state => state.setHighlight);
  const addVisualCluster = useNexusStore(state => state.addVisualCluster);

  const nodes = path.nodes || [];
  const edges = path.edges || [];
  const length = nodes.length - 1;

  const getPreview = () => {
    if (nodes.length <= 4) {
      return nodes.map(n => n.name || n.label || n.id).join(' → ');
    }

    const first = nodes.slice(0, 2).map(n => n.name || n.label || n.id);
    const last = nodes[nodes.length - 1].name || nodes[nodes.length - 1].label || nodes[nodes.length - 1].id;
    return `${first.join(' → ')} → ... → ${last}`;
  };

  const handleShow = () => {
    const nodeIds = nodes.map(n => n.id);

    setHighlight(nodeIds, 'glow', '#f59e0b');

    addVisualCluster({
      id: `path-${index}`,
      nodeIds,
      color: '#f59e0b',
      label: `Path ${index + 1}`,
      opacity: 0.15,
    });

    onShow?.(path);
  };

  const handleMouseEnter = () => {
    const nodeIds = nodes.map(n => n.id);
    setHighlight(nodeIds, 'outline', '#f59e0b');
  };

  const handleMouseLeave = () => {
    setHighlight([], 'outline', '#f59e0b');
  };

  return (
    <div
      className="path-result"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="path-result__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="path-result__info">
          <span className="path-result__title">Path {index + 1}</span>
          <span className="path-result__length">({length} hop{length !== 1 ? 's' : ''})</span>
        </div>

        <div className="path-result__actions">
          <button
            className="path-result__show-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleShow();
            }}
            title="Highlight path on canvas"
          >
            Show →
          </button>
          <span className="path-result__expand">
            {isExpanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      <div className="path-result__preview">
        {getPreview()}
      </div>

      {isExpanded && (
        <div className="path-result__expanded">
          <div className="path-result__nodes">
            {nodes.map((node, nodeIndex) => (
              <React.Fragment key={node.id}>
                <div
                  className="path-result__node"
                  onClick={() => onNodeClick?.(node)}
                >
                  <span className="path-result__node-icon">
                    {getTypeIcon(node.type)}
                  </span>
                  <span className="path-result__node-name">
                    {node.name || node.label || node.id}
                  </span>
                  <span className="path-result__node-type">
                    {node.type}
                  </span>
                </div>

                {nodeIndex < nodes.length - 1 && edges[nodeIndex] && (
                  <div className="path-result__edge">
                    <span className="path-result__edge-arrow">↓</span>
                    <span className="path-result__edge-type">
                      {edges[nodeIndex].type || edges[nodeIndex].label || 'RELATES_TO'}
                    </span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const getTypeIcon = (type) => {
  const icons = {
    'CLASS': '📦',
    'METHOD': '⚙️',
    'FILE': '📄',
    'MODULE': '📁',
    'SERVICE': '🔧',
    'COMPONENT': '🧩',
  };
  return icons[type?.toUpperCase()] || '📄';
};

export default PathResult;
