const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledge.controller');

// Запуск задачи
router.post('/ingest', knowledgeController.ingestWorkItems);

// Поток событий (SSE)
router.get('/stream/:jobId', knowledgeController.streamIngestionStatus);

// Агрегация контекста
router.get('/context/:id', knowledgeController.getContext);

// Multer setup for file uploads
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Temp storage

// Симуляция Ingestion
router.post('/simulate', knowledgeController.processContext);
// Use multer to handle multipart/form-data (both file and fields)
router.post('/analyze-attachment', upload.single('file'), knowledgeController.analyzeAttachment);
router.post('/vectorize-query', knowledgeController.vectorizeQuery);

module.exports = router;
