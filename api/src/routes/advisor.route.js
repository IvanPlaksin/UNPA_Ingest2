/**
 * NEXUS Advisor Routes — Insights and graph intelligence API.
 *
 * Base path: /api/v1/advisor
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/advisor.controller');

router.get('/insights', controller.getInsights);
router.post('/insights/refresh', controller.refreshInsights);
router.post('/evaluate-clusters', controller.evaluateClusters);
router.post('/assistant', controller.assistant);
router.get('/health', controller.healthCheck);

module.exports = router;
