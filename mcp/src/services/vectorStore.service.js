import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const base = `${API_BASE_URL}/vectors`;

export async function listCollections() {
  const { data } = await axios.get(`${base}/collections`);
  return data.data;
}

export async function getCollectionInfo(collection) {
  const { data } = await axios.get(`${base}/collections/${collection}`);
  return data.data;
}

export async function countPoints(collection, filters = {}) {
  const { data } = await axios.get(`${base}/collections/${collection}/count`, { params: filters });
  return data.data.count;
}

export async function browsePoints(collection, { limit = 50, offset = null, withVector = false, ...filters } = {}) {
  const params = { limit, ...filters };
  if (offset) params.offset = offset;
  if (withVector) params.withVector = 'true';
  const { data } = await axios.get(`${base}/collections/${collection}/points`, { params });
  return data.data;
}

export async function getPoint(collection, id) {
  const { data } = await axios.get(`${base}/collections/${collection}/points/${id}`);
  return data.data;
}

export async function semanticSearch(collection, text, { limit = 20, scoreThreshold = 0.1, ...filters } = {}) {
  const { data } = await axios.post(`${base}/collections/${collection}/search`, {
    text, limit, scoreThreshold, ...filters,
  });
  return data.data;
}

export async function getKNN(collection, pointId, { k = 10, ...filters } = {}) {
  const { data } = await axios.post(`${base}/collections/${collection}/knn`, {
    pointId, k, ...filters,
  });
  return data.data;
}

export async function getKNNGraph(collection, { pointIds, k = 5, limit = 100, force = false, ...filters } = {}) {
  const { data } = await axios.post(`${base}/collections/${collection}/knn-graph`, {
    pointIds, k, limit, force, ...filters,
  });
  return data.data;
}

export async function invalidateKNNCache(collection) {
  const { data } = await axios.delete(`${base}/collections/${collection}/knn-graph/cache`);
  return data.data;
}

export async function computeProjection(collection, { limit = 500, dims = 2, ...filters } = {}) {
  const { data } = await axios.post(`${base}/collections/${collection}/projection`, {
    limit, dims, ...filters,
  });
  return data.data;
}

export async function computeSimilarity(collection, pointIds) {
  const { data } = await axios.post(`${base}/collections/${collection}/similarity`, { pointIds });
  return data.data;
}

export async function getCollectionStats(collection, { limit = 1500 } = {}) {
  const { data } = await axios.get(`${base}/collections/${collection}/stats`, { params: { limit } });
  return data.data;
}

export async function radiusSearch(collection, { vectorId, radius = 0.7, limit = 100 } = {}) {
  const { data } = await axios.post(`${base}/collections/${collection}/radius-search`, {
    vectorId, radius, limit,
  });
  return data.data;
}
