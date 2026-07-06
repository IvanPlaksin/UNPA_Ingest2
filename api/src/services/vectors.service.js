'use strict';
/**
 * VectorsService — Qdrant wrapper for Vector Store UI.
 * Provides: collection stats, point browsing, semantic search,
 * k-NN lookup, PCA projection, and cosine similarity matrix.
 */

const qdrant = require('./qdrant.service');
const tei    = require('./tei.service');

function client() { return qdrant.client || qdrant; }

// ── Collection helpers ───────────────────────────────────────────────

async function listCollections() {
  const c = client();
  const result = await c.getCollections();
  const collections = result?.collections || result?.result?.collections || [];
  const details = await Promise.all(
    collections.map(async col => {
      try {
        const info = await c.getCollection(col.name);
        const cfg  = info?.config?.params || info?.result?.config?.params || {};
        return {
          name:        col.name,
          vectorSize:  cfg.vectors?.size ?? cfg.size ?? null,
          distance:    cfg.vectors?.distance ?? cfg.distance ?? null,
          pointsCount: info?.points_count ?? info?.result?.points_count ?? 0,
          status:      info?.status ?? info?.result?.status ?? 'unknown',
        };
      } catch {
        return { name: col.name, pointsCount: 0, status: 'error' };
      }
    })
  );
  return details;
}

async function getCollectionInfo(collection) {
  const c = client();
  const info = await c.getCollection(collection);
  const raw  = info?.result ?? info;
  const cfg  = raw?.config?.params ?? {};
  return {
    name:        collection,
    vectorSize:  cfg.vectors?.size ?? cfg.size ?? null,
    distance:    cfg.vectors?.distance ?? cfg.distance ?? null,
    pointsCount: raw.points_count ?? 0,
    status:      raw.status ?? 'unknown',
    indexedVectorsCount: raw.indexed_vectors_count ?? raw.points_count ?? 0,
  };
}

// ── Browse points (scroll) ──────────────────────────────────────────

async function browsePoints(collection, { limit = 50, offset = null, filter = null, withVector = false } = {}) {
  const c = client();
  const opts = { limit, with_payload: true, with_vector: withVector };
  if (filter) opts.filter = filter;
  if (offset) opts.offset = offset;

  const result = await c.scroll(collection, opts);
  const points = result?.points ?? result ?? [];
  return {
    points: points.map(normalizePoint),
    nextOffset: result?.next_page_offset ?? null,
  };
}

function buildFilter({ entityType, epistemicLayer, sourceDocumentId, methodologyId }) {
  const must = [];
  if (entityType)       must.push({ key: 'entityType',       match: { value: entityType } });
  if (epistemicLayer)   must.push({ key: 'epistemicLayer',   match: { value: epistemicLayer } });
  if (sourceDocumentId) must.push({ key: 'sourceDocumentId', match: { value: sourceDocumentId } });
  if (methodologyId)    must.push({ key: 'methodologyId',    match: { value: methodologyId } });
  return must.length ? { must } : null;
}

function normalizePoint(pt) {
  const p = pt.payload ?? {};
  return {
    id:              pt.id,
    score:           pt.score ?? null,
    name:            p.name ?? p.label ?? String(pt.id).slice(0, 8),
    entityType:      p.entityType ?? p.type ?? 'UNKNOWN',
    epistemicLayer:  p.epistemicLayer ?? null,
    sourceDocumentId: p.sourceDocumentId ?? p.documentId ?? null,
    methodologyId:   p.methodologyId ?? null,
    embeddingModel:  p.embeddingModel ?? null,
    confidence:      p.confidence ?? null,
    indexedAt:       p.indexedAt ?? null,
    payload:         p,
  };
}

// ── Semantic search ─────────────────────────────────────────────────

async function semanticSearch(collection, { text, limit = 20, filter = null, scoreThreshold = 0.1 } = {}) {
  // Embed text via TEI
  const embeddings = await tei.getEmbeddings([text]);
  const queryVector = embeddings[0];

  const c = client();
  const opts = { limit, with_payload: true, score_threshold: scoreThreshold };
  if (filter) opts.filter = filter;

  const results = await c.search(collection, { vector: queryVector, ...opts });
  const points  = results?.result ?? results ?? [];
  return points.map(normalizePoint);
}

// ── Radius (Semantic Lens) search ───────────────────────────────────

async function radiusSearch(collection, { vectorId, radius = 0.7, limit = 100 } = {}) {
  const c = client();
  const retrieved = await c.retrieve(collection, { ids: [vectorId], with_vector: true, with_payload: true });
  const anchor = (retrieved?.result ?? retrieved ?? [])[0];
  if (!anchor?.vector) throw new Error(`Point ${vectorId} not found or has no vector`);

  const results = await c.search(collection, {
    vector: anchor.vector, limit: limit + 1, with_payload: true, score_threshold: radius,
  });
  const pts = (results?.result ?? results ?? []).filter(r => String(r.id) !== String(vectorId));

  // Layer distribution
  const layerDist = {};
  pts.forEach(p => {
    const l = p.payload?.epistemicLayer ?? 'N/A';
    layerDist[l] = (layerDist[l] || 0) + 1;
  });

  return {
    anchor: normalizePoint({ ...anchor, id: vectorId }),
    neighbors: pts.slice(0, limit).map(normalizePoint),
    layerDistribution: layerDist,
    radius,
  };
}

// ── k-NN lookup ─────────────────────────────────────────────────────

async function getKNN(collection, pointId, { k = 10, filter = null } = {}) {
  const c = client();
  // First get the point's vector
  const pointResult = await c.retrieve(collection, { ids: [pointId], with_vector: true, with_payload: true });
  const point = (pointResult?.result ?? pointResult ?? [])[0];
  if (!point?.vector) throw new Error(`Point ${pointId} not found or has no vector`);

  const opts = { limit: k + 1, with_payload: true, score_threshold: 0.0 };
  if (filter) opts.filter = filter;

  const results = await c.search(collection, { vector: point.vector, ...opts });
  const candidates = (results?.result ?? results ?? []).filter(r => r.id !== pointId).slice(0, k);
  return {
    source: normalizePoint({ ...point, id: pointId }),
    neighbors: candidates.map(normalizePoint),
  };
}

// ── KNN Graph Cache ──────────────────────────────────────────────────
const _knnCache    = new Map();
const KNN_TTL_MS   = 5 * 60 * 1000;   // 5 min
const KNN_MAX_ENTRIES = 50;

function _knnKey(collection, k, limit, filter) {
  return `${collection}\0${k}\0${limit}\0${JSON.stringify(filter ?? null)}`;
}
function _knnCacheGet(key) {
  const e = _knnCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > KNN_TTL_MS) { _knnCache.delete(key); return null; }
  return e;
}
function _knnCacheSet(key, data) {
  if (_knnCache.size >= KNN_MAX_ENTRIES) {
    const [oldestKey] = [..._knnCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    _knnCache.delete(oldestKey);
  }
  _knnCache.set(key, { data, ts: Date.now() });
}
function invalidateKNNCache(collection) {
  const prefix = collection + '\0';
  for (const key of _knnCache.keys()) if (key.startsWith(prefix)) _knnCache.delete(key);
  return true;
}
function knnCacheStats() {
  return [..._knnCache.entries()].map(([key, e]) => ({
    key, ageMs: Date.now() - e.ts,
    nodes: e.data.nodes?.length ?? 0, links: e.data.links?.length ?? 0,
  }));
}

// ── KNN Graph (batch) ───────────────────────────────────────────────
// Returns {nodes, links, _cached, _cachedAt} for react-force-graph

async function buildKNNGraph(collection, { pointIds = [], k = 5, limit = 100, filter = null, force = false } = {}) {
  const cacheKey = _knnKey(collection, k, limit, filter);

  if (!force) {
    const hit = _knnCacheGet(cacheKey);
    if (hit) return { ...hit.data, _cached: true, _cachedAt: hit.ts };
  }

  if (pointIds.length === 0) {
    const browsed = await browsePoints(collection, { limit: Math.min(limit, 500), filter });
    pointIds = browsed.points.map(p => p.id);
  }

  // Retrieve all vectors at once
  const c = client();
  const retrieved = await c.retrieve(collection, { ids: pointIds, with_vector: true, with_payload: true });
  const pts = (retrieved?.result ?? retrieved ?? []);

  const nodeMap   = new Map(pts.map(p => [p.id, normalizePoint(p)]));
  const links     = [];
  const seenEdges = new Set();

  // O(N²) local cosine similarity — intentional; avoid N Qdrant round-trips
  for (const src of pts) {
    if (!src.vector) continue;
    const scores = pts
      .filter(t => t.id !== src.id && t.vector)
      .map(t => ({ id: t.id, sim: cosineSim(src.vector, t.vector) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k);

    for (const { id, sim } of scores) {
      const edgeKey = [src.id, id].sort().join('|');
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        links.push({ source: src.id, target: id, similarity: sim });
      }
    }
  }

  const result = {
    nodes: pts.map(p => ({
      id:               p.id,
      name:             nodeMap.get(p.id)?.name          ?? String(p.id).slice(0, 8),
      entityType:       nodeMap.get(p.id)?.entityType    ?? 'UNKNOWN',
      epistemicLayer:   nodeMap.get(p.id)?.epistemicLayer ?? null,
      sourceDocumentId: nodeMap.get(p.id)?.sourceDocumentId ?? null,
    })),
    links,
  };

  _knnCacheSet(cacheKey, result);
  return { ...result, _cached: false, _cachedAt: Date.now() };
}

// ── Projection (PCA) ─────────────────────────────────────────────────

async function computeProjection(collection, { limit = 500, dims = 2, filter = null } = {}) {
  const c = client();
  // Scroll to get points with vectors
  const opts = { limit, with_payload: true, with_vector: true };
  if (filter) opts.filter = filter;
  const result = await c.scroll(collection, opts);
  const pts = result?.points ?? result ?? [];
  if (pts.length === 0) return { points: [], explained: [] };

  const vectors = pts.map(p => p.vector).filter(Boolean);
  if (vectors.length === 0) return { points: pts.map(p => ({ id: p.id, x: 0, y: 0, ...normalizePoint(p) })), explained: [] };

  const { projected, explained } = pca(vectors, dims);

  const safe = (v) => (Number.isFinite(v) ? v : 0);

  return {
    points: pts.map((p, i) => ({
      ...normalizePoint(p),
      id: p.id,
      x:  safe(projected[i]?.[0]),
      y:  safe(projected[i]?.[1]),
      z:  dims >= 3 ? safe(projected[i]?.[2]) : undefined,
    })),
    explained,
    totalPoints: pts.length,
  };
}

// ── Similarity Matrix ────────────────────────────────────────────────

async function computeSimilarityMatrix(collection, pointIds) {
  if (!pointIds?.length) return { ids: [], matrix: [] };
  const ids = pointIds.slice(0, 60); // cap at 60×60

  const c = client();
  const retrieved = await c.retrieve(collection, { ids, with_vector: true, with_payload: true });
  const pts = (retrieved?.result ?? retrieved ?? []);
  const ptMap = new Map(pts.map(p => [String(p.id), p]));

  const orderedIds = ids.filter(id => ptMap.has(String(id)));
  const matrix = orderedIds.map(rowId => {
    const rowPt = ptMap.get(String(rowId));
    return orderedIds.map(colId => {
      if (rowId === colId) return 1.0;
      const colPt = ptMap.get(String(colId));
      if (!rowPt?.vector || !colPt?.vector) return 0;
      return parseFloat(cosineSim(rowPt.vector, colPt.vector).toFixed(4));
    });
  });

  const labels = orderedIds.map(id => {
    const p = ptMap.get(String(id));
    const name = p?.payload?.name ?? String(id).slice(0, 10);
    return { id, name };
  });

  return { ids: orderedIds, labels, matrix };
}

// ── Collection Statistics ────────────────────────────────────────────

async function getCollectionStats(collection, { sampleLimit = 1500 } = {}) {
  const c = client();
  // Scroll a representative sample — no vectors needed, just payloads
  const result = await c.scroll(collection, {
    limit: sampleLimit, with_payload: true, with_vector: false,
  });
  const pts = result?.points ?? result ?? [];

  const typeCount  = {};
  const layerCount = {};
  const modelCount = {};
  const docSet     = new Set();
  const methodSet  = new Set();
  let minTs = null, maxTs = null;

  for (const pt of pts) {
    const p  = pt.payload ?? {};
    const ty = (p.entityType ?? p.type ?? 'UNKNOWN').toUpperCase();
    const la = p.epistemicLayer ?? null;
    const mo = p.embeddingModel ?? 'unknown';
    const di = p.sourceDocumentId ?? p.documentId ?? null;
    const me = p.methodologyId ?? null;
    const it = p.indexedAt   ?? null;

    typeCount[ty]  = (typeCount[ty]  || 0) + 1;
    modelCount[mo] = (modelCount[mo] || 0) + 1;
    if (la) layerCount[la] = (layerCount[la] || 0) + 1;
    if (di) docSet.add(di);
    if (me) methodSet.add(me);
    if (it) {
      const ts = new Date(it).getTime();
      if (!isNaN(ts)) {
        if (minTs === null || ts < minTs) minTs = ts;
        if (maxTs === null || ts > maxTs) maxTs = ts;
      }
    }
  }

  const toArr = obj =>
    Object.entries(obj)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    sampleSize:        pts.length,
    typeDistribution:  toArr(typeCount),
    layerDistribution: toArr(layerCount),
    modelDistribution: toArr(modelCount),
    documentCount:     docSet.size,
    methodologyCount:  methodSet.size,
    indexedRange:      minTs !== null
      ? { min: new Date(minTs).toISOString(), max: new Date(maxTs).toISOString() }
      : null,
  };
}

// ── Exact count ─────────────────────────────────────────────────────

async function countPoints(collection, filter = null) {
  const c = client();
  const opts = { exact: true };
  if (filter) opts.filter = filter;
  const result = await c.count(collection, opts);
  return result?.count ?? 0;
}

// ── Math helpers ─────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * PCA via power iteration (truncated SVD approximation).
 * Returns top-`dims` principal components.
 * @param {number[][]} X   - N × D data matrix
 * @param {number}     dims - target dimensionality (2 or 3)
 */
// Seeded LCG PRNG — ensures PCA is deterministic for the same data.
function makePrng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

function pca(X, dims = 2) {
  const N = X.length;
  const D = X[0].length;
  const rand = makePrng(42);

  // 1. Center
  const mean = new Array(D).fill(0);
  for (const v of X) for (let j = 0; j < D; j++) mean[j] += v[j] / N;
  const Xc = X.map(v => v.map((x, j) => x - mean[j]));

  // 2. Power iteration for top-dims eigenvectors of covariance X^T X
  const components = [];
  const explained  = [];
  let Xres = Xc.map(r => [...r]);

  for (let k = 0; k < Math.min(dims, D, N); k++) {
    // Deterministic init via seeded PRNG (same seed → same projection every run)
    let vec = new Array(D).fill(0).map(() => rand() - 0.5);
    vec = normalize(vec);

    // 60 power iterations: v ← normalize(X^T · (X · v))
    // X·v is N-dim, X^T·(N-dim) is D-dim — vec stays D-dim throughout
    for (let iter = 0; iter < 60; iter++) {
      vec = normalize(matTVec(Xres, matVec(Xres, vec)));
    }

    // Explained variance = ||X·vec||²  (vec is D-dim)
    const proj = Xres.map(row => dot(row, vec));
    const variance = proj.reduce((s, x) => s + x * x, 0) / N;
    explained.push(parseFloat(variance.toFixed(4)));

    // Deflate
    Xres = Xres.map((row, i) => row.map((x, j) => x - proj[i] * vec[j]));
    components.push(vec);
  }

  // 3. Project
  const projected = Xc.map(row =>
    components.map(comp => dot(row, comp))
  );

  return { projected, explained };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function normalize(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n === 0 ? v : v.map(x => x / n);
}
function matTVec(M, v) {
  // M^T · v  (D-dim result)
  const D = M[0].length;
  const r = new Array(D).fill(0);
  for (let i = 0; i < M.length; i++)
    for (let j = 0; j < D; j++) r[j] += M[i][j] * v[i];
  return r;
}
function matVec(M, v) {
  // M · v  (N-dim result)
  return M.map(row => dot(row, v));
}

module.exports = {
  listCollections,
  getCollectionInfo,
  browsePoints,
  buildFilter,
  semanticSearch,
  getKNN,
  buildKNNGraph,
  invalidateKNNCache,
  knnCacheStats,
  computeProjection,
  computeSimilarityMatrix,
  countPoints,
  getCollectionStats,
  radiusSearch,
};
