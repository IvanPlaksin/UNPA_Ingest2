'use strict';

/**
 * SITE_NAVIGATE target whitelist (Phase 5).
 *
 * The chat never emits a free-form path — the LLM only picks a KEY from this
 * whitelist, and the server maps the key to a route. This prevents hallucinated
 * or unsafe navigation targets.
 *
 * Routes + `highlight` anchors are grounded in the REAL Altiora portal
 * (FlowDeskPortal, React Router v7 — see PHASE0 F6): route table `App.tsx` and
 * the ~60 `data-tour="…"` spotlight anchors already placed across the portal.
 * `highlight` is an optional `data-tour` id the host may spotlight (react-joyride)
 * after navigating.
 *
 * Extend this map as more chat-navigable destinations are confirmed with the PO.
 *
 * @module instances/flowdesk/interpreter/navigation-targets
 */

const NAVIGATION_TARGETS = {
  'my.requests': {
    path: '/requests', title: 'Your Requests', highlight: 'portal-header-nav',
    keywords: ['my requests', 'status', 'track', 'submitted', 'my tickets', 'where are my requests'],
  },
  'my.tasks': {
    path: '/tasks', title: 'Your Tasks', highlight: 'portal-header-nav',
    keywords: ['my tasks', 'to do', 'assigned', 'work items'],
  },
  'my.approvals': {
    path: '/approvals', title: 'My Approvals', highlight: 'portal-header-nav',
    keywords: ['approvals', 'approve', 'pending approval', 'sign off', 'authorize'],
  },
  'catalog': {
    path: '/catalog', title: 'Service Catalog', highlight: 'portal-catalog-search',
    keywords: ['catalog', 'services', 'browse', 'available services', 'what can i request', 'raise a request', 'new request', 'request something'],
  },
  'chat': {
    path: '/chat', title: 'Assistant Chat', highlight: 'portal-chat-input',
    keywords: ['chat', 'assistant', 'talk to', 'ask'],
  },
  'mail': {
    path: '/mail', title: 'Mail', highlight: null,
    keywords: ['mail', 'inbox', 'messages', 'email'],
  },
  'home': {
    path: '/', title: 'Home', highlight: null,
    keywords: ['home', 'start', 'main page', 'dashboard'],
  },
};

/** Look up a target by whitelist key. Returns null for unknown/invalid keys. */
function findNavigationTarget(key) {
  if (!key || typeof key !== 'string') return null;
  return NAVIGATION_TARGETS[key.trim().toLowerCase()] || null;
}

/** All targets as an array (for the extraction prompt). */
function getAllTargets() {
  return Object.entries(NAVIGATION_TARGETS).map(([key, val]) => ({ key, ...val }));
}

module.exports = { NAVIGATION_TARGETS, findNavigationTarget, getAllTargets };
