'use strict';
/**
 * DocumentIndexAiResponder — autonomous error-response agent.
 *
 * When the indexer's error rate spikes past a threshold, this launches a Claude
 * Code instance (via the project's own claude binary, like
 * claude-code-reanalyze.service) that:
 *   - reads the current error categories, per-source rollup, open incidents,
 *     circuit states and the criticality policy,
 *   - learns from a persistent log of PAST decisions + outcomes,
 *   - returns a structured diagnosis + remediation actions (each rated for
 *     criticality) and optional policy extensions.
 *
 * Actions are routed through the criticality policy: auto-applicable ones are
 * executed autonomously; the rest are escalated to the admin as pending-approval
 * items on the dashboard. Every run is appended to the learning log.
 *
 * If the claude binary / API key is unavailable, a DETERMINISTIC fallback still
 * diagnoses and auto-applies safe actions so the system always reacts.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const telemetry   = require('./document-index.telemetry');
const errorPolicy = require('./document-index.error-policy');
const criticality = require('./document-index.criticality');
const incidents   = require('./document-index.incidents');

const DIR = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const DECISIONS_LOG = path.join(DIR, 'ai-decisions.jsonl');

const CFG = {
  enabled:      (process.env.DOCUMENT_INDEXER_AI_ENABLED ?? 'true') !== 'false',
  rateThreshold: parseInt(process.env.DOCUMENT_INDEXER_AI_RATE_THRESHOLD, 10) || 30, // errors/min
  cooldownMs:    parseInt(process.env.DOCUMENT_INDEXER_AI_COOLDOWN_MS, 10) || 5 * 60 * 1000,
  model:         process.env.DOCUMENT_INDEXER_AI_MODEL || process.env.SUMMARY_MODEL || 'claude-sonnet-4-6',
  timeoutMs:     parseInt(process.env.DOCUMENT_INDEXER_AI_TIMEOUT_MS, 10) || 3 * 60 * 1000,
  maxBudgetUsd:  process.env.DOCUMENT_INDEXER_AI_BUDGET || '0.75',
};

let _running = false;
let _lastRunAt = 0;
let _lastResult = null;

// ── claude binary ─────────────────────────────────────────────────

function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    path.resolve(__dirname, '../../../node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
    path.resolve(__dirname, '../../../node_modules/@anthropic-ai/claude-code/cli.js'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe') : null,
    'claude',
  ].filter(Boolean);
  for (const p of candidates) {
    if (p === 'claude') return p;
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

function available() {
  return CFG.enabled && !!findClaudeBinary() && !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

// ── run claude code, return final assistant text ──────────────────

function runClaudeText({ system, prompt }) {
  return new Promise((resolve, reject) => {
    const binary = findClaudeBinary();
    if (!binary) return reject(new Error('claude binary not found'));
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format',  'text',
      '--system-prompt', system,
      '--tools',         '',          // pure reasoning over the provided context
      '--model',         CFG.model,
      '--no-session-persistence',
      '--verbose',
      '--max-turns',     '2',
      '--max-budget-usd', String(CFG.maxBudgetUsd),
    ];
    let proc;
    try { proc = spawn(binary, args, { env: { ...process.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return reject(new Error(`spawn failed: ${e.message}`)); }

    const kill = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
    const timer = setTimeout(kill, CFG.timeoutMs);
    proc.stdin.write(prompt, 'utf8'); proc.stdin.end();

    let out = '', err = '', finalText = null, assistantText = '';
    proc.stdout.on('data', (c) => {
      out += c.toString('utf8');
      const lines = out.split('\n'); out = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'result' && typeof msg.result === 'string') finalText = msg.result;
        else if (msg.type === 'assistant') {
          for (const b of (msg.message?.content || [])) if (b.type === 'text') assistantText += b.text;
        }
      }
    });
    proc.stderr.on('data', (d) => { err += d.toString('utf8'); });
    proc.on('error', (e) => { clearTimeout(timer); reject(new Error(`claude error: ${e.message}`)); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const text = finalText || assistantText;
      if (text) return resolve(text);
      reject(new Error(`claude exited ${code}: ${err.slice(0, 200)}`));
    });
  });
}

function parseJson(raw) {
  if (!raw) return null;
  const s = raw.trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1].trim()); } catch { /* */ } }
  const obj = s.match(/\{[\s\S]*\}/); if (obj) { try { return JSON.parse(obj[0]); } catch { /* */ } }
  return null;
}

// ── context + learning log ────────────────────────────────────────

function readDecisions(n = 8) {
  try {
    const lines = fs.readFileSync(DECISIONS_LOG, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function appendDecision(entry) {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(DECISIONS_LOG, JSON.stringify(entry) + '\n'); } catch { /* best-effort */ }
}

function buildContext() {
  let status = {};
  try { status = require('./document-index.service').getDocumentIndexService().getStatus(); } catch { /* */ }
  return {
    errorRatePerMin: telemetry.errorRate(60000),
    summary: telemetry.errorSummary(),
    categories: telemetry.categories(),
    recentErrors: telemetry.listErrors({ limit: 30 }),
    circuit: status.circuit || [],
    concurrency: status.stats?.concurrency,
    openIncidents: incidents.list({ limit: 40 }).filter(i => ['open', 'escalated'].includes(i.status))
      .map(i => ({ id: i.id, sourceId: i.sourceId, sourceName: i.sourceName, category: i.category, status: i.status, errorCount: i.errorCount })),
    policy: criticality.getPolicy(),
    pastDecisions: readDecisions(6),
  };
}

const SYSTEM_PROMPT =
  'You are the autonomous error-response agent for the UNPA document-index harvester. ' +
  'You receive the current error telemetry, open incidents, circuit-breaker states and the ' +
  'criticality policy, plus a log of your PAST decisions and their outcomes — learn from them. ' +
  'Diagnose root causes per source, then propose remediation actions using ONLY these action ' +
  'types: pause_source, set_backoff, resume_source, reindex_source, adjust_concurrency, ' +
  'enable_source, set_source_headers, set_source_config, disable_source, extend_policy, notify_admin. ' +
  'Reply with ONLY a JSON object, no prose:\n' +
  '{"diagnosis":"...","incidents":[{"sourceId":"..","sourceName":"..","category":"ACCESS_BLOCKED",' +
  '"rootCause":"..","actions":[{"type":"set_source_headers","params":{"sourceId":"..","headers":{"User-Agent":".."}},' +
  '"criticality":55,"rationale":".."}]}],"policyUpdates":[{"methodology":"a lesson learned"}]}';

function buildPrompt(ctx) {
  return 'Current indexer error state (JSON):\n' + JSON.stringify(ctx, null, 1).slice(0, 14000) +
    '\n\nProduce the JSON response now.';
}

// ── main run ──────────────────────────────────────────────────────

async function run({ trigger = 'manual' } = {}) {
  if (_running) return { skipped: 'already-running' };
  _running = true;
  const startedAt = new Date().toISOString();
  const ctx = buildContext();
  let result;
  try {
    result = available() ? await runAi(ctx, trigger) : await runFallback(ctx, trigger);
  } catch (e) {
    // LLM failed → deterministic fallback so we still react.
    result = await runFallback(ctx, trigger, `ai-error: ${e.message}`);
  } finally {
    _running = false;
    _lastRunAt = Date.now();
  }
  const entry = { at: startedAt, trigger, mode: result.mode, errorRatePerMin: ctx.errorRatePerMin,
    diagnosis: result.diagnosis, actions: result.actions, incidents: result.incidentIds };
  appendDecision(entry);
  _lastResult = { ...entry, finishedAt: new Date().toISOString() };
  return _lastResult;
}

async function routeActions(perIncident) {
  // perIncident: [{ sourceId, sourceName, category, rootCause, actions:[tpl] }]
  const applied = []; const incidentIds = [];
  for (const grp of perIncident) {
    const inc = incidents.raise({
      scope: grp.sourceId ? 'source' : 'global', sourceId: grp.sourceId, sourceName: grp.sourceName,
      category: errorPolicy.CATEGORIES[grp.category] ? grp.category : 'UNKNOWN',
      description: grp.rootCause || '', source: 'ai', proposals: [],
    });
    incidents.attachAiResult(inc.id, { diagnosis: grp.rootCause, actions: grp.actions || [] });
    incidentIds.push(inc.id);
    const done = await incidents.autoApply(inc.id);
    applied.push(...done.map(d => ({ incidentId: inc.id, type: d.action.type, ok: d.result.ok, escalated: false })));
    // Track which stayed escalated.
    for (const a of incidents.get(inc.id).proposedActions) {
      if (a.status === 'pending_approval') applied.push({ incidentId: inc.id, type: a.type, escalated: true });
    }
  }
  return { applied, incidentIds };
}

async function runAi(ctx, trigger) {
  const raw = await runClaudeText({ system: SYSTEM_PROMPT, prompt: buildPrompt(ctx) });
  const parsed = parseJson(raw) || {};
  // AI may extend its own policy / methodology.
  for (const pu of (parsed.policyUpdates || [])) { try { criticality.updatePolicy(pu, 'ai'); } catch { /* */ } }
  const { applied, incidentIds } = await routeActions(parsed.incidents || []);
  return { mode: 'ai', diagnosis: parsed.diagnosis || '(no diagnosis)', actions: applied, incidentIds };
}

/** Deterministic reaction from the error categories when the LLM is unavailable. */
async function runFallback(ctx, trigger, note) {
  // Group recent errors by source, propose from category methodology.
  const bySource = new Map();
  for (const e of ctx.recentErrors) {
    if (!e.sourceId) continue;
    const g = bySource.get(e.sourceId) || { sourceId: e.sourceId, sourceName: e.sourceName, category: e.category, rootCause: `Repeated ${e.category} (${e.message})`, actions: [] };
    bySource.set(e.sourceId, g);
  }
  const groups = [...bySource.values()].map(g => ({ ...g, actions: incidents.proposeForCategory(g.category, g.sourceId) }));
  const { applied, incidentIds } = await routeActions(groups);
  const diagnosis = (note ? note + '. ' : '') +
    `Deterministic response: ${groups.length} source(s) with sustained errors; auto-applied safe actions, escalated the rest.`;
  return { mode: 'fallback', diagnosis, actions: applied, incidentIds };
}

// ── rate-triggered auto-run ───────────────────────────────────────

function maybeTrigger() {
  if (!CFG.enabled || _running) return;
  if (Date.now() - _lastRunAt < CFG.cooldownMs) return;
  if (telemetry.errorRate(60000) < CFG.rateThreshold) return;
  // Only when the indexer is actually running.
  try { if (require('./document-index.service').getDocumentIndexService().state !== 'RUNNING') return; } catch { /* */ }
  run({ trigger: 'auto-rate' }).catch(() => {});
}

// ── chat with the AI about an incident ────────────────────────────

async function chat(incidentId, userText) {
  const inc = incidents.get(incidentId);
  if (!inc) throw new Error('incident not found');
  incidents.addChat(incidentId, 'user', userText);
  const sys = 'You are the UNPA document-index error-response agent, chatting with a human admin about a specific ' +
    'incident. Be concise and concrete. You may recommend actions from the allowed action types and explain trade-offs. ' +
    'If you want an action taken, state it clearly so the admin can approve it.';
  const convo = inc.chat.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
  const prompt = `INCIDENT:\n${JSON.stringify({
    sourceName: inc.sourceName, category: inc.category, severity: inc.severity, status: inc.status,
    methodology: inc.methodology, errorCount: inc.errorCount, aiDiagnosis: inc.aiDiagnosis,
    proposedActions: inc.proposedActions.map(a => ({ type: a.type, status: a.status, criticality: a.criticality, rationale: a.rationale })),
  }, null, 1).slice(0, 6000)}\n\nCONVERSATION:\n${convo}\n\nReply to the admin's latest message.`;

  let reply;
  try { reply = available() ? await runClaudeText({ system: sys, prompt }) : null; }
  catch (e) { reply = null; }
  if (!reply) {
    const cat = errorPolicy.CATEGORIES[inc.category] || errorPolicy.CATEGORIES.UNKNOWN;
    reply = `[offline diagnosis] ${inc.sourceName || 'This source'} is failing with ${inc.category}. ` +
      `Response methodology: ${cat.methodology} Proposed actions are listed on the incident — approve the ones you want applied.`;
  }
  const msg = incidents.addChat(incidentId, 'assistant', reply.trim());
  return msg;
}

function getState() {
  return { enabled: CFG.enabled, available: available(), running: _running, lastRunAt: _lastRunAt || null,
    rateThreshold: CFG.rateThreshold, cooldownMs: CFG.cooldownMs, model: CFG.model, lastResult: _lastResult };
}

// Subscribe to error telemetry so spikes auto-trigger the agent (self-throttled).
try { telemetry.onRecord(() => { try { maybeTrigger(); } catch { /* */ } }); } catch { /* */ }

module.exports = { run, maybeTrigger, chat, getState, available, DECISIONS_LOG, readDecisions };
