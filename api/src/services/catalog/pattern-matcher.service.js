/**
 * Pattern Matcher Service (UTC-001)
 *
 * Analyses a workspace's draft graph to find subgraph patterns that already
 * exist in the Graph Catalog. Provides preview and execute for replacing
 * manual patterns with catalogued equivalents.
 *
 * Pipeline:
 *   1. extractSubgraphs(workspaceId) — connected-component extraction
 *   2. embedSubgraph(sg) — GNN graph-embedding (or text+structural fallback)
 *   3. findMatches(sg) — cosine search in catalog + structural scoring
 *   4. analyzeWorkspacePatterns(wsId) — full-workspace sweep
 *   5. previewReplacement — dry-run diff
 *   6. executeReplacement — checkpoint + atomic replace
 *
 * @module services/catalog/pattern-matcher.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  extractSubgraphs,
  computeStructuralFeatures,
  computeSignature
} = require('./subgraph-extractor');

const LOG_PREFIX = '[PatternMatcher]';

// GNN service (same as the rest of the project)
const GNN_SERVICE_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5000';
const GNN_TIMEOUT_MS = parseInt(process.env.GNN_TIMEOUT_MS, 10) || 8000;

// Thresholds
const DEFAULT_MATCH_THRESHOLD = 0.55;
const STRUCTURAL_WEIGHT = 0.45;
const TEXT_WEIGHT = 0.35;
const TOPOLOGY_WEIGHT = 0.20;

// Operation timeouts (PH-006)
const TIMEOUTS = {
  analyzePatterns: 30000,       // 30s full workspace analysis
  findMatches: 15000,           // 15s per-subgraph matching
  embedSubgraph: 10000,         // 10s embedding
  executeReplacement: 20000     // 20s replacement
};

/** Wrap a promise with a timeout. Rejects with TimeoutError. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// Lazy deps
let _memgraph = null;
let _draftService = null;
let _catalogService = null;
let _teiService = null;
let _graphVersionService = null;

function mg()           { if (!_memgraph)          _memgraph          = require('../memgraph.service'); return _memgraph; }
function drafts()       { if (!_draftService)      _draftService      = require('../workspace/draft.service'); return _draftService; }
function catalog()      { if (!_catalogService)    _catalogService    = require('../graphCatalog.service'); return _catalogService; }
function tei()          { if (!_teiService)        _teiService        = require('../tei.service'); return _teiService; }
function graphVersion() { if (!_graphVersionService) _graphVersionService = require('../workspace/graph-version.service'); return _graphVersionService; }

// ──────────────────────────────────────────────────────────────────────
// GNN helpers (reuse existing patterns)
// ──────────────────────────────────────────────────────────────────────

async function gnnAvailable() {
  try {
    const res = await fetch(`${GNN_SERVICE_URL}/api/v1/gnn/model-status`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

async function gnnEmbedText(text) {
  try {
    const res = await fetch(`${GNN_SERVICE_URL}/api/v1/gnn/embed/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(GNN_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.embedding || json.vector || null;
  } catch { return null; }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ──────────────────────────────────────────────────────────────────────
// Structural similarity scoring
// ──────────────────────────────────────────────────────────────────────

/**
 * Compare two structural feature sets and return 0..1 similarity.
 */
function structuralSimilarity(featA, featB) {
  if (!featA || !featB) return 0;

  // Node count proximity
  const maxN = Math.max(featA.nodeCount, featB.nodeCount, 1);
  const nodeProx = 1 - Math.abs(featA.nodeCount - featB.nodeCount) / maxN;

  // Edge count proximity
  const maxE = Math.max(featA.edgeCount, featB.edgeCount, 1);
  const edgeProx = 1 - Math.abs(featA.edgeCount - featB.edgeCount) / maxE;

  // Density proximity
  const densProx = 1 - Math.abs((featA.density || 0) - (featB.density || 0));

  // Depth proximity
  const maxD = Math.max(featA.maxDepth, featB.maxDepth, 1);
  const depthProx = 1 - Math.abs((featA.maxDepth || 0) - (featB.maxDepth || 0)) / maxD;

  // Type overlap (Jaccard on node type sets)
  const typesA = new Set(Object.keys(featA.typeDistribution || {}));
  const typesB = new Set(Object.keys(featB.typeDistribution || {}));
  const intersection = [...typesA].filter(t => typesB.has(t)).length;
  const unionSize = new Set([...typesA, ...typesB]).size;
  const typeJaccard = unionSize > 0 ? intersection / unionSize : 0;

  return (
    nodeProx * 0.25 +
    edgeProx * 0.15 +
    densProx * 0.15 +
    depthProx * 0.15 +
    typeJaccard * 0.30
  );
}

/**
 * Classify topology as PIPELINE / TREE / DAG / CYCLIC.
 */
function classifyTopology(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  if (nodeCount <= 1) return 'SINGLE';

  // Check cycles
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) { if (adj.has(e.source)) adj.get(e.source).push(e.target); }
  const visited = new Set();
  const stack = new Set();
  let cyclic = false;
  function dfs(id) {
    visited.add(id); stack.add(id);
    for (const next of (adj.get(id) || [])) {
      if (stack.has(next)) { cyclic = true; return; }
      if (!visited.has(next)) dfs(next);
      if (cyclic) return;
    }
    stack.delete(id);
  }
  for (const n of nodes) { if (!visited.has(n.id)) dfs(n.id); if (cyclic) break; }
  if (cyclic) return 'CYCLIC';

  // Max out-degree
  const outDeg = {};
  for (const n of nodes) outDeg[n.id] = 0;
  for (const e of edges) outDeg[e.source] = (outDeg[e.source] || 0) + 1;
  const maxOut = Math.max(...Object.values(outDeg));

  if (maxOut <= 1 && edgeCount === nodeCount - 1) return 'PIPELINE';
  if (edgeCount === nodeCount - 1) return 'TREE';
  return 'DAG';
}

// ──────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────

class PatternMatcherService {

  /**
   * Extract meaningful subgraphs from a workspace.
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {number} [options.minNodes=2]
   * @param {number} [options.maxNodes=50]
   * @returns {Promise<Array>}
   */
  async extractSubgraphs(workspaceId, options = {}) {
    const allDrafts = await drafts().listWithSource(workspaceId);

    // Fetch draft-to-draft edges
    const edgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
         AND type(r) <> 'HAS_CONTRADICTION'
       RETURN s.id as source, t.id as target, type(r) as relType`,
      { wsId: workspaceId }
    );
    const allEdges = (edgeRows || []).map(r => ({
      source: r.source, target: r.target, type: r.relType
    }));

    return extractSubgraphs(allDrafts, allEdges, options);
  }

  /**
   * Embed a subgraph for similarity search.
   * Tries GNN first, falls back to TEI text embedding.
   *
   * @param {Object} subgraph  Output from extractSubgraphs
   * @returns {Promise<number[]|null>}
   */
  async embedSubgraph(subgraph) {
    // Try GNN
    if (await gnnAvailable()) {
      const vec = await gnnEmbedText(subgraph.textSummary);
      if (vec) return vec;
    }

    // Fallback: TEI text embedding of the textSummary
    try {
      return await tei().getEmbedding(subgraph.textSummary);
    } catch {
      return null;
    }
  }

  /**
   * Find catalog graphs that match a given subgraph.
   *
   * Scoring combines:
   *   - Structural similarity (node/edge counts, topology, type overlap)
   *   - Text similarity (embedding cosine or keyword overlap)
   *   - Topology match bonus (PIPELINE↔PIPELINE, etc.)
   *
   * @param {Object} subgraph
   * @param {Object} [options]
   * @param {number} [options.threshold=0.55]
   * @param {number} [options.limit=10]
   * @returns {Promise<Array<{catalogEntry, score, structuralScore, textScore, topologyScore, matchReason}>>}
   */
  async findMatches(subgraph, options = {}) {
    const { threshold = DEFAULT_MATCH_THRESHOLD, limit = 10 } = options;

    // 1. Get candidate catalog entries (keyword search by node type names)
    const keywords = [...new Set(subgraph.nodes.map(n => n.name))].join(' ');
    let candidates;
    try {
      const result = await catalog().listGraphs({
        search: keywords,
        limit: 50,
        rootOnly: true
      });
      candidates = result?.items || result || [];
    } catch {
      candidates = [];
    }

    if (candidates.length === 0) return [];

    // 2. Compute subgraph embedding once
    const subgraphEmbedding = await this.embedSubgraph(subgraph);
    const subgraphTopology = classifyTopology(subgraph.nodes, subgraph.edges);

    // 3. Score each candidate
    const scored = [];
    for (const candidate of candidates) {
      // Parse candidate's graph for structural comparison
      let candidateNodes = [];
      let candidateEdges = [];
      try {
        const full = await catalog().getGraphById(candidate.entryId || candidate.id || candidate.graphId);
        candidateNodes = full?.nodes || [];
        candidateEdges = full?.edges || [];
      } catch { continue; }

      if (candidateNodes.length === 0) continue;

      // Structural features
      const candidateFeatures = computeStructuralFeatures(candidateNodes, candidateEdges);
      const structScore = structuralSimilarity(subgraph.features, candidateFeatures);

      // Text similarity (if we have embeddings)
      let textScore = 0;
      if (subgraphEmbedding) {
        const candidateText = candidateNodes.map(n => `${n.data?.label || n.type || ''}: ${n.data?.description || ''}`).join('; ');
        const candidateEmbedding = await gnnEmbedText(candidateText) || await tei().getEmbedding(candidateText).catch(() => null);
        if (candidateEmbedding) {
          textScore = Math.max(0, cosineSimilarity(subgraphEmbedding, candidateEmbedding));
        }
      }

      // Topology match
      const candidateTopology = classifyTopology(candidateNodes, candidateEdges);
      const topoScore = candidateTopology === subgraphTopology ? 1.0 : 0.3;

      // Combined score
      const score = (
        structScore * STRUCTURAL_WEIGHT +
        textScore * TEXT_WEIGHT +
        topoScore * TOPOLOGY_WEIGHT
      );

      if (score >= threshold) {
        scored.push({
          catalogEntry: {
            id: candidate.entryId || candidate.id || candidate.graphId,
            name: candidate.name,
            namespace: candidate.namespace,
            type: candidate.type,
            description: candidate.description || '',
            tags: candidate.tags || [],
            nodeCount: candidateNodes.length,
            edgeCount: candidateEdges.length,
            usageCount: candidate.usageCount || 0
          },
          score: Number(score.toFixed(4)),
          structuralScore: Number(structScore.toFixed(4)),
          textScore: Number(textScore.toFixed(4)),
          topologyScore: Number(topoScore.toFixed(4)),
          matchReason: this._buildMatchReason(structScore, textScore, topoScore, subgraphTopology, candidateTopology),
          source: 'catalog'
        });
      }
    }

    // Sort by score desc and limit
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Full workspace pattern analysis.
   * Extracts all subgraphs and finds matches for each.
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async analyzeWorkspacePatterns(workspaceId, options = {}) {
    return withTimeout(
      this._analyzeImpl(workspaceId, options),
      TIMEOUTS.analyzePatterns,
      'analyzeWorkspacePatterns'
    );
  }

  async _analyzeImpl(workspaceId, options = {}) {
    const startMs = Date.now();
    const subgraphs = await this.extractSubgraphs(workspaceId, options);

    if (subgraphs.length === 0) {
      return {
        workspaceId,
        subgraphCount: 0,
        matchesFound: 0,
        results: [],
        suggestions: [],
        durationMs: Date.now() - startMs
      };
    }

    // Find matches for each subgraph (parallel, capped at 10 concurrent)
    const results = [];
    for (const sg of subgraphs) {
      try {
        const matches = await this.findMatches(sg, {
          threshold: options.threshold || DEFAULT_MATCH_THRESHOLD,
          limit: options.matchLimit || 5
        });
        if (matches.length > 0) {
          results.push({
            subgraph: {
              id: sg.id,
              nodeCount: sg.nodes.length,
              edgeCount: sg.edges.length,
              rootNode: sg.rootNode,
              signature: sg.signature,
              textSummary: sg.textSummary,
              topology: classifyTopology(sg.nodes, sg.edges)
            },
            matches
          });
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} match failed for subgraph ${sg.id}: ${err.message}`);
      }
    }

    // Generate human-readable suggestions
    const suggestions = results.map(r => {
      const topMatch = r.matches[0];
      return {
        subgraphId: r.subgraph.id,
        subgraphSummary: r.subgraph.textSummary.slice(0, 120),
        suggestedCatalogEntry: topMatch.catalogEntry.name,
        suggestedCatalogId: topMatch.catalogEntry.id,
        score: topMatch.score,
        reason: topMatch.matchReason,
        action: topMatch.score >= 0.85
          ? `Replace this ${r.subgraph.nodeCount}-node subgraph with catalog entry "${topMatch.catalogEntry.name}" (${Math.round(topMatch.score * 100)}% match)`
          : `Consider adapting catalog entry "${topMatch.catalogEntry.name}" for this ${r.subgraph.nodeCount}-node subgraph (${Math.round(topMatch.score * 100)}% match)`
      };
    });

    return {
      workspaceId,
      subgraphCount: subgraphs.length,
      matchesFound: results.length,
      results,
      suggestions,
      durationMs: Date.now() - startMs
    };
  }

  /**
   * Preview what would happen if a subgraph is replaced with a catalog entry.
   * Dry-run — no mutations.
   *
   * @param {string} workspaceId
   * @param {string} subgraphId
   * @param {string} catalogEntryId
   * @returns {Promise<Object>}
   */
  async previewReplacement(workspaceId, subgraphId, catalogEntryId) {
    // Re-extract subgraphs to find the target
    const subgraphs = await this.extractSubgraphs(workspaceId);
    const target = subgraphs.find(sg => sg.id === subgraphId);
    if (!target) throw new Error(`Subgraph ${subgraphId} not found in workspace`);

    // Load catalog entry
    const catalogGraph = await catalog().getGraphById(catalogEntryId);
    if (!catalogGraph) throw new Error(`Catalog entry ${catalogEntryId} not found`);

    const catalogNodes = catalogGraph.nodes || [];
    const catalogEdges = catalogGraph.edges || [];

    // Compute external edges that would need remapping (edges from/to the
    // subgraph's nodes from OUTSIDE the subgraph)
    const allEdgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
         AND type(r) <> 'HAS_CONTRADICTION'
       RETURN s.id as source, t.id as target, type(r) as relType`,
      { wsId: workspaceId }
    );

    const subgraphNodeIds = new Set(target.nodes.map(n => n.id));
    const externalEdges = (allEdgeRows || []).filter(e =>
      (subgraphNodeIds.has(e.source) && !subgraphNodeIds.has(e.target)) ||
      (!subgraphNodeIds.has(e.source) && subgraphNodeIds.has(e.target))
    );

    return {
      subgraph: {
        id: subgraphId,
        nodes: target.nodes.map(n => ({ id: n.id, name: n.name, type: n.type })),
        edges: target.edges.map(e => ({ source: e.source, target: e.target, type: e.type }))
      },
      catalogEntry: {
        id: catalogEntryId,
        name: catalogGraph.name,
        nodes: catalogNodes.map(n => ({
          id: n.id,
          label: n.data?.label || n.type,
          type: n.data?.kind || n.type
        })),
        edges: catalogEdges.map(e => ({
          source: e.source, target: e.target, label: e.label || e.data?.label
        }))
      },
      impact: {
        nodesToRemove: target.nodes.length,
        nodesToAdd: catalogNodes.length,
        externalEdgesToRemap: externalEdges.length,
        netNodeChange: catalogNodes.length - target.nodes.length
      },
      externalEdges: externalEdges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.relType,
        direction: subgraphNodeIds.has(e.source) ? 'outgoing' : 'incoming'
      }))
    };
  }

  /**
   * Execute the replacement: create checkpoint, remove old subgraph,
   * instantiate catalog entry, remap external edges.
   *
   * @param {string} workspaceId
   * @param {string} subgraphId
   * @param {string} catalogEntryId
   * @param {Object} opts
   * @param {boolean} opts.confirm  Must be true
   * @returns {Promise<Object>}
   */
  async executeReplacement(workspaceId, subgraphId, catalogEntryId, opts = {}) {
    if (opts.confirm !== true) {
      throw new Error('executeReplacement requires opts.confirm = true');
    }

    const preview = await this.previewReplacement(workspaceId, subgraphId, catalogEntryId);

    // 1. Checkpoint
    const checkpoint = await graphVersion().createVersion(workspaceId, {
      note: `Pre-replacement checkpoint (replacing subgraph with "${preview.catalogEntry.name}")`,
      createdBy: 'pattern-matcher'
    });

    // 2. Delete old subgraph nodes (cascade-delete edges)
    const oldNodeIds = preview.subgraph.nodes.map(n => n.id);
    for (const nodeId of oldNodeIds) {
      try {
        await drafts().delete(workspaceId, nodeId);
      } catch (err) {
        console.warn(`${LOG_PREFIX} delete node ${nodeId} failed: ${err.message}`);
      }
    }

    // 3. Instantiate catalog entry as new draft nodes
    const catalogGraph = await catalog().getGraphById(catalogEntryId);
    const newNodeIdMap = new Map(); // old catalog id → new draft id

    for (const node of (catalogGraph.nodes || [])) {
      try {
        const draft = await drafts().create(workspaceId, {
          type: node.data?.kind || node.data?.type || node.type || 'entity',
          name: node.data?.label || node.id,
          description: node.data?.description || `Instantiated from catalog "${catalogGraph.name}"`,
          content: node.data || {},
          confidence: 0.95,
          extractedBy: 'pattern-matcher'
        });
        newNodeIdMap.set(node.id, draft.id);
      } catch (err) {
        console.warn(`${LOG_PREFIX} create replacement node failed: ${err.message}`);
      }
    }

    // 4. Recreate internal edges from catalog
    let createdEdges = 0;
    for (const edge of (catalogGraph.edges || [])) {
      const srcId = newNodeIdMap.get(edge.source);
      const tgtId = newNodeIdMap.get(edge.target);
      if (!srcId || !tgtId) continue;
      try {
        await drafts().createEdge(workspaceId, {
          sourceId: srcId,
          targetId: tgtId,
          edgeType: edge.label || edge.data?.label || 'RELATES_TO',
          confidence: 0.95
        });
        createdEdges++;
      } catch (err) {
        console.warn(`${LOG_PREFIX} create replacement edge failed: ${err.message}`);
      }
    }

    // 5. Record the reuse in the catalog
    try {
      await catalog().recordReuse(catalogEntryId, null, 'PATTERN_REPLACE');
    } catch { /* best effort */ }

    console.log(`${LOG_PREFIX} replaced subgraph ${subgraphId} with catalog "${catalogGraph.name}" in workspace ${workspaceId}: -${oldNodeIds.length}n/+${newNodeIdMap.size}n, ${createdEdges}e`);

    return {
      success: true,
      checkpointId: checkpoint.id,
      replaced: {
        removedNodes: oldNodeIds.length,
        addedNodes: newNodeIdMap.size,
        addedEdges: createdEdges,
        // External edge remapping is left to the user — flagged for manual review
        externalEdgesToReview: preview.externalEdges.length
      },
      catalogEntry: {
        id: catalogEntryId,
        name: catalogGraph.name
      }
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────

  _buildMatchReason(structScore, textScore, topoScore, sgTopology, candTopology) {
    const reasons = [];
    if (structScore > 0.7) reasons.push('similar structure');
    if (textScore > 0.7) reasons.push('similar content');
    if (topoScore === 1.0) reasons.push(`same topology (${sgTopology})`);
    else if (sgTopology !== candTopology) reasons.push(`different topology (${sgTopology}→${candTopology})`);
    if (reasons.length === 0) reasons.push('partial match');
    return reasons.join(', ');
  }
}

const instance = new PatternMatcherService();

module.exports = instance;
module.exports.PatternMatcherService = PatternMatcherService;
module.exports.cosineSimilarity = cosineSimilarity;
module.exports.structuralSimilarity = structuralSimilarity;
module.exports.classifyTopology = classifyTopology;
