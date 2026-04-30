'use strict';

/**
 * UnpaChat API client — thin fetch wrapper for /api/v1/flowdesk endpoints.
 */

export async function fetchHealth(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/flowdesk/health`);
  return res.json();
}

export async function fetchUserContext(apiBaseUrl, userId) {
  const res = await fetch(`${apiBaseUrl}/flowdesk/user/${userId}/context`);
  if (!res.ok) throw new Error(`Failed to load user context: ${res.status}`);
  return res.json();
}

export async function fetchGraphCatalog(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/graph-catalog?limit=100`);
  const data = await res.json();
  return (data.data || []).filter(g => g.nodes?.length > 0 || g.nodeCount > 0);
}

export async function fetchGraphInfo(apiBaseUrl, graphId) {
  const res = await fetch(`${apiBaseUrl}/graph-catalog/${graphId}`);
  const data = await res.json();
  return data.data || data;
}

export async function fetchGraphVersions(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/flowdesk/graph-versions`);
  const data = await res.json();
  return data.versions || [];
}

/**
 * Send a chat message and receive a structured response.
 * @param {string} apiBaseUrl
 * @param {{ sessionId, userId, message, graphVersion?, graphId? }} params
 * @returns {Promise<{ response, choices, state, executionLog, spawnResult, isComplete, engineStatus }>}
 */
export async function sendChatMessage(apiBaseUrl, { sessionId, userId, message, graphVersion, graphId }) {
  const res = await fetch(`${apiBaseUrl}/flowdesk/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, message, graphVersion, graphId }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
