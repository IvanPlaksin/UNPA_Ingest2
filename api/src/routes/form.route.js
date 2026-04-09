/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORM DEFINITION API ROUTES
 *
 * Endpoints:
 *   GET    /api/v1/forms              - List forms
 *   GET    /api/v1/forms/:id          - Get form by ID
 *   GET    /api/v1/forms/:id/schema   - Get JSON Schema
 *   GET    /api/v1/forms/:id/render   - Get form for rendering
 *   POST   /api/v1/forms              - Create form
 *   PATCH  /api/v1/forms/:id          - Update form metadata
 *   DELETE /api/v1/forms/:id          - Soft delete form
 *   POST   /api/v1/forms/:id/clone    - Clone form
 *   POST   /api/v1/forms/sections/:sectionId/fields - Add field
 *   DELETE /api/v1/forms/fields/:fieldId             - Remove field
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

// Lazy-load service to avoid circular dependencies
let _formService = null;
function getFormService() {
  if (!_formService) {
    const { FormDefinitionService } = require('../services/forms');
    const memgraphService = require('../services/memgraph.service');
    _formService = new FormDefinitionService(memgraphService);
  }
  return _formService;
}

// ── LIST ──
router.get('/', async (req, res) => {
  try {
    const { namespace, status, search, limit, offset } = req.query;
    const forms = await getFormService().list({
      namespace, status, search,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    res.json({ success: true, forms, count: forms.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET BY ID ──
router.get('/:id', async (req, res) => {
  try {
    const form = await getFormService().getById(req.params.id);
    if (!form) return res.status(404).json({ success: false, error: 'Form not found' });
    res.json({ success: true, ...form });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET SCHEMA ──
router.get('/:id/schema', async (req, res) => {
  try {
    const schema = await getFormService().buildSchema(req.params.id);
    res.json(schema);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ success: false, error: error.message });
  }
});

// ── GET FOR RENDER ──
router.get('/:id/render', async (req, res) => {
  try {
    const data = await getFormService().getForRender(req.params.id, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ success: false, error: error.message });
  }
});

// ── CREATE ──
router.post('/', async (req, res) => {
  try {
    const form = await getFormService().create(req.body);
    res.status(201).json({ success: true, ...form });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── UPDATE ──
router.patch('/:id', async (req, res) => {
  try {
    const form = await getFormService().update(req.params.id, req.body);
    res.json({ success: true, ...form });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE ──
router.delete('/:id', async (req, res) => {
  try {
    const result = await getFormService().delete(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── CLONE ──
router.post('/:id/clone', async (req, res) => {
  try {
    const form = await getFormService().clone(req.params.id, req.body.name);
    res.status(201).json({ success: true, ...form });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── ADD FIELD ──
router.post('/sections/:sectionId/fields', async (req, res) => {
  try {
    const fieldId = await getFormService().addField(req.params.sectionId, req.body);
    res.status(201).json({ success: true, fieldId });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── REMOVE FIELD ──
router.delete('/fields/:fieldId', async (req, res) => {
  try {
    const result = await getFormService().removeField(req.params.fieldId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
