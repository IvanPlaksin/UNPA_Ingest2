'use strict';

const express    = require('express');
const router     = express.Router();
const hypothesis = require('../services/knowledge/tier1/hypothesis.service');
const admiralty  = require('../services/knowledge/tier1/admiralty.service');
const decay      = require('../services/knowledge/tier1/confidence-decay.service');
const inference  = require('../services/knowledge/tier1/inference.service');

function send(res, fn) {
  return fn
    .then(data => res.json({ success: true, data }))
    .catch(err  => res.status(err.status || 400).json({ success: false, error: err.message }));
}

// ── Hypothesis ────────────────────────────────────────────────────────────────

router.post('/hypotheses', (req, res) => {
  const { type, statement, context, subject_nodes, subject_edges, namespace, expires_at } = req.body;
  if (!type || !statement || !namespace)
    return res.status(400).json({ error: 'type, statement, namespace required' });
  send(res, hypothesis.createHypothesis({ type, statement, context, subject_nodes, subject_edges, namespace, expires_at }));
});

router.get('/hypotheses', (req, res) => {
  const { namespace, type, status, minConfidence, maxConfidence, limit } = req.query;
  send(res, hypothesis.queryHypotheses({
    namespace, type, status,
    minConfidence: minConfidence != null ? Number(minConfidence) : undefined,
    maxConfidence: maxConfidence != null ? Number(maxConfidence) : undefined,
    limit: limit ? Number(limit) : 100,
  }));
});

router.get('/hypotheses/:id', (req, res) => {
  send(res, hypothesis.getHypothesis(req.params.id));
});

router.post('/hypotheses/:id/evidence', (req, res) => {
  const { quantumId, relationship, diagnostic_value, admiralty: adm, eliminates } = req.body;
  if (!quantumId || !relationship)
    return res.status(400).json({ error: 'quantumId and relationship required' });
  send(res, hypothesis.addEvidence(req.params.id, {
    quantumId, relationship, diagnostic_value, admiralty: adm, eliminates,
  }));
});

router.post('/hypotheses/:id/resolve', (req, res) => {
  const { status, resolved_by, resolution_reason, resolution_action } = req.body;
  if (!status || !resolved_by)
    return res.status(400).json({ error: 'status and resolved_by required' });
  send(res, hypothesis.resolveHypothesis(req.params.id, {
    status, resolved_by, resolution_reason, resolution_action,
  }));
});

router.get('/hypotheses/:id/competing', (req, res) => {
  send(res, hypothesis.getCompetingHypotheses(req.params.id));
});

router.post('/hypotheses/:id/link-competing', (req, res) => {
  const { competingId } = req.body;
  if (!competingId) return res.status(400).json({ error: 'competingId required' });
  send(res, hypothesis.linkCompeting(req.params.id, competingId));
});

router.post('/hypotheses/:id/evaluate', (req, res) => {
  send(res, hypothesis.evaluateWithACH(req.params.id));
});

router.post('/hypotheses/check-expired', (_req, res) => {
  send(res, hypothesis.checkExpired());
});

// ── Admiralty ─────────────────────────────────────────────────────────────────

router.post('/admiralty/:quantumId', (req, res) => {
  const { sourceCode, accuracyCode } = req.body;
  if (!sourceCode || !accuracyCode)
    return res.status(400).json({ error: 'sourceCode and accuracyCode required' });
  send(res, admiralty.setAdmiraltyCode(req.params.quantumId, sourceCode, accuracyCode));
});

router.get('/admiralty/:quantumId', (req, res) => {
  send(res, admiralty.getAdmiraltyCode(req.params.quantumId));
});

router.post('/admiralty/:quantumId/suggest', (req, res) => {
  send(res, admiralty.suggestAdmiraltyCode(req.params.quantumId, req.body));
});

router.post('/admiralty/arbitrate', (req, res) => {
  const { quantumIds } = req.body;
  if (!quantumIds || quantumIds.length < 2)
    return res.status(400).json({ error: 'quantumIds array with >= 2 items required' });
  send(res, admiralty.arbitrateConflict(quantumIds));
});

router.post('/admiralty/edge/:edgeId/update-weight', (req, res) => {
  send(res, admiralty.updateWeightFromAdmiralty(Number(req.params.edgeId)));
});

// ── Confidence Decay ──────────────────────────────────────────────────────────

router.post('/decay/apply', (req, res) => {
  send(res, decay.applyDecay(req.body));
});

router.post('/decay/reinforce/:edgeId', (req, res) => {
  const { newSourceQuantumId } = req.body;
  send(res, decay.reinforce(Number(req.params.edgeId), newSourceQuantumId));
});

router.patch('/decay/rate/:edgeId', (req, res) => {
  const { rate } = req.body;
  if (!rate) return res.status(400).json({ error: 'rate required' });
  send(res, decay.setDecayRate(Number(req.params.edgeId), rate));
});

router.get('/decay/statistics', (req, res) => {
  send(res, decay.getDecayStatistics(req.query.namespace));
});

router.get('/decay/low-confidence', (req, res) => {
  const { namespace, threshold, limit } = req.query;
  send(res, decay.getDecayedEdges({
    namespace,
    threshold: threshold ? Number(threshold) : undefined,
    limit:     limit     ? Number(limit)     : 100,
  }));
});

// ── Inference ─────────────────────────────────────────────────────────────────

router.post('/inference/rules', (req, res) => {
  const { name, description, type, pattern, confidence_modifier, namespace, created_by } = req.body;
  if (!name || !type || !pattern || !namespace)
    return res.status(400).json({ error: 'name, type, pattern, namespace required' });
  send(res, inference.registerRule({ name, description, type, pattern, confidence_modifier, namespace, created_by }));
});

router.get('/inference/rules', (req, res) => {
  const { namespace, type, limit } = req.query;
  const enabled = req.query.enabled != null ? req.query.enabled === 'true' : undefined;
  send(res, inference.listRules({ namespace, type, enabled, limit: limit ? Number(limit) : 100 }));
});

router.get('/inference/rules/:id', (req, res) => {
  send(res, inference.getRule(req.params.id));
});

router.post('/inference/rules/:id/enable',  (req, res) => {
  send(res, inference.enableRule(req.params.id).then(() => ({ enabled: true })));
});

router.post('/inference/rules/:id/disable', (req, res) => {
  send(res, inference.disableRule(req.params.id).then(() => ({ enabled: false })));
});

router.post('/inference/rules/:id/apply', (req, res) => {
  const { namespace, limit, dryRun } = req.body;
  send(res, inference.applyRule(req.params.id, { namespace, limit, dryRun }));
});

router.post('/inference/run', (req, res) => {
  const { namespace, ruleIds, dryRun } = req.body;
  send(res, inference.runInferencePass({ namespace, ruleIds, dryRun }));
});

router.get('/inference/edges/:id/justification', (req, res) => {
  send(res, inference.getJustification(Number(req.params.id)));
});

router.post('/inference/revalidate/:edgeId', (req, res) => {
  send(res, inference.revalidateDerived(Number(req.params.edgeId)));
});

router.post('/inference/invalidate-derived/:edgeId', (req, res) => {
  send(res, inference.invalidateDerived(Number(req.params.edgeId)));
});

module.exports = router;
