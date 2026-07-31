'use strict';

/**
 * Tour API — the four calls `@guided-ux/tour` needs from a host, and nothing else.
 *
 *   GET  /tour/scenarios            what tours exist here
 *   GET  /tour/scenarios/:id        one, in the shape the runner validates
 *   POST /tour/search               retrieval for the assistant
 *   POST /tour/ask                  a grounded answer
 *   POST /tour/speak                one sentence of narration as audio
 *   GET  /tour/health               is any of this actually wired up
 *
 * The shape of these endpoints is dictated by the package's provider contract, not by
 * our storage — that is what lets a different host implement the same six routes over
 * a JSON file and reuse the whole front end.
 *
 * READ-ONLY BY DESIGN. There is no route here that changes a scenario: authoring goes
 * through the seed script, deliberately, because a tour that visitors can edit is a
 * tour that can be made to say anything to the next visitor.
 *
 * @module routes/tour.route
 */

const express = require('express');

const router = express.Router();
const knowledge = require('../services/tour/tour-knowledge.service');
const assistant = require('../services/tour/tour-assistant.service');
const speech = require('../services/tour/tour-speech.service');

const h = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[tour]', req.method, req.originalUrl, err.message);
    if (!res.headersSent) res.status(status).json({ error: err.message });
  }
};

router.get('/scenarios', h(async () => ({
  scenarios: await knowledge.listScenarios(),
  capabilities: knowledge.capabilities(),
})));

router.get('/scenarios/:id', h(async (req) => {
  try {
    return await knowledge.getScenario(req.params.id);
  } catch (e) {
    e.status = 404;
    throw e;
  }
}));

router.post('/search', h(async (req) => {
  const { query, lang, scenarioId, limit } = req.body || {};
  if (!query) { const e = new Error('query is required'); e.status = 400; throw e; }
  return { hits: await knowledge.search(query, { lang, scenarioId, limit }) };
}));

router.post('/ask', h(async (req) => {
  const { question, lang, scenarioId, step, hits } = req.body || {};
  return assistant.ask({ question, lang, scenarioId, step, hits });
}));

/**
 * Narration. Returns audio bytes, not JSON: the client hands the response straight to
 * an <audio> element, and a base64 round trip through JSON would inflate every
 * sentence by a third for nothing.
 */
router.post('/speak', async (req, res) => {
  try {
    const { text, lang, voice, format } = req.body || {};
    const out = await speech.synthesize(text, { lang, voice, format });
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Length', out.audio.length);
    // Same sentence, same audio, for everyone taking this tour.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Tour-Speech-Cached', String(out.cached));
    res.end(out.audio);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[tour/speak]', err.message);
    if (!res.headersSent) res.status(status).json({ error: err.message });
  }
});

/**
 * Health, and the honest kind: it reports which parts are actually reachable, so a
 * tour that will narrate but not answer says so before a user finds out.
 */
router.get('/health', h(async () => {
  const out = { scenarios: 0, vectorSearch: false, speech: false, notes: [] };
  try {
    const list = await knowledge.listScenarios();
    out.scenarios = list.length;
  } catch (e) { out.notes.push(`graph unavailable: ${e.message}`); }
  try {
    const hits = await knowledge.search('tour', { limit: 1 });
    out.vectorSearch = !hits.some((x) => x.degraded);
    if (hits.some((x) => x.degraded)) out.notes.push(`vector search degraded: ${hits[0].degraded}`);
  } catch (e) { out.notes.push(`search unavailable: ${e.message}`); }
  out.speech = !!process.env.AZURE_VOICE_FOUNDRY_KEY;
  if (!out.speech) out.notes.push('speech not configured (AZURE_VOICE_FOUNDRY_KEY)');
  return out;
}));

module.exports = router;
