import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const base = `${API_BASE_URL}/knowledge-map`;

export async function fetchKnowledgeMap({
  collection        = 'documents_entities',
  namespace         = null,
  semanticThreshold = 0.7,
  limit             = 1500,
} = {}) {
  const params = { collection, semanticThreshold, limit };
  if (namespace) params.namespace = namespace;
  const { data } = await axios.get(base, { params });
  return data.data;
}
