/**
 * Radix REST Controller
 *
 * HTTP surface for workspace-scoped hybrid retrieval — the context pre-fetch
 * that runs before a message reaches an LLM.
 *
 * @module controllers/radix
 */

'use strict';

// Lazy-loaded so requiring the controller does not open Memgraph/Qdrant/TEI
// connections at import time.
let _retriever = null;
let _workspaceService = null;

function retriever() {
  if (!_retriever) {
    const { createRadixRetriever } = require('../services/radix');
    _retriever = createRadixRetriever({
      qdrantService: require('../services/qdrant.service'),
      memgraphService: require('../services/memgraph.service')
    });
  }
  return _retriever;
}

function ws() {
  if (!_workspaceService) _workspaceService = require('../services/workspace/workspace.service');
  return _workspaceService;
}

/**
 * Renders an expansion path as one readable line for API consumers, so a client
 * does not have to re-implement the walk to display it.
 *
 * @param {import('../services/radix/contracts/strategy.interface').PathSegment[]} path
 * @returns {string|undefined}
 */
function formatPath(path) {
  if (!Array.isArray(path) || path.length < 2) return undefined;
  return path
    .map((segment, index) => {
      const name = segment.nodeName || segment.nodeId;
      if (index === 0) return name;
      const link = segment.edgeDirection === 'incoming'
        ? `<--[${segment.edgeType}]--`
        : `--[${segment.edgeType}]-->`;
      return `${link} ${name}`;
    })
    .join(' ');
}

/**
 * Projects an internal ContextElement onto the API shape.
 *
 * Strategy attributions collapse to names: the raw/normalized scores and ranks
 * are internal ranking mechanics, and exposing them invites clients to build on
 * numbers we intend to keep tuning.
 *
 * @param {import('../services/radix/contracts/context-bundle').ContextElement} element
 * @returns {Object}
 */
function toElementDTO(element) {
  const meta = element.metadata || {};
  return {
    id: element.id,
    type: element.type,
    content: element.content,
    score: element.score,
    strategies: (element.strategies || []).map((s) => s.strategyName),
    provenance: {
      sourceId: element.provenance.sourceId,
      sourceType: element.provenance.sourceType,
      ...(element.provenance.draftId ? { draftId: element.provenance.draftId } : {}),
      ...(meta.sourceRefName ? { documentName: meta.sourceRefName } : {})
    },
    metadata: {
      ...(meta.name ? { name: meta.name } : {}),
      ...(meta.draftType ? { draftType: meta.draftType } : {}),
      ...(meta.draftStatus ? { draftStatus: meta.draftStatus } : {}),
      ...(meta.knowledgeFamily ? { knowledgeFamily: meta.knowledgeFamily } : {}),
      ...(typeof meta.hops === 'number' ? { hops: meta.hops } : {}),
      ...(formatPath(meta.expansionPath) ? { path: formatPath(meta.expansionPath) } : {}),
      ...(meta.conflict ? { conflict: meta.conflict } : {})
    }
  };
}

class RadixController {
  /**
   * POST /api/v1/workspaces/:id/retrieve
   *
   * Body: { query: string, config?: Partial<RetrievalConfig> }
   */
  async retrieve(req, res, next) {
    try {
      const workspaceId = req.params.id;
      const { query, config } = req.body || {};

      if (typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'query is required and must be a non-empty string'
        });
      }
      if (config !== undefined && (typeof config !== 'object' || Array.isArray(config))) {
        return res.status(400).json({
          success: false,
          error: 'config must be an object'
        });
      }

      // Checked before retrieving: an unknown workspace is a 404, not an empty
      // result set — those mean very different things to a caller.
      const workspace = await ws().get(workspaceId);
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: `Workspace not found: ${workspaceId}`
        });
      }

      const bundle = await retriever().retrieve(workspaceId, query, config || {});

      return res.json({
        success: true,
        data: {
          bundleId: bundle.bundleId,
          workspaceId: bundle.workspaceId,
          query: bundle.query,
          elements: bundle.elements.map(toElementDTO),
          assembledContext: bundle.assembledContext,
          strategiesUsed: bundle.strategiesUsed,
          truncated: bundle.truncated,
          timing: bundle.timing,
          stats: bundle.stats
        }
      });
    } catch (error) {
      // A caller mistake the retriever rejects (unknown strategy name,
      // unimplemented format) is a 400, not a server fault.
      if (/Unknown strategy|not implemented|requires |must be a Map/.test(error.message || '')) {
        return res.status(400).json({ success: false, error: error.message });
      }
      return next(error);
    }
  }
}

module.exports = new RadixController();
module.exports.toElementDTO = toElementDTO;
module.exports.formatPath = formatPath;
