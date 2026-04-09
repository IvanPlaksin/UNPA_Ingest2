/**
 * WorkSpace Structural Import Service
 *
 * Bridges the global Structural Editor (form/data-structure builder, stored
 * as a `:GraphDefinition {graphType: 'STRUCTURAL'}` node in Memgraph) with
 * the workspace draft model.
 *
 * The Structural Editor produces a graph of typed fields, objects, arrays
 * and enums grouped under a ROOT node. We convert this into workspace
 * drafts so the curated structure becomes part of the workspace knowledge:
 *
 *   ROOT       → DraftSchema  (one schema draft per imported form)
 *   OBJECT     → DraftEntity  (one entity per nested object)
 *   ARRAY      → DraftEntity  (treated as a collection entity)
 *   ENUM       → DraftConcept (enum values become concept allowed-values)
 *   FIELD      → kept inline as a property of the parent schema/entity,
 *                NOT as separate drafts (avoids draft explosion)
 *
 * Edges between drafts are created with `CONTAINS` (parent→child).
 *
 * Each imported draft is linked to a synthetic `SourceReference` so the
 * provenance trail records "this came from structural form X" — that source
 * is created on first import and reused on subsequent imports of the same
 * structural graph into the same workspace.
 *
 * @module services/workspace/structural-import.service
 */

'use strict';

const LOG_PREFIX = '[StructuralImport]';

let _memgraph = null;
let _draftService = null;
let _wsService = null;

function mg()      { if (!_memgraph)     _memgraph    = require('../memgraph.service'); return _memgraph; }
function drafts()  { if (!_draftService) _draftService = require('./draft.service');    return _draftService; }
function ws()      { if (!_wsService)    _wsService   = require('./workspace.service'); return _wsService; }

/**
 * Fetch a STRUCTURAL graph definition by id.
 * @returns {Promise<{graphId, name, namespace, nodes, edges} | null>}
 */
async function _fetchStructuralGraph(graphId) {
  const rows = await mg().runQuery(
    `MATCH (g:GraphDefinition {graphId: $gid, graphType: "STRUCTURAL"})
     RETURN g.graphId as graphId, g.name as name, g.namespace as namespace,
            g.nodes as nodes, g.edges as edges`,
    { gid: graphId }
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  let nodes = r.nodes;
  let edges = r.edges;
  try { if (typeof nodes === 'string') nodes = JSON.parse(nodes); } catch {}
  try { if (typeof edges === 'string') edges = JSON.parse(edges); } catch {}
  return {
    graphId: r.graphId,
    name: r.name,
    namespace: r.namespace,
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : []
  };
}

/**
 * Find or create a synthetic source representing this structural graph
 * inside the workspace. Reused across imports of the same graph.
 */
async function _ensureStructuralSource(workspaceId, structuralGraph, userId) {
  const filename = `structural:${structuralGraph.graphId}`;

  // Check existing
  const existing = await mg().runQuery(
    `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {filename: $filename})
     RETURN s LIMIT 1`,
    { wsId: workspaceId, filename }
  );
  if (existing && existing.length > 0) {
    const props = existing[0].s?.properties || existing[0].s || {};
    return { id: props.id, filename, isNew: false };
  }

  // Create new synthetic source via workspace.service.addSource
  const created = await ws().addSource(workspaceId, {
    filename,
    mimeType: 'application/x-structural-graph',
    sourceType: 'STRUCTURAL_FORM',
    sizeBytes: JSON.stringify(structuralGraph).length,
    uri: `structural://${structuralGraph.graphId}`
  });
  console.log(`${LOG_PREFIX} created synthetic source ${created.id} for structural graph ${structuralGraph.graphId}`);
  return { id: created.id, filename, isNew: true };
}

/**
 * Build adjacency from edges so we can walk parent → children.
 */
function _buildAdjacency(structuralGraph) {
  const childrenOf = new Map();
  for (const edge of structuralGraph.edges) {
    const src = edge.source;
    const tgt = edge.target;
    if (!src || !tgt) continue;
    if (!childrenOf.has(src)) childrenOf.set(src, []);
    childrenOf.get(src).push({ targetId: tgt, edgeType: edge.edgeType || 'CONTAINS' });
  }
  return childrenOf;
}

/**
 * Pick a draft type for a structural node.
 *   ROOT   → 'schema'
 *   OBJECT → 'entity'
 *   ARRAY  → 'entity'
 *   ENUM   → 'concept'
 *   FIELD  → null (folded into parent)
 *   other  → null (skipped)
 */
function _draftTypeFor(structuralNode) {
  switch (structuralNode.nodeType) {
    case 'ROOT':   return 'schema';
    case 'OBJECT': return 'entity';
    case 'ARRAY':  return 'entity';
    case 'ENUM':   return 'concept';
    default:       return null;
  }
}

/**
 * Extract a sensible label/name from a structural node.
 */
function _nodeLabel(structuralNode) {
  if (structuralNode.label) {
    if (typeof structuralNode.label === 'string') return structuralNode.label;
    if (typeof structuralNode.label === 'object') {
      return structuralNode.label.en
          || structuralNode.label.ru
          || Object.values(structuralNode.label)[0]
          || structuralNode.name
          || structuralNode.nodeId;
    }
  }
  return structuralNode.name || structuralNode.nodeId || '(unnamed)';
}

/**
 * Build the `content` payload for a draft node, folding all FIELD children
 * inline as a `fields` array (with name, dataType, required, etc).
 */
function _buildContent(structuralNode, structuralNodes, childrenOf) {
  const content = {
    structuralNodeId: structuralNode.nodeId,
    structuralNodeType: structuralNode.nodeType,
    description: structuralNode.description || ''
  };

  if (structuralNode.dataType) content.dataType = structuralNode.dataType;
  if (structuralNode.required !== undefined) content.required = structuralNode.required;

  // ENUM: capture allowed values
  if (structuralNode.nodeType === 'ENUM') {
    if (Array.isArray(structuralNode.enumValues)) {
      content.allowedValues = structuralNode.enumValues;
    }
    if (structuralNode.enumLabels && typeof structuralNode.enumLabels === 'object') {
      content.allowedValueLabels = structuralNode.enumLabels;
    }
  }

  // For ROOT/OBJECT/ARRAY: gather child FIELDs as inline properties
  const myChildren = childrenOf.get(structuralNode.nodeId) || [];
  const inlineFields = [];
  for (const { targetId } of myChildren) {
    const child = structuralNodes.find(n => n.nodeId === targetId);
    if (!child) continue;
    if (child.nodeType !== 'FIELD') continue;     // only fields are folded inline
    inlineFields.push({
      name: child.name || child.nodeId,
      label: _nodeLabel(child),
      dataType: child.dataType || 'string',
      required: !!child.required,
      defaultValue: child.defaultValue,
      uiHints: child.uiHints || null
    });
  }
  if (inlineFields.length > 0) content.fields = inlineFields;

  return content;
}

/**
 * Walk the structural graph and produce { drafts, edges } where drafts is
 * an array of {structuralNodeId, draftType, name, description, content}
 * and edges is an array of {sourceStructuralId, targetStructuralId, edgeType}.
 *
 * FIELD nodes are NOT in `drafts` (they live inside their parent's content).
 * Only ROOT / OBJECT / ARRAY / ENUM produce drafts.
 */
function _convertToDraftPlan(structuralGraph) {
  const childrenOf = _buildAdjacency(structuralGraph);
  const draftPlans = [];
  const edgePlans = [];

  for (const node of structuralGraph.nodes) {
    const draftType = _draftTypeFor(node);
    if (!draftType) continue;     // skip FIELDs (folded inline) and unknown types

    draftPlans.push({
      structuralNodeId: node.nodeId,
      draftType,
      name: _nodeLabel(node),
      description: node.description || `Imported from structural form "${structuralGraph.name}"`,
      content: _buildContent(node, structuralGraph.nodes, childrenOf)
    });
  }

  // Edges between draft-producing nodes only (skip edges to FIELD children)
  const draftNodeIds = new Set(draftPlans.map(d => d.structuralNodeId));
  for (const edge of structuralGraph.edges) {
    if (draftNodeIds.has(edge.source) && draftNodeIds.has(edge.target)) {
      edgePlans.push({
        sourceStructuralId: edge.source,
        targetStructuralId: edge.target,
        edgeType: edge.edgeType || 'CONTAINS'
      });
    }
  }

  return { draftPlans, edgePlans };
}

class StructuralImportService {

  /**
   * Preview an import without creating anything. Returns the plan that
   * would be applied (counts + draft list) so the UI can show "this will
   * create N drafts and M edges".
   *
   * @param {string} workspaceId
   * @param {string} structuralGraphId
   */
  async previewImport(workspaceId, structuralGraphId) {
    const structuralGraph = await _fetchStructuralGraph(structuralGraphId);
    if (!structuralGraph) {
      throw new Error(`Structural graph not found: ${structuralGraphId}`);
    }

    const { draftPlans, edgePlans } = _convertToDraftPlan(structuralGraph);

    // Count breakdown by type
    const byType = {};
    for (const d of draftPlans) byType[d.draftType] = (byType[d.draftType] || 0) + 1;

    return {
      structuralGraph: {
        graphId: structuralGraph.graphId,
        name: structuralGraph.name,
        namespace: structuralGraph.namespace,
        nodeCount: structuralGraph.nodes.length,
        edgeCount: structuralGraph.edges.length
      },
      plan: {
        draftCount: draftPlans.length,
        edgeCount: edgePlans.length,
        byType,
        drafts: draftPlans.map(d => ({
          structuralNodeId: d.structuralNodeId,
          draftType: d.draftType,
          name: d.name,
          fieldCount: (d.content.fields || []).length
        }))
      }
    };
  }

  /**
   * Execute the import: create a synthetic source (or reuse existing),
   * create a workspace draft for every ROOT/OBJECT/ARRAY/ENUM in the
   * structural graph, then create CONTAINS edges between them.
   *
   * @param {string} workspaceId
   * @param {string} structuralGraphId
   * @param {Object} [opts]
   * @param {string} [opts.userId]
   * @returns {Promise<{success, source, createdDrafts, createdEdges, stats}>}
   */
  async importIntoWorkspace(workspaceId, structuralGraphId, opts = {}) {
    const userId = opts.userId || 'structural-import';

    const structuralGraph = await _fetchStructuralGraph(structuralGraphId);
    if (!structuralGraph) {
      throw new Error(`Structural graph not found: ${structuralGraphId}`);
    }

    const { draftPlans, edgePlans } = _convertToDraftPlan(structuralGraph);

    // 1. Synthetic source (idempotent — reused on re-import)
    const source = await _ensureStructuralSource(workspaceId, structuralGraph, userId);

    // 2. Create drafts (one per ROOT/OBJECT/ARRAY/ENUM)
    const idMap = new Map();   // structuralNodeId → workspace draft id
    const createdDrafts = [];
    for (const plan of draftPlans) {
      try {
        const draft = await drafts().create(workspaceId, {
          type: plan.draftType,
          name: plan.name,
          description: plan.description,
          content: plan.content,
          sourceId: source.id,
          confidence: 0.9,                  // user-curated structure → high confidence
          extractedBy: userId
        });
        idMap.set(plan.structuralNodeId, draft.id);
        createdDrafts.push({
          id: draft.id,
          structuralNodeId: plan.structuralNodeId,
          type: plan.draftType,
          name: plan.name
        });
      } catch (err) {
        console.warn(`${LOG_PREFIX} failed to create draft for ${plan.structuralNodeId}: ${err.message}`);
      }
    }

    // 3. Create edges between created drafts
    const createdEdges = [];
    for (const edge of edgePlans) {
      const srcDraftId = idMap.get(edge.sourceStructuralId);
      const tgtDraftId = idMap.get(edge.targetStructuralId);
      if (!srcDraftId || !tgtDraftId) continue;
      try {
        await drafts().createEdge(workspaceId, {
          sourceId: srcDraftId,
          targetId: tgtDraftId,
          edgeType: edge.edgeType,
          confidence: 1.0
        });
        createdEdges.push({ source: srcDraftId, target: tgtDraftId, type: edge.edgeType });
      } catch (err) {
        console.warn(`${LOG_PREFIX} failed to create edge ${edge.sourceStructuralId}->${edge.targetStructuralId}: ${err.message}`);
      }
    }

    console.log(`${LOG_PREFIX} imported structural ${structuralGraphId} into workspace ${workspaceId}: ${createdDrafts.length} drafts, ${createdEdges.length} edges`);

    return {
      success: true,
      source: { id: source.id, filename: source.filename, isNew: source.isNew },
      structuralGraph: {
        graphId: structuralGraph.graphId,
        name: structuralGraph.name
      },
      stats: {
        draftsRequested: draftPlans.length,
        draftsCreated: createdDrafts.length,
        edgesRequested: edgePlans.length,
        edgesCreated: createdEdges.length
      },
      createdDrafts,
      createdEdges
    };
  }
}

const instance = new StructuralImportService();
module.exports = instance;
module.exports.StructuralImportService = StructuralImportService;
