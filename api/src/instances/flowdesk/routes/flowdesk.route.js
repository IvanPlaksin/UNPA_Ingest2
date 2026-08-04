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

// DOC-1-001 — the one multipart route in the chat API.
//
// `sessionId` rides in the query rather than the form: a query param does not
// depend on the body having been parsed, which for multipart happens inside the
// middleware below, and it stays visible in logs and telemetry.
//
// The 10 MB cap here is a coarse guard against garbage, NOT the real limit.
// Altiora holds that, per file extension, in an editable table it serves from
// /api/Attachments/config — copying those numbers into our code would freeze a
// limit that is meant to move. Anything under the cap goes to Altiora and is
// judged there.
router.post('/chat/upload', controller.uploadChatFileMiddleware, controller.uploadChatFile);

// DOC-5 — the staged documents follow the request onto its ticket.
//
// Separate from submit because the ticket id does not exist until the wizard has
// created it, and separate from the hand-off because handing the ids to the form
// breaks ticket creation outright (see attachment-link.service). JSON, so the
// acting-user context survives — no multer on this path.
router.post('/chat/attachments/link', controller.linkSessionAttachments);

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
