import { useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import {
  createSession,
  addStep,
  updateSummary,
  completeSession,
  abandonSession,
  saveSession,
  getRecentSessions,
  getSessionDuration,
} from './SessionTracker';

/**
 * Hook for managing session state
 */
export const useSession = () => {
  const namespace = useNexusStore(state => state.namespace);
  const currentSession = useNexusStore(state => state.currentSession);
  const sessionSteps = useNexusStore(state => state.sessionSteps);
  const guidedPhase = useNexusStore(state => state.guidedPhase);

  const setCurrentSession = useNexusStore(state => state.setCurrentSession);
  const addSessionStep = useNexusStore(state => state.addSessionStep);
  const clearSession = useNexusStore(state => state.clearSession);

  const startSession = useCallback((beforeState = null) => {
    const session = createSession(namespace);
    if (beforeState) {
      session.beforeState = beforeState;
    }
    setCurrentSession?.(session);
    return session;
  }, [namespace, setCurrentSession]);

  const recordStep = useCallback((phase, action, data = {}) => {
    if (!currentSession) return;

    const step = { phase, action, data };
    const updatedSession = addStep(currentSession, step);
    setCurrentSession?.(updatedSession);
    addSessionStep?.(step);

    return updatedSession;
  }, [currentSession, setCurrentSession, addSessionStep]);

  const updateSessionSummary = useCallback((updates) => {
    if (!currentSession) return;

    const updatedSession = updateSummary(currentSession, updates);
    setCurrentSession?.(updatedSession);

    return updatedSession;
  }, [currentSession, setCurrentSession]);

  const finishSession = useCallback((afterState = null) => {
    if (!currentSession) return;

    const completedSession = completeSession(currentSession, afterState);
    saveSession(completedSession);
    clearSession?.();

    return completedSession;
  }, [currentSession, clearSession]);

  const cancelSession = useCallback(() => {
    if (!currentSession) return;

    const abandonedSession = abandonSession(currentSession);
    saveSession(abandonedSession);
    clearSession?.();

    return abandonedSession;
  }, [currentSession, clearSession]);

  const getSessionInfo = useCallback(() => {
    if (!currentSession) return null;

    return {
      ...currentSession,
      duration: getSessionDuration(currentSession),
      currentPhase: guidedPhase,
      phaseNumber: ['understand', 'discover', 'evaluate', 'act'].indexOf(guidedPhase) + 1,
      totalPhases: 4,
    };
  }, [currentSession, guidedPhase]);

  const getHistory = useCallback((limit = 10) => {
    return getRecentSessions(limit);
  }, []);

  return {
    session: currentSession,
    steps: sessionSteps,
    sessionInfo: getSessionInfo(),

    startSession,
    recordStep,
    updateSessionSummary,
    finishSession,
    cancelSession,
    getHistory,
  };
};

export default useSession;
