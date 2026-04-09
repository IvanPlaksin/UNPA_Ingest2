/**
 * Hooks for Codex API (hierarchy, search, sections, ADRs)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api.config';

const CODEX_API = `${API_BASE_URL}/codex`;

/**
 * Hook for fetching Codex hierarchy (Parts → Sections)
 */
export function useCodexHierarchy() {
  const [hierarchy, setHierarchy] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHierarchy = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${CODEX_API}/hierarchy`);
      const data = await res.json();
      if (data.success) {
        setHierarchy(data.data.hierarchy || []);
        setMetadata(data.data.metadata?.properties || data.data.metadata || null);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

  return { hierarchy, metadata, loading, error, refetch: fetchHierarchy };
}

/**
 * Hook for Codex full-text search with debounce
 */
export function useCodexSearch() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const search = useCallback((query) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    // Debounce 300ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`${CODEX_API}/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
          setResults(data.data || []);
          setError(null);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, search, clear };
}

/**
 * Hook for fetching rules of a specific section
 */
export function useSectionRules(sectionId) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sectionId) { setRules([]); return; }

    setLoading(true);
    fetch(`${CODEX_API}/sections/${sectionId}/rules`)
      .then(r => r.json())
      .then(data => { if (data.success) setRules(data.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sectionId]);

  return { rules, loading };
}

/**
 * Hook for fetching ADRs
 */
export function useCodexADRs() {
  const [adrs, setAdrs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${CODEX_API}/adrs`)
      .then(r => r.json())
      .then(data => { if (data.success) setAdrs(data.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { adrs, loading };
}

/**
 * Hook for Codex graph visualization data (parts + cross-refs + ADR links)
 */
export function useCodexGraph() {
  const [data, setData] = useState({ parts: [], crossRefs: [], adrLinks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${CODEX_API}/graph`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { ...data, loading, error };
}

/**
 * Fetch children of a Codex graph node (Part→Sections, Section→Rules).
 * Returns { parentId, parentType, childType, edgeLabel, children }
 */
export async function fetchGraphChildren(nodeId) {
  const res = await fetch(`${CODEX_API}/graph/expand/${encodeURIComponent(nodeId)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
