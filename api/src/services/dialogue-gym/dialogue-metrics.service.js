'use strict';

/**
 * Dialogue quality metrics (Phase 6) — programmatic detectors over recorded turns.
 *
 * WHY THESE AND NOT THE JUDGE. The judge is an LLM scoring a run on rubrics; at
 * thirteen runs per candidate its scores carry a standard error of roughly
 * fourteen percentage points, which is larger than any improvement we hope to
 * see. These metrics are counted from the transcript instead. They have no
 * sampling noise, cost nothing, need no model, and answer the question EXP-002
 * actually asks: does the assistant write to the user, or relay fixed strings?
 *
 * HOW "TEMPLATE" IS DETECTED. Not by route, and not by which interpreter ran —
 * by the text itself. Every user-facing string the code can emit lives in
 * ui-strings; a reply that IS one of those strings was not written for this
 * user. This matters for EXP-002: the agent interpreter must be measured by the
 * same rule as the state machine, or the comparison is rigged. A detector that
 * returned false for the agent because it is the agent would be an assumption
 * wearing the costume of a measurement.
 *
 * The baseline this was built against (291 recorded turns, 2026-07-28):
 *   DISAMBIGUATE 153 (52.6%) — one template string
 *   INFO_QUESTION 58 (19.9%) — the only route that reliably generates prose
 *   template-driven 233 (80.1%) / generated 58 (19.9%)
 *
 * @module services/dialogue-gym/dialogue-metrics.service
 */

const { UI_STRINGS } = require('../../instances/flowdesk/interpreter/templates/ui-strings');

// ── template corpus ───────────────────────────────────────────────────────────

/** Collapse whitespace and case so formatting differences do not hide a match. */
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * A template with placeholders ("Здесь {title}") can never match literally, so
 * turn it into a prefix long enough to be distinctive. Templates shorter than
 * this after the first placeholder are skipped rather than risk matching prose.
 */
const PREFIX_MIN = 24;

function collectTemplates(tree, out = { exact: new Set(), prefixes: [] }) {
  for (const value of Object.values(tree || {})) {
    if (typeof value === 'string') {
      const n = norm(value);
      if (n.length < 12) continue; // too short to identify anything
      const brace = n.indexOf('{');
      if (brace === -1) { out.exact.add(n); continue; }
      const prefix = n.slice(0, brace).trim();
      if (prefix.length >= PREFIX_MIN) out.prefixes.push(prefix);
    } else if (value && typeof value === 'object') {
      collectTemplates(value, out);
    }
  }
  return out;
}

let _corpus = null;
function corpus() {
  if (!_corpus) {
    const c = collectTemplates(UI_STRINGS);
    // Longest first so the most specific prefix wins.
    c.prefixes.sort((a, b) => b.length - a.length);
    _corpus = c;
  }
  return _corpus;
}

// ── detectors ─────────────────────────────────────────────────────────────────

/**
 * Did this reply come from the string table rather than from the model?
 *
 * A reply often concatenates a template with generated or interpolated text
 * (`"${prefix}: ${label}. ${correct}"`), so a substring hit counts: the presence
 * of a canned sentence is what makes the turn canned.
 *
 * @param {string} agentText
 * @returns {{template:boolean, matched:string|null}}
 */
function detectTemplateUsed(agentText) {
  const text = norm(agentText);
  if (!text) return { template: false, matched: null };
  const { exact, prefixes } = corpus();
  if (exact.has(text)) return { template: true, matched: text };
  for (const t of exact) {
    if (t.length >= 20 && text.includes(t)) return { template: true, matched: t };
  }
  for (const p of prefixes) {
    if (text.includes(p)) return { template: true, matched: p };
  }
  return { template: false, matched: null };
}

/** The loop signature: this turn says what the previous turn already said. */
function detectSameAsLastTurn(agentText, previousAgentText) {
  const a = norm(agentText);
  const b = norm(previousAgentText);
  if (!a || !b) return false;
  if (a === b) return true;
  // A repeated canned sentence counts even when surrounding text differs.
  const cur = detectTemplateUsed(agentText);
  const prev = detectTemplateUsed(previousAgentText);
  return !!(cur.template && prev.template && cur.matched === prev.matched);
}

/**
 * The user said the options are wrong. Everything the assistant does after this
 * point is answerable: it either acknowledges and changes course, or it repeats
 * itself. Patterns cover the six supported languages.
 */
// NB: \b is an ASCII word boundary in JavaScript — Cyrillic and Arabic letters
// are not \w, so \bни\b never matches. Non-Latin patterns are anchored on
// spacing/edges instead, which is why they look different from the English ones.
const NOT_MATCH_PATTERNS = [
  /\bnone of (those|these|them)\b/i, /\bnot what i (need|want|meant)\b/i,
  /\bthat'?s not (it|right|what)\b/i, /\bno[, ]+i (need|want|meant)\b/i,
  /\bneither\b/i, /\bwrong (one|service|option)\b/i, /\bi (already )?told you\b/i,
  /(^|\s)ни один/i, /(^|\s)не то(\s|$|[.,!])/i, /не подход/i, /я же сказал/i, /(^|\s)не это(\s|$|[.,!])/i,
  /\baucun (de ces|ne)\b/i, /\bce n'?est pas (ça|ce)\b/i,
  /\bninguno\b/i, /\bno es (eso|lo que)\b/i,
  /لا شيء من/, /ليس هذا/,
  /都不是/, /不是我要/,
];
const detectUserSaidNotMatch = (userMessage) => NOT_MATCH_PATTERNS.some((re) => re.test(String(userMessage || '')));

// ── per-turn and per-run ──────────────────────────────────────────────────────

/**
 * Metrics for one turn, given the turn before it.
 * @param {{agentResponse?, userMessage?, route?}} turn
 * @param {{agentResponse?}|null} prevTurn
 */
function turnMetrics(turn, prevTurn) {
  const t = detectTemplateUsed(turn && turn.agentResponse);
  const hasText = !!norm(turn && turn.agentResponse);
  return {
    templateUsed: t.template,
    templateMatched: t.matched,
    empty: !hasText,
    // A turn is "generated" when the reply is prose the model wrote. An EMPTY
    // reply is neither generated nor a template — it is an error turn. Counting
    // it as generation would let a run of failures read as perfect prose, which
    // is exactly what a mis-wired comparison produced once: every field empty,
    // every turn scored 100% generated.
    generated: hasText && !t.template,
    sameTemplateAsLastTurn: detectSameAsLastTurn(turn && turn.agentResponse, prevTurn && prevTurn.agentResponse),
    userSaidNotMatch: detectUserSaidNotMatch(turn && turn.userMessage),
    route: (turn && turn.route) || null,
  };
}

/**
 * Aggregate a run's turns.
 *
 * `explainAfterRejectRate` is the metric that captures the complaint most
 * directly: after the user says "none of those", did the next reply say
 * something new, or did it repeat the same canned line?
 */
function runMetrics(turns) {
  const list = Array.isArray(turns) ? turns : [];
  if (!list.length) {
    return {
      turns: 0, templateRepeatRate: 0, generationRate: 0, templateRate: 0,
      explainAfterRejectRate: null, rejects: 0, disambiguateCount: 0, maxConsecutiveTemplate: 0,
    };
  }
  const per = list.map((t, i) => turnMetrics(t, i > 0 ? list[i - 1] : null));

  let repeats = 0; let generated = 0; let templates = 0;
  let run = 0; let maxRun = 0; let disambiguate = 0;
  let rejects = 0; let explained = 0; let empties = 0;

  per.forEach((m, i) => {
    if (m.empty) empties += 1;
    if (m.sameTemplateAsLastTurn) repeats += 1;
    if (m.generated) generated += 1;
    if (m.templateUsed) { templates += 1; run += 1; maxRun = Math.max(maxRun, run); } else { run = 0; }
    if (String(m.route || '').toUpperCase() === 'DISAMBIGUATE') disambiguate += 1;
    if (m.userSaidNotMatch) {
      rejects += 1;
      // An ArenaTurn holds the persona's message AND the agent's reply to it, so
      // the answer to a rejection is THIS turn's reply — not the next turn's.
      // (Getting this off by one would have credited the wrong reply and made the
      // metric read better than reality.)
      if (m.generated) explained += 1;
    }
  });

  const n = per.length;
  return {
    turns: n,
    // Surfaced so a run of empty replies cannot masquerade as a healthy one.
    emptyTurns: empties,
    templateRepeatRate: repeats / n,
    generationRate: generated / n,
    templateRate: templates / n,
    explainAfterRejectRate: rejects ? explained / rejects : null,
    rejects,
    disambiguateCount: disambiguate,
    maxConsecutiveTemplate: maxRun,
    perTurn: per,
  };
}

// ── store-backed ──────────────────────────────────────────────────────────────

function createDialogueMetrics(deps = {}) {
  const read = deps.read || require('../../instances/flowdesk/schema-graph/driver').read;

  async function turnsForRun(runId) {
    const rows = await read(
      'MATCH (ar:ArenaRun {runId:$id})-[:HAS_TURN]->(t:ArenaTurn) RETURN t ORDER BY t.turnIndex',
      { id: runId }
    );
    return rows.map((r) => r.get('t').properties);
  }

  const computeRunMetrics = async (runId) => runMetrics(await turnsForRun(runId));

  /** Corpus-wide baseline over a time window — the number EXP-002 is measured against. */
  async function computeBaseline({ since } = {}) {
    const rows = await read(
      `MATCH (ar:ArenaRun)-[:HAS_TURN]->(t:ArenaTurn)
       ${since ? 'WHERE ar.startedAt >= $since' : ''}
       RETURN ar.runId AS runId, t.turnIndex AS i, t.agentResponse AS agentResponse,
              t.userMessage AS userMessage, t.route AS route
       ORDER BY ar.runId, t.turnIndex`,
      since ? { since } : {}
    );
    const byRun = new Map();
    for (const r of rows) {
      const runId = r.get('runId');
      if (!byRun.has(runId)) byRun.set(runId, []);
      byRun.get(runId).push({
        turnIndex: r.get('i'), agentResponse: r.get('agentResponse'),
        userMessage: r.get('userMessage'), route: r.get('route'),
      });
    }
    const runs = [...byRun.entries()].map(([runId, turns]) => ({ runId, ...runMetrics(turns) }));
    const totalTurns = runs.reduce((a, r) => a + r.turns, 0);
    const weighted = (key) => (totalTurns
      ? runs.reduce((a, r) => a + (r[key] * r.turns), 0) / totalTurns
      : 0);
    return {
      runs: runs.length,
      turns: totalTurns,
      generationRate: weighted('generationRate'),
      templateRate: weighted('templateRate'),
      templateRepeatRate: weighted('templateRepeatRate'),
      rejects: runs.reduce((a, r) => a + r.rejects, 0),
      explainAfterRejectRate: (() => {
        const rj = runs.reduce((a, r) => a + r.rejects, 0);
        if (!rj) return null;
        const ex = runs.reduce((a, r) => a + ((r.explainAfterRejectRate || 0) * r.rejects), 0);
        return ex / rj;
      })(),
      perRun: runs.map(({ perTurn, ...rest }) => rest),
    };
  }

  return { computeRunMetrics, computeBaseline, turnsForRun };
}

module.exports = createDialogueMetrics();
module.exports.createDialogueMetrics = createDialogueMetrics;
module.exports.detectTemplateUsed = detectTemplateUsed;
module.exports.detectSameAsLastTurn = detectSameAsLastTurn;
module.exports.detectUserSaidNotMatch = detectUserSaidNotMatch;
module.exports.turnMetrics = turnMetrics;
module.exports.runMetrics = runMetrics;
module.exports.norm = norm;
