/**
 * Dashboard API Routes
 * Metrics, analytics, activity, and system status
 *
 * Endpoints:
 *   GET    /api/v1/dashboard/overview       - High-level summary
 *   GET    /api/v1/dashboard/graph          - Graph metrics
 *   GET    /api/v1/dashboard/queries        - Query analytics
 *   GET    /api/v1/dashboard/extraction     - Extraction analytics
 *   GET    /api/v1/dashboard/top-entities   - Top entities
 *   GET    /api/v1/dashboard/top-relations  - Top relations
 *   GET    /api/v1/dashboard/activity       - Recent activity
 *   POST   /api/v1/dashboard/activity       - Log activity
 *   GET    /api/v1/dashboard/system         - System status
 *   GET    /api/v1/dashboard/stats          - Dashboard service stats
 *
 * @module routes/dashboard.routes
 */

const express = require('express');
const { dashboardService } = require('../services/visualization');

const router = express.Router();

router.get('/overview', (req, res) => {
  try {
    res.json({ success: true, ...dashboardService.getOverview() });
  } catch (error) {
    console.error('[DashboardRoute] Overview error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/graph', (req, res) => {
  try {
    res.json({ success: true, ...dashboardService.getGraphMetrics() });
  } catch (error) {
    console.error('[DashboardRoute] Graph metrics error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queries', (req, res) => {
  try {
    res.json({ success: true, ...dashboardService.getQueryAnalytics() });
  } catch (error) {
    console.error('[DashboardRoute] Query analytics error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/extraction', (req, res) => {
  try {
    res.json({ success: true, ...dashboardService.getExtractionAnalytics() });
  } catch (error) {
    console.error('[DashboardRoute] Extraction analytics error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/top-entities', (req, res) => {
  try {
    const { limit, sortBy } = req.query;
    res.json({ success: true, ...dashboardService.getTopEntities({
      limit: limit ? parseInt(limit) : 20,
      sortBy: sortBy || 'connections'
    })});
  } catch (error) {
    console.error('[DashboardRoute] Top entities error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/top-relations', (req, res) => {
  try {
    const { limit } = req.query;
    res.json({ success: true, ...dashboardService.getTopRelations({
      limit: limit ? parseInt(limit) : 20
    })});
  } catch (error) {
    console.error('[DashboardRoute] Top relations error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/activity', (req, res) => {
  try {
    const { limit, type } = req.query;
    res.json({ success: true, ...dashboardService.getRecentActivity({
      limit: limit ? parseInt(limit) : 50,
      type
    })});
  } catch (error) {
    console.error('[DashboardRoute] Activity error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/activity', (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type) {
      return res.status(400).json({ success: false, error: 'type is required' });
    }
    const activity = dashboardService.logActivity(type, data || {});
    res.status(201).json({ success: true, activity });
  } catch (error) {
    console.error('[DashboardRoute] Log activity error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system', (req, res) => {
  try {
    res.json({ success: true, ...dashboardService.getSystemStatus() });
  } catch (error) {
    console.error('[DashboardRoute] System status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json({ success: true, stats: dashboardService.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
