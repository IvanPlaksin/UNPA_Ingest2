/**
 * SessionTracker - Manages session state and persistence
 *
 * Tracks user actions during Guided Mode and stores session history.
 */

const STORAGE_KEY = 'nexus-sessions';
const MAX_SESSIONS = 20;

/**
 * Generate unique session ID
 */
export const generateSessionId = () => {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `session-${date}-${time}-${random}`;
};

/**
 * Create a new session object
 */
export const createSession = (namespace) => {
  return {
    id: generateSessionId(),
    namespace,
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,

    beforeState: null,
    afterState: null,

    steps: [],

    summary: {
      clustersFound: 0,
      clustersApproved: 0,
      clustersConsolidated: 0,
      clustersExported: 0,
      nodesReduced: 0,
      edgesReduced: 0,
    },
  };
};

/**
 * Add a step to the session
 */
export const addStep = (session, step) => {
  return {
    ...session,
    steps: [
      ...session.steps,
      {
        id: `step-${session.steps.length + 1}`,
        timestamp: new Date().toISOString(),
        ...step,
      },
    ],
  };
};

/**
 * Update session summary
 */
export const updateSummary = (session, updates) => {
  return {
    ...session,
    summary: {
      ...session.summary,
      ...updates,
    },
  };
};

/**
 * Complete a session
 */
export const completeSession = (session, afterState) => {
  const beforeState = session.beforeState || { nodeCount: 0, edgeCount: 0 };
  const finalAfterState = afterState || beforeState;

  return {
    ...session,
    status: 'completed',
    endedAt: new Date().toISOString(),
    afterState: finalAfterState,
    summary: {
      ...session.summary,
      nodesReduced: beforeState.nodeCount - finalAfterState.nodeCount,
      edgesReduced: beforeState.edgeCount - finalAfterState.edgeCount,
    },
  };
};

/**
 * Abandon a session (incomplete)
 */
export const abandonSession = (session) => {
  return {
    ...session,
    status: 'abandoned',
    endedAt: new Date().toISOString(),
  };
};

/**
 * Load sessions from localStorage
 */
export const loadSessions = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load sessions:', error);
  }
  return [];
};

/**
 * Save sessions to localStorage
 */
export const saveSessions = (sessions) => {
  try {
    const trimmed = sessions.slice(-MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn('Failed to save sessions:', error);
  }
};

/**
 * Add session to history
 */
export const saveSession = (session) => {
  const sessions = loadSessions();
  const existingIndex = sessions.findIndex(s => s.id === session.id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  saveSessions(sessions);
  return sessions;
};

/**
 * Get recent sessions
 */
export const getRecentSessions = (limit = 10) => {
  const sessions = loadSessions();
  return sessions
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
    .slice(0, limit);
};

/**
 * Delete a session
 */
export const deleteSession = (sessionId) => {
  const sessions = loadSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveSessions(filtered);
  return filtered;
};

/**
 * Clear all sessions
 */
export const clearAllSessions = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Calculate session duration
 */
export const getSessionDuration = (session) => {
  const start = new Date(session.startedAt);
  const end = session.endedAt ? new Date(session.endedAt) : new Date();
  const diffMs = end - start;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
};

/**
 * Get phase index (for progress display)
 */
export const getPhaseIndex = (phase) => {
  const phases = ['understand', 'discover', 'evaluate', 'act'];
  return phases.indexOf(phase);
};

/**
 * Format session for display
 */
export const formatSessionSummary = (session) => {
  const actions = [];

  if (session.summary.clustersConsolidated > 0) {
    actions.push(`${session.summary.clustersConsolidated} consolidated`);
  }
  if (session.summary.clustersExported > 0) {
    actions.push(`${session.summary.clustersExported} exported`);
  }
  if (actions.length === 0) {
    if (session.summary.clustersApproved > 0) {
      actions.push(`${session.summary.clustersApproved} approved`);
    } else if (session.summary.clustersFound > 0) {
      actions.push(`${session.summary.clustersFound} found`);
    } else {
      actions.push('Analysis only');
    }
  }

  return actions.join(', ');
};
