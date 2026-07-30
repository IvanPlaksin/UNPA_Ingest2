'use strict';

/**
 * EVOLUTIO:PROMPT service (Suada Phase 1) — CRUD over the typed prompt ontology.
 *
 * Storage is the platform graph-catalog, unchanged and unforked:
 *   (:CatalogRoot)-[:CONTAINS]->(:CatalogEntry)-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(:GraphVersion)
 * Suada adds no persistence of its own (SUADA-002). What it adds is the shape of
 * what goes in there: typed nodes and typed edges instead of a flat rule list.
 *
 * The catalog stores ReactFlow-ish {nodes, edges}. Ontology nodes therefore ride
 * inside `node.data` with `node.id === data.nodeId`, so the catalog's own
 * contentHash, versioning and diffing keep working and an editor could render the
 * graph without translation. `toCatalog`/`fromCatalog` are the only two places
 * that know about that packing.
 *
 * Phase 1 deliberately does NOT touch CHAT_PROMPT: the Suada graph is built
 * BESIDE the live FlowDesk one and reconciled only once the parity test passes,
 * so the running chat is untouched for the whole phase.
 *
 * @module services/evolutio/evolutio-prompt.service
 */

const { NAMESPACE, SCHEMA_VERSION } = require('./evolutio-prompt.constants');
const { validateGraph } = require('./evolutio-prompt.validator');

let _catalog = null;
function catalog() {
  if (!_catalog) _catalog = require('../graphCatalog.service').graphCatalogService;
  return _catalog;
}

// ── catalog packing ───────────────────────────────────────────────────────────

/** Ontology graph → catalog payload. Positions are layout only; absent is fine. */
function toCatalog(graph) {
  return {
    nodes: (graph.nodes || []).map((n, i) => ({
      id: n.nodeId,
      type: `evolutio${n.type}`,
      position: n.position || { x: 120, y: 80 + i * 90 },
      data: { ...n, position: undefined },
    })),
    edges: (graph.edges || []).map((e) => ({
      id: e.edgeId,
      source: e.source,
      target: e.target,
      type: e.type,
      data: { type: e.type, reason: e.reason ?? null, condition: e.condition ?? null },
    })),
    requiredParams: [],
  };
}

/** Catalog payload → ontology graph. Tolerates edges stored flat or under data. */
function fromCatalog(stored, schemaVersion) {
  const nodes = (stored.nodes || []).map((n) => {
    const d = n.data || {};
    return { ...d, nodeId: d.nodeId || n.id, ...(n.position ? { position: n.position } : {}) };
  });
  const edges = (stored.edges || []).map((e) => {
    const d = e.data || {};
    return {
      edgeId: e.id || e.edgeId,
      type: d.type || e.type,
      source: e.source ?? e.sourceNodeId,
      target: e.target ?? e.targetNodeId,
      ...(d.reason != null ? { reason: d.reason } : {}),
      ...(d.condition != null ? { condition: d.condition } : {}),
    };
  });
  return { schemaVersion: schemaVersion || stored.schemaVersion || SCHEMA_VERSION, nodes, edges };
}

// ── read ──────────────────────────────────────────────────────────────────────

async function listGraphs() {
  const res = await catalog().listGraphs({ namespace: NAMESPACE, limit: 200 });
  const items = res.data || res.items || res.graphs || res || [];
  return Array.isArray(items) ? items : [];
}

/**
 * One graph, at `version` or at the entry's current version.
 * @returns {Promise<{graph:object, meta:object}|null>}
 */
async function getGraph(entryId, version) {
  const loaded = version != null
    ? await catalog().getVersion(entryId, Number(version))
    : await catalog().getGraphById(entryId, false);
  if (!loaded) return null;
  return {
    graph: fromCatalog(loaded, loaded.schemaVersion),
    meta: {
      entryId,
      name: loaded.name,
      versionNumber: loaded.versionNumber ?? loaded.currentVersion ?? null,
      contentHash: loaded.contentHash ?? null,
    },
  };
}

const getVersions = (entryId) => catalog().getVersions(entryId);
const promoteVersion = (entryId, version) => catalog().promoteVersion(entryId, Number(version));

// ── write ─────────────────────────────────────────────────────────────────────

/**
 * Create an entry, or add a version to one. Validation is NOT optional: an
 * invalid prompt graph that reaches storage is one a later reader has to
 * discover the hard way, and versions are meant to be a reliable history.
 * @param {object} p {entryId?, name?, description?, graph, changelog?, createdBy?}
 */
async function saveGraph(p) {
  const graph = { schemaVersion: SCHEMA_VERSION, ...(p.graph || {}) };
  const validation = validateGraph(graph);
  if (!validation.ok) {
    throw Object.assign(
      new Error(`prompt graph invalid: ${validation.errors.map((e) => e.message).join('; ')}`),
      { status: 400, validation }
    );
  }
  const payload = toCatalog(graph);

  if (p.entryId) {
    const saved = await catalog().createVersion(
      p.entryId, payload, p.changelog || 'Prompt ontology update', { createdBy: p.createdBy }
    );
    return { saved, validation };
  }
  const saved = await catalog().createGraph({
    name: p.name || 'Suada Prompt Ontology',
    namespace: NAMESPACE,
    type: 'template',
    description: p.description || 'Typed prompt ontology (EVOLUTIO:PROMPT)',
    tags: ['suada', 'prompt-ontology', `schema-${SCHEMA_VERSION}`],
    isPublic: true,
    nodes: payload.nodes,
    edges: payload.edges,
    requiredParams: [],
    createdBy: p.createdBy,
  });
  return { saved, validation };
}

// ── node/edge mutation (pure) ─────────────────────────────────────────────────

/**
 * Apply add/update/remove ops to a graph without touching storage. Pure, so the
 * mutation operator in Phase 4 and a human editor can go through the same path
 * and produce the same result.
 *
 * A removed node takes its incident edges with it — leaving them would produce a
 * graph the validator rejects for dangling edges, which reads as a storage bug
 * rather than the intended removal.
 *
 * @returns {{graph:object, result:{added,updated,removed,edgesAdded,edgesRemoved}}}
 */
function applyMutations(graph, ops) {
  let nodes = (graph.nodes || []).map((n) => ({ ...n }));
  let edges = (graph.edges || []).map((e) => ({ ...e }));
  const result = { added: 0, updated: 0, removed: 0, edgesAdded: 0, edgesRemoved: 0 };
  if (!Array.isArray(ops)) return { graph: { ...graph, nodes, edges }, result };

  for (const op of ops) {
    switch (op.op) {
      case 'addNode':
        if (op.node) { nodes.push({ ...op.node }); result.added += 1; }
        break;
      case 'updateNode': {
        const n = nodes.find((x) => x.nodeId === op.nodeId);
        if (n) { Object.assign(n, op.patch || {}); result.updated += 1; }
        break;
      }
      case 'removeNode': {
        const before = nodes.length;
        nodes = nodes.filter((x) => x.nodeId !== op.nodeId);
        if (nodes.length !== before) {
          result.removed += 1;
          const eBefore = edges.length;
          edges = edges.filter((e) => e.source !== op.nodeId && e.target !== op.nodeId);
          result.edgesRemoved += eBefore - edges.length;
        }
        break;
      }
      case 'addEdge':
        if (op.edge) { edges.push({ ...op.edge }); result.edgesAdded += 1; }
        break;
      case 'removeEdge': {
        const before = edges.length;
        edges = edges.filter((e) => e.edgeId !== op.edgeId);
        result.edgesRemoved += before - edges.length;
        break;
      }
      default:
        break; // unknown ops are ignored, not fatal — a mutator may be newer than this build
    }
  }
  return { graph: { ...graph, nodes, edges }, result };
}

/** Load → mutate → validate → optionally persist. The assistant/optimizer entry point. */
async function mutateGraph(p) {
  let base = p.graph;
  let entryId = p.entryId || null;
  if (!base && entryId) {
    const loaded = await getGraph(entryId, p.version);
    if (!loaded) throw Object.assign(new Error('graph not found'), { status: 404 });
    base = loaded.graph;
  }
  if (!base) throw Object.assign(new Error('graph or entryId is required'), { status: 400 });

  const { graph, result } = applyMutations(base, p.mutations);
  const validation = validateGraph(graph);
  let saved = null;
  if (p.save) {
    ({ saved } = await saveGraph({
      entryId,
      graph,
      changelog: p.changelog || `mutation: +${result.added} ~${result.updated} -${result.removed}`,
      createdBy: p.createdBy,
    }));
  }
  return { graph, result, validation, saved };
}

module.exports = {
  listGraphs, getGraph, getVersions, promoteVersion,
  saveGraph, applyMutations, mutateGraph,
  toCatalog, fromCatalog,
  NAMESPACE, SCHEMA_VERSION,
};
