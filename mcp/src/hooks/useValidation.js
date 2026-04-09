/**
 * Hooks for Codex Validation API
 */
import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api.config';

const VAL_API = `${API_BASE_URL}/codex/validation`;

/** Quick compliance score */
export function useValidationScore() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${VAL_API}/score`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

/** Full validation report */
export function useValidationReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${VAL_API}/report`);
      const d = await r.json();
      if (d.success && d.data) setReport(d.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { report, loading, refetch: fetch_ };
}

/** Validation history for sparkline */
export function useValidationHistory(limit = 10) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${VAL_API}/history?limit=${limit}`)
      .then(r => r.json())
      .then(d => { if (d.success) setHistory(d.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit]);

  return { history, loading };
}

/** Run validation (POST) */
export function useRunValidation() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async (options = {}) => {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(`${VAL_API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeInfo: true, ...options })
      });
      const d = await r.json();
      if (d.success) {
        setResult(d.data);
        return d.data;
      } else {
        setError(d.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { run, running, result, error };
}

/** Validation issues (synced from violations) */
export function useValidationIssues() {
  const [data, setData] = useState({ issues: [], summary: null });
  const [loading, setLoading] = useState(true);

  const fetchIssues = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters).toString();
      const r = await fetch(`${VAL_API}/issues?${params}`);
      const d = await r.json();
      if (d.success) setData(d.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const syncIssues = useCallback(async () => {
    await fetch(`${VAL_API}/sync-issues`, { method: 'POST' });
    await fetchIssues();
  }, [fetchIssues]);

  const createProposal = useCallback(async (issueId) => {
    const r = await fetch(`${VAL_API}/issues/${issueId}/create-proposal`, { method: 'POST' });
    return r.json();
  }, []);

  const autoFix = useCallback(async () => {
    const r = await fetch(`${VAL_API}/auto-fix`, { method: 'POST' });
    return r.json();
  }, []);

  return { ...data, loading, refetch: fetchIssues, syncIssues, createProposal, autoFix };
}
