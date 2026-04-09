/**
 * SearchPanel — GXE floating search panel.
 *
 * Migrated from Nexus/Search (CONS-07).
 * Standalone: no nexusStore dependency.
 * Supports text / semantic / hybrid modes.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Search, X, ArrowRight, Type, Brain, Layers,
  Filter, ChevronDown, ChevronRight, Loader2,
  FileText, Box, Settings, Puzzle, Database, Globe,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import api from '../../../services/api';

// ── Search modes ──
const MODES = [
  { id: 'text',     name: 'Text',     icon: Type,   desc: 'Exact and fuzzy text matching',          needsEmbed: false },
  { id: 'semantic', name: 'Semantic', icon: Brain,  desc: 'AI-powered meaning-based search',        needsEmbed: true  },
  { id: 'hybrid',   name: 'Hybrid',   icon: Layers, desc: 'Combined text + semantic (best results)', needsEmbed: true  },
];

// ── Type icons ──
const TYPE_ICON = {
  CLASS: Box, METHOD: Settings, PROPERTY: FileText, INTERFACE: Puzzle,
  FILE: FileText, MODULE: Database, SERVICE: Globe, COMPONENT: Puzzle,
  ENTITY: Database, CONCEPT: Brain, PROCESS: ArrowRight,
};

const LAYER_COLORS = {
  Strategic: '#f59e0b', Business: '#3b82f6', Code: '#22c55e',
};

// ── Client-side fallback search ──
function clientSearch(nodes, query, { types = [], layers = [], limit = 20 } = {}) {
  if (!query?.trim()) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return nodes
    .map(node => {
      if (types.length > 0 && !types.includes(node.type)) return null;
      if (layers.length > 0 && !layers.includes(node.layer)) return null;

      const name = (node.data?.label || node.name || node.id || '').toLowerCase();
      const desc = (node.data?.description || node.description || '').toLowerCase();
      const type = (node.type || '').toLowerCase();

      let score = 0;
      for (const t of terms) {
        if (name.includes(t)) score += name === t ? 1.0 : 0.7;
        if (desc.includes(t)) score += 0.3;
        if (type.includes(t)) score += 0.2;
      }
      if (score === 0) return null;

      return {
        node: { id: node.id, name: node.data?.label || node.name || node.id, type: node.type, layer: node.layer },
        score: Math.min(score / terms.length, 1.0),
        snippet: desc.slice(0, 120) || null,
        highlights: terms,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── SearchResult item ──
const SearchResultItem = ({ result, onNavigate }) => {
  const { node, score, snippet, highlights = [] } = result;
  const Icon = TYPE_ICON[node.type?.toUpperCase()] || FileText;
  const layerColor = LAYER_COLORS[node.layer] || '#64748b';
  const pct = Math.round(score * 100);

  const highlightText = (text) => {
    if (!text || highlights.length === 0) return text;
    let marked = text;
    highlights.forEach(term => {
      const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      marked = marked.replace(re, '|||$1|||');
    });
    return marked.split('|||').map((part, i) =>
      i % 2 === 1
        ? <mark key={i} className="bg-amber-500/30 text-amber-200 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div
      className="flex items-start gap-2 p-2 rounded-md hover:bg-[#30363d] cursor-pointer transition-colors group"
      onClick={() => onNavigate?.(node)}
    >
      <Icon size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-200 truncate">{highlightText(node.name)}</span>
          <span className="text-[10px] text-gray-500 tabular-nums">{pct}%</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-gray-500">{node.type}</span>
          {node.layer && (
            <>
              <span className="text-[10px] text-gray-600">&middot;</span>
              <span className="text-[10px]" style={{ color: layerColor }}>{node.layer}</span>
            </>
          )}
        </div>
        {snippet && (
          <p className="text-[10px] text-gray-500 mt-1 line-clamp-1">{highlightText(snippet)}</p>
        )}
      </div>
      <button
        className="p-1 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-300 hover:bg-[#21262d] transition-all"
        onClick={(e) => { e.stopPropagation(); onNavigate?.(node); }}
        title="Focus on canvas"
      >
        <ArrowRight size={12} />
      </button>
    </div>
  );
};

// ── Main SearchPanel ──
const SearchPanel = ({ nodes = [], embeddingsAvailable = false, namespace = 'GXE', onNavigate, onClose }) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('text');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterLayers, setFilterLayers] = useState([]);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Available filter options from nodes
  const filterOptions = useMemo(() => {
    const types = new Set();
    const layers = new Set();
    nodes.forEach(n => {
      if (n.type) types.add(n.type);
      if (n.layer) layers.add(n.layer);
    });
    return { types: [...types].sort(), layers: [...layers].sort() };
  }, [nodes]);

  // Search execution
  const performSearch = useCallback(async (q) => {
    if (!q?.trim()) { setResults([]); return; }
    setLoading(true);
    setError(null);

    try {
      const resp = await api.post('/subgraph/search', {
        namespace, query: q, mode,
        filters: {
          types: filterTypes.length > 0 ? filterTypes : undefined,
          layers: filterLayers.length > 0 ? filterLayers : undefined,
        },
        limit: 20,
      });
      const data = resp.data;
      if (data.fallback || data.error) {
        setResults(clientSearch(nodes, q, { types: filterTypes, layers: filterLayers }));
      } else {
        setResults(data.results || []);
      }
    } catch {
      // API unavailable — client-side fallback
      setResults(clientSearch(nodes, q, { types: filterTypes, layers: filterLayers }));
    } finally {
      setLoading(false);
    }
  }, [namespace, mode, filterTypes, filterLayers, nodes]);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(val), 300);
  }, [performSearch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current);
      performSearch(query);
    } else if (e.key === 'Escape') {
      if (query) { setQuery(''); setResults([]); }
      else onClose?.();
    }
  }, [query, performSearch, onClose]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    inputRef.current?.focus();
  }, []);

  // Re-search when filters change
  useEffect(() => {
    if (query) performSearch(query);
  }, [mode, filterTypes, filterLayers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus
  useEffect(() => { inputRef.current?.focus(); }, []);

  const toggleFilterType = (type) =>
    setFilterTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  const toggleFilterLayer = (layer) =>
    setFilterLayers(prev => prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]);

  const activeFilterCount = filterTypes.length + filterLayers.length;

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] focus-within:border-[#58a6ff] transition-colors">
          <Search size={13} className="text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes, content, relationships..."
          />
          {query && (
            <button onClick={handleClear} className="text-gray-500 hover:text-gray-300">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex items-center gap-1 px-3 pb-2">
        {MODES.map(m => {
          const MIcon = m.icon;
          const disabled = m.needsEmbed && !embeddingsAvailable;
          const selected = mode === m.id;
          return (
            <button
              key={m.id}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                selected
                  ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30'
                  : disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-300'
              }`}
              onClick={() => !disabled && setMode(m.id)}
              disabled={disabled}
              title={disabled ? 'Requires embeddings' : m.desc}
            >
              <MIcon size={11} />
              {m.name}
              {disabled && <span className="text-[8px] bg-gray-700 px-1 rounded">AI</span>}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Filter toggle */}
        <button
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            showFilters ? 'bg-[#30363d] text-gray-200' : 'text-gray-500 hover:text-gray-300'
          }`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={11} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[#58a6ff] text-white text-[8px] px-1 rounded-full">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-3 pb-2 border-b border-[#21262d]">
          {filterOptions.types.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Type</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {filterOptions.types.map(t => (
                  <button
                    key={t}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      filterTypes.includes(t)
                        ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30'
                        : 'bg-[#21262d] text-gray-400 hover:text-gray-300'
                    }`}
                    onClick={() => toggleFilterType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {filterOptions.layers.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Layer</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {filterOptions.layers.map(l => (
                  <button
                    key={l}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      filterLayers.includes(l)
                        ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30'
                        : 'bg-[#21262d] text-gray-400 hover:text-gray-300'
                    }`}
                    onClick={() => toggleFilterLayer(l)}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: LAYER_COLORS[l] || '#64748b' }} />
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-xs">
            <Loader2 size={14} className="animate-spin" />
            Searching...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 text-red-400 text-xs">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {!loading && !error && query && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-500 text-xs text-center">
            <Search size={20} className="text-gray-600" />
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="text-[10px] text-gray-500 mb-2">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            {results.map((r, i) => (
              <SearchResultItem
                key={r.node?.id || i}
                result={r}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}

        {!query && !loading && (
          <div className="flex flex-col items-center gap-2 py-8 text-gray-500 text-xs text-center">
            <Search size={24} className="text-gray-600" />
            Type to search graph nodes
            <span className="text-[10px] text-gray-600">Enter to submit &middot; Esc to clear</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
