/**
 * WorkSpace Routes
 *
 * REST API for WorkSpace management.
 * Base path: /api/v1/workspaces
 *
 * @module routes/workspace
 */

'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/workspace.controller');
const radixController = require('../controllers/radix.controller');
const connectorController = require('../controllers/connector.controller');
const { validate } = require('../middleware/input-validator.middleware');
const { sanitizeInput } = require('../middleware/sanitizer.middleware');
const { rateLimit } = require('../middleware/rate-limiter.middleware');

// Multer config for file uploads (in-memory buffer, max 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ==================== WORKSPACE LIFECYCLE ====================

router.post('/',                    (req, res, next) => controller.create(req, res, next));
router.get('/',                     (req, res, next) => controller.list(req, res, next));
router.get('/:id',                  (req, res, next) => controller.get(req, res, next));
router.patch('/:id',                (req, res, next) => controller.update(req, res, next));
router.patch('/:id/status',         (req, res, next) => controller.updateStatus(req, res, next));
router.delete('/:id',               (req, res, next) => controller.archive(req, res, next));
router.delete('/:id/permanent',     (req, res, next) => controller.deletePermanent(req, res, next));
router.get('/:id/stats',            (req, res, next) => controller.getStats(req, res, next));

// ==================== SOURCES ====================

router.post('/:id/sources',                        (req, res, next) => controller.addSource(req, res, next));
router.post('/:id/sources/upload', upload.single('file'), (req, res, next) => controller.uploadSource(req, res, next));
router.post('/:id/sources/from-document',          (req, res, next) => controller.addSourceFromDocument(req, res, next));
router.get('/:id/sources',                         (req, res, next) => controller.listSources(req, res, next));
router.get('/:id/sources/:sourceId',                (req, res, next) => controller.getSource(req, res, next));
router.get('/:id/sources/:sourceId/details',        (req, res, next) => controller.getSourceDetails(req, res, next));
router.post('/:id/sources/:sourceId/analyze',       (req, res, next) => controller.analyzeSource(req, res, next));
router.post('/:id/sources/:sourceId/extract',       (req, res, next) => controller.extractSource(req, res, next));
router.delete('/:id/sources/:sourceId',             (req, res, next) => controller.deleteSource(req, res, next));
router.post('/:id/sources/extract-flowdesk',        (req, res, next) => controller.extractFlowDesk(req, res, next));

// ==================== EXTRACTION JOBS ====================

router.get('/:id/extract/jobs',                     (req, res, next) => controller.listExtractionJobs(req, res, next));
router.get('/:id/extract/:jobId',                   (req, res, next) => controller.getExtractionStatus(req, res, next));
router.get('/:id/extract/:jobId/progress',          (req, res) => controller.streamExtractionProgress(req, res));
router.delete('/:id/extract/:jobId',                (req, res, next) => controller.cancelExtraction(req, res, next));

// ==================== DRAFTS ====================

router.post('/:id/drafts',                 (req, res, next) => controller.createDraft(req, res, next));
router.get('/:id/drafts',                  (req, res, next) => controller.listDrafts(req, res, next));
router.post('/:id/drafts/search',          (req, res, next) => controller.searchDrafts(req, res, next));
router.get('/:id/drafts/:draftId',         (req, res, next) => controller.getDraft(req, res, next));
router.patch('/:id/drafts/:draftId',       (req, res, next) => controller.updateDraft(req, res, next));
router.delete('/:id/drafts/:draftId',      (req, res, next) => controller.deleteDraft(req, res, next));
router.get('/:id/drafts/:draftId/edges',   (req, res, next) => controller.getEdges(req, res, next));

// ==================== EDGES ====================

router.post('/:id/edges',                  (req, res, next) => controller.createEdge(req, res, next));

// ==================== RADIX RETRIEVAL ====================
// Workspace-scoped hybrid retrieval (vector seed + graph expansion + fusion).
// Lives in its own controller — the route is workspace-scoped, the subsystem is not.

router.post('/:id/retrieve',               (req, res, next) => radixController.retrieve(req, res, next));

// Connectors — the workspace's own declaration of what categories it answers with.
router.get('/:id/connectors',                     (req, res, next) => connectorController.list(req, res, next));
router.post('/:id/connectors',                    (req, res, next) => connectorController.create(req, res, next));
router.get('/:id/connectors/:connectorId',        (req, res, next) => connectorController.get(req, res, next));
router.patch('/:id/connectors/:connectorId',      (req, res, next) => connectorController.update(req, res, next));
router.delete('/:id/connectors/:connectorId',     (req, res, next) => connectorController.remove(req, res, next));

// ==================== KB ACCESS (READ-ONLY) ====================

router.post('/:id/kb/search',              (req, res, next) => controller.kbSearch(req, res, next));
router.get('/:id/kb/nodes/:entityId',      (req, res, next) => controller.kbGetNode(req, res, next));

// ==================== PROMOTION ====================

router.post('/:id/promotion/diff',                  (req, res, next) => controller.computePromotionDiff(req, res, next));
router.post('/:id/promotion/execute',               (req, res, next) => controller.executePromotion(req, res, next));

// ==================== DATASOURCE CATALOG (BRIDGE) ====================

router.get('/:id/datasources',                          (req, res, next) => controller.listWorkspaceDataSources(req, res, next));
router.post('/:id/datasources',                         (req, res, next) => controller.createWorkspaceDataSource(req, res, next));
router.post('/:id/datasources/register-source',         (req, res, next) => controller.registerWorkspaceSourceAsDataSource(req, res, next));

// ==================== STRUCTURAL IMPORT ====================

router.get('/:id/structural-import/preview',   (req, res, next) => controller.previewStructuralImport(req, res, next));
router.post('/:id/structural-import',          sanitizeInput, validate('structuralImport'), (req, res, next) => controller.importStructuralGraph(req, res, next));

// ==================== AUDIT ====================

router.get('/:id/audit',                   (req, res, next) => controller.getAuditLog(req, res, next));

// ==================== AGENT (PERSISTENT CHAT) ====================

router.get('/:id/agent/session',           (req, res, next) => controller.getAgentSession(req, res, next));
router.post('/:id/agent/message',          rateLimit('workspaceAgent'), sanitizeInput, validate('workspaceAgentMessage'), (req, res, next) => controller.sendAgentMessage(req, res, next));
router.delete('/:id/agent/session',        (req, res, next) => controller.clearAgentSession(req, res, next));
router.get('/:id/agent/actions',           (req, res, next) => controller.getAgentActions(req, res, next));

// ==================== VALIDATION ====================

router.post('/:id/validate',                                         (req, res, next) => controller.validateGraph(req, res, next));
router.get('/:id/validate/rules',                                    (req, res, next) => controller.listValidationRules(req, res, next));
router.get('/:id/validate/can-promote',                              (req, res, next) => controller.canPromote(req, res, next));
router.get('/:id/validate/node/:nodeId',                             (req, res, next) => controller.validateNode(req, res, next));

// ==================== CROSS-SOURCE ANALYSIS ====================

router.get('/:id/analysis/coverage',                                 (req, res, next) => controller.analysisCoverage(req, res, next));
router.get('/:id/analysis/shared-entities',                          (req, res, next) => controller.analysisSharedEntities(req, res, next));
router.get('/:id/analysis/source-relationships',                     (req, res, next) => controller.analysisSourceRelationships(req, res, next));
router.get('/:id/analysis/suggestions',                              (req, res, next) => controller.analysisSuggestions(req, res, next));
router.post('/:id/analysis/predict-links',                           (req, res, next) => controller.predictLinks(req, res, next));
router.get('/:id/analysis/report',                                   (req, res, next) => controller.analysisReport(req, res, next));

// ==================== CONTRADICTIONS ====================

router.post('/:id/contradictions/detect',  sanitizeInput, validate('detectContradictions'), (req, res, next) => controller.detectContradictions(req, res, next));
router.get('/:id/contradictions/stats',                              (req, res, next) => controller.contradictionStats(req, res, next));
router.get('/:id/contradictions',                                    (req, res, next) => controller.listContradictions(req, res, next));
router.get('/:id/contradictions/:contradictionId',                   (req, res, next) => controller.getContradiction(req, res, next));
router.put('/:id/contradictions/:contradictionId/resolve',           (req, res, next) => controller.resolveContradiction(req, res, next));
router.put('/:id/contradictions/:contradictionId/reopen',            (req, res, next) => controller.reopenContradiction(req, res, next));
router.delete('/:id/contradictions/:contradictionId',                (req, res, next) => controller.deleteContradiction(req, res, next));

// ==================== GRAPH (CANVAS) ====================

router.get('/:id/graph',                              (req, res, next) => controller.getGraph(req, res, next));
router.put('/:id/graph',                              (req, res, next) => controller.saveGraph(req, res, next));

// ==================== GRAPH VERSIONS ====================

router.post('/:id/versions',                          (req, res, next) => controller.createVersion(req, res, next));
router.get('/:id/versions',                           (req, res, next) => controller.listVersions(req, res, next));
router.get('/:id/versions/diff',                      (req, res, next) => controller.diffVersions(req, res, next));
router.get('/:id/versions/:versionId',                (req, res, next) => controller.getVersion(req, res, next));
router.post('/:id/versions/:versionId/restore',       (req, res, next) => controller.restoreVersion(req, res, next));

module.exports = router;
