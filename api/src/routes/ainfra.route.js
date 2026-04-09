/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA ROUTES
 * REST API routes for AI Infrastructure configuration management
 * Base path: /api/v1/ainfra
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ainfra.controller');

// ────────────────────────────────────────────────────────────────────────────
// STATUS & HEALTH
// ────────────────────────────────────────────────────────────────────────────

// Get full AI infrastructure status (config + usage + alerts)
router.get('/status', controller.getStatus);

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION SETS
// ────────────────────────────────────────────────────────────────────────────

// List all configuration sets
router.get('/configs', controller.listConfigSets);

// Create new configuration set
router.post('/configs', controller.createConfigSet);

// Get active configuration
router.get('/configs/active', controller.getActiveConfig);

// Get configuration set by name
router.get('/configs/:name', controller.getConfigSet);

// Activate configuration set
router.put('/configs/:name/activate', controller.activateConfigSet);

// Update provider configuration
router.patch('/configs/:name/providers/:provider', controller.updateProviderConfig);

// ────────────────────────────────────────────────────────────────────────────
// USAGE TRACKING
// ────────────────────────────────────────────────────────────────────────────

// Save current usage snapshot
router.post('/usage/snapshot', controller.saveUsageSnapshot);

// Get usage history
router.get('/usage/history', controller.getUsageHistory);

// ────────────────────────────────────────────────────────────────────────────
// ALERTS
// ────────────────────────────────────────────────────────────────────────────

// Get recent alerts
router.get('/alerts', controller.getAlerts);

// Acknowledge alert
router.post('/alerts/:id/acknowledge', controller.acknowledgeAlert);

module.exports = router;
