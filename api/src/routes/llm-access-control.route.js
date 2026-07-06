'use strict';

const express = require('express');
const router = express.Router();
const { setAccess, getState, resetAll } = require('../services/llm-access-control.service');

/**
 * GET /api/v1/llm-access
 * Returns full state: providers, serviceGroups with providerStates, raw state map.
 */
router.get('/', (_req, res) => {
  try {
    res.json(getState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/v1/llm-access/:key
 * Body: { enabled: boolean }
 * key examples: "provider:anthropic", "svc:agent_service:anthropic"
 */
router.patch('/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Body must contain { enabled: boolean }' });
  }

  try {
    const newState = setAccess(key, enabled);
    res.json({ key, enabled: newState });
  } catch (err) {
    if (err.message.startsWith('Unknown')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/llm-access/reset
 * Resets all entries to enabled=true.
 */
router.post('/reset', (_req, res) => {
  try {
    resetAll();
    res.json(getState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
