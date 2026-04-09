import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config/api.config';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedResult = null;
let cachedAt = 0;

/**
 * Hook to check if embedding service (TEI / Ollama) is available.
 * Caches result for 5 minutes (module-level) to avoid repeated calls.
 */
export function useEmbeddingsStatus() {
  const [status, setStatus] = useState({
    available: cachedResult?.available ?? false,
    provider: cachedResult?.provider ?? 'none',
    model: cachedResult?.model ?? null,
    loading: !cachedResult,
    error: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Use cache if fresh
    if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
      setStatus({
        available: cachedResult.available,
        provider: cachedResult.provider,
        model: cachedResult.model,
        loading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const resp = await fetch(`${API_BASE_URL}/health/embeddings`, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        cachedResult = data;
        cachedAt = Date.now();

        if (!cancelled && mounted.current) {
          setStatus({
            available: data.available,
            provider: data.provider,
            model: data.model,
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled && mounted.current) {
          setStatus(prev => ({ ...prev, loading: false, error: e.message }));
        }
      }
    }

    check();
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  return status;
}
