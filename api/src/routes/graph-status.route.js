const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/graph-status.controller');

// Queue / list endpoints
router.get('/summary', getStatusSummary);
router.get('/review-queue', getReviewQueue);
router.get('/pending-gnn', getPendingGnnTraining);
router.get('/by-status/:status', getGraphsByStatus);

// Bulk operations
router.post('/bulk-status', bulkUpdateStatus);

// Single graph operations
router.get('/:graphId/status', getGraphStatus);
router.get('/:graphId/status/history', getStatusHistory);
router.post('/:graphId/status', updateGraphStatus);
router.post('/:graphId/submit-for-review', submitForReview);
router.post('/:graphId/approve', approveGraph);
router.post('/:graphId/reject', rejectGraph);
router.post('/:graphId/quarantine', quarantineGraph);

module.exports = router;
