import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({ baseURL: API_BASE_URL });

export function useProposals(statusFilter) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/metacognition/proposals${params}`);
      if (data.success) {
        setProposals(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const approve = async (id, approver = 'user') => {
    const { data } = await api.post(`/metacognition/proposals/${id}/approve`, { approver });
    if (data.success) fetchProposals();
    return data;
  };

  const reject = async (id, rejector = 'user', reason = '') => {
    const { data } = await api.post(`/metacognition/proposals/${id}/reject`, { rejector, reason });
    if (data.success) fetchProposals();
    return data;
  };

  const execute = async (id) => {
    const { data } = await api.post(`/metacognition/proposals/${id}/execute`);
    if (data.success) fetchProposals();
    return data;
  };

  const runDetection = async () => {
    const { data } = await api.post('/metacognition/detect');
    if (data.success) fetchProposals();
    return data;
  };

  return { proposals, loading, error, refetch: fetchProposals, approve, reject, execute, runDetection };
}

export function useMetacognitionStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/metacognition/stats')
      .then(({ data }) => { if (data.success) setStats(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}
