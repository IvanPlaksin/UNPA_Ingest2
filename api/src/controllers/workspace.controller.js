/**
 * WorkSpace REST Controller
 *
 * HTTP endpoints for WorkSpace management.
 * Used by UI and external integrations.
 *
 * @module controllers/workspace
 */

'use strict';

// Lazy-loaded services to avoid circular dependencies
let _workspaceService = null;
let _draftService = null;

function ws() {
  if (!_workspaceService) _workspaceService = require('../services/workspace/workspace.service');
  return _workspaceService;
}

function drafts() {
  if (!_draftService) _draftService = require('../services/workspace/draft.service');
  return _draftService;
}

function getUserId(req) {
  return req.user?.id || req.headers['x-user-id'] || 'anonymous';
}

class WorkspaceController {

  // ==================== WORKSPACE LIFECYCLE ====================

  /** POST /api/v1/workspaces */
  async create(req, res, next) {
    try {
      const { name, description, domain, tags } = req.body;
      const workspace = await ws().create({
        name,
        description,
        domain,
        tags,
        createdBy: getUserId(req)
      });
      res.status(201).json({ success: true, data: workspace });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces */
  async list(req, res, next) {
    try {
      const { status, domain, limit = '20', offset = '0' } = req.query;
      const result = await ws().list({
        userId: getUserId(req),
        status,
        domain,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      res.json({
        success: true,
        data: result.items,
        pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) }
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id */
  async get(req, res, next) {
    try {
      const workspace = await ws().get(req.params.id);
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `WorkSpace not found: ${req.params.id}` }
        });
      }
      res.json({ success: true, data: workspace });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/v1/workspaces/:id */
  async update(req, res, next) {
    try {
      const { name, description, domain, tags } = req.body;
      const workspace = await ws().update(req.params.id, { name, description, domain, tags });
      res.json({ success: true, data: workspace });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/v1/workspaces/:id/status */
  async updateStatus(req, res, next) {
    try {
      const { status, reason } = req.body;
      const workspace = await ws().updateStatus(req.params.id, status, reason);
      res.json({ success: true, data: workspace });
    } catch (error) {
      if (error.message.includes('Invalid status transition')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TRANSITION', message: error.message }
        });
      }
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id */
  async archive(req, res, next) {
    try {
      await ws().archive(req.params.id);
      res.json({ success: true, message: `WorkSpace ${req.params.id} archived` });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/permanent */
  async deletePermanent(req, res, next) {
    try {
      await ws().delete(req.params.id);
      res.json({ success: true, message: `WorkSpace ${req.params.id} permanently deleted` });
    } catch (error) {
      if (error.message.includes('Archive it first')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATE', message: error.message }
        });
      }
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/stats */
  async getStats(req, res, next) {
    try {
      const stats = await ws().getStats(req.params.id);
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  // ==================== SOURCES ====================

  /** POST /api/v1/workspaces/:id/sources — Create source (JSON: URL or TEXT) */
  async addSource(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      const { sourceType, url, text, title, description, filename, mimeType, uri, sizeBytes } = req.body;

      let source;
      if (sourceType === 'URL') {
        source = await srcSvc.createUrlSource(req.params.id, { url, title, description });
      } else if (sourceType === 'TEXT') {
        source = await srcSvc.createTextSource(req.params.id, { text, title, description });
      } else {
        // Legacy: FILE/DATABASE/API/FILESYSTEM via JSON (no file upload)
        source = await ws().addSource(req.params.id, {
          filename, mimeType, sourceType: sourceType || 'FILE', uri, sizeBytes
        });
      }
      res.status(201).json({ success: true, data: source });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/sources/upload — Upload file source (multipart) */
  async uploadSource(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
      }
      const srcSvc = require('../services/workspace/source.service');
      const source = await srcSvc.createFileSource(req.params.id, req.file, {
        description: req.body.description || ''
      });
      res.status(201).json({ success: true, data: source });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/sources */
  async listSources(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      const sources = await srcSvc.listSources(req.params.id);
      res.json({ success: true, data: sources });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/sources/:sourceId */
  async getSource(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      const source = await srcSvc.getSource(req.params.id, req.params.sourceId);
      if (!source) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Source not found: ${req.params.sourceId}` }
        });
      }
      res.json({ success: true, data: source });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/sources/:sourceId/details — Full source with extraction results */
  async getSourceDetails(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      const details = await srcSvc.getSourceWithResults(req.params.id, req.params.sourceId);
      if (!details) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Source not found: ${req.params.sourceId}` }
        });
      }
      res.json({ success: true, data: details });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/sources/:sourceId/analyze — Run source analysis */
  async analyzeSource(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      const result = await srcSvc.analyzeSource(req.params.id, req.params.sourceId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/sources/:sourceId/extract — Enqueue async extraction */
  async extractSource(req, res, next) {
    try {
      const { enqueueExtraction } = require('../services/workspace/extraction/extraction-queue');
      const { extractTypes, priority } = req.body || {};
      const result = await enqueueExtraction(req.params.id, req.params.sourceId, { extractTypes, priority });
      res.status(202).json({
        success: true,
        data: {
          ...result,
          message: 'Extraction job enqueued',
          progressUrl: `/api/v1/workspaces/${req.params.id}/extract/${result.jobId}/progress`
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/sources/extract-flowdesk — Run FlowDesk-specific extraction */
  async extractFlowDesk(req, res, next) {
    try {
      const { runFlowDeskExtraction } = require('../services/workspace/extraction/flowdesk');
      const { sourceId } = req.body;
      const result = await runFlowDeskExtraction(req.params.id, sourceId || '', req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/extract/:jobId — Get job status */
  async getExtractionStatus(req, res, next) {
    try {
      const { getJobStatus } = require('../services/workspace/extraction/extraction-queue');
      const status = await getJobStatus(req.params.jobId);
      if (!status.exists) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
      }
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/extract/:jobId — Cancel extraction */
  async cancelExtraction(req, res, next) {
    try {
      const { cancelJob } = require('../services/workspace/extraction/extraction-queue');
      const result = await cancelJob(req.params.jobId);
      res.json({ success: result.success, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/extract/jobs — List workspace extraction jobs */
  async listExtractionJobs(req, res, next) {
    try {
      const { getWorkspaceJobs } = require('../services/workspace/extraction/extraction-queue');
      const { status, limit } = req.query;
      const jobs = await getWorkspaceJobs(req.params.id, {
        status: status ? status.split(',') : undefined,
        limit: limit ? parseInt(limit) : 20
      });
      res.json({ success: true, data: jobs });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/extract/:jobId/progress — SSE progress stream */
  async streamExtractionProgress(req, res) {
    const { getJobStatus, subscribeToProgress } = require('../services/workspace/extraction/extraction-queue');
    const { jobId } = req.params;

    const status = await getJobStatus(jobId);
    if (!status.exists) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial status
    sendEvent('status', status);

    if (status.status === 'completed' || status.status === 'failed') {
      sendEvent('done', { status: status.status });
      res.end();
      return;
    }

    // Subscribe to progress
    const unsubscribe = subscribeToProgress(jobId, (progress) => {
      sendEvent('progress', progress);
      if (['completed', 'failed', 'cancelled'].includes(progress.phase)) {
        sendEvent('done', { phase: progress.phase });
        res.end();
        unsubscribe();
      }
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  /** DELETE /api/v1/workspaces/:id/sources/:sourceId */
  async deleteSource(req, res, next) {
    try {
      const srcSvc = require('../services/workspace/source.service');
      await srcSvc.deleteSource(req.params.id, req.params.sourceId);
      res.json({ success: true, message: `Source ${req.params.sourceId} deleted` });
    } catch (error) {
      next(error);
    }
  }

  // ==================== DRAFTS ====================

  /** POST /api/v1/workspaces/:id/drafts */
  async createDraft(req, res, next) {
    try {
      const { type, name, description, content, sourceId, confidence } = req.body;
      const draft = await drafts().create(req.params.id, {
        type, name, description, content, sourceId, confidence,
        extractedBy: getUserId(req)
      });
      res.status(201).json({ success: true, data: draft });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/drafts */
  async listDrafts(req, res, next) {
    try {
      const { type, status, sourceId, knowledgeFamily, limit = '50', offset = '0' } = req.query;
      const result = await drafts().list(req.params.id, {
        type, status, sourceId, knowledgeFamily,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      res.json({
        success: true,
        data: result.items,
        pagination: { total: result.total, limit: parseInt(limit), offset: parseInt(offset) }
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/drafts/:draftId */
  async getDraft(req, res, next) {
    try {
      const draft = await drafts().get(req.params.id, req.params.draftId);
      if (!draft) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Draft not found: ${req.params.draftId}` }
        });
      }
      res.json({ success: true, data: draft });
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /api/v1/workspaces/:id/drafts/:draftId */
  async updateDraft(req, res, next) {
    try {
      const draft = await drafts().update(req.params.id, req.params.draftId, req.body);
      res.json({ success: true, data: draft });
    } catch (error) {
      if (error.message.includes('Invalid draft status transition')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TRANSITION', message: error.message }
        });
      }
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/drafts/:draftId */
  async deleteDraft(req, res, next) {
    try {
      await drafts().delete(req.params.id, req.params.draftId);
      res.json({ success: true, message: `Draft ${req.params.draftId} deleted` });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/drafts/search */
  async searchDrafts(req, res, next) {
    try {
      const { query, type, limit = 10 } = req.body;
      const results = await drafts().searchByText(req.params.id, query, { type, limit });
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  }

  // ==================== EDGES ====================

  /** POST /api/v1/workspaces/:id/edges */
  async createEdge(req, res, next) {
    try {
      const { sourceId, targetId, edgeType, confidence, properties } = req.body;
      const edge = await drafts().createEdge(req.params.id, {
        sourceId, targetId, edgeType, confidence, properties
      });
      res.status(201).json({ success: true, data: edge });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/drafts/:draftId/edges */
  async getEdges(req, res, next) {
    try {
      const { direction = 'both' } = req.query;
      const edges = await drafts().getEdges(req.params.id, req.params.draftId, { direction });
      res.json({ success: true, data: edges });
    } catch (error) {
      next(error);
    }
  }

  // ==================== KB ACCESS (READ-ONLY) ====================

  /** POST /api/v1/workspaces/:id/kb/search */
  async kbSearch(req, res, next) {
    try {
      const { query, namespace, type, limit = 10 } = req.body;
      const userId = getUserId(req);
      const tei = require('../services/tei.service');
      const { createReadOnlyProxy } = require('../services/workspace');

      const embedding = await tei.getEmbedding(query);
      const proxy = createReadOnlyProxy(req.params.id, userId);
      try {
        const results = await proxy.searchSimilar(embedding, {
          namespace, type, limit, threshold: 0.6
        });
        res.json({ success: true, data: results });
      } finally {
        await proxy.close();
      }
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/kb/nodes/:entityId */
  async kbGetNode(req, res, next) {
    try {
      const { full = 'false' } = req.query;
      const userId = getUserId(req);
      const { createReadOnlyProxy } = require('../services/workspace');

      const proxy = createReadOnlyProxy(req.params.id, userId);
      try {
        const node = full === 'true'
          ? await proxy.getNodeFull(req.params.entityId)
          : await proxy.getNodeStub(req.params.entityId);

        if (!node) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `KB node not found: ${req.params.entityId}` }
          });
        }
        res.json({ success: true, data: node });
      } finally {
        await proxy.close();
      }
    } catch (error) {
      next(error);
    }
  }

  // ==================== PROMOTION ====================

  /** POST /api/v1/workspaces/:id/promotion/diff — Compute diff for all drafts */
  async computePromotionDiff(req, res, next) {
    try {
      const { computeDiff } = require('../services/workspace/promotion');
      const { targetNamespace, draftIds } = req.body || {};
      const result = await computeDiff(req.params.id, { targetNamespace, draftIds });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/promotion/execute — Execute promotion with resolutions */
  async executePromotion(req, res, next) {
    try {
      const { applyResolutions, buildPromotionSaga, executePromotionSaga } = require('../services/workspace/promotion');
      const { items, resolutions, targetNamespace, skipValidation } = req.body;
      const userId = getUserId(req);

      // Validation gate (WS2-007) — block promotion on unresolved BLOCKING contradictions.
      if (!skipValidation) {
        const validator = require('../services/workspace/graph-validator.service');
        const promotionCheck = await validator.canPromote(req.params.id);
        if (!promotionCheck.allowed) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Cannot promote: unresolved blocking issues',
              blockers: promotionCheck.blockers
            }
          });
        }
      }

      // Apply resolutions
      const resolved = applyResolutions(items, resolutions || {});

      // Build and execute SAGA
      const saga = buildPromotionSaga({
        workspaceId: req.params.id,
        targetNamespace: targetNamespace || 'core',
        items: resolved.items,
        userId
      });

      const result = await executePromotionSaga(saga);

      res.json({ success: result.success, data: { ...result, resolutionSummary: resolved.summary } });
    } catch (error) {
      next(error);
    }
  }

  // ==================== DATASOURCE CATALOG (BRIDGE) ====================

  /**
   * GET /api/v1/workspaces/:id/datasources
   * Returns the workspace-scoped DataSource catalog: workspace-private +
   * shared globals.
   *
   * Query: sourceType?, includeGlobal=true, limit=200
   */
  async listWorkspaceDataSources(req, res, next) {
    try {
      const { sourceType, includeGlobal = 'true', limit = '200' } = req.query;
      const wsDsService = require('../services/workspace/workspace-datasource.service');
      const items = await wsDsService.listForWorkspace(req.params.id, {
        sourceType,
        includeGlobal: includeGlobal !== 'false',
        limit: parseInt(limit, 10)
      });
      res.json({ success: true, data: items, count: items.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/datasources
   * Body: full v2 DataSource config (name, sourceType, sqlConfig|apiConfig|...)
   *
   * Creates a v2 DataSource scoped to the workspace AND a paired
   * SourceReference so the new entry appears both in the workspace
   * SourcesTab and in the Form Builder DataSources tab.
   */
  async createWorkspaceDataSource(req, res, next) {
    try {
      const wsDsService = require('../services/workspace/workspace-datasource.service');
      const result = await wsDsService.createWithSource(
        req.params.id,
        req.body || {},
        getUserId(req)
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/datasources/register-source
   * Body: { sourceId }
   *
   * Promotes an existing workspace SourceReference (DATABASE or API type)
   * into the v2 DataSource catalog and returns the linked graphId.
   */
  async registerWorkspaceSourceAsDataSource(req, res, next) {
    try {
      const { sourceId } = req.body || {};
      if (!sourceId) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'sourceId in body is required' }
        });
      }
      const wsDsService = require('../services/workspace/workspace-datasource.service');
      const result = await wsDsService.registerSourceAsDataSource(req.params.id, sourceId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/sources/from-document
   * Body: { documentId }
   *
   * Links an already-extracted Document (status=COMPLETED) as a KB DataSource
   * + SourceReference in the workspace.
   */
  async addSourceFromDocument(req, res, next) {
    try {
      const { documentId } = req.body || {};
      if (!documentId) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'documentId is required' } });
      }
      const wsDsService = require('../services/workspace/workspace-datasource.service');
      const result = await wsDsService.createFromDocument(req.params.id, documentId);
      res.status(result.alreadyLinked ? 200 : 201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // ==================== STRUCTURAL IMPORT ====================

  /**
   * GET /api/v1/workspaces/:id/structural-import/preview?graphId=...
   * Preview the import plan without writing anything.
   */
  async previewStructuralImport(req, res, next) {
    try {
      const { graphId } = req.query;
      if (!graphId) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'graphId query parameter is required' }
        });
      }
      const svc = require('../services/workspace/structural-import.service');
      const data = await svc.previewImport(req.params.id, graphId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/structural-import
   * Body: { graphId: "structural_..." }
   * Imports a Structural Editor graph as workspace drafts.
   */
  async importStructuralGraph(req, res, next) {
    try {
      const { graphId } = req.body || {};
      if (!graphId) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'graphId in body is required' }
        });
      }
      const svc = require('../services/workspace/structural-import.service');
      const result = await svc.importIntoWorkspace(req.params.id, graphId, {
        userId: getUserId(req)
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // ==================== AUDIT ====================

  /** GET /api/v1/workspaces/:id/audit */
  async getAuditLog(req, res, next) {
    try {
      const { limit = '100', operation } = req.query;
      const userId = getUserId(req);
      const { createReadOnlyProxy } = require('../services/workspace');

      const proxy = createReadOnlyProxy(req.params.id, userId);
      try {
        const entries = await proxy.getAuditLog({
          limit: parseInt(limit),
          operation
        });
        res.json({ success: true, data: entries });
      } finally {
        await proxy.close();
      }
    } catch (error) {
      next(error);
    }
  }

  // ==================== AGENT (PERSISTENT CHAT) ====================

  /** GET /api/v1/workspaces/:id/agent/session */
  async getAgentSession(req, res, next) {
    try {
      const agent = require('../services/workspace/workspace-agent.service');
      const session = await agent.getOrCreateSession(req.params.id);
      res.json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/agent/session */
  async clearAgentSession(req, res, next) {
    try {
      const agent = require('../services/workspace/workspace-agent.service');
      const result = await agent.clearHistory(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/workspaces/:id/agent/actions
   * Query: limit, offset, type
   */
  async getAgentActions(req, res, next) {
    try {
      const { limit = '50', offset = '0', type } = req.query;
      const agent = require('../services/workspace/workspace-agent.service');
      const result = await agent.getActions(req.params.id, {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        type
      });
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/agent/message
   * SSE stream of agent events.
   * Body: { message: string }
   */
  async sendAgentMessage(req, res, next) {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'message (string) is required' }
      });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let clientClosed = false;
    req.on('close', () => { clientClosed = true; });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 15000);

    try {
      const agent = require('../services/workspace/workspace-agent.service');
      sendEvent('start', { workspaceId: req.params.id });

      for await (const event of agent.chat(req.params.id, message)) {
        if (clientClosed) break;
        sendEvent(event.type || 'message', event);
        if (event.type === 'done' || event.type === 'error' || event.type === 'max_iterations') {
          break;
        }
      }
      sendEvent('end', { ok: true });
    } catch (err) {
      sendEvent('error', { error: err.message });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  // ==================== VALIDATION ====================

  /** POST /api/v1/workspaces/:id/validate  body: { rules?, graphType?, stopOnFirstError? } */
  async validateGraph(req, res, next) {
    try {
      const validator = require('../services/workspace/graph-validator.service');
      const { rules, graphType, stopOnFirstError } = req.body || {};
      const result = await validator.validateGraph(req.params.id, {
        rules, graphType, stopOnFirstError: !!stopOnFirstError
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/validate/rules?graphType=... */
  async listValidationRules(req, res, next) {
    try {
      const validator = require('../services/workspace/graph-validator.service');
      const { graphType } = req.query;
      const rules = validator.getRules({ graphType });
      res.json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/validate/can-promote */
  async canPromote(req, res, next) {
    try {
      const validator = require('../services/workspace/graph-validator.service');
      const result = await validator.canPromote(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/validate/node/:nodeId */
  async validateNode(req, res, next) {
    try {
      const validator = require('../services/workspace/graph-validator.service');
      const result = await validator.validateNode(req.params.id, req.params.nodeId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // ==================== CROSS-SOURCE ANALYSIS ====================

  /** GET /api/v1/workspaces/:id/analysis/coverage */
  async analysisCoverage(req, res, next) {
    try {
      const svc = require('../services/workspace/cross-source.service');
      const data = await svc.analyzeSourceCoverage(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/analysis/shared-entities */
  async analysisSharedEntities(req, res, next) {
    try {
      const svc = require('../services/workspace/cross-source.service');
      const { minSources = '2', limit = '50' } = req.query;
      const data = await svc.findSharedEntities(req.params.id, {
        minSources: parseInt(minSources, 10),
        limit: parseInt(limit, 10)
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/analysis/source-relationships */
  async analysisSourceRelationships(req, res, next) {
    try {
      const svc = require('../services/workspace/cross-source.service');
      const data = await svc.inferSourceRelationships(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/analysis/suggestions */
  async analysisSuggestions(req, res, next) {
    try {
      const svc = require('../services/workspace/cross-source.service');
      const { limit = '50' } = req.query;
      const data = await svc.suggestMissingLinks(req.params.id, { limit: parseInt(limit, 10) });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/analysis/predict-links
   * Body: { threshold?, limit?, skipExisting? }
   */
  async predictLinks(req, res, next) {
    try {
      const svc = require('../services/workspace/link-predictor.service');
      const { threshold, limit, skipExisting } = req.body || {};
      const data = await svc.predictLinks(req.params.id, { threshold, limit, skipExisting });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/analysis/report */
  async analysisReport(req, res, next) {
    try {
      const svc = require('../services/workspace/cross-source.service');
      const data = await svc.generateAnalysisReport(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // ==================== CONTRADICTIONS ====================

  /** POST /api/v1/workspaces/:id/contradictions/detect */
  async detectContradictions(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const { similarityThreshold } = req.body || {};
      const result = await svc.detectContradictions(req.params.id, {
        similarityThreshold,
        detectedBy: getUserId(req) === 'anonymous' ? 'auto' : getUserId(req)
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/contradictions */
  async listContradictions(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const { status, severity, type, limit = '50', offset = '0' } = req.query;
      const result = await svc.getContradictions(req.params.id, {
        status, severity, type,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      });
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/contradictions/stats */
  async contradictionStats(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const stats = await svc.getContradictionStats(req.params.id);
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/contradictions/:contradictionId */
  async getContradiction(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const c = await svc.getContradiction(req.params.contradictionId);
      if (!c) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Contradiction not found: ${req.params.contradictionId}` }
        });
      }
      res.json({ success: true, data: c });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/workspaces/:id/contradictions/:contradictionId/resolve
   * Body: { strategy, resolvedValue?, rationale? }
   */
  async resolveContradiction(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const c = await svc.resolveContradiction(req.params.contradictionId, {
        ...(req.body || {}),
        resolvedBy: getUserId(req)
      });
      res.json({ success: true, data: c });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/workspaces/:id/contradictions/:contradictionId/reopen */
  async reopenContradiction(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      const c = await svc.reopenContradiction(req.params.contradictionId);
      res.json({ success: true, data: c });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/contradictions/:contradictionId */
  async deleteContradiction(req, res, next) {
    try {
      const svc = require('../services/workspace/contradiction.service');
      await svc.deleteContradiction(req.params.contradictionId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  // ==================== GRAPH (CANVAS) ====================

  /** GET /api/v1/workspaces/:id/graph */
  async getGraph(req, res, next) {
    try {
      const svc = require('../services/workspace/workspace-graph.service');
      const graph = await svc.getGraph(req.params.id);
      res.json({ success: true, data: graph });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/workspaces/:id/graph
   * Body: { nodes: [...], edges: [...], createCheckpoint?: boolean, checkpointNote?: string }
   */
  async saveGraph(req, res, next) {
    try {
      const svc = require('../services/workspace/workspace-graph.service');
      const { nodes, edges, createCheckpoint, checkpointNote } = req.body || {};
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'nodes and edges must be arrays' }
        });
      }
      const result = await svc.saveGraph(req.params.id, { nodes, edges }, {
        createCheckpoint: !!createCheckpoint,
        checkpointNote: checkpointNote || 'Canvas save',
        userId: getUserId(req)
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // ==================== GRAPH VERSIONS ====================

  /** POST /api/v1/workspaces/:id/versions  body: { note?, createdBy? } */
  async createVersion(req, res, next) {
    try {
      const gv = require('../services/workspace/graph-version.service');
      const { note = '', createdBy = 'user' } = req.body || {};
      const version = await gv.createVersion(req.params.id, { note, createdBy });
      res.status(201).json({ success: true, data: version });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/versions */
  async listVersions(req, res, next) {
    try {
      const gv = require('../services/workspace/graph-version.service');
      const { limit = '50' } = req.query;
      const items = await gv.getVersions(req.params.id, { limit: parseInt(limit, 10) });
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/versions/:versionId */
  async getVersion(req, res, next) {
    try {
      const gv = require('../services/workspace/graph-version.service');
      const version = await gv.getVersion(req.params.versionId);
      if (!version) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Version not found: ${req.params.versionId}` }
        });
      }
      res.json({ success: true, data: version });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/workspaces/:id/versions/:versionId/restore
   * Body: { confirm: true }
   */
  async restoreVersion(req, res, next) {
    try {
      const gv = require('../services/workspace/graph-version.service');
      const { confirm } = req.body || {};
      const result = await gv.restoreVersion(req.params.id, req.params.versionId, {
        confirm: confirm === true,
        createdBy: getUserId(req)
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/versions/diff?v1=...&v2=... */
  async diffVersions(req, res, next) {
    try {
      const gv = require('../services/workspace/graph-version.service');
      const { v1, v2 } = req.query;
      if (!v1 || !v2) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'v1 and v2 query params are required' }
        });
      }
      const diff = await gv.diffVersions(v1, v2);
      res.json({ success: true, data: diff });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WorkspaceController();
