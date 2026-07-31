'use strict';

/**
 * PE-006 — which rules were IN FORCE on a recorded turn.
 *
 * The operator's way in is a turn that went wrong, and the first question is always
 * "what was the assistant told to do here?" Until now that question had no answer:
 * the turn carried a version number and nothing could turn it back into rules.
 *
 * WHAT THIS PROMISES, AND WHAT IT REFUSES TO PROMISE.
 *
 * It reconstructs the rules the model was given, by loading the graph version the
 * turn recorded and compiling it — the compiler is pure, so the same version yields
 * the same text it yielded then. That is a FACT about the turn.
 *
 * It does NOT say a rule caused the behaviour. "In force" is what the data supports;
 * "caused" is a hypothesis, and the only thing that tests it is running the arena
 * with the rule changed. Every label here is worded so an operator cannot mistake
 * the first for the second — an editor that says "this rule caused it" would send
 * people to rewrite innocent rules.
 *
 * FOUR ANSWERS, BECAUSE "NO RULES" HAS FOUR DIFFERENT MEANINGS:
 *
 *   ok             the version was rebuilt; these are the rules, with their text
 *   template       no prompt ran at all — the hybrid's template wrote this turn
 *                  from the field's own promptHint, and the graph had no say
 *   unattributable recorded before the provenance fix (P-1), when EVERY turn was
 *                  stamped with the state machine's graph whatever ran. 580 live
 *                  turns are in this state and no rebuild can rescue them: which
 *                  version of the agent's graph was current then was never written
 *   unavailable    the version is gone from the catalog, or the rebuild threw
 *
 * Collapsing those into an empty list would be the worst outcome: "this turn had no
 * rules" and "we lost the record" look identical, and only one of them is a reason
 * to distrust the panel.
 *
 * @module instances/flowdesk/services/prompt-attribution.service
 */

const editor = require('./prompt-editor.service');

/** The entry the running agent compiles; used to tell its graph from the FSM's. */
const agentEntryId = () => process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;

const num = (v) => (v && typeof v === 'object' && 'low' in v ? v.low : v);

/**
 * Which field each node type compiles. For DISPLAY only — the text itself comes from
 * the compiler's own `bodyOf`, so what the panel shows cannot drift from what the
 * model was given. Naming the field matters because several nodes also carry a
 * legacy `text` copy that compiles to nothing, and editing that one is the mistake
 * this whole subsystem exists to stop people making.
 */
const COMPILES_FIELD = {
  Thesis: 'assertion', Narrative: 'framing', Persona: 'register',
  Constraint: 'rule', ToolContract: 'usage', Exemplar: 'input/output',
};

function ruleFrom(node, position, isAgent = true) {
  const d = node.data || node;
  const type = node.type || d.type || null;
  const field = isAgent ? (COMPILES_FIELD[type] || 'text') : 'text';
  // The compiler is the authority on what a node contributes; asking it directly is
  // the only way "shown" and "compiled" stay the same string.
  // Flattened first: a catalog node keeps its fields at the top level, an editor node
  // keeps them under `data`, and bodyOf reads them off whatever it is handed.
  let text = '';
  try {
    text = isAgent
      ? String(require('../../../services/evolutio/evolutio-prompt.compiler').bodyOf({ ...d, type }) || '')
      : String(d.text || '');
  } catch { text = String(d[field] || d.text || ''); }
  return {
    nodeId: node.nodeId || node.id || d.nodeId || null,
    type,
    title: d.title || d.key || node.nodeId || null,
    category: d.category || null,
    priority: d.priority ?? null,
    immutable: !!d.immutable,
    // The field this type compiles — shown so an operator editing the wrong one
    // (the trap that cost a full round of "why did nothing change") sees it named.
    compilesField: field,
    text,
    // Where it landed in the prompt, from the compiler's own manifest.
    position: position ? { index: position.index ?? null, tokens: position.tokens ?? null } : null,
  };
}

/** The context recorded on the turn, or null when it predates EC-004. */
function parseContext(json) {
  if (!json) return null;
  try {
    const c = typeof json === 'string' ? JSON.parse(json) : json;
    return c && typeof c === 'object' ? c : null;
  } catch { return null; }
}

/**
 * EC-014 — why this rule is not in this prompt, in the terms of THIS turn.
 *
 * "Excluded by condition" is not an answer; it is the question restated. What the
 * operator needs is the comparison he would otherwise do by hand — what the rule
 * asked for, and what the turn actually was — because nine times in ten the mismatch
 * is a value he did not expect the turn to have.
 *
 * @param {{nodeId:string, reason:string}} exclusion  from `manifest.excluded`
 * @param {object} node
 * @param {object} graph
 * @param {object|null} ctx  the turn's recorded compilation context
 * @returns {string}
 */
function explainExclusion(exclusion, node, graph, ctx) {
  if (exclusion.reason === 'status') {
    const s = node.status || 'not ACTIVE';
    return s === 'CANDIDATE'
      ? 'Its status is CANDIDATE — proposed but not yet accepted, so it is never compiled.'
      : `Its status is ${s}, so it is not compiled into any prompt.`;
  }

  if (exclusion.reason === 'engine_node') {
    const scope = (node.appliesToNodes || []).join(', ');
    return scope
      ? `It is scoped to ${scope}, which belongs to the state machine. The agent path never reaches it.`
      : 'It is scoped to part of the assistant this turn did not run.';
  }

  if (exclusion.reason === 'condition') {
    const conds = (graph.edges || [])
      .filter((e) => e.type === 'APPLIES_WHEN' && e.source === (node.nodeId || node.id) && e.condition)
      .map((e) => e.condition);
    if (!conds.length) return 'Its condition did not hold on this turn.';
    if (!ctx) {
      return 'Its condition did not hold — but this turn recorded no context, so which key '
        + 'failed cannot be recovered.';
    }
    // The FIRST key that fails is the honest answer: conditions are ANDed, so one
    // mismatch is enough, and listing all of them would suggest several problems.
    const mismatches = [];
    for (const c of conds) {
      const miss = firstMismatch(c, ctx);
      if (miss) mismatches.push(miss);
    }
    if (!mismatches.length) return 'Its condition did not hold on this turn.';
    // Several conditions on one node are ORed — every one of them had to fail.
    return mismatches.length === 1
      ? mismatches[0]
      : `None of its conditions held: ${mismatches.join('; ')}.`;
  }

  return 'Not compiled into this prompt.';
}

/** The first key of a condition the turn did not satisfy, said in full. */
function firstMismatch(condition, ctx) {
  const actual = {
    phase: ctx.phase,
    toolContext: ctx.toolContext,
    serviceCategory: ctx.serviceCategory,
    language: ctx.language,
    channel: ctx.channel,
    serviceId: ctx.serviceId,
  };
  for (const [key, want] of Object.entries(condition || {})) {
    const wanted = Array.isArray(want) ? want : [want];
    const got = actual[key];
    const gotList = Array.isArray(got) ? got : [got];
    const holds = gotList.some((g) => g != null && wanted.includes(g));
    if (!holds) {
      const had = gotList.filter((g) => g != null).join(', ') || 'nothing recorded';
      return `it requires ${key} to be ${wanted.join(' or ')}; this turn had ${had}`;
    }
  }
  return null;
}

/**
 * @param {{promptGraphEntryId?:string, promptGraphVersion?:number|object,
 *          promptProvenanceSource?:string, promptGraphTextHash?:string,
 *          promptContextJson?:string, turnAuthor?:string, lang?:string}} turn
 *        a ChatTurn's recorded provenance
 * @returns {Promise<{status:string, notice:string|null, entryId:string|null,
 *                    version:number|null, isAgentGraph:boolean, rules:Array,
 *                    excluded:Array, context:object|null, contextRecorded:boolean,
 *                    rebuiltHash:string|null, recordedHash:string|null,
 *                    hashMatches:boolean|null, ruleCount:number}>}
 */
async function rulesInForce(turn = {}) {
  const entryId = turn.promptGraphEntryId || null;
  const version = turn.promptGraphVersion != null ? Number(num(turn.promptGraphVersion)) : null;
  const source = turn.promptProvenanceSource || null;
  const recordedHash = turn.promptGraphTextHash || null;

  const base = {
    entryId, version, isAgentGraph: !!entryId && entryId === agentEntryId(),
    rules: [], ruleCount: 0,
    rebuiltHash: null, recordedHash, hashMatches: null,
  };

  if (source === 'template' || turn.turnAuthor === 'template') {
    return {
      ...base, status: 'template',
      notice: 'No prompt governed this turn. The hybrid interpreter answered the click from '
        + "the form field's own prompt hint and the acknowledgement strings — changing a rule "
        + 'here would not have changed this turn.',
    };
  }

  if (!entryId || version == null) {
    return { ...base, status: 'unavailable', notice: 'This turn recorded no prompt version.' };
  }

  // Recorded before P-1: every turn was stamped with the state machine's active
  // record regardless of which interpreter ran, so the number is real but describes
  // the wrong graph — and which agent version was current then is nowhere.
  if (!source) {
    return {
      ...base, status: 'unattributable',
      notice: `Provenance recorded before the telemetry fix: it points at ${entryId === agentEntryId() ? 'a graph' : 'the state-machine graph (CHAT_PROMPT)'} `
        + 'whichever interpreter actually ran. The rules in force for this turn cannot be recovered.',
    };
  }

  let graph;
  try {
    graph = await editor.getGraph(entryId, version, base.isAgentGraph ? 'agent' : 'fsm');
  } catch (e) {
    return { ...base, status: 'unavailable', notice: `Version ${version} could not be loaded: ${e.message}` };
  }
  if (!graph) {
    return { ...base, status: 'unavailable', notice: `Version ${version} is no longer in the catalog.` };
  }

  // EC-012 — the CONTEXT this turn compiled in, as recorded on the turn itself.
  //
  // Without it this rebuild answers a different question from the one asked. A
  // conditional rule is either in the version or not, and this function would report
  // it "in force" on every turn of that version — including the ones where its
  // condition did not hold and the model never saw it. The answer would be wrong in
  // the direction that matters: it would credit a rule for turns it had no part in.
  const ctx = parseContext(turn.promptContextJson);

  let compiled;
  try {
    compiled = editor.compile(graph, {
      source: base.isAgentGraph ? 'agent' : 'fsm',
      language: turn.lang || ctx?.language || 'en', entryId, version,
      ...(ctx ? {
        phase: ctx.phase, toolContext: ctx.toolContext,
        serviceCategory: ctx.serviceCategory, channel: ctx.channel,
      } : {}),
    });
  } catch (e) {
    // A version that no longer compiles is itself worth seeing — it usually means the
    // ontology moved under it, and the operator should not be told "no rules".
    return { ...base, status: 'unavailable', notice: `Version ${version} no longer compiles: ${e.message}` };
  }

  const positions = (compiled.manifest && compiled.manifest.nodes) || [];
  const posById = new Map(positions.map((p, i) => [p.nodeId, { ...p, index: i }]));
  const nodes = (graph.nodes || []).filter((n) => posById.has(n.nodeId || n.id));
  const rules = nodes
    .map((n) => ruleFrom(n, posById.get(n.nodeId || n.id), base.isAgentGraph))
    .sort((a, b) => (a.position?.index ?? 0) - (b.position?.index ?? 0));

  const rebuiltHash = (compiled.manifest && compiled.manifest.textHash) || null;
  // Compared against the GRAPH hash only. The final prompt also carries the agent
  // contract and the cache padding, so comparing against that would differ on every
  // turn ever recorded and the warning would mean nothing.
  const hashMatches = rebuiltHash && recordedHash ? rebuiltHash === recordedHash : null;

  // EC-014 — the rules that were NOT in this prompt, and why. The question the
  // operator actually arrives with is "where is my rule", and a list of what was
  // present answers it only by omission.
  const excluded = ((compiled.manifest && compiled.manifest.excluded) || []).map((x) => {
    const node = (graph.nodes || []).find((n) => (n.nodeId || n.id) === x.nodeId) || {};
    return {
      nodeId: x.nodeId,
      title: node.title || x.nodeId,
      reason: x.reason,
      explanation: explainExclusion(x, node, graph, ctx),
    };
  });

  return {
    ...base,
    status: 'ok',
    rules, ruleCount: rules.length,
    excluded,
    // Stated, because every conditional answer above depends on it: without a recorded
    // context the rebuild is of the UNCONDITIONAL prompt, which is not what ran.
    context: ctx,
    contextRecorded: !!ctx,
    rebuiltHash, hashMatches,
    notice: hashMatches === false
      ? 'The rebuilt rules differ from the ones recorded for this turn. The version may have been '
        + 'overwritten in place, or the compiler changed since. Treat the text below as indicative.'
      : null,
  };
}

/**
 * PE-007 (variant a) — how many recorded turns had this rule in force.
 *
 * Deliberately NOT "how many turns this rule affected". The set is exact — the turn
 * recorded a version, and the node either compiled into that version or it did not —
 * but the influence is not, and the wording must not launder one into the other.
 *
 * Turns recorded before P-1 are excluded and counted separately rather than
 * silently dropped: they are the majority of the history, and a count that quietly
 * ignored them would read as "this rule barely ran".
 *
 * @param {string} nodeId
 * @param {{entryId?:string, days?:number}} [opts]
 */
/**
 * The APPLIES_WHEN conditions this node carried, across the versions it appears in.
 *
 * Across versions, because a rule may have gained or lost a condition and the turns
 * being counted span both. Duplicates are collapsed — the same condition in five
 * versions is one condition to evaluate.
 */
async function conditionsForNode(entryId, versions, nodeId) {
  const seen = new Set();
  const out = [];
  for (const v of versions) {
    let g;
    try { g = await editor.getGraph(entryId, v, 'agent'); } catch { continue; }
    if (!g) continue;
    for (const e of (g.edges || [])) {
      if (e.type !== 'APPLIES_WHEN' || e.source !== nodeId || !e.condition) continue;
      const key = JSON.stringify(e.condition);
      if (seen.has(key)) continue;
      seen.add(key); out.push(e.condition);
    }
  }
  return out;
}

async function turnsUnderRule(nodeId, opts = {}) {
  const entryId = opts.entryId || agentEntryId();
  if (!nodeId || !entryId) return { nodeId, entryId: entryId || null, versions: [], turns: 0, sessions: 0, unattributable: 0 };

  const { read } = require('../schema-graph/driver');

  // Which versions of this graph contain the node — established by compiling each,
  // because presence in the graph is not presence in the prompt (a disabled or
  // budget-dropped node is in the graph and not in the text).
  let versions = [];
  try {
    const raw = await editor.getVersions(entryId, 'agent');
    const list = (Array.isArray(raw) ? raw : (raw.data || raw.items || []))
      .map((v) => Number(num(v.versionNumber ?? v.version ?? v.number)))
      .filter((v) => Number.isFinite(v));
    for (const v of list) {
      try {
        const g = await editor.getGraph(entryId, v, 'agent');
        if (!g) continue;
        const c = editor.compile(g, { source: 'agent', language: 'en', entryId, version: v });
        const present = ((c.manifest && c.manifest.nodes) || []).some((p) => p.nodeId === nodeId);
        if (present) versions.push(v);
      } catch { /* a version that will not compile cannot have carried the rule */ }
    }
  } catch { versions = []; }

  if (!versions.length) return { nodeId, entryId, versions: [], turns: 0, sessions: 0, unattributable: 0 };

  // EC-012 — being in the VERSION is no longer the same as being in the PROMPT.
  //
  // A conditional rule compiles into the version and reaches the model only on the
  // turns where its condition held. Counting versions alone would credit it for every
  // turn of that version — the direction of error that makes a rule look load-bearing
  // when it barely speaks.
  //
  // Turns are grouped by their recorded context, so the condition is evaluated once
  // per distinct context rather than once per turn.
  const conditional = await conditionsForNode(entryId, versions, nodeId);
  if (conditional.length) {
    const byCtx = await read(
      `MATCH (t:ChatTurn)
       WHERE t.promptGraphEntryId = $entryId AND t.promptProvenanceSource IS NOT NULL
         AND t.promptGraphVersion IN $versions AND t.promptContextJson IS NOT NULL
       RETURN t.promptContextJson AS ctx, count(t) AS turns, count(DISTINCT t.sessionId) AS sessions`,
      { entryId, versions },
    );
    let held = 0; let heldSessions = 0; let withContext = 0;
    for (const r of byCtx) {
      const turns = num(r.get('turns'));
      const sessions = num(r.get('sessions'));
      withContext += turns;
      const ctx = parseContext(r.get('ctx'));
      // ORed: any one condition holding puts the rule in the prompt.
      if (ctx && conditional.some((c) => !firstMismatch(c, ctx))) {
        held += turns; heldSessions += sessions;
      }
    }
    // Turns of the right versions that carry no context at all. Not folded into
    // either number: before EC-004 nothing recorded what the conversation was doing,
    // so for a conditional rule these turns are simply unanswerable.
    const noCtx = await read(
      `MATCH (t:ChatTurn)
       WHERE t.promptGraphEntryId = $entryId AND t.promptProvenanceSource IS NOT NULL
         AND t.promptGraphVersion IN $versions AND t.promptContextJson IS NULL
       RETURN count(t) AS n`,
      { entryId, versions },
    );
    const lostAll = await read(
      'MATCH (t:ChatTurn) WHERE t.promptProvenanceSource IS NULL AND t.promptGraphEntryId IS NOT NULL RETURN count(t) AS n',
      {},
    );
    return {
      nodeId, entryId, versions,
      conditional: true,
      turns: held,
      sessions: heldSessions,
      // The denominator: turns of these versions whose context we know.
      turnsWithContext: withContext,
      // Same versions, no context recorded — the condition cannot be replayed.
      withoutContext: noCtx[0] ? num(noCtx[0].get('n')) : 0,
      unattributable: lostAll[0] ? num(lostAll[0].get('n')) : 0,
    };
  }

  const rows = await read(
    `MATCH (t:ChatTurn)
     WHERE t.promptGraphEntryId = $entryId AND t.promptProvenanceSource IS NOT NULL
       AND t.promptGraphVersion IN $versions
     RETURN count(t) AS turns, count(DISTINCT t.sessionId) AS sessions`,
    { entryId, versions },
  );
  const lost = await read(
    'MATCH (t:ChatTurn) WHERE t.promptProvenanceSource IS NULL AND t.promptGraphEntryId IS NOT NULL RETURN count(t) AS n',
    {},
  );

  return {
    nodeId, entryId, versions,
    turns: rows[0] ? num(rows[0].get('turns')) : 0,
    sessions: rows[0] ? num(rows[0].get('sessions')) : 0,
    // Not attributable to any rule, this one included — stated so the count above is
    // read as "of what we can attribute", not "of everything that happened".
    unattributable: lost[0] ? num(lost[0].get('n')) : 0,
  };
}

/**
 * PE-004 — how much of the dialogue the prompt actually governs.
 *
 * An operator tuning rules should know they are tuning a FRACTION of the conversation:
 * under the hybrid interpreter a click mid-form is answered by a template, from the
 * field's own prompt hint and a fixed acknowledgement, with no model call and so no
 * prompt involved at all.
 *
 * MEASURED, NEVER ASSUMED. My own arena measurement was 39% model / 61% template, on
 * ONE scenario with a 29-field form in English. The share moves with form length, with
 * language (anything but English goes to the model), and with how often the user types
 * instead of clicking. A constant in the UI would be a benchmark wearing production's
 * clothes — so this reads the turns, and says plainly when there are none.
 *
 * @param {{days?:number}} [opts]
 */
async function dialogueAuthorship(opts = {}) {
  const days = Math.min(Math.max(1, Number(opts.days) || 7), 90);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { read } = require('../schema-graph/driver');

  const rows = await read(
    `MATCH (t:ChatTurn) WHERE t.ts >= $since AND t.turnAuthor IS NOT NULL
     RETURN t.turnAuthor AS author, t.routerReason AS reason, count(*) AS n`,
    { since },
  );

  let model = 0;
  let template = 0;
  const reasons = new Map();
  for (const r of rows) {
    const n = num(r.get('n')) || 0;
    const author = r.get('author');
    if (author === 'template') template += n; else model += n;
    if (author !== 'template') {
      const why = r.get('reason') || 'unknown';
      reasons.set(why, (reasons.get(why) || 0) + n);
    }
  }
  const total = model + template;

  return {
    days,
    total,
    model,
    template,
    // Null rather than 0 when there is nothing to divide by: "0% of the dialogue is
    // deterministic" and "we have not recorded any turns yet" are different facts.
    modelShare: total ? model / total : null,
    templateShare: total ? template / total : null,
    // Why turns went to the model, largest first — this is the actionable half. A
    // dominant `non_english` says something different from a dominant `free_text`.
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, turns: n })),
    // Said out loud, because the field was only added recently: turns recorded before
    // it exist and carry no author, and they are not counted here.
    note: total ? null : 'No turn in this window recorded who wrote it. Turns predating the authorship field are not counted.',
  };
}

/** The template's fixed acknowledgements, read-only — the assistant's other voice. */
function controlAcks(langs = ['en', 'fr', 'es', 'ru', 'ar', 'zh']) {
  const { ui } = require('../interpreter/templates/ui-strings');
  const out = {};
  for (const lang of langs) {
    try {
      const acks = (ui(lang) && ui(lang).controlAck) || {};
      out[lang] = { ...acks };
    } catch { out[lang] = {}; }
  }
  return out;
}

module.exports = {
  rulesInForce, turnsUnderRule, ruleFrom, dialogueAuthorship, controlAcks,
  // EC-014 — exported for the tests that keep the wording honest.
  explainExclusion, firstMismatch, parseContext,
};
