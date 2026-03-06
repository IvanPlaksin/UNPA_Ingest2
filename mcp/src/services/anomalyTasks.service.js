import { API_BASE_URL } from '../config/api.config';

const BASE = `${API_BASE_URL}/anomaly-tasks`;

export const anomalyTasksService = {
  async previewTasks(sessionId, filter = 'actionable') {
    const resp = await fetch(`${BASE}/preview/${sessionId}?filter=${filter}`);
    if (!resp.ok) throw new Error('Failed to preview tasks');
    return resp.json();
  },

  async createTask(sessionId, anomaly) {
    const resp = await fetch(`${BASE}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, anomaly }),
    });
    if (!resp.ok) throw new Error('Failed to create task');
    return resp.json();
  },

  async createBatchTasks(sessionId, anomalies, filter = 'actionable') {
    const resp = await fetch(`${BASE}/create-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, anomalies, filter }),
    });
    if (!resp.ok) throw new Error('Failed to create batch tasks');
    return resp.json();
  },
};
