/**
 * FlowDesk Chat Admin — API client (thin fetch wrappers over
 * /api/v1/flowdesk/admin/*, mirroring the documentIndex.service pattern).
 */
import { API_BASE_URL } from '../../../config/api.config';

const BASE = `${API_BASE_URL}/flowdesk/admin`;

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

// Sessions (P1)
export const getSessions = (f) => request(`/sessions${qs(f)}`);
export const getSessionStats = (days = 7) => request(`/sessions/stats${qs({ days })}`);
export const getSession = (id) => request(`/sessions/${encodeURIComponent(id)}`);
export const getSessionTurns = (id) => request(`/sessions/${encodeURIComponent(id)}/turns`);
// One recorded model call — the exact prompt and reply, kept for an hour by the
// agent loop. A miss is ordinary (the hour passed), not an error.
export const getLlmCall = (key) => request(`/llm-call?key=${encodeURIComponent(key)}`);

// Quality (P2)
export const getQualityMeta = () => request('/quality/meta');
export const getNegativeSessions = (f) => request(`/quality/negative${qs(f)}`);
export const triageSession = (id, body) => request(`/quality/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const createBacklogFromSession = (id, body = {}) => request(`/quality/${encodeURIComponent(id)}/backlog`, { method: 'POST', body });

// Session-analysis AI agent + prompt overlays (P5)
export const analyzeSession = (id, force = false) => request(`/sessions/${encodeURIComponent(id)}/analyze`, { method: 'POST', body: { force } });
export const getPromptOverlays = (f) => request(`/prompt-overlays${qs(f)}`);
export const applyPromptOverlay = (body) => request('/prompt-overlays', { method: 'POST', body });
export const setPromptOverlayActive = (overlayId, active) => request(`/prompt-overlays/${overlayId}`, { method: 'PATCH', body: { active } });

// System-prompt graph editor (P6)
export const promptMeta = () => request('/prompt/meta');
export const promptDefaultGraph = () => request('/prompt/default-graph');
export const promptListGraphs = () => request('/prompt/graphs');
export const promptGetGraph = (entryId, version) => request(`/prompt/graphs/${encodeURIComponent(entryId)}${version != null ? `?version=${version}` : ''}`);
export const promptSaveGraph = (body) => request('/prompt/graphs', { method: 'POST', body });
export const promptGetVersions = (entryId) => request(`/prompt/graphs/${encodeURIComponent(entryId)}/versions`);
export const promptCompile = (graph) => request('/prompt/compile', { method: 'POST', body: { graph } });
export const promptValidate = (graph) => request('/prompt/validate', { method: 'POST', body: { graph } });
export const promptSandbox = (body) => request('/prompt/sandbox', { method: 'POST', body });
export const promptApply = (body) => request('/prompt/apply', { method: 'POST', body });
export const promptActive = () => request('/prompt/active');
export const promptApplied = (limit = 20) => request(`/prompt/applied?limit=${limit}`);
export const promptClear = () => request('/prompt/clear', { method: 'POST' });
// SSE assistant — returns {abort}; caller passes onEvent.
export function promptAssistantChat({ message, history, graph, model }, onEvent) {
  const ac = new AbortController();
  fetch(`${API_BASE_URL}/flowdesk/admin/prompt/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, graph, model }),
    signal: ac.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) { onEvent({ type: 'error', message: `HTTP ${res.status}` }); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* skip */ }
      }
    }
  }).catch((e) => { if (e.name !== 'AbortError') onEvent({ type: 'error', message: e.message }); });
  return { abort: () => ac.abort() };
}

// Catalog (P3)
export const getCatalog = () => request('/catalog');
export const getCatalogProviders = (code, locationPath) => request(`/catalog/${encodeURIComponent(code)}/providers${qs({ locationPath })}`);
export const runCatalogSync = (purgeStale = false) => request('/catalog/sync', { method: 'POST', body: { purgeStale } });
export const getCatalogSyncRuns = () => request('/catalog/sync-runs');
export const materializeService = (code) => request(`/catalog/${encodeURIComponent(code)}/materialize`, { method: 'POST' });
export const resolveIntent = (q) => request(`/intent/resolve${qs({ q })}`);

// Schemas (P3)
export const getSchemas = () => request('/schemas');
export const getSchemaDetail = (ousId, includeSource = false) => request(`/schemas/${ousId}${qs({ includeSource })}`);
export const invalidateSchema = (ousId) => request(`/schemas/${ousId}/invalidate`, { method: 'POST' });
export const rematerializeSchema = (ousId) => request(`/schemas/${ousId}/rematerialize`, { method: 'POST' });
// P7 — AI schema enrichment (Claude Haiku): description → intent vector store + field meanings
export const enrichSchema = (ousId) => request(`/schemas/${ousId}/enrich`, { method: 'POST' }); // generate + apply
export const enrichSchemaGenerate = (ousId) => request(`/schemas/${ousId}/enrich/generate`, { method: 'POST' }); // preview
export const enrichSchemaApply = (ousId, body) => request(`/schemas/${ousId}/enrich/apply`, { method: 'POST', body });
export const getSchemaEnrichment = (serviceId) => request(`/schemas/enrichment?serviceId=${encodeURIComponent(serviceId)}`);
// P8 — export selected schemas as a ZIP (schemas.xlsx + schemas.json) and download in-browser.
export async function exportSchemas(ousIds) {
  const res = await fetch(`${API_BASE_URL}/flowdesk/admin/schemas/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ousIds }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^"]+)"?/.exec(cd);
  const filename = m ? m[1] : `flowdesk-schemas-${Date.now()}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
  return { filename, size: blob.size };
}

// Sync (P3)
export const getSyncStatus = () => request('/sync/status');
export const getSyncEvents = (f) => request(`/sync/events${qs(f)}`);
export const pollSyncNow = () => request('/sync/poll', { method: 'POST' });

// Tickets + LLM + health (P4)
export const getTickets = (f) => request(`/tickets${qs(f)}`);
export const getTicketLive = (ticketId) => request(`/tickets/${ticketId}/live`);
export const getLlmStats = (days = 7) => request(`/llm/stats${qs({ days })}`);
export const getAdminHealth = () => request('/health');

// ACT permissions (Phase 9 management)
export const getActUsers = () => request('/act-users');
export const addActUser = (body) => request('/act-users', { method: 'POST', body });
export const setActUserEnabled = (key, enabled) => request(`/act-users/${encodeURIComponent(key)}`, { method: 'PATCH', body: { enabled } });
export const removeActUser = (key) => request(`/act-users/${encodeURIComponent(key)}`, { method: 'DELETE' });
export const checkActUser = (params) => request(`/act-users/check${qs(params)}`);
export const setActPermissionDefault = (permission, enabledForAll) => request(`/act-users/permissions/${encodeURIComponent(permission)}`, { method: 'PATCH', body: { enabledForAll } });
