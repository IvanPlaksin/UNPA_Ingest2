'use strict';

const express    = require('express');
const router     = express.Router();
const polarity   = require('../services/knowledge/tier0/polarity.service');
const temporal   = require('../services/knowledge/tier0/temporal.service');
const retraction = require('../services/knowledge/tier0/retraction.service');
const edgeProps  = require('../services/knowledge/tier0/edge-properties.service');

function send(res, fn) {
  return fn
    .then(data => res.json({ success: true, data }))
    .catch(err  => res.status(err.status || 400).json({ success: false, error: err.message }));
}

// ── Edge CRUD ──────────────────────────────────────────────────────────────────

router.post('/edges', (req, res) => {
  const { from, to, type, properties } = req.body;
  if (!from || !to || !type) return res.status(400).json({ error: 'from, to, type required' });
  send(res, edgeProps.createEdge(from, to, type, properties || {}));
});

router.get('/edges/:id', (req, res) => {
  send(res, edgeProps.getEdgeWithTier0(Number(req.params.id)));
});

router.patch('/edges/:id', (req, res) => {
  send(res, edgeProps.updateEdgeProperties(Number(req.params.id), req.body));
});

// ── Validation & Migration ────────────────────────────────────────────────────

router.post('/validate/:id', (req, res) => {
  send(res, edgeProps.validateEdge(Number(req.params.id)));
});

router.post('/migrate/:id', (req, res) => {
  send(res, edgeProps.migrateEdge(Number(req.params.id)));
});

// ── Polarity ──────────────────────────────────────────────────────────────────

router.patch('/edges/:id/polarity', (req, res) => {
  const { polarity: pol, confidence } = req.body;
  if (!pol) return res.status(400).json({ error: 'polarity required' });
  send(res, polarity.setPolarity(Number(req.params.id), pol, confidence));
});

router.post('/edges/:id/negate', (req, res) => {
  const { reason, sourceQuantumId } = req.body;
  send(res, polarity.negateEdge(Number(req.params.id), reason, sourceQuantumId));
});

// ── Retraction ────────────────────────────────────────────────────────────────

router.post('/edges/:id/retract', (req, res) => {
  const { reason, retractedByQuantum } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  send(res, retraction.retract(Number(req.params.id), { reason, retractedByQuantum }));
});

router.post('/edges/:id/restore', (req, res) => {
  const { reason, newSourceQuantum } = req.body;
  send(res, retraction.restore(Number(req.params.id), { reason, newSourceQuantum }));
});

router.post('/retract-by-quantum', (req, res) => {
  const { quantumId, reason } = req.body;
  if (!quantumId) return res.status(400).json({ error: 'quantumId required' });
  send(res, retraction.retractByQuantum(quantumId, reason));
});

// ── Temporal ──────────────────────────────────────────────────────────────────

router.patch('/edges/:id/temporal', (req, res) => {
  send(res, temporal.setTemporalValidity(Number(req.params.id), req.body));
});

router.post('/edges/:id/expire', (req, res) => {
  const { valid_to, reason } = req.body;
  if (!valid_to) return res.status(400).json({ error: 'valid_to required' });
  send(res, temporal.expireEdge(Number(req.params.id), valid_to, reason));
});

router.post('/edges/:id/supersede', (req, res) => {
  send(res, temporal.supersede(Number(req.params.id), req.body));
});

router.get('/edges/:id/history', (req, res) => {
  const { relationType } = req.query;
  if (!relationType) return res.status(400).json({ error: 'relationType query param required' });
  send(res, temporal.queryHistorical(Number(req.params.id), relationType));
});

// ── Query ─────────────────────────────────────────────────────────────────────

router.get('/query/at-time', (req, res) => {
  const { time, namespace, relationType, includeRetracted } = req.query;
  if (!time) return res.status(400).json({ error: 'time query param required (ISO string)' });
  send(res, temporal.queryAtTime(time, {
    namespace,
    relationType,
    includeRetracted: includeRetracted === 'true',
  }));
});

router.get('/query/by-polarity', (req, res) => {
  const { polarity: pol, namespace, limit } = req.query;
  if (!pol) return res.status(400).json({ error: 'polarity query param required' });
  send(res, polarity.queryByPolarity(pol, { namespace, limit: limit ? Number(limit) : 100 }));
});

router.get('/query/retracted', (req, res) => {
  const { namespace, since, limit } = req.query;
  send(res, retraction.getRetractedEdges({
    namespace,
    since,
    limit: limit ? Number(limit) : 100,
  }));
});

module.exports = router;
