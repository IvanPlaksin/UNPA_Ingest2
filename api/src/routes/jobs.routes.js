/**
 * Jobs API Routes
 * Background job management endpoints
 *
 * Endpoints:
 *   POST   /api/v1/jobs/extraction       - Queue extraction job
 *   POST   /api/v1/jobs/batch            - Queue batch processing job
 *   POST   /api/v1/jobs/graph-update     - Queue graph update job
 *   GET    /api/v1/jobs/:queue/:jobId    - Get job status
 *   DELETE /api/v1/jobs/:queue/:jobId    - Cancel job
 *   GET    /api/v1/jobs/queue/:name/status  - Get queue status
 *   POST   /api/v1/jobs/queue/:name/pause   - Pause queue
 *   POST   /api/v1/jobs/queue/:name/resume  - Resume queue
 *   GET    /api/v1/jobs/stats            - Job queue statistics
 *
 * @module routes/jobs.routes
 */

const express = require('express');
const router = express.Router();
const { jobQueueService } = require('../services/jobs');

// ═══════════════════════════════════════════════════════════════════════════
// JOB SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /extraction
 * Queue an extraction job
 * Body: { text: string, domain?: string, options?: object }
 */
router.post('/extraction', async (req, res) => {
  try {
    const { text, domain, options } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required and must be a string' });
    }

    const job = await jobQueueService.addJob('extraction', {
      type: 'extract',
      text,
      domain,
      options
    });

    res.status(202).json({ success: true, job });
  } catch (error) {
    console.error('[JobsRoute] Queue extraction error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /batch
 * Queue a batch processing job
 * Body: { items: any[], batchSize?: number }
 */
router.post('/batch', async (req, res) => {
  try {
    const { items, batchSize } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });
    }

    const job = await jobQueueService.addJob('batch', {
      type: 'batch',
      items,
      batchSize: batchSize || 5
    });

    res.status(202).json({ success: true, job, itemCount: items.length });
  } catch (error) {
    console.error('[JobsRoute] Queue batch error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /graph-update
 * Queue a graph update job
 * Body: { nodes?: array, edges?: array, operation?: 'add'|'clear' }
 */
router.post('/graph-update', async (req, res) => {
  try {
    const { nodes, edges, operation = 'add' } = req.body;

    if (!nodes && !edges) {
      return res.status(400).json({ success: false, error: 'nodes or edges are required' });
    }

    const job = await jobQueueService.addJob('graph-update', {
      type: 'graph-update',
      nodes,
      edges,
      operation
    });

    res.status(202).json({ success: true, job });
  } catch (error) {
    console.error('[JobsRoute] Queue graph update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// JOB STATUS & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stats
 * Get overall job queue statistics
 * NOTE: This route must be defined BEFORE /:queue/:jobId to avoid matching 'stats' as a queue name
 */
router.get('/stats', (req, res) => {
  try {
    const stats = jobQueueService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[JobsRoute] Job stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /queue/:name/status
 * Get status of a specific queue
 */
router.get('/queue/:name/status', async (req, res) => {
  try {
    const status = await jobQueueService.getQueueStatus(req.params.name);
    res.json({ success: true, queue: status });
  } catch (error) {
    console.error('[JobsRoute] Queue status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /queue/:name/pause
 * Pause a queue
 */
router.post('/queue/:name/pause', async (req, res) => {
  try {
    await jobQueueService.pauseQueue(req.params.name);
    res.json({ success: true, message: `Queue ${req.params.name} paused` });
  } catch (error) {
    console.error('[JobsRoute] Pause queue error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /queue/:name/resume
 * Resume a queue
 */
router.post('/queue/:name/resume', async (req, res) => {
  try {
    await jobQueueService.resumeQueue(req.params.name);
    res.json({ success: true, message: `Queue ${req.params.name} resumed` });
  } catch (error) {
    console.error('[JobsRoute] Resume queue error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:queue/:jobId
 * Get job status
 */
router.get('/:queue/:jobId', async (req, res) => {
  try {
    const { queue, jobId } = req.params;
    const status = await jobQueueService.getJobStatus(queue, jobId);

    if (!status) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job: status });
  } catch (error) {
    console.error('[JobsRoute] Get job status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:queue/:jobId
 * Cancel / remove a job
 */
router.delete('/:queue/:jobId', async (req, res) => {
  try {
    const { queue, jobId } = req.params;
    const cancelled = await jobQueueService.cancelJob(queue, jobId);

    res.json({
      success: cancelled,
      message: cancelled ? 'Job cancelled' : 'Job not found or already processed'
    });
  } catch (error) {
    console.error('[JobsRoute] Cancel job error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
