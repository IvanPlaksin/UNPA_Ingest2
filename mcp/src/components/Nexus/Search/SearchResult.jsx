import React from 'react';
import { useNexusStore } from '../../../stores/nexusStore';

/**
 * Single search result item
 */
const SearchResult = ({ result, onClick, onNavigate }) => {
  const setHighlight = useNexusStore(state => state.setHighlight);

  const { node, score, snippet, highlights = [] } = result;

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

  const getLayerColor = (layer) => {
    const colors = {
      'Strategic': '#f59e0b',
      'Business': '#3b82f6',
      'Code': '#22c55e',
    };
    return colors[layer] || '#64748b';
  };

  const highlightText = (text) => {
    if (!text || highlights.length === 0) return text;

    let marked = text;
    highlights.forEach(term => {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      marked = marked.replace(regex, '**$1**');
    });

    const parts = marked.split(/\*\*([^*]+)\*\*/);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <mark key={index} className="search-result__highlight">{part}</mark>;
      }
      return part;
    });
  };

  const handleMouseEnter = () => {
    setHighlight([node.id], 'outline', '#6366f1');
  };

  const handleMouseLeave = () => {
    setHighlight([], 'outline', '#6366f1');
  };

  const handleClick = () => {
    setHighlight([node.id], 'glow', '#6366f1');
    onClick?.(node);
  };

  const handleNavigate = (e) => {
    e.stopPropagation();
    onNavigate?.(node);
  };

  const name = node.name || node.label || node.id;
  const scorePercent = Math.round(score * 100);

  return (
    <div
      className="search-result"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className="search-result__icon">
        {getTypeIcon(node.type)}
      </div>

      <div className="search-result__content">
        <div className="search-result__header">
          <span className="search-result__name">{highlightText(name)}</span>
          <span className="search-result__score">{scorePercent}%</span>
        </div>

        <div className="search-result__meta">
          <span className="search-result__type">{node.type}</span>
          {node.layer && (
            <>
              <span className="search-result__separator">•</span>
              <span
                className="search-result__layer"
                style={{ color: getLayerColor(node.layer) }}
              >
                {node.layer}
              </span>
            </>
          )}
        </div>

        {snippet && (
          <div className="search-result__snippet">
            {highlightText(snippet)}
          </div>
        )}
      </div>

      <button
        className="search-result__navigate"
        onClick={handleNavigate}
        title="Focus on canvas"
      >
        →
      </button>
    </div>
  );
};

export default SearchResult;
