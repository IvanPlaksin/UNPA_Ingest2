'use strict';

/**
 * Dialogue Gym preflight — verify the services an arena run depends on BEFORE
 * spending an hour and real tokens on runs whose failures would be meaningless.
 *
 * WHY THIS EXISTS. Every backend the agent calls degrades *silently* by design:
 * `service.backend` returns `[]` when Qdrant, the embedder or Altiora is
 * unreachable ("graceful degradation", service.backend.js:83), the KB search
 * does the same, and the directory falls back. That is correct for a live chat —
 * a user gets a slightly worse answer instead of a stack trace. It is
 * catastrophic for an experiment: a dead catalog produces zero matches, the
 * agent says "I could not find that service", the run ends `gave_up`, and the
 * judge scores it `intentAccuracy: incorrect`. The result is indistinguishable
 * from a prompt defect. A whole GEPA optimization can run against a dead Qdrant
 * and dutifully "fix" a prompt that was never broken.
 *
 * So the checks here do not ping ports. They exercise the SAME call paths the
 * arena will use and assert the answer is non-empty, because reachable-but-empty
 * is exactly the failure that fakes a prompt problem.
 *
 * Fail-closed: callers abort the run unless explicitly overridden.
 *
 * @module services/dialogue-gym/preflight.service
 */

/** A query that must match something in any sane HR/Finance catalog. */
const PROBE_QUERY = 'home leave travel request';
const PROBE_KB_QUERY = 'education grant';

const DEFAULT_TIMEOUT_MS = 20000;

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref?.()),
]);

async function timed(name, critical, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, critical, ok: true, latencyMs: Date.now() - t0, detail: detail || null, error: null };
  } catch (err) {
    return { name, critical, ok: false, latencyMs: Date.now() - t0, detail: null, error: err.message || String(err) };
  }
}

// ── individual checks ─────────────────────────────────────────────────────────

const checkMemgraph = (deps) => timed('memgraph', true, async () => {
  const read = deps.read || require('../../instances/flowdesk/schema-graph/driver').read;
  const rows = await read('MATCH (n:ServiceDef) RETURN count(n) AS c', {});
  const c = rows.length ? Number(rows[0].get('c')) : 0;
  if (!c) throw new Error('no ServiceDef nodes — the schema graph is empty');
  return `${c} ServiceDef nodes`;
});

const checkRedis = (deps) => timed('redis (draft store)', true, async () => {
  const draft = deps.draftService || require('../../instances/flowdesk/services/draft-sr.service').getDraftSRService();
  const probeId = `preflight-${Date.now()}`;
  await draft.get(probeId); // a miss is fine; a throw is not
  return 'reachable';
});

/**
 * The check that matters most. Runs the agent's real service resolution and
 * demands a hit: reachable-but-returning-nothing is the exact state that fakes a
 * prompt failure, so an empty result is treated as DOWN, not as "no match".
 */
const checkServiceCatalog = (deps) => timed('service catalog (resolve.search SERVICE)', true, async () => {
  // Exactly what chat-v2.service hands the engine (chat-v2.service.js:54).
  const resolveSearch = deps.resolveSearch
    || require('../../instances/flowdesk/services/resolve-search.service').getResolveSearch();
  if (!resolveSearch) throw new Error('resolve.search is not wired');
  const hits = await withTimeout(resolveSearch(PROBE_QUERY, { lang: 'en' }), DEFAULT_TIMEOUT_MS, 'resolve.search');
  const services = (hits || []).filter((h) => h.type === 'SERVICE' || h.serviceId);
  if (!services.length) {
    throw new Error(
      `probe "${PROBE_QUERY}" matched no service. The backend degrades to [] when Qdrant, the embedder or ` +
      'Altiora is unreachable, so this looks identical to a prompt failure in every run that follows.'
    );
  }
  return `${services.length} hit(s), top=${services[0].serviceId || services[0].title}`;
});

const checkKnowledgeBase = (deps) => timed('knowledge base (kb.search)', false, async () => {
  const tools = deps.tools || require('../../instances/flowdesk/services/altiora-tools.adapter').getAltioraTools();
  if (!tools) throw new Error('Altiora tools are not wired');
  const articles = await withTimeout(tools.searchArticles(PROBE_KB_QUERY, {}), DEFAULT_TIMEOUT_MS, 'kb.search');
  const n = Array.isArray(articles) ? articles.length : 0;
  if (!n) throw new Error(`probe "${PROBE_KB_QUERY}" returned no articles — INFO_QUESTION turns will be ungrounded`);
  return `${n} article(s)`;
});

const checkCatalogTool = (deps) => timed('catalog tool (catalog.search)', true, async () => {
  const tools = deps.tools || require('../../instances/flowdesk/services/altiora-tools.adapter').getAltioraTools();
  if (!tools) throw new Error('Altiora tools are not wired');
  const services = await withTimeout(tools.searchServices(PROBE_QUERY, {}), DEFAULT_TIMEOUT_MS, 'catalog.search');
  const n = Array.isArray(services) ? services.length : 0;
  if (!n) throw new Error(`probe "${PROBE_QUERY}" returned no catalog services`);
  return `${n} service(s)`;
});

const checkAltiora = (deps) => timed('Altiora API', true, async () => {
  const base = process.env.ALTIORA_API_BASE;
  if (!base) throw new Error('ALTIORA_API_BASE is not set');
  const fetchFn = deps.fetch || global.fetch;
  const res = await withTimeout(fetchFn(base, { method: 'GET' }), DEFAULT_TIMEOUT_MS, 'Altiora');
  // 401 is the healthy answer from an authenticated root — it proves the service
  // is listening and enforcing auth. A refused connection is what we are hunting.
  if (res.status >= 500) throw new Error(`Altiora returned ${res.status}`);
  return `${base} -> ${res.status}`;
});

/**
 * The schema provider. When FLOWDESK_SCHEMA_PROVIDER=altiora an unreachable
 * provider means no form can be materialized, so every intake stalls after the
 * service is resolved — which scores as a dialogue failure.
 */
const checkSchemaProvider = (deps) => timed('schema provider (materialized forms)', true, async () => {
  const provider = process.env.FLOWDESK_SCHEMA_PROVIDER || 'graph';
  const read = deps.read || require('../../instances/flowdesk/schema-graph/driver').read;
  // A materialized form is (:ServiceDef)-[:HAS_SLOT]->(:SlotDef); there is no
  // SchemaSnapshot node label in this store, so count what actually exists.
  // Slots are the operative part: a ServiceDef with no slots cannot be filled in,
  // and the intake stalls right after the service is resolved — which the judge
  // then scores as a dialogue failure.
  const rows = await read(
    'MATCH (s:ServiceDef) OPTIONAL MATCH (s)-[:HAS_SLOT]->(sl:SlotDef) RETURN count(DISTINCT s) AS svc, count(sl) AS slots', {}
  );
  const svc = rows.length ? Number(rows[0].get('svc')) : 0;
  const slots = rows.length ? Number(rows[0].get('slots')) : 0;
  if (!svc) throw new Error(`provider=${provider} but no ServiceDef is materialized — no form can be filled`);
  if (!slots) throw new Error(`provider=${provider}: ${svc} ServiceDef but zero SlotDef — every intake stalls on the first question`);
  return `provider=${provider}, ${svc} service(s) / ${slots} slot(s)`;
});

/** The LLM both the agent and the persona simulator run on. */
const checkLlm = (deps) => timed('LLM provider', true, async () => {
  // Same provider and model the agent and persona simulator will run on
  // (chat-v2.service.js:41-47), so a misconfigured model is caught here.
  const model = process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001';
  const llm = deps.llm || require('../ai/llm-provider').getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'anthropic-api',
    model,
  });
  if (!llm) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    return 'key present (provider not directly probeable)';
  }
  // A plain completion, not structuredOutput. The point is "can we reach the
  // model and get tokens back", and a strict probe schema would fail whenever the
  // model phrased its answer differently — blocking every run over nothing. That
  // is the same brittleness that killed the first EXP-001 (a required field
  // missing from one reply), and it has no place in a gate.
  const out = await withTimeout(
    llm.completion('Reply with the single word: ready', { maxTokens: 16, temperature: 0 }),
    DEFAULT_TIMEOUT_MS, 'LLM'
  );
  const text = (out && (out.text || out.content)) || '';
  if (!String(text).trim()) throw new Error('LLM returned an empty response');
  return `model=${(out && out.model) || model}`;
});

const CHECKS = [
  checkMemgraph, checkRedis, checkAltiora, checkSchemaProvider,
  checkServiceCatalog, checkCatalogTool, checkKnowledgeBase, checkLlm,
];

// ── entry point ───────────────────────────────────────────────────────────────

/**
 * Run every check. Never throws — the caller decides what a failure means.
 * @param {object} [deps] injectable collaborators (tests, alternate wiring)
 * @returns {Promise<{ok:boolean, checks:Array, failed:Array, warned:Array, at:string, durationMs:number}>}
 */
async function runPreflight(deps = {}) {
  const t0 = Date.now();
  const checks = [];
  for (const check of (deps.checks || CHECKS)) {
    checks.push(await check(deps));
  }
  const failed = checks.filter((c) => !c.ok && c.critical);
  const warned = checks.filter((c) => !c.ok && !c.critical);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    warned,
    at: new Date().toISOString(),
    durationMs: Date.now() - t0,
  };
}

/** Human-readable block for a CLI. */
function formatReport(result) {
  const lines = ['─'.repeat(64), 'DIALOGUE GYM PREFLIGHT'];
  for (const c of result.checks) {
    const mark = c.ok ? 'OK  ' : (c.critical ? 'FAIL' : 'WARN');
    lines.push(`  [${mark}] ${c.name} (${c.latencyMs}ms)${c.ok ? ` — ${c.detail}` : ''}`);
    if (!c.ok) lines.push(`         ${c.error}`);
  }
  lines.push('─'.repeat(64));
  lines.push(result.ok
    ? `PREFLIGHT PASSED in ${result.durationMs}ms${result.warned.length ? ` (${result.warned.length} warning(s))` : ''}`
    : `PREFLIGHT FAILED — ${result.failed.length} critical check(s) down. Runs would produce meaningless failures.`);
  lines.push('─'.repeat(64));
  return lines.join('\n');
}

/**
 * Gate for a run. Throws when a critical dependency is down, because a silent
 * pass here is the whole problem this module exists to prevent.
 */
async function assertReady(deps = {}) {
  const result = await runPreflight(deps);
  if (!result.ok) {
    const err = new Error(
      `preflight failed: ${result.failed.map((c) => `${c.name} (${c.error})`).join('; ')}`
    );
    err.preflight = result;
    err.status = 503;
    throw err;
  }
  return result;
}

module.exports = {
  runPreflight, assertReady, formatReport,
  CHECKS, PROBE_QUERY, PROBE_KB_QUERY,
  checkMemgraph, checkRedis, checkAltiora, checkSchemaProvider,
  checkServiceCatalog, checkCatalogTool, checkKnowledgeBase, checkLlm,
};
