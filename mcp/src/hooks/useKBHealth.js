import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({ baseURL: API_BASE_URL });

export function useKBHealth(autoRefresh = false, interval = 60000) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/health/kb');
      if (data.success) {
        setHealth(data.data);
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

  useEffect(() => {
    fetchHealth();
    if (autoRefresh) {
      const timer = setInterval(fetchHealth, interval);
      return () => clearInterval(timer);
    }
  }, [fetchHealth, autoRefresh, interval]);

  return { health, loading, error, refetch: fetchHealth };
}

export function useKBIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/health/kb/issues');
      if (data.success) {
        setIssues(data.data);
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

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  return { issues, loading, error, refetch: fetchIssues };
}
