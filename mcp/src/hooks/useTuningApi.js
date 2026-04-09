/**
 * @fileoverview React hook for Tuning API
 * @module hooks/useTuningApi
 */

import { useState, useCallback } from 'react';

const API_BASE = '/api/v1/tuning';

export function useTuningApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchApi = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API Error');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStatus = useCallback(() => fetchApi('/status'), [fetchApi]);
  const getConfig = useCallback(() => fetchApi('/config'), [fetchApi]);
  const getParameters = useCallback(() => fetchApi('/parameters'), [fetchApi]);
  const getMetrics = useCallback(() => fetchApi('/metrics'), [fetchApi]);

  const startAutoTuning = useCallback((options) => fetchApi('/auto', {
    method: 'POST',
    body: JSON.stringify(options),
  }), [fetchApi]);

  const startSession = useCallback((options) => fetchApi('/start', {
    method: 'POST',
    body: JSON.stringify(options),
  }), [fetchApi]);

  const iterate = useCallback((sessionId) => fetchApi(`/${sessionId}/iterate`, {
    method: 'POST',
  }), [fetchApi]);

  const stopSession = useCallback((sessionId, applyBest = true) => fetchApi(`/${sessionId}/stop`, {
    method: 'POST',
    body: JSON.stringify({ applyBest }),
  }), [fetchApi]);

  const pauseSession = useCallback((sessionId) => fetchApi(`/${sessionId}/pause`, {
    method: 'POST',
  }), [fetchApi]);

  const resumeSession = useCallback((sessionId) => fetchApi(`/${sessionId}/resume`, {
    method: 'POST',
  }), [fetchApi]);

  const getHistory = useCallback((sessionId) => fetchApi(`/${sessionId}/history`), [fetchApi]);

  const exportSession = useCallback((sessionId) => fetchApi(`/${sessionId}/export`), [fetchApi]);

  const updateConfig = useCallback((updates, persist = true) => fetchApi('/config', {
    method: 'PUT',
    body: JSON.stringify({ updates, persist }),
  }), [fetchApi]);

  const resetConfig = useCallback((persist = true) => fetchApi('/config/reset', {
    method: 'POST',
    body: JSON.stringify({ persist }),
  }), [fetchApi]);

  const evaluate = useCallback((data) => fetchApi('/evaluate', {
    method: 'POST',
    body: JSON.stringify(data),
  }), [fetchApi]);

  const getRecommendations = useCallback((evaluation) => fetchApi('/recommendations', {
    method: 'POST',
    body: JSON.stringify({ evaluation }),
  }), [fetchApi]);

  const compareConfigs = useCallback((config1, config2, goldenDataset) => fetchApi('/compare', {
    method: 'POST',
    body: JSON.stringify({ config1, config2, goldenDataset }),
  }), [fetchApi]);

  const getProfiles = useCallback(() => fetchApi('/profiles'), [fetchApi]);

  const loadProfile = useCallback((name) => fetchApi(`/profiles/${name}/load`, {
    method: 'POST',
  }), [fetchApi]);

  const saveProfile = useCallback((name, config) => fetchApi(`/profiles/${name}/save`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  }), [fetchApi]);

  const getMetricTrend = useCallback((metricName, windowSize = 10) =>
    fetchApi(`/metrics/${metricName}/trend?window=${windowSize}`), [fetchApi]);

  const getBestRun = useCallback((metric = 'f1_score', minimize = false) =>
    fetchApi(`/metrics/best?metric=${metric}&minimize=${minimize}`), [fetchApi]);

  // LLM Provider management
  const getProviders = useCallback(() => fetchApi('/providers'), [fetchApi]);

  const selectProvider = useCallback((name) => fetchApi(`/providers/${name}/select`, {
    method: 'POST',
  }), [fetchApi]);

  const testProvider = useCallback((name, text) => fetchApi(`/providers/${name}/test`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }), [fetchApi]);

  return {
    loading,
    error,
    clearError: () => setError(null),
    // Status
    getStatus,
    // Config
    getConfig,
    getParameters,
    updateConfig,
    resetConfig,
    // Profiles
    getProfiles,
    loadProfile,
    saveProfile,
    // Session
    startSession,
    startAutoTuning,
    iterate,
    stopSession,
    pauseSession,
    resumeSession,
    getHistory,
    exportSession,
    // Metrics
    getMetrics,
    getMetricTrend,
    getBestRun,
    // Evaluation
    evaluate,
    getRecommendations,
    compareConfigs,
    // LLM Providers
    getProviders,
    selectProvider,
    testProvider,
  };
}

export default useTuningApi;
