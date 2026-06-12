import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const BASE = `${API_BASE_URL}/source-catalog`;

export const listSources  = (params = {}) => axios.get(BASE, { params }).then(r => r.data);
export const getSource    = (id)          => axios.get(`${BASE}/${id}`).then(r => r.data);
export const createSource = (data)        => axios.post(BASE, data).then(r => r.data);
export const updateSource = (id, data)    => axios.put(`${BASE}/${id}`, data).then(r => r.data);
export const deleteSource = (id)          => axios.delete(`${BASE}/${id}`).then(r => r.data);

export const browseSource         = (id, body)    => axios.post(`${BASE}/${id}/browse`, body).then(r => r.data);
export const importDocument       = (id, body)    => axios.post(`${BASE}/${id}/import`, body).then(r => r.data);
export const getSourceDocuments   = (id, params)  => axios.get(`${BASE}/${id}/documents`, { params }).then(r => r.data);
export const updateSourceMethodology = (id, text) => axios.put(`${BASE}/${id}`, { methodology: text }).then(r => r.data);

export const startEnrich = (id, items) => axios.post(`${BASE}/${id}/enrich`, { items }).then(r => r.data);

export const getEnrichProgressUrl = (id, jobId) => `${BASE}/${id}/enrich/${jobId}/progress`;
