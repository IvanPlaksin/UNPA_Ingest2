const express = require('express');
const router = express.Router();
const adoService = require('../services/ado.service');
const queueService = require('../services/queue.service');

router.get('/', async (req, res) => {
    console.log("[Health Route] Hit!");
    const status = {
        ado: 'unknown',
        redis: 'unknown',
        worker: 'unknown',
        vector_db: 'mocked', // Since vector.service.js is a stub
        timestamp: new Date().toISOString()
    };

    // Check ADO
    try {
        console.log("Checking ADO health...");
        const adoHealth = await adoService.checkHealth();
        console.log("ADO health:", adoHealth);
        status.ado = adoHealth ? 'connected' : 'disconnected';
    } catch (e) {
        console.error("ADO check failed:", e);
        status.ado = 'error';
    }

    // Check Redis
    try {
        console.log("Checking Redis health...");
        const redisHealth = await queueService.checkRedisHealth();
        console.log("Redis health:", redisHealth);
        status.redis = redisHealth ? 'connected' : 'disconnected';
    } catch (e) {
        console.error("Redis check failed:", e);
        status.redis = 'error';
    }

    // Check Worker
    try {
        console.log("Checking Worker health...");
        const workerHealth = await queueService.checkWorkerHealth();
        console.log("Worker health:", workerHealth);
        status.worker = workerHealth ? 'active' : 'inactive';
    } catch (e) {
        console.error("Worker check failed:", e);
        status.worker = 'error';
    }

    res.json(status);
});

module.exports = router;
