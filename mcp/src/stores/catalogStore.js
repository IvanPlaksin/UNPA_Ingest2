import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * Tool Catalog Store — state management for GXE Tool Catalog
 *
 * Data source: MCP Registry via /api/v1/tool-catalog
 *
 * 4-Level Hierarchy:
 *   Level 1 — Primitives: core data operations (get/set, merge, filter)
 *   Level 2 — Domain: text, extraction, vector, graph, ai, data, catalog, control
 *   Level 3 — Patterns: composite tools (RAG, pipeline, map-reduce)
 *   Level 4 — Meta: tool creation, introspection, optimization
 */

const LEVEL_META = {
  1: { label: 'Primitives', description: 'Core data operations', color: '#9ca3af' },
  2: { label: 'Domain', description: 'Specialized tools per domain', color: '#60a5fa' },
  3: { label: 'Patterns', description: 'Composite execution patterns', color: '#fbbf24' },
  4: { label: 'Meta', description: 'Tool creation & introspection', color: '#fb7185' },
};

// Fallback categories matching MCP schema enum
const TOOL_CATEGORIES = [
  { id: 'primitive', name: 'Primitives', emoji: '⚙️', color: '#9ca3af', level: 1,
    description: 'Core data operations: get/set, merge, filter, aggregate' },
  { id: 'text', name: 'Text', emoji: '📝', color: '#60a5fa', level: 2,
    description: 'Text processing: chunk, tokenize, normalize, sanitize' },
  { id: 'extraction', name: 'Extraction', emoji: '🔬', color: '#f472b6', level: 2,
    description: 'Data extraction: entities, relations, topics, sentiment' },
  { id: 'vector', name: 'Vector', emoji: '🔍', color: '#2dd4bf', level: 2,
    description: 'Embeddings, similarity, semantic search, clustering' },
  { id: 'graph', name: 'Graph', emoji: '🔷', color: '#60a5fa', level: 2,
    description: 'Graph CRUD, query, traversal, community detection' },
  { id: 'ai', name: 'AI', emoji: '🧠', color: '#a78bfa', level: 2,
    description: 'LLM chat, completion, summarization, classification' },
  { id: 'control', name: 'Control', emoji: '⚡', color: '#22d3ee', level: 2,
    description: 'Control flow, orchestration, events' },
  { id: 'pattern', name: 'Patterns', emoji: '🔗', color: '#fbbf24', level: 3,
    description: 'Composite: RAG, map-reduce, parallel, pipeline, retry' },
  { id: 'meta', name: 'Meta', emoji: '🎯', color: '#fb7185', level: 4,
    description: 'Meta-tools: create, compose, introspect, optimize' },
  { id: 'data', name: 'Data', emoji: '📥', color: '#fbbf24', level: 2,
    description: 'MSSQL connectors, schema discovery, data import' },
  { id: 'catalog', name: 'Catalog', emoji: '📚', color: '#818cf8', level: 2,
    description: 'Graph catalog, tool catalog, versioning, reuse' },
];

const initialState = {
  // === UI STATE ===
  isOpen: false,
  position: { x: 100, y: 100 },
  size: { width: 420, height: 600 },
  isPinned: false,

  // === FILTER STATE ===
  searchQuery: '',
  selectedCategory: null,
  selectedLevel: null,       // 1 | 2 | 3 | 4 | null (all)
  selectedTool: null,
  expandedCategories: [],

  // === DATA (loaded from MCP Registry via API) ===
  categories: TOOL_CATEGORIES,
  tools: [],
  loading: false,
  error: null,
  dataSource: 'fallback', // 'fallback' | 'mcp-registry'

  // === USAGE TRACKING ===
  recentTools: [],
  pinnedTools: [],
};

export const useCatalogStore = create(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // ── UI Actions ──────────────────────────────────────
        toggle: () => set(s => ({ isOpen: !s.isOpen }), false, 'toggle'),
        open: () => set({ isOpen: true }, false, 'open'),
        close: () => set({ isOpen: false }, false, 'close'),
        setPosition: (position) => set({ position }, false, 'setPosition'),
        setSize: (size) => set({ size }, false, 'setSize'),
        togglePin: () => set(s => ({ isPinned: !s.isPinned }), false, 'togglePin'),

        // ── Filter Actions ──────────────────────────────────
        setSearchQuery: (searchQuery) => set({ searchQuery }, false, 'setSearchQuery'),
        selectCategory: (selectedCategory) => set({ selectedCategory }, false, 'selectCategory'),
        selectLevel: (selectedLevel) => set({ selectedLevel }, false, 'selectLevel'),
        selectTool: (selectedTool) => set({ selectedTool }, false, 'selectTool'),

        toggleCategory: (catId) => set(s => ({
          expandedCategories: s.expandedCategories.includes(catId)
            ? s.expandedCategories.filter(id => id !== catId)
            : [...s.expandedCategories, catId]
        }), false, 'toggleCategory'),

        clearFilters: () => set({
          searchQuery: '',
          selectedCategory: null,
          selectedLevel: null,
          selectedTool: null,
        }, false, 'clearFilters'),

        // ── Usage Actions ───────────────────────────────────
        pinTool: (toolId) => set(s => ({
          pinnedTools: s.pinnedTools.includes(toolId)
            ? s.pinnedTools
            : [...s.pinnedTools, toolId]
        }), false, 'pinTool'),

        unpinTool: (toolId) => set(s => ({
          pinnedTools: s.pinnedTools.filter(id => id !== toolId)
        }), false, 'unpinTool'),

        togglePinTool: (toolId) => {
          const { pinnedTools } = get();
          if (pinnedTools.includes(toolId)) {
            set({ pinnedTools: pinnedTools.filter(id => id !== toolId) }, false, 'unpinTool');
          } else {
            set({ pinnedTools: [...pinnedTools, toolId] }, false, 'pinTool');
          }
        },

        addRecentTool: (toolId) => set(s => ({
          recentTools: [toolId, ...s.recentTools.filter(id => id !== toolId)].slice(0, 10)
        }), false, 'addRecentTool'),

        // ── Data Loading ────────────────────────────────────
        loadCatalog: async () => {
          const { tools } = get();
          if (tools.length > 0 && get().dataSource !== 'fallback') return;

          set({ loading: true, error: null }, false, 'loadCatalog/start');
          try {
            const res = await fetch('/api/v1/tool-catalog');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            set({
              categories: data.categories?.length ? data.categories : TOOL_CATEGORIES,
              tools: data.tools || [],
              loading: false,
              dataSource: data.meta?.source || 'mcp-registry',
            }, false, 'loadCatalog/success');
          } catch (error) {
            set({
              loading: false,
              error: error.message,
              dataSource: 'fallback',
            }, false, 'loadCatalog/error');
          }
        },

        setFallbackTools: (tools) => set({
          tools,
          dataSource: 'fallback',
        }, false, 'setFallbackTools'),

        // ── Computed Getters ────────────────────────────────
        getFilteredTools: () => {
          const { tools, searchQuery, selectedCategory, selectedLevel } = get();
          return tools.filter(t => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
              t.name.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q) ||
              t.tags?.some(tag => tag.toLowerCase().includes(q)) ||
              t.executorId?.toLowerCase().includes(q);
            const matchesCategory = !selectedCategory || t.category === selectedCategory;
            const matchesLevel = !selectedLevel || t.level === selectedLevel;
            return matchesSearch && matchesCategory && matchesLevel;
          });
        },

        getToolsByCategory: (catId) => {
          const { tools, searchQuery, selectedLevel } = get();
          const q = searchQuery.toLowerCase();
          return tools.filter(t => {
            const matchesCategory = t.category === catId;
            const matchesSearch = !searchQuery ||
              t.name.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q) ||
              t.tags?.some(tag => tag.toLowerCase().includes(q)) ||
              t.executorId?.toLowerCase().includes(q);
            const matchesLevel = !selectedLevel || t.level === selectedLevel;
            return matchesCategory && matchesSearch && matchesLevel;
          });
        },

        getToolById: (toolId) => {
          return get().tools.find(t => t.id === toolId) || null;
        },

        getCategoryById: (catId) => {
          return get().categories.find(c => c.id === catId) || null;
        },

        getPinnedToolObjects: () => {
          const { tools, pinnedTools } = get();
          return pinnedTools
            .map(id => tools.find(t => t.id === id))
            .filter(Boolean);
        },

        getRecentToolObjects: () => {
          const { tools, recentTools } = get();
          return recentTools
            .map(id => tools.find(t => t.id === id))
            .filter(Boolean);
        },

        // ── Reset ───────────────────────────────────────────
        reset: () => set(initialState, false, 'reset'),
      }),
      {
        name: 'gxe-tool-catalog',
        partialize: (state) => ({
          position: state.position,
          size: state.size,
          isPinned: state.isPinned,
          pinnedTools: state.pinnedTools,
          recentTools: state.recentTools,
          expandedCategories: state.expandedCategories,
        }),
      }
    ),
    { name: 'CatalogStore' }
  )
);

export { TOOL_CATEGORIES, LEVEL_META };
