'use strict';
const express = require('express');
const router  = express.Router();
const { getKnowledgeMap } = require('../services/knowledge-map.service');

const ok  = (res, data)        => res.json({ success: true, data });
const err = (res, e, code=500) => res.status(code).json({ success: false, error: e.message });

// GET /api/v1/knowledge-map
// Query: collection, namespace, semanticThreshold (0-1), limit
router.get('/', async (req, res) => {
  try {
    const {
      collection        = 'documents_entities',
      namespace         = null,
      semanticThreshold = 0.7,
      limit             = 1500,
    } = req.query;

    ok(res, await getKnowledgeMap({
      collection,
      namespace:         namespace || null,
      semanticThreshold: parseFloat(semanticThreshold),
      limit:             Math.min(parseInt(limit), 5000),
    }));
  } catch (e) { err(res, e); }
});

module.exports = router;
