import React, { useMemo } from 'react';
import NodeListItem from './NodeListItem';

/**
 * Scrollable list of nodes with sorting
 */
const NodeList = ({
  nodes,
  searchQuery,
  filters,
  selectedNodeId,
  onNodeClick,
  onNodeDoubleClick,
  sortBy = 'name',
  sortOrder = 'asc',
}) => {
  const filteredNodes = useMemo(() => {
    let result = [...nodes];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(node => {
        const name = (node.name || node.label || node.id || '').toLowerCase();
        const type = (node.type || '').toLowerCase();
        return name.includes(query) || type.includes(query);
      });
    }

    // Type filter
    if (filters?.type && filters.type !== 'all') {
      result = result.filter(node => node.type === filters.type);
    }

    // Layer filter
    if (filters?.layer && filters.layer !== 'all') {
      result = result.filter(node => node.layer === filters.layer);
    }

    // Degree filter
    if (filters?.degree && filters.degree !== 'any') {
      switch (filters.degree) {
        case 'hub':
          result = result.filter(node => (node.degree || 0) >= 10);
          break;
        case 'bridge':
          result = result.filter(node => node.isBridge);
          break;
        case 'orphan':
          result = result.filter(node => (node.degree || 0) === 0);
          break;
        case 'leaf':
          result = result.filter(node => (node.degree || 0) === 1);
          break;
      }
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'degree':
          comparison = (b.degree || 0) - (a.degree || 0);
          break;
        case 'type':
          comparison = (a.type || '').localeCompare(b.type || '');
          break;
        case 'layer':
          comparison = (a.layer || '').localeCompare(b.layer || '');
          break;
        case 'name':
        default: {
          const nameA = a.name || a.label || a.id || '';
          const nameB = b.name || b.label || b.id || '';
          comparison = nameA.localeCompare(nameB);
        }
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [nodes, searchQuery, filters, sortBy, sortOrder]);

  return (
    <div className="node-list">
      <div className="node-list__header">
        <span className="node-list__count">
          {filteredNodes.length} node{filteredNodes.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </span>
      </div>

      <div className="node-list__content">
        {filteredNodes.length > 0 ? (
          filteredNodes.map(node => (
            <NodeListItem
              key={node.id}
              node={node}
              isSelected={node.id === selectedNodeId}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
            />
          ))
        ) : (
          <div className="node-list__empty">
            {searchQuery
              ? `No nodes matching "${searchQuery}"`
              : 'No nodes match the current filters'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeList;
