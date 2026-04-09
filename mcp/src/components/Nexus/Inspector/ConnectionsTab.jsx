import React, { useState, useMemo } from 'react';
import ConnectionItem from './ConnectionItem';

/**
 * Connections tab showing incoming and outgoing edges
 */
const ConnectionsTab = ({ node, edges = [], allNodes = [], onNodeClick }) => {
  const [showAllIncoming, setShowAllIncoming] = useState(false);
  const [showAllOutgoing, setShowAllOutgoing] = useState(false);
  const [edgeTypeFilter, setEdgeTypeFilter] = useState('all');

  const { incoming, outgoing, edgeTypes } = useMemo(() => {
    const nodeId = node.id;
    const incomingEdges = [];
    const outgoingEdges = [];
    const types = new Set();

    edges.forEach(edge => {
      const edgeType = edge.type || edge.label || edge.relationship || 'RELATES_TO';
      types.add(edgeType);

      const sourceNode = allNodes.find(n => n.id === edge.source);
      const targetNode = allNodes.find(n => n.id === edge.target);

      if (edge.target === nodeId) {
        incomingEdges.push({ ...edge, sourceNode });
      }
      if (edge.source === nodeId) {
        outgoingEdges.push({ ...edge, targetNode });
      }
    });

    return {
      incoming: incomingEdges,
      outgoing: outgoingEdges,
      edgeTypes: Array.from(types).sort(),
    };
  }, [node.id, edges, allNodes]);

  const filteredIncoming = edgeTypeFilter === 'all'
    ? incoming
    : incoming.filter(e => (e.type || e.label || 'RELATES_TO') === edgeTypeFilter);

  const filteredOutgoing = edgeTypeFilter === 'all'
    ? outgoing
    : outgoing.filter(e => (e.type || e.label || 'RELATES_TO') === edgeTypeFilter);

  const PREVIEW_LIMIT = 5;
  const displayedIncoming = showAllIncoming ? filteredIncoming : filteredIncoming.slice(0, PREVIEW_LIMIT);
  const displayedOutgoing = showAllOutgoing ? filteredOutgoing : filteredOutgoing.slice(0, PREVIEW_LIMIT);

  return (
    <div className="connections-tab">
      {edgeTypes.length > 1 && (
        <div className="connections-tab__filter">
          <label>Filter by type:</label>
          <select value={edgeTypeFilter} onChange={(e) => setEdgeTypeFilter(e.target.value)}>
            <option value="all">All ({incoming.length + outgoing.length})</option>
            {edgeTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      )}

      {/* Incoming */}
      <div className="connections-section">
        <div className="connections-section__header">
          <span className="connections-section__title">← Incoming ({filteredIncoming.length})</span>
          {filteredIncoming.length > PREVIEW_LIMIT && (
            <button className="connections-section__toggle" onClick={() => setShowAllIncoming(!showAllIncoming)}>
              {showAllIncoming ? 'Show less' : `Show all ${filteredIncoming.length}`}
            </button>
          )}
        </div>
        {displayedIncoming.length > 0 ? (
          <div className="connections-list">
            {displayedIncoming.map((edge, index) => (
              <ConnectionItem key={`in-${edge.id || index}`} edge={edge} direction="incoming" onNodeClick={onNodeClick} />
            ))}
          </div>
        ) : (
          <div className="connections-section__empty">No incoming connections</div>
        )}
      </div>

      {/* Outgoing */}
      <div className="connections-section">
        <div className="connections-section__header">
          <span className="connections-section__title">→ Outgoing ({filteredOutgoing.length})</span>
          {filteredOutgoing.length > PREVIEW_LIMIT && (
            <button className="connections-section__toggle" onClick={() => setShowAllOutgoing(!showAllOutgoing)}>
              {showAllOutgoing ? 'Show less' : `Show all ${filteredOutgoing.length}`}
            </button>
          )}
        </div>
        {displayedOutgoing.length > 0 ? (
          <div className="connections-list">
            {displayedOutgoing.map((edge, index) => (
              <ConnectionItem key={`out-${edge.id || index}`} edge={edge} direction="outgoing" onNodeClick={onNodeClick} />
            ))}
          </div>
        ) : (
          <div className="connections-section__empty">No outgoing connections</div>
        )}
      </div>

      {incoming.length === 0 && outgoing.length === 0 && (
        <div className="connections-tab__empty">
          <span className="connections-tab__empty-text">This node has no connections</span>
        </div>
      )}
    </div>
  );
};

export default ConnectionsTab;
