import React, { useState } from 'react';

/**
 * Properties tab showing all node properties
 */
const PropertiesTab = ({ node }) => {
  const [expandedProps, setExpandedProps] = useState(new Set());

  const getProperties = () => {
    const excludeKeys = new Set([
      'id', 'position', 'data', 'type', 'width', 'height',
      'selected', 'dragging', 'positionAbsolute', 'sourcePosition',
      'targetPosition', 'draggable', 'selectable', 'connectable',
      'deletable', 'parentNode', 'extent', 'expandParent', 'style',
      'className', 'hidden', 'zIndex', 'ariaLabel', 'focusable',
      'name', 'label', 'layer', 'degree', 'inDegree', 'outDegree',
      'isBridge', 'edges', 'neighbors',
    ]);

    const props = [];

    if (node.data) {
      Object.entries(node.data).forEach(([key, value]) => {
        if (!excludeKeys.has(key) && value !== undefined && value !== null) {
          props.push({ key, value, source: 'data' });
        }
      });
    }

    Object.entries(node).forEach(([key, value]) => {
      if (!excludeKeys.has(key) && value !== undefined && value !== null && key !== 'data') {
        if (!props.find(p => p.key === key)) {
          props.push({ key, value, source: 'node' });
        }
      }
    });

    return props;
  };

  const properties = getProperties();

  const formatValue = (value) => {
    if (value === null || value === undefined) {
      return <span className="property-value--null">null</span>;
    }
    if (typeof value === 'boolean') {
      return <span className={`property-value--boolean property-value--${value}`}>{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span className="property-value--number">{value}</span>;
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return <span className="property-value--date" title={value}>{date.toLocaleString()}</span>;
        }
      }
      if (value.startsWith('http') || value.includes('/')) {
        return <span className="property-value--path" title={value}>{value}</span>;
      }
      return <span className="property-value--string">{value}</span>;
    }
    if (Array.isArray(value)) {
      return <span className="property-value--array">[{value.length} items]</span>;
    }
    if (typeof value === 'object') {
      return <span className="property-value--object">{'{...}'} ({Object.keys(value).length} keys)</span>;
    }
    return <span>{String(value)}</span>;
  };

  const toggleExpand = (key) => {
    const newExpanded = new Set(expandedProps);
    if (newExpanded.has(key)) newExpanded.delete(key);
    else newExpanded.add(key);
    setExpandedProps(newExpanded);
  };

  const isExpandable = (value) => {
    return (typeof value === 'object' && value !== null) || Array.isArray(value);
  };

  if (properties.length === 0) {
    return (
      <div className="properties-tab properties-tab--empty">
        <span className="properties-tab__empty-text">No properties available</span>
      </div>
    );
  }

  return (
    <div className="properties-tab">
      <div className="properties-list">
        {properties.map(({ key, value }) => (
          <div key={key} className={`property-item ${isExpandable(value) ? 'property-item--expandable' : ''}`}>
            <div className="property-item__header" onClick={() => isExpandable(value) && toggleExpand(key)}>
              <span className="property-item__key">{key}</span>
              {isExpandable(value) && (
                <span className="property-item__expand-icon">
                  {expandedProps.has(key) ? '▼' : '▶'}
                </span>
              )}
            </div>
            <div className="property-item__value">{formatValue(value)}</div>

            {isExpandable(value) && expandedProps.has(key) && (
              <div className="property-item__expanded">
                <pre className="property-item__json">{JSON.stringify(value, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PropertiesTab;
