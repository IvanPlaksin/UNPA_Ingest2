/**
 * REST controller for the chat's knowledge-workspace binding.
 *
 * @module instances/flowdesk/controller/knowledge-binding
 */

'use strict';

let _service = null;
function binding() {
  if (!_service) {
    _service = require('../services/knowledge-binding.service').getKnowledgeBindingService();
  }
  return _service;
}

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../../../services/memgraph.service');
  return _mg;
}

function actor(req) {
  return req.user?.id || req.headers['x-user-id'] || 'anonymous';
}

class KnowledgeBindingController {
  /** GET /api/v1/flowdesk/admin/knowledge-binding */
  async get(req, res, next) {
    try {
      return res.json({ success: true, data: await binding().getStatus() });
    } catch (error) {
      return next(error);
    }
  }

  /** PUT /api/v1/flowdesk/admin/knowledge-binding */
  async set(req, res, next) {
    try {
      const { workspaceId, workspaceName } = req.body || {};
      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'workspaceId is required' });
      }

      // The workspace is verified to exist before it is bound: a binding to a
      // deleted or mistyped id would leave the chat silently context-less, with
      // the admin screen cheerfully showing it as configured.
      const rows = await mg().runQuery(
        'MATCH (w:WorkSpace {id: $id}) RETURN w.name AS name',
        { id: workspaceId }
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: `Workspace not found: ${workspaceId}` });
      }

      const saved = await binding().setBinding(workspaceId, {
        workspaceName: workspaceName || rows[0].name || '',
        updatedBy: actor(req)
      });

      return res.json({ success: true, data: saved });
    } catch (error) {
      return next(error);
    }
  }

  /** POST /api/v1/flowdesk/admin/knowledge-binding/disable */
  async disable(req, res, next) {
    try {
      const result = await binding().disableBinding({ updatedBy: actor(req) });
      if (!result) return res.status(404).json({ success: false, error: 'No binding to disable' });
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }

  /** POST /api/v1/flowdesk/admin/knowledge-binding/enable */
  async enable(req, res, next) {
    try {
      const result = await binding().enableBinding({ updatedBy: actor(req) });
      if (!result) return res.status(404).json({ success: false, error: 'No binding to enable' });
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }

  /** DELETE /api/v1/flowdesk/admin/knowledge-binding */
  async remove(req, res, next) {
    try {
      const removed = await binding().deleteBinding();
      return res.json({ success: true, data: { removed } });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * GET /api/v1/flowdesk/admin/available-workspaces
   *
   * Draft and connector counts ride along so the picker can show what binding a
   * workspace would actually give the chat, rather than a list of names.
   */
  async availableWorkspaces(req, res, next) {
    try {
      const rows = await mg().runQuery(
        `MATCH (w:WorkSpace)
         WHERE coalesce(w.status, '') <> 'ARCHIVED'
         OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
         OPTIONAL MATCH (w)-[:HAS_CONNECTOR]->(c)
         RETURN w.id AS id, w.name AS name, w.status AS status,
                count(DISTINCT d) AS draftsCount, count(DISTINCT c) AS connectorsCount`,
        {}
      );

      const workspaces = (rows || [])
        .map((r) => ({
          id: r.id,
          name: r.name || '(unnamed)',
          status: r.status || null,
          draftsCount: Number(r.draftsCount) || 0,
          connectorsCount: Number(r.connectorsCount) || 0
        }))
        .sort((a, b) => b.draftsCount - a.draftsCount);

      return res.json({ success: true, data: workspaces });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new KnowledgeBindingController();
