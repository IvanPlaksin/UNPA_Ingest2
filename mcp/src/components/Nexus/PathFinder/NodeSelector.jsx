import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Autocomplete node selector with search
 */
const NodeSelector = ({
  label,
  value,
  nodes = [],
  onChange,
  onClear,
  placeholder = 'Search nodes...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes.slice(0, 50);

    const query = searchQuery.toLowerCase();
    return nodes
      .filter(node => {
        const name = (node.name || node.label || node.id || '').toLowerCase();
        const type = (node.type || '').toLowerCase();
        return name.includes(query) || type.includes(query);
      })
      .slice(0, 50);
  }, [nodes, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (node) => {
    onChange?.(node);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onClear?.();
    setSearchQuery('');
  };

  const displayValue = value
    ? (value.name || value.label || value.id)
    : '';

  return (
    <div className={`node-selector ${disabled ? 'node-selector--disabled' : ''}`}>
      {label && (
        <label className="node-selector__label">{label}</label>
      )}

      <div className="node-selector__input-wrapper">
        {value ? (
          <div
            className="node-selector__selected"
            onClick={() => !disabled && setIsOpen(true)}
          >
            <span className="node-selector__selected-icon">
              {getTypeIcon(value.type)}
            </span>
            <span className="node-selector__selected-name">
              {displayValue}
            </span>
            <button
              className="node-selector__clear"
              onClick={handleClear}
              disabled={disabled}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="node-selector__search" ref={inputRef}>
            <span className="node-selector__search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {isOpen && !value && (
        <div ref={dropdownRef} className="node-selector__dropdown">
          {filteredNodes.length > 0 ? (
            <div className="node-selector__list">
              {filteredNodes.map(node => (
                <div
                  key={node.id}
                  className="node-selector__option"
                  onClick={() => handleSelect(node)}
                >
                  <span className="node-selector__option-icon">
                    {getTypeIcon(node.type)}
                  </span>
                  <span className="node-selector__option-name">
                    {node.name || node.label || node.id}
                  </span>
                  <span className="node-selector__option-type">
                    {node.type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="node-selector__empty">
              {searchQuery ? `No nodes matching "${searchQuery}"` : 'No nodes available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const getTypeIcon = (type) => {
  const icons = {
    'CLASS': '📦',
    'METHOD': '⚙️',
    'PROPERTY': '📎',
    'INTERFACE': '🔌',
    'FILE': '📄',
    'MODULE': '📁',
    'SUBGRAPH': '🗂️',
    'SERVICE': '🔧',
    'COMPONENT': '🧩',
    'ENTITY': '📊',
    'CONCEPT': '💡',
    'PROCESS': '▶️',
  };
  return icons[type?.toUpperCase()] || '📄';
};

export default NodeSelector;
