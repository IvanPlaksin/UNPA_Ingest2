import React from 'react';

/**
 * Shows current context: selected nodes + graph stats.
 */
const ContextBar = ({ selectedNodes = [], graphStats = {} }) => {
  const hasSelection = selectedNodes.length > 0;

  return (
    <div className="assistant-context">
      <div className="assistant-context__stats">
        <span className="assistant-context__stat">
          {graphStats.nodeCount || 0} nodes
        </span>
        <span className="assistant-context__separator">|</span>
        <span className="assistant-context__stat">
          {graphStats.edgeCount || 0} edges
        </span>
      </div>

      {hasSelection && (
        <div className="assistant-context__selection">
          <span className="assistant-context__selection-icon">
            {selectedNodes.length > 1 ? '◈' : '◇'}
          </span>
          <span className="assistant-context__selection-text">
            {selectedNodes.length === 1
              ? (selectedNodes[0].name || selectedNodes[0].label || selectedNodes[0].id)
              : `${selectedNodes.length} nodes selected`}
          </span>
          {selectedNodes.length === 1 && selectedNodes[0].type && (
            <span className="assistant-context__selection-type">
              {selectedNodes[0].type}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextBar;
