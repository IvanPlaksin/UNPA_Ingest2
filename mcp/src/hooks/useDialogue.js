/**
 * React hooks for DevDialogue Collector API
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSessions,
  getSession,
  getSessionContext,
  getRelatedSessions,
  searchDialogue,
  aiSearchDialogue,
  reanalyzeSession,
  getDecisions,
  getDecisionDetail,
  getDecisionProvenance,
  getStats,
  getMetrics,
  getRelatedDialoguesForBacklog,
  getProvenanceChain,
  getAnalytics,
} from '../services/dialogue.service';

export function useDialogueSessions(filters = {}) {
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filtersKey = JSON.stringify(filters);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSessions(filters);
      setSessions(data.sessions || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => { fetch(); }, [fetch]);
  return { sessions, pagination, loading, error, refetch: fetch };
}

export function useDialogueSession(sessionId, full = true) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) { setSession(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    getSession(sessionId, full)
      .then(data => setSession(data.session || null))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId, full]);

  return { session, loading, error };
}

export function useDialogueSearch() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');
  const timerRef = useRef(null);

  const search = useCallback(async (query, options = {}) => {
    if (!query?.trim()) { setResults([]); return; }
    setLoading(true);
    setError(null);
    setLastQuery(query);
    try {
      const data = await searchDialogue(query, options);
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchDebounced = useCallback((query, options = {}, delayMs = 500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query, options), delayMs);
  }, [search]);

  return { results, loading, error, lastQuery, search, searchDebounced };
}

export function useSessionContext(sessionId) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!sessionId) { setContext(null); return; }
    setLoading(true);
    setError(null);
    getSessionContext(sessionId)
      .then(data => setContext(data.success ? data : null))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId, rev]);

  const refetch = useCallback(() => setRev(r => r + 1), []);

  return { context, loading, error, refetch };
}

export function useDialogueDecisions(filters = {}) {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const filtersKey = JSON.stringify(filters);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDecisions(filters);
      setDecisions(data.decisions || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => { fetch(); }, [fetch]);
  return { decisions, loading, error, refetch: fetch };
}

export function useDecisionDetail(decisionId) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!decisionId) { setDetail(null); return; }
    setLoading(true);
    setError(null);
    getDecisionDetail(decisionId)
      .then(data => setDetail(data.success ? data : null))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [decisionId]);

  return { detail, loading, error };
}

export function useDecisionProvenance(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const trace = useCallback(async (q, limit = 10) => {
    if (!q?.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await getDecisionProvenance(q, limit);
      setResults(data.results || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query) trace(query);
  }, [query, trace]);

  return { results, loading, error, trace };
}

export function useDialogueStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}

export function useDialogueMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getMetrics()
      .then(data => setMetrics(data.dialogue || null))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { metrics, loading, refresh };
}

export function useRelatedDialoguesForBacklog(backlogId) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backlogId) { setSessions([]); return; }
    setLoading(true);
    setError(null);
    getRelatedDialoguesForBacklog(backlogId)
      .then(data => setSessions(data.sessions || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [backlogId]);

  return { sessions, loading, error };
}

export function useRelatedSessions(sessionId, limit = 5) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) { setRelated([]); return; }
    setLoading(true);
    getRelatedSessions(sessionId, limit)
      .then(data => setRelated(data.related || []))
      .catch(() => setRelated([]))
      .finally(() => setLoading(false));
  }, [sessionId, limit]);

  return { related, loading };
}

export function useProvenanceChain(type, nodeId) {
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!type || !nodeId) { setChain(null); return; }
    setLoading(true);
    setError(null);
    getProvenanceChain(type, nodeId)
      .then(data => setChain(data.success ? data : null))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [type, nodeId]);

  return { chain, loading, error };
}

export function useAISearch() {
  const [results, setResults] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [searchParams, setSearchParams] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(true);

  const search = useCallback(async (query) => {
    if (!query?.trim()) { setResults([]); setStrategy(null); setReasoning(null); setSearchParams(null); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await aiSearchDialogue(query);
      setResults(data.results || []);
      setStrategy(data.strategy || null);
      setReasoning(data.reasoning || null);
      setSearchParams(data.searchParams || null);
      setAiAvailable(data.aiAvailable !== false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, strategy, reasoning, searchParams, loading, error, aiAvailable, search };
}

export function useSessionReanalyze() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSessionId, setLastSessionId] = useState(null);

  const reanalyze = useCallback(async (sessionId) => {
    setLoading(true);
    setError(null);
    setLastSessionId(sessionId);
    try {
      await reanalyzeSession(sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { reanalyze, loading, error, lastSessionId };
}

export function useDialogueAnalytics(period = 'all') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalytics(period);
      setData(result.success ? result : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, loading, error, refetch: fetch };
}
