'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controller/flowdesk.controller.js');
const voiceController = require('../voice/voice.controller.js');
const { flowdeskUserMiddleware } = require('../../../middleware/flowdesk-user.middleware');

router.use(flowdeskUserMiddleware);

router.get('/health', controller.health);
router.post('/classify', controller.classify);
router.post('/route', controller.route);
router.get('/user/:userId/context', controller.getUserContext);
router.get('/services', controller.getServices);
router.get('/services/:code', controller.getServiceByCode);
router.get('/directory/:type', controller.directoryTypeahead);
router.post('/request', controller.createRequest);
router.get('/request/:id', controller.getRequest);
router.post('/chat', controller.chat);
router.get('/chat/:sessionId', controller.getChatSession);
router.get('/graph-versions', controller.getGraphVersions);

// Chat V2 — SSE node-progress stream (must precede generic routes)
router.get('/chat/:sessionId/stream', controller.streamChat);
router.get('/schema/:serviceId', controller.getSchema);

// DraftSR (C2) — live draft service request
router.post('/draft', controller.createDraft);
router.get('/draft/:sessionId', controller.getDraft);
router.patch('/draft/:sessionId', controller.patchDraft);
router.post('/draft/:sessionId/submit', controller.submitDraft);
router.post('/draft/:sessionId/escalate', controller.escalateDraft);

// Ticket lifecycle — GXE executable graph endpoints
router.post('/tickets', controller.createTicket);
router.get('/tickets', controller.listTickets);
router.get('/tickets/:ticketId', controller.getTicket);
router.patch('/tickets/:ticketId', controller.updateTicket);
router.post('/tickets/:ticketId/escalate', controller.escalateTicket);
router.post('/tickets/:ticketId/close', controller.closeTicket);

// SLA management
router.post('/sla/check', controller.checkSLA);
router.get('/sla/breached', controller.getBreachedTickets);

// Laptop Provisioning — CaMeL-protected AI assistant
router.post('/laptop/chat', controller.laptopChat);
router.get('/laptop/session/:sessionId', controller.getLaptopSession);

// Voice Live — session token + transcript sync (Phase 1)
router.post('/voice/token', voiceController.issueToken);
router.post('/voice/transcript', voiceController.appendTranscript);
router.get('/voice/transcript/:sessionId', voiceController.getTranscript);

module.exports = router;
