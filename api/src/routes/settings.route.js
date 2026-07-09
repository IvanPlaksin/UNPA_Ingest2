'use strict';

/**
 * Runtime settings routes — UI-tunable operator settings.
 * Mounted at /api/v1/settings.
 */

const express = require('express');
const router = express.Router();
const runtimeSettings = require('../services/settings/runtime-settings');

/**
 * GET /api/v1/settings/llm-provider
 * Current structured-output (SDA) LLM provider + allowed options.
 */
router.get('/llm-provider', (req, res) => {
  res.json({
    provider: runtimeSettings.getLlmProvider(),
    options: runtimeSettings.LLM_PROVIDER_OPTIONS,
  });
});

/**
 * PUT /api/v1/settings/llm-provider  { provider }
 */
router.put('/llm-provider', (req, res) => {
  try {
    const provider = runtimeSettings.setLlmProvider(req.body?.provider);
    res.json({ success: true, provider });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
