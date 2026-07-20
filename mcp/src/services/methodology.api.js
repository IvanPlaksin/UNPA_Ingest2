import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/methodology/investigation`,
  headers: { 'Content-Type': 'application/json' },
});

const unwrap = (res) => res.data?.data ?? res.data;

export const listMethodologies = async ({ status, limit = 50, offset = 0 } = {}) => {
  const params = {};
  if (status) params.status = status;
  if (limit !== 50) params.limit = limit;
  if (offset) params.offset = offset;
  const res = await api.get('/', { params });
  return unwrap(res);
};

export const getMethodology = async (id) => {
  const res = await api.get(`/${id}`);
  return unwrap(res);
};

export const createMethodology = async (payload) => {
  const res = await api.post('/', payload);
  return unwrap(res);
};

export const updateMethodology = async (id, payload) => {
  const res = await api.patch(`/${id}`, payload);
  return unwrap(res);
};

export const setMethodologyStatus = async (id, status) => {
  const res = await api.patch(`/${id}/status`, { status });
  return unwrap(res);
};

export const executeMethodology = async (id, { parameters = {}, sessionId }) => {
  const res = await api.post(`/${id}/execute`, { parameters, sessionId });
  return unwrap(res);
};

export const evaluateMethodology = async (id, content) => {
  const res = await api.post(`/${id}/evaluate`, { content });
  return unwrap(res);
};
