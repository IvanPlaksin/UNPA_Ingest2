import { useEffect, useCallback, useRef } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { fetchInsights, refreshInsights } from '../../../services/nexus.service';

/**
 * Hook for managing insights data fetching and state.
 *
 * - Fetches insights on mount
 * - Auto-refresh every 5 minutes
 * - Manual refresh capability
 * - Loading/error state management via nexusStore
 */
export const useInsights = (options = {}) => {
  const {
    autoRefresh = true,
    refreshInterval = 5 * 60 * 1000,
  } = options;

  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const namespace = useNexusStore(state => state.namespace);
  const insights = useNexusStore(state => state.insights);
  const insightsLoading = useNexusStore(state => state.insightsLoading);
  const insightsError = useNexusStore(state => state.insightsError);
  const insightsLastUpdated = useNexusStore(state => state.insightsLastUpdated);

  const setInsights = useNexusStore(state => state.setInsights);
  const setInsightsLoading = useNexusStore(state => state.setInsightsLoading);
  const setInsightsError = useNexusStore(state => state.setInsightsError);

  const loadInsights = useCallback(async (forceRefresh = false) => {
    if (!namespace) return;

    setInsightsLoading(true);

    try {
      const result = forceRefresh
        ? await refreshInsights(namespace)
        : await fetchInsights(namespace);

      if (isMountedRef.current) {
        setInsights(result.insights || []);
      }
    } catch (error) {
      console.error('[useInsights] Failed to load:', error);
      if (isMountedRef.current) {
        setInsightsError(error.message || 'Failed to load insights');
      }
    }
  }, [namespace, setInsights, setInsightsLoading, setInsightsError]);

  const refresh = useCallback(() => loadInsights(true), [loadInsights]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    loadInsights();
    return () => { isMountedRef.current = false; };
  }, [loadInsights]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    intervalRef.current = setInterval(() => loadInsights(false), refreshInterval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, loadInsights]);

  const getTimeSinceUpdate = useCallback(() => {
    if (!insightsLastUpdated) return null;
    const minutes = Math.floor((Date.now() - new Date(insightsLastUpdated).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }, [insightsLastUpdated]);

  const summary = useNexusStore(state => state.getInsightsSummary)();

  return {
    insights,
    loading: insightsLoading,
    error: insightsError,
    lastUpdated: insightsLastUpdated,
    timeSinceUpdate: getTimeSinceUpdate(),
    summary,
    refresh,
    reload: loadInsights,
  };
};

export default useInsights;
