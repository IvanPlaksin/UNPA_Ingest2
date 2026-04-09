/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMMUTABLE GRAPH ROUTES
 * API routes for bi-temporal versioned graph system
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/immutableGraph.controller');

// ════════════════════════════════════════════════════════════════════════════
// NODE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

// Create a new node
router.post('/nodes', controller.createNode);

// Get a node by entityId
router.get('/nodes/:entityId', controller.getNode);

// Update a node (creates new version)
router.patch('/nodes/:entityId', controller.updateNode);

// Deprecate a node
router.post('/nodes/:entityId/deprecate', controller.deprecateNode);

// Merge two nodes
router.post('/nodes/merge', controller.mergeNodes);

// Get node version lineage
router.get('/nodes/:entityId/lineage', controller.getNodeLineage);

// Verify node chain integrity
router.get('/nodes/:entityId/verify-chain', controller.verifyNodeChain);

// Get connected edges for a node
router.get('/nodes/:entityId/edges', controller.getConnectedEdges);

// ════════════════════════════════════════════════════════════════════════════
// EDGE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

// Create a new edge
router.post('/edges', controller.createEdge);

// Get an edge by edgeId
router.get('/edges/:edgeId', controller.getEdge);

// Deprecate an edge
router.post('/edges/:edgeId/deprecate', controller.deprecateEdge);

// ════════════════════════════════════════════════════════════════════════════
// TEMPORAL QUERIES
// ════════════════════════════════════════════════════════════════════════════

// Query nodes with filters
router.get('/query/nodes', controller.queryNodes);

// ════════════════════════════════════════════════════════════════════════════
// GOD MODE
// ════════════════════════════════════════════════════════════════════════════

// Activate god mode
router.post('/god-mode/activate', controller.activateGodMode);

// Deactivate god mode
router.post('/god-mode/deactivate', controller.deactivateGodMode);

// Get god mode status
router.get('/god-mode/status', controller.getGodModeStatus);

// Mark entity for deletion
router.post('/god-mode/delete/:entityId/mark', controller.markForDeletion);

// Confirm deletion
router.post('/god-mode/delete/:entityId/confirm', controller.confirmDeletion);

// Get audit trail for entity
router.get('/god-mode/audit/:entityId', controller.getAuditTrail);

// Get audit trail for session
router.get('/god-mode/session/:sessionId/audit', controller.getSessionAuditTrail);

// ════════════════════════════════════════════════════════════════════════════
// SSE ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// Graph events stream
router.get('/sse/events', controller.sseEvents);

// God mode events stream
router.get('/sse/events/god-mode', controller.sseGodModeEvents);

module.exports = router;
