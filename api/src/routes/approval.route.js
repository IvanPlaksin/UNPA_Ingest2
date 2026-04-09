/**
 * Approval Workflow Routes
 * Base path: /api/v1/approval
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/approval.controller');

// Submit a new approval request
router.post('/submit', controller.submitRequest);

// Get request status with decisions
router.get('/status/:requestId', controller.getStatus);

// Submit a decision (approve/reject)
router.post('/decide/:requestId', controller.decide);

// List requests (with optional filters: ?status=pending&type=expense&requesterId=emp-001)
router.get('/list', controller.listRequests);

// List employees (for UI dropdowns)
router.get('/employees', controller.listEmployees);

module.exports = router;
