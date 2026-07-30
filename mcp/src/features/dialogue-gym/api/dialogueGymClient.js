/**
 * Dialogue Gym — API client (thin fetch wrappers over /api/v1/dialogue-gym/*).
 * Mirrors flowdesk-admin/api/adminClient.js. The backend wraps responses in
 * { success, data } — request() unwraps to `data` (and throws on { success:false }).
 */
import { API_BASE_URL } from '../../../config/api.config';

const BASE = `${API_BASE_URL}/dialogue-gym`;

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok || (body && body.success === false)) {
    throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status, data: body });
  }
  return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

// ── meta / health ──
export const getMeta = () => request('/meta');
export const getHealth = () => request('/health');

// ── personas ──
export const listPersonas = (f) => request(`/personas${qs(f)}`);
export const getPersona = (id) => request(`/personas/${encodeURIComponent(id)}`);
export const createPersona = (body) => request('/personas', { method: 'POST', body });
export const updatePersona = (id, body) => request(`/personas/${encodeURIComponent(id)}`, { method: 'PUT', body });
export const deletePersona = (id) => request(`/personas/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── scenarios ──
export const listScenarios = (f) => request(`/scenarios${qs(f)}`);
export const getScenario = (id) => request(`/scenarios/${encodeURIComponent(id)}`);
export const createScenario = (body) => request('/scenarios', { method: 'POST', body });
export const updateScenario = (id, body) => request(`/scenarios/${encodeURIComponent(id)}`, { method: 'PUT', body });
export const deleteScenario = (id) => request(`/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const verifyGroundTruth = (id, body) => request(`/scenarios/${encodeURIComponent(id)}/verify-ground-truth`, { method: 'POST', body });

// ── assignment ──
export const assignPersona = (body) => request('/assign', { method: 'POST', body });
export const unassignPersona = (body) => request('/assign', { method: 'DELETE', body });
export const getRandomPair = (f) => request(`/random-pair${qs(f)}`);

// ── prompt versions (bridge to the P6 editor / CHAT_PROMPT) ──
export const listPrompts = () => request('/prompts');
export const getProductionPrompt = () => request('/prompts/production');
export const getPromptVersions = (entryId) => request(`/prompts/${encodeURIComponent(entryId)}/versions`);
export const getPromptVersion = (entryId, version) => request(`/prompts/${encodeURIComponent(entryId)}/versions/${encodeURIComponent(version)}`);

// ── arena ──
export const runArena = (body) => request('/arena/run', { method: 'POST', body });
export const runArenaRandom = (body) => request('/arena/run-random', { method: 'POST', body });
export const listRuns = (f) => request(`/arena/runs${qs(f)}`);
export const getRun = (id) => request(`/arena/runs/${encodeURIComponent(id)}`);
export const getRunTurns = (id) => request(`/arena/runs/${encodeURIComponent(id)}/turns`);

// ── judge ──
export const judgeRun = (id, body) => request(`/judge/run/${encodeURIComponent(id)}`, { method: 'POST', body: body || {} });
export const judgeBatch = (body) => request('/judge/batch', { method: 'POST', body });
export const getRunJudgements = (id) => request(`/judge/run/${encodeURIComponent(id)}`);
export const listJudgeRecords = (f) => request(`/judge/records${qs(f)}`);
