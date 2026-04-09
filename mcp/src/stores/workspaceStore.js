/**
 * WorkSpace Store — Zustand state management
 *
 * Manages workspace list, current workspace detail,
 * sources, drafts, KB search results, and UI filters.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import * as wsApi from '../services/workspace.service';

export const useWorkspaceStore = create(
  devtools(
    (set, get) => ({
      // ==================== STATE ====================

      // List view
      workspaces: [],
      totalWorkspaces: 0,

      // Detail view
      currentWorkspace: null,
      stats: null,
      sources: [],
      drafts: [],
      totalDrafts: 0,
      selectedDraft: null,
      draftEdges: [],

      // KB search
      kbResults: [],

      // Audit
      auditLog: [],

      // UI
      loading: false,
      error: null,
      activeTab: 0,
      filters: {
        status: '',
        domain: '',
        draftType: '',
        draftStatus: '',
        kbNamespace: '',
      },
      createDialogOpen: false,
      sourceDialogOpen: false,

      // ==================== WORKSPACE LIFECYCLE ====================

      fetchWorkspaces: async (params = {}) => {
        set({ loading: true, error: null }, false, 'fetchWorkspaces');
        try {
          const res = await wsApi.listWorkspaces({
            status: get().filters.status || undefined,
            domain: get().filters.domain || undefined,
            ...params
          });
          set({
            workspaces: res.data || [],
            totalWorkspaces: res.pagination?.total || 0,
            loading: false
          }, false, 'fetchWorkspaces/done');
        } catch (err) {
          set({ error: err.response?.data?.error?.message || err.message, loading: false }, false, 'fetchWorkspaces/error');
        }
      },

      fetchWorkspace: async (id) => {
        set({ loading: true, error: null }, false, 'fetchWorkspace');
        try {
          const [wsRes, statsRes, sourcesRes] = await Promise.all([
            wsApi.getWorkspace(id),
            wsApi.getWorkspaceStats(id),
            wsApi.listSources(id)
          ]);
          set({
            currentWorkspace: wsRes.data,
            stats: statsRes.data,
            sources: sourcesRes.data || [],
            loading: false
          }, false, 'fetchWorkspace/done');
        } catch (err) {
          set({ error: err.response?.data?.error?.message || err.message, loading: false }, false, 'fetchWorkspace/error');
        }
      },

      createWorkspace: async (data) => {
        set({ loading: true, error: null }, false, 'createWorkspace');
        try {
          const res = await wsApi.createWorkspace(data);
          const ws = res.data;
          set((state) => ({
            workspaces: [ws, ...state.workspaces],
            totalWorkspaces: state.totalWorkspaces + 1,
            loading: false,
            createDialogOpen: false
          }), false, 'createWorkspace/done');
          return ws;
        } catch (err) {
          set({ error: err.response?.data?.error?.message || err.message, loading: false }, false, 'createWorkspace/error');
          throw err;
        }
      },

      updateStatus: async (id, status, reason) => {
        try {
          const res = await wsApi.updateWorkspaceStatus(id, status, reason);
          const updated = res.data;
          set((state) => ({
            currentWorkspace: state.currentWorkspace?.id === id ? updated : state.currentWorkspace,
            workspaces: state.workspaces.map(w => w.id === id ? { ...w, status: updated.status } : w)
          }), false, 'updateStatus');
        } catch (err) {
          set({ error: err.response?.data?.error?.message || err.message });
          throw err;
        }
      },

      archiveWorkspace: async (id) => {
        await wsApi.archiveWorkspace(id);
        set((state) => ({
          workspaces: state.workspaces.filter(w => w.id !== id),
          totalWorkspaces: Math.max(0, state.totalWorkspaces - 1)
        }), false, 'archiveWorkspace');
      },

      // ==================== SOURCES ====================

      addSource: async (wsId, sourceData) => {
        const res = await wsApi.addSource(wsId, sourceData);
        set((state) => ({
          sources: [...state.sources, res.data],
          sourceDialogOpen: false
        }), false, 'addSource');
        // Refresh workspace to get updated status/counts
        await get().fetchWorkspace(wsId);
        return res.data;
      },

      // ==================== DRAFTS ====================

      fetchDrafts: async (wsId, params = {}) => {
        set({ loading: true }, false, 'fetchDrafts');
        try {
          const filters = get().filters;
          const res = await wsApi.listDrafts(wsId, {
            type: filters.draftType || undefined,
            status: filters.draftStatus || undefined,
            ...params
          });
          set({
            drafts: res.data || [],
            totalDrafts: res.pagination?.total || 0,
            loading: false
          }, false, 'fetchDrafts/done');
        } catch (err) {
          set({ error: err.message, loading: false }, false, 'fetchDrafts/error');
        }
      },

      selectDraft: async (wsId, draftId) => {
        if (!draftId) {
          set({ selectedDraft: null, draftEdges: [] }, false, 'selectDraft/clear');
          return;
        }
        try {
          const [draftRes, edgesRes] = await Promise.all([
            wsApi.getDraft(wsId, draftId),
            wsApi.getEdges(wsId, draftId)
          ]);
          set({
            selectedDraft: draftRes.data,
            draftEdges: edgesRes.data || []
          }, false, 'selectDraft');
        } catch (err) {
          set({ error: err.message });
        }
      },

      updateDraft: async (wsId, draftId, updates) => {
        const res = await wsApi.updateDraft(wsId, draftId, updates);
        const updated = res.data;
        set((state) => ({
          drafts: state.drafts.map(d => d.id === draftId ? updated : d),
          selectedDraft: state.selectedDraft?.id === draftId ? updated : state.selectedDraft
        }), false, 'updateDraft');
      },

      deleteDraft: async (wsId, draftId) => {
        await wsApi.deleteDraft(wsId, draftId);
        set((state) => ({
          drafts: state.drafts.filter(d => d.id !== draftId),
          selectedDraft: state.selectedDraft?.id === draftId ? null : state.selectedDraft
        }), false, 'deleteDraft');
      },

      searchDrafts: async (wsId, query, params = {}) => {
        set({ loading: true }, false, 'searchDrafts');
        try {
          const res = await wsApi.searchDrafts(wsId, query, params);
          set({ drafts: res.data || [], loading: false }, false, 'searchDrafts/done');
        } catch (err) {
          set({ error: err.message, loading: false });
        }
      },

      // ==================== KB SEARCH ====================

      searchKB: async (wsId, query, params = {}) => {
        set({ loading: true }, false, 'searchKB');
        try {
          const res = await wsApi.kbSearch(wsId, query, {
            namespace: get().filters.kbNamespace || undefined,
            ...params
          });
          set({ kbResults: res.data || [], loading: false }, false, 'searchKB/done');
        } catch (err) {
          set({ error: err.message, loading: false }, false, 'searchKB/error');
        }
      },

      clearKBResults: () => set({ kbResults: [] }, false, 'clearKBResults'),

      // ==================== AUDIT ====================

      fetchAuditLog: async (wsId, params = {}) => {
        try {
          const res = await wsApi.getAuditLog(wsId, params);
          set({ auditLog: res.data || [] }, false, 'fetchAuditLog');
        } catch (err) {
          set({ error: err.message });
        }
      },

      // ==================== UI ====================

      setActiveTab: (tab) => set({ activeTab: tab }, false, 'setActiveTab'),
      setFilter: (key, value) => set((s) => ({
        filters: { ...s.filters, [key]: value }
      }), false, `setFilter/${key}`),
      clearFilters: () => set({
        filters: { status: '', domain: '', draftType: '', draftStatus: '', kbNamespace: '' }
      }, false, 'clearFilters'),
      setCreateDialogOpen: (open) => set({ createDialogOpen: open }, false, 'createDialog'),
      setSourceDialogOpen: (open) => set({ sourceDialogOpen: open }, false, 'sourceDialog'),
      clearError: () => set({ error: null }, false, 'clearError'),

      // Reset on leave
      reset: () => set({
        currentWorkspace: null,
        stats: null,
        sources: [],
        drafts: [],
        totalDrafts: 0,
        selectedDraft: null,
        draftEdges: [],
        kbResults: [],
        auditLog: [],
        activeTab: 0,
        error: null
      }, false, 'reset')
    }),
    { name: 'workspace-store' }
  )
);
