import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * GxeManager Zustand Store
 *
 * State management for GxeManager — execution orchestrator monitor.
 * Tracks executions, filters, stats, triggers, and SSE connection status.
 */
const useGxeManagerStore = create(
  devtools(
    (set, get) => ({
      // ═══════════════════════════════════════════════════════════════════
      // STATE
      // ═══════════════════════════════════════════════════════════════════

      /** @type {Map<string, Object>} executionId → ExecutionRecord */
      executions: new Map(),

      /** Current filter/sort/group settings */
      filters: {
        status: [],       // e.g. ['RUNNING', 'PAUSED']
        graphId: null,
        search: '',
      },
      groupBy: 'status',  // 'status' | 'graphId' | 'priority' | 'none'
      sortBy: 'createdAt', // 'createdAt' | 'status' | 'graphId'
      sortDir: 'desc',

      /** Aggregated stats from /stats endpoint */
      stats: {
        byStatus: {},
        total: 0,
        activeCount: 0,
      },

      /** Triggers list */
      triggers: [],

      /** Capacity report */
      capacity: null,

      /** Currently selected execution for detail panel */
      selectedExecutionId: null,

      /** SSE connection state */
      sseStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'

      /** Audit log entries (latest N) */
      auditLog: [],

      /** Loading flags */
      loading: {
        executions: false,
        triggers: false,
        stats: false,
        launch: false,
      },

      /** Alerts (failed executions, capacity warnings) */
      alerts: [],

      /** Whether detail panel is open */
      detailPanelOpen: false,

      /** Active tab in detail panel */
      activeTab: 'overview', // 'overview'|'timeline'|'nodemap'|'metrics'|'logs'|'context'

      /** SSE convenience booleans */
      sseConnected: false,
      sseReconnecting: false,

      /** Last error */
      error: null,

      // ═══════════════════════════════════════════════════════════════════
      // EXECUTION ACTIONS
      // ═══════════════════════════════════════════════════════════════════

      /**
       * Set full executions list (from REST or initial SSE load)
       */
      setExecutions: (list) => set((state) => {
        const map = new Map();
        for (const exec of list) {
          map.set(exec.executionId, exec);
        }
        return { executions: map };
      }),

      /**
       * Upsert a single execution (from SSE event)
       */
      upsertExecution: (exec) => set((state) => {
        const next = new Map(state.executions);
        next.set(exec.executionId, exec);
        return { executions: next };
      }),

      /**
       * Remove an execution (archived)
       */
      removeExecution: (executionId) => set((state) => {
        const next = new Map(state.executions);
        next.delete(executionId);
        return { executions: next };
      }),

      /**
       * Update status of a specific execution
       */
      updateExecutionStatus: (executionId, status, metadata = {}) => set((state) => {
        const next = new Map(state.executions);
        const existing = next.get(executionId);
        if (existing) {
          next.set(executionId, { ...existing, status, ...metadata });
        }
        return { executions: next };
      }),

      // ═══════════════════════════════════════════════════════════════════
      // FILTER / SORT ACTIONS
      // ═══════════════════════════════════════════════════════════════════

      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

      setGroupBy: (groupBy) => set({ groupBy }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortDir: (sortDir) => set({ sortDir }),

      setSelectedExecutionId: (id) => set({ selectedExecutionId: id, detailPanelOpen: !!id }),

      toggleStatusFilter: (status) => set((state) => {
        const current = state.filters.status || [];
        const next = current.includes(status)
          ? current.filter((s) => s !== status)
          : [...current, status];
        return { filters: { ...state.filters, status: next } };
      }),

      toggleSortOrder: () => set((state) => ({
        sortDir: state.sortDir === 'asc' ? 'desc' : 'asc',
      })),

      setAlerts: (alerts) => set({ alerts }),

      setActiveTab: (activeTab) => set({ activeTab }),

      clearSelection: () => set({
        selectedExecutionId: null,
        detailPanelOpen: false,
        activeTab: 'overview',
      }),

      // ═══════════════════════════════════════════════════════════════════
      // STATS / TRIGGERS / CAPACITY
      // ═══════════════════════════════════════════════════════════════════

      setStats: (stats) => set({ stats }),
      setTriggers: (triggers) => set({ triggers }),
      setCapacity: (capacity) => set({ capacity }),
      setAuditLog: (auditLog) => set({ auditLog }),

      // ═══════════════════════════════════════════════════════════════════
      // SSE STATUS
      // ═══════════════════════════════════════════════════════════════════

      setSseStatus: (sseStatus) => set({
        sseStatus,
        sseConnected: sseStatus === 'connected',
        sseReconnecting: sseStatus === 'connecting',
      }),

      // ═══════════════════════════════════════════════════════════════════
      // LOADING / ERROR
      // ═══════════════════════════════════════════════════════════════════

      setLoading: (key, value) => set((state) => ({
        loading: { ...state.loading, [key]: value },
      })),

      setError: (error) => set({ error }),

      // ═══════════════════════════════════════════════════════════════════
      // COMPUTED HELPERS (call as get().getFilteredExecutions())
      // ═══════════════════════════════════════════════════════════════════

      /**
       * Return executions as array, filtered and sorted
       */
      getFilteredExecutions: () => {
        const { executions, filters, sortBy, sortDir } = get();
        let list = Array.from(executions.values());

        // Filter by status
        if (filters.status.length > 0) {
          list = list.filter((e) => filters.status.includes(e.status));
        }

        // Filter by graphId
        if (filters.graphId) {
          list = list.filter((e) => e.graphId === filters.graphId);
        }

        // Filter by search term
        if (filters.search) {
          const q = filters.search.toLowerCase();
          list = list.filter(
            (e) =>
              e.executionId?.toLowerCase().includes(q) ||
              e.graphId?.toLowerCase().includes(q)
          );
        }

        // Sort
        list.sort((a, b) => {
          const aVal = a[sortBy] ?? 0;
          const bVal = b[sortBy] ?? 0;
          if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });

        return list;
      },

      /**
       * Group filtered executions by groupBy field
       */
      /**
       * Get executions as flat array (convenience for components)
       */
      executionsList: () => {
        return get().getFilteredExecutions();
      },

      getGroupedExecutions: () => {
        const { groupBy } = get();
        const list = get().getFilteredExecutions();

        if (groupBy === 'none') return [{ label: 'All', items: list }];

        const map = {};
        for (const exec of list) {
          const key = exec[groupBy] || 'unknown';
          if (!map[key]) map[key] = [];
          map[key].push(exec);
        }
        return Object.entries(map).map(([label, items]) => ({ label, items }));
      },
    }),
    { name: 'gxe-manager-store' }
  )
);

export default useGxeManagerStore;
