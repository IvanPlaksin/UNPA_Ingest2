import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const base = `${API_BASE_URL}/entity-store`;

export async function importFromDocument(docId, { entityIds = null, namespace = 'DEFAULT' } = {}) {
    const { data } = await axios.post(`${base}/import/${docId}`, { entityIds, namespace });
    return data.data;
}

export async function createEntity(payload) {
    const { data } = await axios.post(base, payload);
    return data.data;
}

export async function listEntities({ namespace, type, search } = {}) {
    const params = {};
    if (namespace) params.namespace = namespace;
    if (type)      params.type = type;
    if (search)    params.search = search;
    const { data } = await axios.get(base, { params });
    return data.data;
}

export async function listNamespaces() {
    const { data } = await axios.get(`${base}/namespaces`);
    return data.data;
}

export async function getEntityGraph(namespace = null) {
    const params = namespace ? { namespace } : {};
    const { data } = await axios.get(`${base}/graph`, { params });
    return data.data;
}

export async function getEntityStoreStats() {
    const { data } = await axios.get(`${base}/stats`);
    return data.data;
}

export async function getEntity(id) {
    const { data } = await axios.get(`${base}/${id}`);
    return data.data;
}

export async function updateEntity(id, payload) {
    const { data } = await axios.put(`${base}/${id}`, payload);
    return data.data;
}

export async function deleteEntity(id) {
    const { data } = await axios.delete(`${base}/${id}`);
    return data.data;
}

export async function deleteNamespace(namespace) {
    const { data } = await axios.delete(`${base}/namespace/${encodeURIComponent(namespace)}`);
    return data.data;
}

export async function saveLayout(namespace, { algorithm, positions, config, label = '' }) {
    const { data } = await axios.post(`${base}/layout`, { namespace, algorithm, positions, config, label });
    return data.data;
}

export async function loadLayout(namespace) {
    const { data } = await axios.get(`${base}/layout`, { params: { namespace } });
    return data.data;  // null if no saved layout
}

// ── Pyramid ───────────────────────────────────────────────────────────────────

export async function buildAndLayoutPyramid(namespace, { minCommunitySize = 2, canvasWidth = 10000, canvasHeight = 10000 } = {}) {
    const { data } = await axios.post(`${base}/pyramid/build-and-layout`, { namespace, minCommunitySize, canvasWidth, canvasHeight });
    return data.data;
}

export async function getPyramidStatus(namespace) {
    const { data } = await axios.get(`${base}/pyramid/status`, { params: { namespace } });
    return data.data;
}

// ── Viewport (LOD) ────────────────────────────────────────────────────────────

export async function getViewport(namespace, bbox, level = 0, budget = 400) {
    const { data } = await axios.get(`${base}/viewport`, {
        params: {
            namespace,
            minX: bbox.minX, minY: bbox.minY,
            maxX: bbox.maxX, maxY: bbox.maxY,
            level, budget,
        },
    });
    return data.data;
}

export async function expandCluster(clusterId) {
    const { data } = await axios.post(`${base}/viewport/expand`, { clusterId });
    return data.data;
}

export async function getDocumentRefs(namespace = null) {
    const params = namespace ? { namespace } : {};
    const { data } = await axios.get(`${base}/docrefs`, { params });
    return data.data;
}

export async function getEntitySubgraph(entityId, depth = 2) {
    const { data } = await axios.get(`${base}/${entityId}/subgraph`, { params: { depth } });
    return data.data;
}

export async function findPaths(fromId, toId, k = 5) {
    const { data } = await axios.get(`${base}/paths`, { params: { from: fromId, to: toId, k } });
    return data.data;
}

export async function interpretPaths(fromEntity, toEntity, paths, structuralAnalysis) {
    const { data } = await axios.post(`${base}/paths/interpret`, { fromEntity, toEntity, paths, structuralAnalysis });
    return data.data;
}
