const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledge.controller');

// Запуск задачи
router.post('/ingest', knowledgeController.ingestWorkItems);

// Поток событий (SSE)
router.get('/stream/:jobId', knowledgeController.streamIngestionStatus);

// Агрегация контекста
router.get('/context/:id', knowledgeController.getContext);

// Симуляция Ingestion
// Симуляция Ingestion
router.post('/simulate', knowledgeController.processContext);
router.post('/analyze-attachment', knowledgeController.analyzeAttachment);
router.post('/vectorize-query', knowledgeController.vectorizeQuery);

module.exports = router;
