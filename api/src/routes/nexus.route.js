const express = require('express');
const router = express.Router();
const nexusController = require('../controllers/nexus.controller');

// GET /api/v1/nexus/stream/analyze?entityType=...&entityId=...&sources=ado,git
router.get('/stream/analyze', nexusController.analyzeStream);

// GET /api/v1/nexus/entity/:type/:id
router.get('/entity/:type/:id', nexusController.getEntityDetails);

module.exports = router;
