/**
 * REST API for STRUCTURAL form specifications.
 *
 * GET  /api/v1/forms/specification/:structuralGraphId  — Get form spec
 * POST /api/v1/forms/validate                          — Validate form data
 * DELETE /api/v1/forms/cache/:graphId                  — Clear cache
 */

const express = require('express');
const router = express.Router();
const { StructuralFormService } = require('../services/structural-form.service');

let formService;
let memgraph;

function initFormRoutes(memgraphService) {
  memgraph = memgraphService;
  formService = new StructuralFormService(memgraphService);
  return router;
}

/**
 * GET /structural-graphs
 * List all STRUCTURAL graphs with their linked CONSTRAINT graphs.
 */
router.get('/structural-graphs', async (req, res) => {
  try {
    if (!memgraph) return res.status(503).json({ success: false, error: 'Service not initialized' });

    const rows = await memgraph.runQuery(
      'MATCH (s:GraphDefinition {graphType: "STRUCTURAL"}) ' +
      'OPTIONAL MATCH (c:GraphDefinition {graphType: "CONSTRAINT"})-[:CONSTRAINS]->(s) ' +
      'RETURN s.graphId AS graphId, s.name AS name, s.namespace AS namespace, ' +
      's.nodeCount AS nodeCount, s.edgeCount AS edgeCount, ' +
      'c.graphId AS constraintGraphId, c.name AS constraintName, c.nodeCount AS constraintRuleCount ' +
      'ORDER BY s.namespace, s.name'
    );

    const graphs = rows.map(r => ({
      graphId: r.graphId,
      name: r.name,
      namespace: r.namespace,
      nodeCount: r.nodeCount,
      edgeCount: r.edgeCount,
      constraint: r.constraintGraphId ? {
        graphId: r.constraintGraphId,
        name: r.constraintName,
        ruleCount: r.constraintRuleCount,
      } : null,
    }));

    res.json({ success: true, data: graphs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /specification/:structuralGraphId
 * Returns compiled form specification from STRUCTURAL + CONSTRAINT.
 */
router.get('/specification/:structuralGraphId', async (req, res) => {
  try {
    if (!formService) return res.status(503).json({ success: false, error: 'Service not initialized' });

    const { structuralGraphId } = req.params;
    const {
      constraintGraphId,
      locale = 'en',
      resolveDataSources = 'true',
      preloadAll = 'true',
    } = req.query;

    const spec = await formService.getFormSpecification(
      { structuralGraphId, constraintGraphId },
      {
        locale,
        resolveDataSources: resolveDataSources !== 'false',
        preloadAll: preloadAll !== 'false',
      }
    );

    res.json({ success: true, data: spec });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /validate
 * Validates form data against STRUCTURAL + CONSTRAINT using AJV.
 */
router.post('/validate', async (req, res) => {
  try {
    if (!formService) return res.status(503).json({ success: false, error: 'Service not initialized' });

    const { structuralGraphId, constraintGraphId, data, locale = 'en' } = req.body;

    if (!structuralGraphId) {
      return res.status(400).json({ success: false, error: 'structuralGraphId is required' });
    }
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, error: 'data must be an object' });
    }

    const spec = await formService.getFormSpecification(
      { structuralGraphId, constraintGraphId },
      { locale }
    );

    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(spec.jsonSchema);
    const valid = validate(data);

    if (valid) {
      return res.json({ success: true, valid: true, errors: [] });
    }

    const errors = validate.errors.map(err => ({
      field: err.instancePath.replace('/', '') || err.params?.missingProperty || '',
      message: spec.errorMessages[err.instancePath.replace('/', '')]?.[err.keyword]?.[locale] || err.message,
      keyword: err.keyword,
    }));

    res.json({ success: true, valid: false, errors });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /cache/:graphId
 * Clear cached form specs for a given graph.
 */
router.delete('/cache/:graphId', (req, res) => {
  if (!formService) return res.status(503).json({ success: false, error: 'Service not initialized' });
  formService.clearCache(req.params.graphId);
  res.json({ success: true });
});

module.exports = { router, initFormRoutes, getFormService: () => formService };
