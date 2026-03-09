/**
 * Graph Status Controller
 * REST endpoints for graph lifecycle management
 */

const { GraphStatusService, GraphStatus } = require('../services/graph/graph-status.service');
const memgraphService = require('../services/memgraph.service');

let statusService = null;

const getService = () => {
  if (!statusService) {
    statusService = new GraphStatusService(memgraphService);
  }
  return statusService;
};

/**
 * GET /api/v1/graph-status/:graphId/status
 */
const getGraphStatus = async (req, res) => {
  try {
    const status = await getService().getStatus(req.params.graphId);
    if (!status) return res.status(404).json({ error: 'Graph not found' });

    res.json({
      graphId: req.params.graphId,
      ...status,
      allowedTransitions: getService().getAllowedTransitions(status.status),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/graph-status/:graphId/status/history
 */
const getStatusHistory = async (req, res) => {
  try {
    const history = await getService().getStatusHistory(req.params.graphId);
    res.json({ graphId: req.params.graphId, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/:graphId/status
 * Body: { status, reason?, changedBy? }
 */
const updateGraphStatus = async (req, res) => {
  const { status, reason, changedBy } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  try {
    const result = await getService().transitionStatus(
      req.params.graphId, status, changedBy || 'system', reason
    );
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/:graphId/submit-for-review
 */
const submitForReview = async (req, res) => {
  try {
    const result = await getService().submitForReview(
      req.params.graphId, req.body.submittedBy || 'system'
    );
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/:graphId/approve
 */
const approveGraph = async (req, res) => {
  try {
    const result = await getService().approve(
      req.params.graphId, req.body.approvedBy || 'system'
    );
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/:graphId/reject
 * Body: { reason, rejectedBy? }
 */
const rejectGraph = async (req, res) => {
  const { reason, rejectedBy } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason is required for rejection' });

  try {
    const result = await getService().reject(req.params.graphId, rejectedBy || 'system', reason);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/:graphId/quarantine
 * Body: { reason, quarantinedBy? }
 */
const quarantineGraph = async (req, res) => {
  const { reason, quarantinedBy } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason is required for quarantine' });

  try {
    const result = await getService().quarantine(req.params.graphId, quarantinedBy || 'system', reason);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/graph-status/bulk-status
 * Body: { graphIds, status, reason?, changedBy? }
 */
const bulkUpdateStatus = async (req, res) => {
  const { graphIds, status, reason, changedBy } = req.body;

  if (!graphIds || !Array.isArray(graphIds) || graphIds.length === 0) {
    return res.status(400).json({ error: 'graphIds array is required' });
  }
  if (!status) return res.status(400).json({ error: 'Status is required' });

  try {
    const results = await getService().bulkTransitionStatus(graphIds, status, changedBy || 'system', reason);
    res.json({
      totalRequested: graphIds.length,
      successCount: results.success.length,
      failedCount: results.failed.length,
      ...results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/graph-status/review-queue
 * Query: { domain?, limit?, offset? }
 */
const getReviewQueue = async (req, res) => {
  try {
    const graphs = await getService().getReviewQueue({
      domain: req.query.domain,
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    });
    res.json({ status: 'UNDER_REVIEW', count: graphs.length, graphs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/graph-status/by-status/:status
 * Query: { domain?, limit?, offset? }
 */
const getGraphsByStatus = async (req, res) => {
  const { status } = req.params;
  if (!Object.values(GraphStatus).includes(status)) {
    return res.status(400).json({
      error: `Invalid status: ${status}`,
      validStatuses: Object.values(GraphStatus),
    });
  }

  try {
    const graphs = await getService().getGraphsByStatus(status, {
      domain: req.query.domain,
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    });
    res.json({ status, count: graphs.length, graphs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/graph-status/pending-gnn
 */
const getPendingGnnTraining = async (req, res) => {
  try {
    const graphs = await getService().getApprovedPendingGnn();
    res.json({ count: graphs.length, graphs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/graph-status/summary
 */
const getStatusSummary = async (req, res) => {
  try {
    const summary = await getService().getStatusSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getGraphStatus,
  getStatusHistory,
  updateGraphStatus,
  submitForReview,
  approveGraph,
  rejectGraph,
  quarantineGraph,
  bulkUpdateStatus,
  getReviewQueue,
  getGraphsByStatus,
  getPendingGnnTraining,
  getStatusSummary,
};
