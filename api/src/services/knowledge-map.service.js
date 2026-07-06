'use strict';
/**
 * KnowledgeMapService — merges Qdrant (vector positions) + Memgraph (explicit edges)
 * into a unified knowledge map response for the /knowledge-map frontend.
 *
 * Nodes: ESEntity from Memgraph, enriched with 2D PCA position from Qdrant.
 * Explicit edges: relationships from Memgraph.
 * Semantic edges: pairs of Qdrant vectors with cosine similarity >= threshold.
 * Gaps: semantic edges that have no corresponding explicit edge (possible missing links).
 */

const qdrant = require('./qdrant.service');
const mg     = require('./memgraph.service');

function client() { return qdrant.client || qdrant; }

// ── Tiny seeded PRNG (same as vectors.service — deterministic PCA) ──────────

function makePrng(seed = 42) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s, 1664525) + 1013904223 >>> 0; return s / 4294967296; };
}

// ── Vector math ──────────────────────────────────────────────────────────────

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function normalize(v) { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n === 0 ? v : v.map(x => x / n); }
function matTVec(M, v) { const D = M[0].length, r = new Array(D).fill(0); for (let i = 0; i < M.length; i++) for (let j = 0; j < D; j++) r[j] += M[i][j] * v[i]; return r; }
function matVec(M, v) { return M.map(row => dot(row, v)); }

function cosineSim(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : d / denom;
}

function pca2D(X) {
  if (!X.length || !X[0]?.length) return { projected: [], explained: [] };
  const N = X.length, D = X[0].length;
  const rand = makePrng(42);
  const mean = new Array(D).fill(0);
  for (const v of X) for (let j = 0; j < D; j++) mean[j] += v[j] / N;
  const Xc = X.map(v => v.map((x, j) => x - mean[j]));
  const components = [], explained = [];
  let Xres = Xc.map(r => [...r]);
  for (let k = 0; k < Math.min(2, D, N); k++) {
    let vec = new Array(D).fill(0).map(() => rand() - 0.5);
    vec = normalize(vec);
    for (let iter = 0; iter < 60; iter++) vec = normalize(matTVec(Xres, matVec(Xres, vec)));
    const proj = Xres.map(row => dot(row, vec));
    const variance = proj.reduce((s, x) => s + x * x, 0) / N;
    explained.push(parseFloat(variance.toFixed(4)));
    Xres = Xres.map((row, i) => row.map((x, j) => x - proj[i] * vec[j]));
    components.push(vec);
  }
  const safe = v => Number.isFinite(v) ? v : 0;
  return { projected: Xc.map(row => components.map(c => safe(dot(row, c)))), explained };
}

// ── Main service ─────────────────────────────────────────────────────────────

async function getKnowledgeMap({
  collection        = 'documents_entities',
  namespace         = null,
  semanticThreshold = 0.7,
  limit             = 1500,
} = {}) {
  // ── 1. Memgraph: entities + relationships ─────────────────────────────────

  const nsFilter = namespace ? 'WHERE e.namespace = $ns' : '';
  const nsParam  = namespace ? { ns: namespace } : {};

  const [mgNodes, mgEdges] = await Promise.all([
    mg.runQuery(
      `MATCH (e:ESEntity) ${nsFilter}
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.epistemicLayer AS epistemicLayer, e.namespace AS namespace,
              e.category AS category, e.description AS description,
              e.provenanceDocId AS provenanceDocId, e.provenanceDocTitle AS provenanceDocTitle`,
      nsParam
    ),
    mg.runQuery(
      `MATCH (a:ESEntity)-[r]->(b:ESEntity) ${namespace ? 'WHERE a.namespace = $ns AND b.namespace = $ns' : ''}
       RETURN a.id AS source, b.id AS target, type(r) AS relType, r.weight AS weight`,
      nsParam
    ),
  ]).catch(() => [[], []]);

  // ── 2. Qdrant: vectors with payload ──────────────────────────────────────

  const c = client();
  let qdrantPts = [];
  try {
    const res = await c.scroll(collection, { limit, with_payload: true, with_vector: true });
    qdrantPts = res?.points ?? res ?? [];
  } catch (_) { /* collection may not exist yet */ }

  // ── 3. PCA 2D projection ──────────────────────────────────────────────────

  const vectors = qdrantPts.map(p => p.vector).filter(Boolean);
  const { projected, explained } = vectors.length >= 2 ? pca2D(vectors) : { projected: [], explained: [] };
  const safe = v => Number.isFinite(v) ? v : 0;

  // ── 4. Build Qdrant node lookup by name ───────────────────────────────────

  const qdrantByName = new Map();
  qdrantPts.forEach((pt, i) => {
    const key = (pt.payload?.name ?? '').toLowerCase().trim();
    if (key) qdrantByName.set(key, { pt, proj: projected[i] ?? [0, 0] });
  });

  // ── 5. Build Memgraph node lookup ─────────────────────────────────────────

  const mgById   = new Map(mgNodes.map(e => [e.id, e]));
  const mgByName = new Map(mgNodes.map(e => [(e.name ?? '').toLowerCase().trim(), e]));

  // ── 6. Merge: primary key = Memgraph ID when available, else Qdrant UUID ─

  const nodes       = [];
  const seenNames   = new Set();
  const qdrantIdToNodeId = new Map();  // Qdrant UUID → unified node id

  // Start with Qdrant points (they have positions)
  qdrantPts.forEach((pt, i) => {
    const payload = pt.payload ?? {};
    const name    = payload.name ?? String(pt.id).slice(0, 12);
    const nameKey = name.toLowerCase().trim();
    const mgNode  = mgByName.get(nameKey);
    const nodeId  = mgNode?.id ?? `q:${pt.id}`;

    seenNames.add(nameKey);
    qdrantIdToNodeId.set(String(pt.id), nodeId);

    nodes.push({
      id:             nodeId,
      qdrantId:       String(pt.id),
      mgId:           mgNode?.id ?? null,
      name,
      type:           payload.entityType ?? mgNode?.type ?? 'UNKNOWN',
      epistemicLayer: payload.epistemicLayer ?? mgNode?.epistemicLayer ?? null,
      namespace:      mgNode?.namespace ?? null,
      category:       payload.category  ?? mgNode?.category ?? null,
      x:              safe(projected[i]?.[0]),
      y:              safe(projected[i]?.[1]),
      hasQdrant:      true,
      hasMemgraph:    !!mgNode,
      confidence:     payload.confidence ?? null,
      sourceDocumentId: payload.sourceDocumentId ?? mgNode?.provenanceDocId ?? null,
    });
  });

  // Memgraph-only nodes (no Qdrant vector — shown at center/null position)
  mgNodes.forEach(e => {
    const nameKey = (e.name ?? '').toLowerCase().trim();
    if (!seenNames.has(nameKey)) {
      nodes.push({
        id: e.id, qdrantId: null, mgId: e.id,
        name: e.name, type: e.type,
        epistemicLayer: e.epistemicLayer, namespace: e.namespace,
        category: e.category, x: null, y: null,
        hasQdrant: false, hasMemgraph: true,
        confidence: null, sourceDocumentId: e.provenanceDocId ?? null,
      });
    }
  });

  // ── 7. Explicit edges (Memgraph) ──────────────────────────────────────────

  const explicitEdges = mgEdges.map(e => ({
    source:  e.source, target: e.target,
    relType: e.relType ?? 'RELATES_TO', weight: e.weight ?? 1,
    edgeType: 'explicit',
  })).filter(e => e.source && e.target);

  const explicitPairSet = new Set(explicitEdges.flatMap(e => [
    `${e.source}|${e.target}`, `${e.target}|${e.source}`,
  ]));

  // ── 8. Semantic edges (pairwise cosine on Qdrant vectors, O(N²)) ──────────

  const semanticEdges = [];
  const qdrantWithVec = qdrantPts.filter(p => p.vector);

  for (let i = 0; i < qdrantWithVec.length; i++) {
    for (let j = i + 1; j < qdrantWithVec.length; j++) {
      const a   = qdrantWithVec[i];
      const b   = qdrantWithVec[j];
      const sim = cosineSim(a.vector, b.vector);
      if (sim < semanticThreshold) continue;

      const srcId = qdrantIdToNodeId.get(String(a.id)) ?? `q:${a.id}`;
      const tgtId = qdrantIdToNodeId.get(String(b.id)) ?? `q:${b.id}`;
      if (srcId === tgtId) continue;

      semanticEdges.push({
        source: srcId, target: tgtId,
        similarity: parseFloat(sim.toFixed(4)),
        hasExplicit: explicitPairSet.has(`${srcId}|${tgtId}`),
        edgeType: 'semantic',
      });
    }
  }

  // ── 9. Gap detection (high semantic similarity, no explicit edge) ─────────

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const gaps = semanticEdges
    .filter(e => !e.hasExplicit)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 30)
    .map(e => ({
      source:      e.source,
      target:      e.target,
      similarity:  e.similarity,
      sourceName:  nodeById.get(e.source)?.name ?? e.source,
      targetName:  nodeById.get(e.target)?.name ?? e.target,
      sourceLayer: nodeById.get(e.source)?.epistemicLayer ?? null,
      targetLayer: nodeById.get(e.target)?.epistemicLayer ?? null,
    }));

  // ── 10. Coherence + layer metrics ────────────────────────────────────────

  const layerDist = {};
  nodes.forEach(n => {
    const l = n.epistemicLayer ?? 'N/A';
    layerDist[l] = (layerDist[l] || 0) + 1;
  });

  // Cross-layer edge counts
  let sameLayerEdges = 0, crossLayerEdges = 0;
  explicitEdges.forEach(e => {
    const s = nodeById.get(e.source)?.epistemicLayer;
    const t = nodeById.get(e.target)?.epistemicLayer;
    if (s && t) { s === t ? sameLayerEdges++ : crossLayerEdges++; }
  });
  const totalLayerEdges = sameLayerEdges + crossLayerEdges;
  const coherenceScore  = totalLayerEdges > 0
    ? parseFloat((sameLayerEdges / totalLayerEdges).toFixed(3)) : null;

  return {
    nodes,
    explicitEdges,
    semanticEdges,
    gaps,
    explained,
    metrics: {
      totalNodes:     nodes.length,
      nodesWithVector: nodes.filter(n => n.hasQdrant).length,
      nodesMemgraphOnly: nodes.filter(n => n.hasMemgraph && !n.hasQdrant).length,
      totalExplicit:  explicitEdges.length,
      totalSemantic:  semanticEdges.length,
      totalGaps:      gaps.length,
      coherenceScore,
      layerDistribution: Object.entries(layerDist).map(([layer, count]) => ({ layer, count })),
    },
  };
}

module.exports = { getKnowledgeMap };
