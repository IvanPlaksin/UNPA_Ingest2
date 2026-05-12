import { create } from 'zustand';

const API_BASE = '/api/v1/flowdesk/config';

export const useFlowDeskConfigStore = create((set, get) => ({
  // State per config type
  configs: {
    sla: { data: null, loading: false, error: null },
    queues: { data: null, loading: false, error: null },
    keywords: { data: null, loading: false, error: null },
    categories: { data: null, loading: false, error: null },
    domains: { data: null, loading: false, error: null },
    thresholds: { data: null, loading: false, error: null },
    scopes: { data: null, loading: false, error: null },
  },
  activeTab: 'sla',

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── LOAD ──
  loadConfig: async (type, params = '') => {
    set(s => ({ configs: { ...s.configs, [type]: { ...s.configs[type], loading: true, error: null } } }));
    try {
      const res = await fetch(`${API_BASE}/${type}${params ? '?' + params : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      set(s => ({ configs: { ...s.configs, [type]: { data: json.data, loading: false, error: null } } }));
      return json.data;
    } catch (e) {
      set(s => ({ configs: { ...s.configs, [type]: { ...s.configs[type], loading: false, error: e.message } } }));
      return null;
    }
  },

  // ── CREATE ──
  createItem: async (type, item) => {
    const res = await fetch(`${API_BASE}/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    await get().loadConfig(type);
    return res.json();
  },

  // ── UPDATE ──
  updateItem: async (type, id, updates) => {
    const res = await fetch(`${API_BASE}/${type}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    await get().loadConfig(type);
    return res.json();
  },

  // ── DELETE ──
  deleteItem: async (type, id) => {
    const res = await fetch(`${API_BASE}/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await get().loadConfig(type);
  },

  // ── INVALIDATE CACHE ──
  invalidateCache: async (type = 'all') => {
    await fetch(`${API_BASE}/invalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  },
}));
