// api/src/routes/pipelineLab.route.js
// Маршруты для Enhanced Pipeline Lab

const express = require('express');
const router = express.Router();
const controller = require('../controllers/pipelineLab.controller');

// Запуск обработки pipeline
router.post('/process', controller.startPipeline);

// SSE stream для real-time обновлений
router.get('/stream/:sessionId', controller.streamPipeline);

// Операции с этапами
router.post('/stage/:stageId/rerun', controller.rerunStage);
router.post('/stage/:stageId/edit', controller.editStageOutput);

// Операции с графом
router.get('/graph/:sessionId', controller.getGraph);
router.post('/export/:sessionId', controller.exportGraph);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pipeline-lab' });
});

module.exports = router;
