import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const initialState = {
  // === GRAPH DATA (ReactFlow) ===
  nodes: [],
  edges: [],

  // === SELECTION ===
  selectedIds: [],

  // === FILTERS ===
  filters: {
    namespace: null,
    entityTypes: [],
    searchQuery: '',
  },

  // === LAYOUT CONFIG ===
  layoutConfig: {
    algorithm: 'dagre', // 'dagre' | 'force' | 'stress'
    spacing: 80,
    clusterStrength: 0,
    edgeLength: 120,
    groupByType: false,
  },

  // === VIEW MODE ===
  viewMode: '2d', // '2d' | '3d'

  // === ASYNC FLAGS ===
  isLayouting: false,
  isLoading: false,
  isSavingLayout: false,
  lastLayoutSavedAt: null,

  // === INCREMENTAL STABILITY ===
  // Saved node positions to preserve across layout recomputes
  frozenPositions: {}, // { [nodeId]: { x, y } }
  isLayoutFrozen: false,

  // === LOD / VIEWPORT ===
  pyramidStatus:     null,   // {exists, levels, lastBuilt} | null
  viewportBbox:      null,   // {minX, minY, maxX, maxY} world coords
  lodLevel:          0,      // 0=entities, 1+=clusters
  viewportMeta:      null,   // meta from last viewport API response
  viewportNodes:     [],     // raw nodes from last viewport API response
  viewportEdges:     [],     // raw edges from last viewport API response
  isLoadingViewport: false,

  // === VISUAL CLUSTERS ===
  clusters: [], // [{ id, nodeIds, color, label, entityType }]
};

export const useEntityStore = create(
  devtools(
    (set, get) => ({
      ...initialState,

      // === GRAPH DATA ACTIONS ===
      setNodes: (nodes) => set({ nodes }, false, 'setNodes'),

      setEdges: (edges) => set({ edges }, false, 'setEdges'),

      setGraphData: (nodes, edges) => set({ nodes, edges }, false, 'setGraphData'),

      // === SELECTION ACTIONS ===
      setSelectedIds: (ids) => set({ selectedIds: ids }, false, 'setSelectedIds'),

      selectNode: (id, addToSelection = false) => set((state) => ({
        selectedIds: addToSelection
          ? [...new Set([...state.selectedIds, id])]
          : [id],
      }), false, 'selectNode'),

      clearSelection: () => set({ selectedIds: [] }, false, 'clearSelection'),

      // === FILTER ACTIONS ===
      updateFilters: (partial) => set((state) => ({
        filters: { ...state.filters, ...partial },
      }), false, 'updateFilters'),

      resetFilters: () => set({
        filters: initialState.filters,
      }, false, 'resetFilters'),

      // === LAYOUT CONFIG ACTIONS ===
      setLayoutConfig: (partial) => set((state) => ({
        layoutConfig: { ...state.layoutConfig, ...partial },
      }), false, 'setLayoutConfig'),

      setAlgorithm: (algorithm) => set((state) => ({
        layoutConfig: { ...state.layoutConfig, algorithm },
      }), false, 'setAlgorithm'),

      // === VIEW MODE ACTIONS ===
      setViewMode: (viewMode) => set({ viewMode }, false, 'setViewMode'),

      // === ASYNC FLAG ACTIONS ===
      setIsLayouting: (isLayouting) => set({ isLayouting }, false, 'setIsLayouting'),

      setIsLoading: (isLoading) => set({ isLoading }, false, 'setIsLoading'),

      setIsSavingLayout: (v) => set({ isSavingLayout: v }, false, 'setIsSavingLayout'),

      // === LAYOUT PERSISTENCE (knowledge base) ===
      saveLayoutToKB: async (namespace) => {
        if (!namespace) return;
        const { nodes, layoutConfig } = get();
        const positions = Object.fromEntries(nodes.map(n => [n.id, n.position]));
        const { algorithm, ...config } = layoutConfig;
        set({ isSavingLayout: true }, false, 'saveLayoutToKB:start');
        try {
          const { saveLayout } = await import('../services/entityStore.service');
          const result = await saveLayout(namespace, { algorithm, positions, config });
          set({ isSavingLayout: false, lastLayoutSavedAt: result.savedAt }, false, 'saveLayoutToKB:done');
        } catch (err) {
          console.error('[entityStore] saveLayoutToKB:', err);
          set({ isSavingLayout: false }, false, 'saveLayoutToKB:error');
        }
      },

      loadLayoutFromKB: async (namespace) => {
        if (!namespace) return null;
        try {
          const { loadLayout } = await import('../services/entityStore.service');
          const saved = await loadLayout(namespace);
          if (!saved?.positions || !Object.keys(saved.positions).length) return null;
          set(state => ({
            frozenPositions: saved.positions,
            isLayoutFrozen:  true,
            layoutConfig: {
              ...state.layoutConfig,
              ...(saved.config || {}),
              algorithm: saved.algorithm || state.layoutConfig.algorithm,
              _ts: Date.now(),
            },
          }), false, 'loadLayoutFromKB');
          return saved;
        } catch (err) {
          console.error('[entityStore] loadLayoutFromKB:', err);
          return null;
        }
      },

      // === LOD / VIEWPORT ACTIONS ===
      setPyramidStatus: (status) => set({ pyramidStatus: status }, false, 'setPyramidStatus'),

      setLodLevel: (level) => set({ lodLevel: level }, false, 'setLodLevel'),

      fetchViewport: async (namespace, bbox, level, budget = 400) => {
        if (!namespace) return null;
        set({ isLoadingViewport: true, viewportBbox: bbox, lodLevel: level }, false, 'fetchViewport:start');
        try {
          const { getViewport } = await import('../services/entityStore.service');
          const result = await getViewport(namespace, bbox, level, budget);
          set({
            isLoadingViewport: false,
            viewportMeta:      result.meta,
            viewportNodes:     result.nodes || [],
            viewportEdges:     result.edges || [],
          }, false, 'fetchViewport:done');
          return result;
        } catch (err) {
          console.error('[entityStore] fetchViewport:', err);
          set({ isLoadingViewport: false }, false, 'fetchViewport:error');
          return null;
        }
      },

      expandCluster: async (clusterId) => {
        if (!clusterId) return null;
        try {
          const { expandCluster } = await import('../services/entityStore.service');
          return await expandCluster(clusterId);
        } catch (err) {
          console.error('[entityStore] expandCluster:', err);
          return null;
        }
      },

      buildAndLayoutPyramid: async (namespace, opts = {}) => {
        if (!namespace) return null;
        set({ isLoading: true }, false, 'buildAndLayoutPyramid:start');
        try {
          const { buildAndLayoutPyramid, getPyramidStatus } = await import('../services/entityStore.service');
          const result = await buildAndLayoutPyramid(namespace, opts);
          const status = await getPyramidStatus(namespace);
          set({ isLoading: false, pyramidStatus: status }, false, 'buildAndLayoutPyramid:done');
          return result;
        } catch (err) {
          console.error('[entityStore] buildAndLayoutPyramid:', err);
          set({ isLoading: false }, false, 'buildAndLayoutPyramid:error');
          return null;
        }
      },

      // === INCREMENTAL STABILITY ACTIONS ===
      saveFrozenPositions: () => set((state) => ({
        frozenPositions: Object.fromEntries(
          state.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
        ),
      }), false, 'saveFrozenPositions'),

      clearFrozenPositions: () => set({ frozenPositions: {} }, false, 'clearFrozenPositions'),

      setLayoutFrozen: (frozen) => set({ isLayoutFrozen: frozen }, false, 'setLayoutFrozen'),

      // === CLUSTER ACTIONS ===
      setClusters: (clusters) => set({ clusters }, false, 'setClusters'),

      clearClusters: () => set({ clusters: [] }, false, 'clearClusters'),

      // === RESET ===
      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'EntityStore' }
  )
);
