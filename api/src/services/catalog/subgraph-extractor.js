/**
 * Subgraph Extractor
 *
 * Extracts meaningful connected subgraphs from a workspace's draft graph.
 * Each subgraph is a cluster of ≥ minNodes connected draft nodes that forms
 * a semantically coherent "pattern" — e.g. an approval workflow fragment,
 * a data pipeline, or an entity constellation.
 *
 * Used by PatternMatcherService to find reusable patterns.
 *
 * @module services/catalog/subgraph-extractor
 */

'use strict';

const crypto = require('crypto');

const LOG_PREFIX = '[SubgraphExtractor]';

/**
 * Find all weakly-connected components in a set of nodes and edges.
 * Uses union-find for O(n·α(n)) performance.
 */
function findConnectedComponents(nodes, edges) {
  const parent = new Map();
  const rank = new Map();

  const find = (x) => {
    if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0); }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };

  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra) || 0;
    const rankB = rank.get(rb) || 0;
    if (rankA < rankB) parent.set(ra, rb);
    else if (rankA > rankB) parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, rankA + 1); }
  };

  // Initialize all nodes
  for (const n of nodes) find(n.id);

  // Union connected nodes
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) {
      union(e.source, e.target);
    }
  }

  // Group nodes by component root
  const groups = new Map();
  for (const n of nodes) {
    const root = find(n.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(n);
  }

  // Build components with their internal edges
  const components = [];
  for (const [_, groupNodes] of groups) {
    const nodeIds = new Set(groupNodes.map(n => n.id));
    const componentEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    components.push({
      nodes: groupNodes,
      edges: componentEdges
    });
  }

  return components;
}

/**
 * Find the topological "root" of a subgraph — the node(s) with zero in-degree.
 * If multiple, pick the first alphabetically by name.
 */
function findRootNode(nodes, edges) {
  const inDegree = new Map();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  }
  const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
  if (roots.length === 0) return nodes[0]; // cycle — pick first
  roots.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return roots[0];
}

/**
 * Compute max depth of the subgraph via BFS from root(s).
 */
function computeMaxDepth(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.target)) inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  if (roots.length === 0) return nodes.length > 0 ? 1 : 0;

  let maxDepth = 0;
  const visited = new Set();
  const queue = roots.map(r => ({ id: r, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);
    for (const next of (adj.get(id) || [])) {
      if (nodeIds.has(next) && !visited.has(next)) {
        queue.push({ id: next, depth: depth + 1 });
      }
    }
  }

  return maxDepth;
}

/**
 * Detect if the subgraph has cycles (DFS).
 */
function hasCycles(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
  }
  const visited = new Set();
  const stack = new Set();

  function dfs(id) {
    visited.add(id);
    stack.add(id);
    for (const next of (adj.get(id) || [])) {
      if (stack.has(next)) return true;
      if (!visited.has(next) && dfs(next)) return true;
    }
    stack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && dfs(n.id)) return true;
  }
  return false;
}

/**
 * Compute a deterministic structural signature (hash) for a subgraph.
 * Based on: sorted node types + edge types + topology shape.
 * Two subgraphs with the same signature are structurally identical
 * (modulo node/edge identifiers and labels).
 */
function computeSignature(nodes, edges) {
  const types = nodes.map(n => n.type || n.draftType || 'unknown').sort();
  const edgeTypes = edges.map(e => e.type || e.edgeType || 'RELATES_TO').sort();
  const inDeg = {};
  const outDeg = {};
  for (const n of nodes) { inDeg[n.id] = 0; outDeg[n.id] = 0; }
  for (const e of edges) { outDeg[e.source] = (outDeg[e.source] || 0) + 1; inDeg[e.target] = (inDeg[e.target] || 0) + 1; }
  const degreePairs = nodes.map(n => `${inDeg[n.id] || 0}:${outDeg[n.id] || 0}`).sort();

  const canonical = JSON.stringify({ types, edgeTypes, degreePairs });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Compute structural features vector for embedding fallback.
 * Returns a plain object that can be used for simple numeric comparison
 * or concatenated with a text embedding.
 */
function computeStructuralFeatures(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const maxPossibleEdges = nodeCount * (nodeCount - 1);
  const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

  // Type distribution (normalized histogram)
  const typeCounts = {};
  for (const n of nodes) {
    const t = n.type || n.draftType || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typeDistribution = {};
  for (const [t, c] of Object.entries(typeCounts)) {
    typeDistribution[t] = nodeCount > 0 ? c / nodeCount : 0;
  }

  // Edge type distribution
  const edgeTypeCounts = {};
  for (const e of edges) {
    const t = e.type || e.edgeType || 'RELATES_TO';
    edgeTypeCounts[t] = (edgeTypeCounts[t] || 0) + 1;
  }

  return {
    nodeCount,
    edgeCount,
    density: Number(density.toFixed(4)),
    avgDegree: Number(avgDegree.toFixed(4)),
    maxDepth: computeMaxDepth(nodes, edges),
    hasCycles: hasCycles(nodes, edges),
    typeDistribution,
    edgeTypeDistribution: edgeTypeCounts
  };
}

/**
 * Extract meaningful subgraphs from a workspace's draft graph.
 *
 * @param {Array} allDrafts  Workspace drafts (from drafts.listWithSource)
 * @param {Array} allEdges   Workspace edges [{source, target, type}]
 * @param {Object} [options]
 * @param {number} [options.minNodes=2]   Minimum nodes per subgraph
 * @param {number} [options.maxNodes=50]  Maximum nodes per subgraph
 * @returns {Array<{id, nodes, edges, rootNode, signature, features}>}
 */
function extractSubgraphs(allDrafts, allEdges, options = {}) {
  const { minNodes = 2, maxNodes = 50 } = options;

  // Normalize nodes: ensure id, type/draftType, name
  const nodes = allDrafts.map(d => ({
    id: d.id,
    type: d.type || d.draftType || 'unknown',
    draftType: d.type || d.draftType,
    name: d.name || '(unnamed)',
    description: d.description || '',
    knowledgeFamily: d.knowledgeFamily || '',
    confidence: d.confidence || 0,
    content: d.content || {}
  }));

  // Normalize edges
  const edges = allEdges.map(e => ({
    source: e.source || e.sourceId,
    target: e.target || e.targetId,
    type: e.type || e.edgeType || e.relType || 'RELATES_TO'
  })).filter(e => e.source && e.target);

  // Extract connected components
  const components = findConnectedComponents(nodes, edges);

  // Filter and enrich
  const subgraphs = [];
  for (const component of components) {
    if (component.nodes.length < minNodes || component.nodes.length > maxNodes) continue;

    const rootNode = findRootNode(component.nodes, component.edges);
    const signature = computeSignature(component.nodes, component.edges);
    const features = computeStructuralFeatures(component.nodes, component.edges);

    subgraphs.push({
      id: `sg_${signature}_${component.nodes.length}`,
      nodes: component.nodes,
      edges: component.edges,
      rootNode: { id: rootNode.id, name: rootNode.name, type: rootNode.type },
      signature,
      features,
      textSummary: component.nodes.map(n => `${n.type}: ${n.name}`).join('; ')
    });
  }

  return subgraphs;
}

module.exports = {
  extractSubgraphs,
  findConnectedComponents,
  findRootNode,
  computeMaxDepth,
  hasCycles,
  computeSignature,
  computeStructuralFeatures
};
