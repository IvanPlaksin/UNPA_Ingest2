/**
 * Knowledge Dashboard API client — graph + vector composition stats.
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
    baseURL: `${API_BASE_URL}/knowledge-dashboard`,
    headers: { 'Content-Type': 'application/json' },
});

/** GET /graph-stats — node/relationship/namespace aggregations. */
export const getGraphStats = async (heavy = false) => {
    const r = await api.get('/graph-stats', { params: heavy ? { heavy: true } : {} });
    return r.data;
};

/** GET /vector-stats — Qdrant collections composition. */
export const getVectorStats = async () => {
    const r = await api.get('/vector-stats');
    return r.data;
};

export default { getGraphStats, getVectorStats };
