// src/routes/chat.route.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');

// Принимает POST запрос на /api/v1/chat
router.post('/', chatController.handleChatRequest);
router.post('/stream', chatController.handleChatMessage);

module.exports = router;