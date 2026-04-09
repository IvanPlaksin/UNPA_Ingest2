const { BaseTool } = require('../primitives/BaseTool.js');
const { createGraphValidator } = require('../../../services/graph/graph-validator.js');

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../../../services/graphCatalog.service.js').graphCatalogService;
  }
  return _catalogService;
}

class SaveGraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.save_graph',
      name: 'Save Graph to Catalog',
      version: '2.0.0',
      level: 3,
      category: 'catalog',
      description: 'Save a validated graph to the Core namespace catalog with versioning, deduplication, and lineage tracking.',
      inputSchema: {
        type: 'object',
        required: ['name', 'nodes', 'edges'],
        properties: {
          name:            { type: 'string', description: 'Graph name' },
          description:     { type: 'string', description: 'Graph description' },
          type:            { type: 'string', enum: ['WORKFLOW', 'SUBGRAPH', 'PATTERN', 'TEMPLATE', 'atomic', 'tool', 'business', 'composite', 'template'], default: 'WORKFLOW' },
          namespace:       { type: 'string', default: 'default', description: 'Legacy namespace (catalog always uses CORE)' },
          tags:            { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
          visibility:      { type: 'string', enum: ['PUBLIC', 'PRIVATE', 'TEAM'], default: 'PUBLIC' },
          nodes:           { type: 'array', description: 'Graph nodes array' },
          edges:           { type: 'array', description: 'Graph edges array' },
          requiredParams:  { type: 'object', description: 'Required execution parameters' },
          parentGraphId:   { type: 'string', description: 'Existing CatalogEntry ID to create a new version of' },
          parentNodeId:    { type: 'string', description: 'Node ID in parent that this sub-graph implements' },
          changelog:       { type: 'string', description: 'What changed (for versioning)' },
          reuseStrategy:   { type: 'string', enum: ['DIRECT_REUSE', 'CLONE_MODIFY', 'ABSTRACT_INHERIT', 'CREATE_NEW'], description: 'How this graph relates to source' },
          sourceGraphId:   { type: 'string', description: 'Original graph entry ID if derived' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 15000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    this.validateArgs(args, ['name', 'nodes', 'edges']);
    const {
      name, description = '', type = 'WORKFLOW', namespace = 'default',
      tags = [], visibility = 'PUBLIC', nodes, edges, requiredParams = {},
      parentGraphId, parentNodeId, changelog, reuseStrategy, sourceGraphId
    } = args;

    // ═══ STEP 1: VALIDATE ═══
    const validator = createGraphValidator(server);
    const validation = validator.validate({ nodes, edges });

    let finalNodes = nodes;
    let finalEdges = edges;
    let wasAutoFixed = false;

    if (!validation.valid) {
      // Check if errors are auto-fixable (no cycles, has entry nodes)
      const hasCritical = validation.errors.some(e =>
        e.code === 'GRAPH_HAS_CYCLES' || e.code === 'EMPTY_GRAPH'
      );

      if (!hasCritical) {
        const fixed = validator.autoFix({ nodes, edges });
        finalNodes = fixed.nodes;
        finalEdges = fixed.edges;
        wasAutoFixed = true;

        // Re-validate after fix
        const recheck = validator.validate({ nodes: finalNodes, edges: finalEdges });
        if (!recheck.valid) {
          const criticalAfterFix = recheck.errors.some(e =>
            e.code === 'GRAPH_HAS_CYCLES' || e.code === 'EMPTY_GRAPH'
          );
          if (criticalAfterFix) {
            return this.error('Graph validation failed after auto-fix: ' +
              recheck.errors.map(e => e.message).join('; '));
          }
        }
      } else {
        return this.error('Graph validation failed (not auto-fixable): ' +
          validation.errors.map(e => e.message).join('; '));
      }
    }

    const catalog = getCatalog();

    // ═══ STEP 2: CHECK DUPLICATE ═══
    const contentHash = catalog.computeContentHash(finalNodes, finalEdges);
    const existing = await catalog.findByContentHash(contentHash);
    if (existing) {
      return this.success({
        graph: {
          duplicate: true,
          entryId: existing.entryId,
          name: existing.name,
          message: `Graph already exists as "${existing.name}"`
        }
      });
    }

    // ═══ STEP 3: CREATE OR VERSION ═══
    const validationMeta = { stats: validation.stats, wasAutoFixed };
    const ctxObj = { userId: context?.userId || 'execution-assistant' };

    if (parentGraphId && !parentNodeId) {
      // New version of existing graph
      const result = await catalog.createVersion(
        parentGraphId,
        { nodes: finalNodes, edges: finalEdges, requiredParams, tags, type },
        changelog || 'Updated via Execution Assistant',
        ctxObj
      );

      // ═══ STEP 4: LINEAGE ═══
      if (sourceGraphId && reuseStrategy) {
        await catalog.recordReuse(sourceGraphId, parentGraphId, reuseStrategy, ctxObj);
      }

      return this.success({
        graph: {
          entryId: result.entryId,
          versionId: result.versionId,
          versionNumber: result.versionNumber,
          contentHash: result.contentHash,
          wasAutoFixed
        }
      });
    } else {
      // New catalog entry
      const result = await catalog.createCatalogEntry(
        { name, description, type, namespace, tags, visibility, nodes: finalNodes, edges: finalEdges, requiredParams },
        validationMeta,
        ctxObj
      );

      // Create DECOMPOSES link if this is a sub-graph
      if (parentGraphId && parentNodeId) {
        try {
          const session = catalog.getSession();
          try {
            await session.run(`
              MATCH (child:CatalogEntry {entryId: $entryId})
              MATCH (parent:CatalogEntry {entryId: $parentGraphId})
              CREATE (child)-[:DECOMPOSES {nodeId: $parentNodeId, createdAt: datetime()}]->(parent)
            `, { entryId: result.entryId, parentGraphId, parentNodeId });
          } finally {
            await session.close();
          }
        } catch (e) {
          console.warn('[SaveGraph] DECOMPOSES link warning:', e.message);
        }
      }

      // ═══ STEP 4: LINEAGE ═══
      if (sourceGraphId && reuseStrategy) {
        await catalog.recordReuse(sourceGraphId, result.entryId, reuseStrategy, ctxObj);
      }

      return this.success({
        graph: {
          entryId: result.entryId,
          graphId: result.graphId,
          versionId: result.versionId,
          versionNumber: result.versionNumber,
          contentHash: result.contentHash,
          topology: result.topology,
          qualityScore: result.qualityScore,
          wasAutoFixed,
          name,
          type
        }
      });
    }
  }
}

module.exports = { SaveGraphTool };
