import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════════════
// FILTER PERSISTENCE (localStorage)
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'gxe-manager-filters';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DEFAULT_FILTERS = {
  status: ['RUNNING', 'WAITING'],
  graphId: null,
  search: '',
  dateFrom: startOfToday(),
  dateTo: null,
};

function loadFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const saved = JSON.parse(raw);
    return {
      status: Array.isArray(saved.status) ? saved.status : DEFAULT_FILTERS.status,
      graphId: saved.graphId ?? null,
      search: '',
      dateFrom: saved.dateFrom ?? startOfToday(),
      dateTo: saved.dateTo ?? null,
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      status: filters.status,
      graphId: filters.graphId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }));
  } catch { /* quota exceeded or private mode */ }
}

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

      /** Current filter/sort/group settings (hydrated from localStorage) */
      filters: loadFilters(),
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

      setFilters: (patch) => set((state) => {
        const next = { ...state.filters, ...patch };
        saveFilters(next);
        return { filters: next };
      }),

      setGroupBy: (groupBy) => set({ groupBy }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortDir: (sortDir) => set({ sortDir }),

      setSelectedExecutionId: (id) => set({ selectedExecutionId: id, detailPanelOpen: !!id }),

      toggleStatusFilter: (status) => set((state) => {
        const current = state.filters.status || [];
        const next = current.includes(status)
          ? current.filter((s) => s !== status)
          : [...current, status];
        const filters = { ...state.filters, status: next };
        saveFilters(filters);
        return { filters };
      }),

      setDateRange: (dateFrom, dateTo) => set((state) => {
        const filters = { ...state.filters, dateFrom, dateTo };
        saveFilters(filters);
        return { filters };
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

        // Filter by date range
        if (filters.dateFrom) {
          list = list.filter((e) => (e.createdAt || 0) >= filters.dateFrom);
        }
        if (filters.dateTo) {
          list = list.filter((e) => (e.createdAt || 0) <= filters.dateTo);
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

      /**
       * Compute status counts from the loaded executions (respects date/search filters, ignores status filter)
       */
      getFilteredStats: () => {
        const { executions, filters } = get();
        let list = Array.from(executions.values());

        // Apply date + search filters but NOT status (so all status counts are visible)
        if (filters.dateFrom) list = list.filter((e) => (e.createdAt || 0) >= filters.dateFrom);
        if (filters.dateTo) list = list.filter((e) => (e.createdAt || 0) <= filters.dateTo);
        if (filters.graphId) list = list.filter((e) => e.graphId === filters.graphId);
        if (filters.search) {
          const q = filters.search.toLowerCase();
          list = list.filter((e) =>
            e.executionId?.toLowerCase().includes(q) ||
            e.graphId?.toLowerCase().includes(q)
          );
        }

        const byStatus = {};
        for (const e of list) {
          byStatus[e.status] = (byStatus[e.status] || 0) + 1;
        }
        return { byStatus, total: list.length };
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
