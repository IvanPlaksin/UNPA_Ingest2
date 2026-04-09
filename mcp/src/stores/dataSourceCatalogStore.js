/**
 * DataSource Catalog Store
 *
 * Manages DataSource CRUD for the Structural Editor "DataSources" tab.
 */

import { create } from 'zustand';
import api from '../services/api';

const EMPTY_CONFIGS = {
  SQL: { connectionId: 'default', query: '', countQuery: '', searchQuery: '', searchField: '', parameterMapping: {} },
  KB: { queryType: 'cypher', cypherQuery: '', cypherCountQuery: '', cypherSearchQuery: '', collection: '', embeddingModel: 'default', similarityThreshold: 0.7, namespace: null },
  API: { endpoint: '', method: 'GET', headers: {}, queryParams: {}, bodyTemplate: null, responsePath: 'data', totalPath: 'total', authType: 'none', authConfigId: null },
  FILE: { filePath: '', format: 'json', delimiter: ',', hasHeader: true, encoding: 'utf-8', watchFile: false },
  COMPOSITE: { sources: [], mergeStrategy: 'union' },
};

function makeBlank(sourceType = 'SQL', namespace = 'FLOWDESK') {
  const cfgKey = `${sourceType.toLowerCase()}Config`;
  return {
    graphId: `datasource_new_${Date.now()}`,
    name: '',
    namespace,
    sourceType,
    graphType: 'STRUCTURAL',
    graphSubType: 'datasource',
    graphDimension: 'DATA',
    config: { description: '', valueField: 'value', labelField: 'label', metadataFields: [], cacheStrategy: 'ttl', cacheTTL: 3600, defaultLimit: 100, maxLimit: 1000 },
    sqlConfig: sourceType === 'SQL' ? { ...EMPTY_CONFIGS.SQL } : null,
    kbConfig: sourceType === 'KB' ? { ...EMPTY_CONFIGS.KB } : null,
    apiConfig: sourceType === 'API' ? { ...EMPTY_CONFIGS.API } : null,
    fileConfig: sourceType === 'FILE' ? { ...EMPTY_CONFIGS.FILE } : null,
    compositeConfig: sourceType === 'COMPOSITE' ? { ...EMPTY_CONFIGS.COMPOSITE } : null,
  };
}

const useDataSourceCatalogStore = create((set, get) => ({
  dataSources: [],
  selectedId: null,
  loading: false,
  error: null,
  filter: { search: '', sourceType: '' },

  // When set, the store fetches DataSources via the workspace-scoped endpoint
  // which returns workspace-private + globally-shared records (and tags each
  // with `scope: 'workspace' | 'global'`). When null, the global catalog is
  // used (legacy behaviour for the standalone Structural Editor page).
  workspaceContext: null,    // null | string (workspaceId)

  editMode: null,   // null | 'create' | 'edit'
  draft: null,       // DataSource being created / edited

  // ── Workspace context ────────────────────────────────────────────────────
  setWorkspaceContext: (workspaceId) => set({ workspaceContext: workspaceId || null }),
  clearWorkspaceContext: () => set({ workspaceContext: null }),

  // ── Fetch ────────────────────────────────────────────────────────────────
  fetchAll: async () => {
    const { workspaceContext } = get();
    set({ loading: true, error: null });
    try {
      let list;
      if (workspaceContext) {
        // Workspace-scoped view: workspace-private + global namespaces
        const res = await api.get(`/workspaces/${workspaceContext}/datasources`);
        list = res.data?.data || [];
      } else {
        const res = await api.get('/datasources');
        list = res.data?.dataSources || res.data?.data || [];
      }
      set({ dataSources: list, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // ── Create ───────────────────────────────────────────────────────────────
  save: async () => {
    const { draft, editMode, workspaceContext } = get();
    if (!draft) return;
    set({ loading: true, error: null });
    try {
      if (editMode === 'create') {
        if (workspaceContext) {
          // Workspace-scoped create: route through the workspace endpoint
          // which creates BOTH a v2 DataSource and a paired SourceReference
          // so the new entry shows up in the SourcesTab AND in the Form
          // Builder DataSources tab.
          const payload = { ...draft, namespace: `workspace:${workspaceContext}` };
          await api.post(`/workspaces/${workspaceContext}/datasources`, payload);
        } else {
          // Global create — legacy path for the standalone Structural Editor
          await api.post('/datasources', draft);
        }
      } else {
        // Updates always go to the global endpoint regardless of context
        await api.patch(`/datasources/${draft.graphId || draft.id}`, draft);
      }
      set({ editMode: null, draft: null, loading: false });
      await get().fetchAll();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      set({ error: msg, loading: false });
      throw err;
    }
  },

  // ── Delete ───────────────────────────────────────────────────────────────
  remove: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/datasources/${id}`);
      set(s => ({
        loading: false,
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
      await get().fetchAll();
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // ── Test ─────────────────────────────────────────────────────────────────
  test: async (id, operation = 'loadAll') => {
    const ep = operation === 'search'
      ? `/datasources/${id}/search?q=test&limit=5`
      : `/datasources/${id}/load?limit=5`;
    const res = await api.get(ep);
    return res.data;
  },

  // ── Selection / Filter ──────────────────────────────────────────────────
  select: (id) => set({ selectedId: id }),
  setFilter: (key, val) => set(s => ({ filter: { ...s.filter, [key]: val } })),
  clearError: () => set({ error: null }),

  // ── Edit mode ────────────────────────────────────────────────────────────
  startCreate: (sourceType = 'SQL') => set({ editMode: 'create', draft: makeBlank(sourceType) }),
  startEdit: (ds) => set({ editMode: 'edit', draft: structuredClone(ds) }),
  cancelEdit: () => set({ editMode: null, draft: null }),

  setDraft: (path, value) => set(s => {
    const d = structuredClone(s.draft);
    const parts = path.split('.');
    let obj = d;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    return { draft: d };
  }),

  switchSourceType: (sourceType) => set(s => {
    const d = structuredClone(s.draft);
    d.sourceType = sourceType;
    d.sqlConfig = sourceType === 'SQL' ? { ...EMPTY_CONFIGS.SQL } : null;
    d.kbConfig = sourceType === 'KB' ? { ...EMPTY_CONFIGS.KB } : null;
    d.apiConfig = sourceType === 'API' ? { ...EMPTY_CONFIGS.API } : null;
    d.fileConfig = sourceType === 'FILE' ? { ...EMPTY_CONFIGS.FILE } : null;
    d.compositeConfig = sourceType === 'COMPOSITE' ? { ...EMPTY_CONFIGS.COMPOSITE } : null;
    return { draft: d };
  }),
}));

export default useDataSourceCatalogStore;
