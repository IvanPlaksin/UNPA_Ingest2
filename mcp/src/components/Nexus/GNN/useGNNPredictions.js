import { useState, useCallback, useEffect } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { getGNNStatus, predictLinks, refreshGNNModel } from '../../../services/nexus.service';

/**
 * Hook for GNN predictions state and logic.
 */
export const useGNNPredictions = () => {
  const [status, setStatus] = useState({ ready: false, loading: true });
  const [predictions, setPredictions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const namespace = useNexusStore(state => state.namespace);

  // Check GNN status on mount
  useEffect(() => {
    const checkStatus = async () => {
      const result = await getGNNStatus(namespace);
      setStatus({
        ready: result.ready || false,
        loading: false,
        lastUpdated: result.lastUpdated,
        modelVersion: result.modelVersion,
        error: result.error,
      });
    };
    checkStatus();
  }, [namespace]);

  const runPrediction = useCallback(async (nodeId, options = {}) => {
    if (!nodeId) {
      setError('No node selected');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPredictions([]);

    try {
      const result = await predictLinks(namespace, nodeId, options);
      setPredictions(result.predictions || []);

      if (result.isFallback) {
        setError('Using demo predictions (GNN service unavailable)');
      }
    } catch (err) {
      console.error('Prediction failed:', err);
      setError(err.message || 'Prediction failed');
    } finally {
      setIsLoading(false);
    }
  }, [namespace]);

  const refresh = useCallback(async () => {
    setStatus(prev => ({ ...prev, loading: true }));

    try {
      await refreshGNNModel(namespace);
      const result = await getGNNStatus(namespace);
      setStatus({
        ready: result.ready || false,
        loading: false,
        lastUpdated: new Date().toISOString(),
        modelVersion: result.modelVersion,
      });
    } catch (err) {
      console.error('Refresh failed:', err);
      setStatus(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, [namespace]);

  const clearPredictions = useCallback(() => {
    setPredictions([]);
    setError(null);
  }, []);

  return {
    status,
    predictions,
    isLoading,
    error,
    runPrediction,
    refresh,
    clearPredictions,
  };
};

export default useGNNPredictions;
