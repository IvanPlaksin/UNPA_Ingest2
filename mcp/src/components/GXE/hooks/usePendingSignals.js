import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to subscribe to pending signals via SSE and REST fallback.
 */
export function usePendingSignals(executionId, graphId, apiBaseUrl = '/api/v1') {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  const loadSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (executionId) params.set('executionId', executionId);
      if (graphId) params.set('graphId', graphId);

      const response = await fetch(`${apiBaseUrl}/runtime/signals?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSignals(data.signals || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [executionId, graphId, apiBaseUrl]);

  useEffect(() => {
    loadSignals();

    const params = new URLSearchParams();
    if (executionId) params.set('executionId', executionId);
    if (graphId) params.set('graphId', graphId);

    let eventSource;
    try {
      eventSource = new EventSource(`${apiBaseUrl}/runtime/signals/stream?${params}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('signal:initiated', (event) => {
        const signal = JSON.parse(event.data);
        setSignals(prev => [...prev, signal]);
      });

      eventSource.addEventListener('signal:updated', (event) => {
        const signal = JSON.parse(event.data);
        setSignals(prev => prev.map(s =>
          s.resumeToken === signal.resumeToken ? { ...s, ...signal } : s
        ));
      });

      eventSource.addEventListener('signal:resolved', (event) => {
        const signal = JSON.parse(event.data);
        setSignals(prev => prev.map(s =>
          s.resumeToken === signal.resumeToken ? { ...s, status: 'RESOLVED', ...signal } : s
        ));
      });

      eventSource.addEventListener('signal:timeout', (event) => {
        const signal = JSON.parse(event.data);
        setSignals(prev => prev.map(s =>
          s.resumeToken === signal.resumeToken ? { ...s, status: 'TIMED_OUT', ...signal } : s
        ));
      });

      eventSource.onerror = () => {
        // EventSource auto-reconnects
      };
    } catch (e) {
      // SSE not available, rely on polling via refresh()
      console.warn('SSE not available for signals:', e.message);
    }

    return () => {
      eventSource?.close();
      eventSourceRef.current = null;
    };
  }, [executionId, graphId, apiBaseUrl, loadSignals]);

  return { signals, loading, error, refresh: loadSignals };
}
