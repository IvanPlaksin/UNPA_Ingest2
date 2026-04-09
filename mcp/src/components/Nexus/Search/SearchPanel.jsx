import React, { useState, useCallback, useMemo } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { searchGraph, searchNodesClientSide } from '../../../services/nexus.service';
import SearchInput from './SearchInput';
import SearchModeSelector from './SearchModeSelector';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';
import './SearchPanel.css';

/**
 * Advanced Search Panel
 */
const SearchPanel = ({
  nodes = [],
  embeddingsAvailable = false,
  onResultClick,
  onResultNavigate,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('text');
  const [filters, setFilters] = useState({ types: [], layers: [] });
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const namespace = useNexusStore(state => state.namespace);
  const selectAndFocus = useNexusStore(state => state.selectAndFocus);
  const setHighlight = useNexusStore(state => state.setHighlight);

  const filterOptions = useMemo(() => {
    const types = new Set();
    const layers = new Set();

    nodes.forEach(node => {
      if (node.type) types.add(node.type);
      if (node.layer) layers.add(node.layer);
    });

    return {
      types: Array.from(types).sort(),
      layers: Array.from(layers).sort(),
    };
  }, [nodes]);

  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiResult = await searchGraph(namespace, searchQuery, {
        mode,
        types: filters.types,
        layers: filters.layers,
        limit: 20,
      });

      if (apiResult.fallback || apiResult.error) {
        const clientResults = searchNodesClientSide(nodes, searchQuery, {
          types: filters.types,
          layers: filters.layers,
          limit: 20,
        });
        setResults(clientResults);
      } else {
        setResults(apiResult.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [namespace, mode, filters, nodes]);

  const handleSearch = useCallback((searchQuery) => {
    setQuery(searchQuery);
    performSearch(searchQuery);
  }, [performSearch]);

  const handleResultClick = useCallback((node) => {
    setHighlight([node.id], 'glow', '#6366f1');
    onResultClick?.(node);
  }, [setHighlight, onResultClick]);

  const handleResultNavigate = useCallback((node) => {
    selectAndFocus([node.id]);
    onResultNavigate?.(node);
  }, [selectAndFocus, onResultNavigate]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(newFilters);
    if (query) {
      setTimeout(() => performSearch(query), 100);
    }
  }, [query, performSearch]);

  return (
    <div className="search-panel">
      {onClose && (
        <div className="search-panel__header">
          <h3 className="search-panel__title">🔍 Search</h3>
          <button className="search-panel__close" onClick={onClose}>✕</button>
        </div>
      )}

      <SearchInput
        value={query}
        onChange={setQuery}
        onSubmit={handleSearch}
        onClear={handleClear}
        autoFocus
      />

      <SearchModeSelector
        selectedMode={mode}
        onChange={setMode}
        embeddingsAvailable={embeddingsAvailable}
      />

      <SearchFilters
        filters={filters}
        onChange={handleFiltersChange}
        availableTypes={filterOptions.types}
        availableLayers={filterOptions.layers}
        isCollapsed={filtersCollapsed}
        onToggle={() => setFiltersCollapsed(!filtersCollapsed)}
      />

      <SearchResults
        results={results}
        loading={loading}
        error={error}
        query={query}
        onResultClick={handleResultClick}
        onResultNavigate={handleResultNavigate}
      />
    </div>
  );
};

export default SearchPanel;
