'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controller/flowdesk.controller.js');

router.get('/health', controller.health);
router.post('/classify', controller.classify);
router.post('/route', controller.route);
router.get('/user/:userId/context', controller.getUserContext);
router.get('/services', controller.getServices);
router.get('/services/:code', controller.getServiceByCode);
router.post('/request', controller.createRequest);
router.get('/request/:id', controller.getRequest);
router.post('/chat', controller.chat);
router.get('/chat/:sessionId', controller.getChatSession);
router.get('/graph-versions', controller.getGraphVersions);

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

module.exports = router;
