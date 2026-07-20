'use strict';

/**
 * Session-analysis AI agent (ADMIN P5) — on-demand LLM analysis of one chat
 * session: did the user get what they needed, what went wrong, and what prompt
 * change would fix it. Feeds the prompt-overlay apply flow:
 *
 *   problem in GENERAL functionality → recommend a GLOBAL prompt overlay
 *     (router/planner behavior, tone, deflection copy, routing mistakes);
 *   problem in the SERVICE-REQUEST SCHEMA → recommend a SERVICE-scoped overlay
 *     (applies only to that schema's question planning);
 *   plus a clarity review of the schema itself (field naming/descriptions),
 *   when a schema was invoked in the chat.
 *
 * The analysis is persisted on the (:ChatSession) node (analysisJson) so it is
 * cached across admin sessions; `force` re-runs it.
 *
 * @module instances/flowdesk/services/session-analysis.service
 */

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['successAssessment', 'problems', 'generalPromptRecommendation', 'schemaPromptRecommendation', 'schemaClarityFindings'],
  properties: {
    successAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['userGoalAchieved', 'score', 'summary'],
      properties: {
        userGoalAchieved: { enum: ['achieved', 'partially_achieved', 'not_achieved', 'indeterminate'] },
        score: { type: 'number', minimum: 0, maximum: 1 },
        summary: { type: 'string' },
      },
    },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'description'],
        properties: {
          category: { enum: ['general_functionality', 'schema_specific', 'schema_clarity', 'llm_behavior', 'integration_error', 'user_behavior'] },
          description: { type: 'string' },
          evidenceTurns: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
    generalPromptRecommendation: {
      type: 'object',
      additionalProperties: false,
      required: ['needed'],
      properties: {
        needed: { type: 'boolean' },
        proposedText: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    schemaPromptRecommendation: {
      type: 'object',
      additionalProperties: false,
      required: ['needed'],
      properties: {
        needed: { type: 'boolean' },
        proposedText: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    schemaClarityFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slotId', 'issue', 'suggestion'],
        properties: {
          slotId: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
  },
};

const fmtVal = (v) => (v == null ? '—' : typeof v === 'object' ? (v.name || v.id || JSON.stringify(v)) : String(v));

function transcriptBlock(turns) {
  return turns.slice(0, 40).map((t) => {
    const err = t.error ? ` [ERROR:${t.error}]` : '';
    return `#${t.seq} [route:${t.route || '?'}]${err}\nUSER: ${t.userText || '(action)'}\nAGENT: ${(t.agentText || '').slice(0, 500)}`;
  }).join('\n\n');
}

function schemaBlock(snapshot) {
  if (!snapshot) return '(no schema was invoked in this session)';
  const slots = snapshot.slots.map((s) => {
    const parts = [`- ${s.slotId} (type:${s.type}${s.required ? ', required' : ''}, phase:${s.phase})`];
    if (s.promptHint) parts.push(`  promptHint: "${s.promptHint}"`);
    if (s.trefCondition) parts.push(`  shown when: ${s.trefCondition}`);
    if (s.type === 'enum') parts.push(`  options: ${(s.presentOptions || []).map((o) => o.label).join(' | ')}`);
    return parts.join('\n');
  }).join('\n');
  return `Service: ${snapshot.serviceId} — "${snapshot.metadata?.title}"\nFields (asked in this order):\n${slots}`;
}

function draftBlock(draft) {
  if (!draft) return '(no draft state available)';
  const slots = Object.entries(draft.slots || {})
    .map(([id, sv]) => `- ${id} = ${fmtVal(sv.value)} (${sv.provenance}${sv.stale ? ', stale' : ''}${sv.pending ? ', pending' : ''})`)
    .join('\n');
  return `Final status: ${draft.status}. Filled slots:\n${slots || '(none)'}\nRepair counters: session=${draft.repair?.session ?? 0}`;
}

function buildPrompt({ session, turns, draft, snapshot }) {
  return `You are a UX/dialogue-quality analyst for "FlowDesk Chat" — an AI intake assistant for UN service requests (HR/Finance). A conversation is executed by an interpreter over a declarative form schema (fields below); the LLM only routes intents, extracts slot values and phrases questions.

Analyze this COMPLETED session and report strictly via the tool schema.

## Session metadata
- outcome: ${session.outcome || 'active'} | turns: ${session.turns} | repair events: ${session.repairSession || 0} | out-of-scope turns: ${session.outOfScopeTurns || 0} | error turns: ${session.errorTurns || 0}
- ticket created: ${session.srNumber || 'NO'} | escalated: ${session.escalationId || 'no'}

## Transcript
${transcriptBlock(turns)}

## Final draft state
${draftBlock(draft)}

## Form schema invoked
${schemaBlock(snapshot)}

## Your tasks
1. successAssessment — did the USER get what they needed? (a created ticket usually means yes, but check the dialogue for friction: repeated re-asks, misunderstood answers, wrong service resolved).
2. problems — each distinct problem, classified:
   - general_functionality: routing/tone/deflection/flow issues that would affect ANY service (fix = global system-prompt guidance);
   - schema_specific: question-phrasing or ordering issues specific to THIS service's form (fix = service-scoped prompt guidance);
   - schema_clarity: the form's own field names/hints/options are unclear to an end user;
   - llm_behavior / integration_error / user_behavior: as applicable.
3. generalPromptRecommendation — if any general_functionality (or llm_behavior fixable by prompting) problem exists: needed=true and proposedText = a CONCISE imperative instruction block (<=600 chars) ready to append to the assistant's system guidance. Otherwise needed=false.
4. schemaPromptRecommendation — if any schema_specific or schema_clarity problem is fixable by guiding how questions for THIS service are phrased: needed=true and proposedText = a concise instruction block (<=600 chars) scoped to this service (e.g. 'When asking for areSupportingDocumentsAttached, explain which documents are meant'). Otherwise needed=false.
5. schemaClarityFindings — per-field clarity review of the schema above (empty array if no schema or all fields are clear): unclear label/hint/purpose, jargon, missing explanation of options.

Be specific and evidence-based (reference turn numbers). Write recommendations in English. Do NOT invent problems for a smooth session — an empty problems list with needed=false on both recommendations is a valid result.`;
}

/**
 * @param {object} deps injectable: {llm, getSessionData, loadSnapshot, persist}
 */
function createSessionAnalysis(deps = {}) {
  const getLlm = deps.llm ? () => deps.llm : () => {
    const { getLLMProvider } = require('../../../services/ai/llm-provider');
    return getLLMProvider({
      provider: process.env.FLOWDESK_LLM_PROVIDER || 'claude-code',
      // Analysis benefits from a stronger model than the chat's turn model —
      // overridable independently of the chat.
      model: process.env.FLOWDESK_ADMIN_ANALYSIS_MODEL || process.env.FLOWDESK_LLM_MODEL || 'claude-sonnet-4-6',
    });
  };
  const getSessionData = deps.getSessionData || (async (sessionId) => {
    const admin = require('./chat-admin.service');
    const detail = await admin.getSession(sessionId);
    if (!detail) return null;
    const { turns } = await admin.getTurns(sessionId);
    return { session: detail.session, draft: detail.draft, turns };
  });
  const loadSnapshot = deps.loadSnapshot || require('../schema-graph/schema-compiler').compile;
  const persist = deps.persist || (async (sessionId, analysis, model) => {
    const { write } = require('../schema-graph/driver');
    await write(
      `MATCH (s:ChatSession {sessionId:$sessionId})
       SET s.analysisJson=$json, s.analyzedAt=$ts, s.analysisModel=$model`,
      { sessionId, json: JSON.stringify(analysis), ts: new Date().toISOString(), model });
  });

  /**
   * Run (or return cached) analysis for a session.
   * @returns {{analysis, cached, analyzedAt, model, serviceId}}
   */
  async function analyzeSession(sessionId, { force = false } = {}) {
    const data = await getSessionData(sessionId);
    if (!data) throw Object.assign(new Error('session not found'), { status: 404 });
    const { session, draft, turns } = data;

    if (!force && session.analysisJson) {
      try {
        return {
          analysis: JSON.parse(session.analysisJson), cached: true,
          analyzedAt: session.analyzedAt, model: session.analysisModel, serviceId: session.serviceId || null,
        };
      } catch { /* corrupt cache → re-run */ }
    }
    if (!turns.length) throw Object.assign(new Error('session has no recorded turns to analyze'), { status: 409 });

    let snapshot = null;
    if (session.serviceId) {
      try { snapshot = await loadSnapshot(session.serviceId); } catch { /* schema may be gone — analyze without it */ }
    }

    const prompt = buildPrompt({ session, turns, draft, snapshot });
    const model = process.env.FLOWDESK_ADMIN_ANALYSIS_MODEL || process.env.FLOWDESK_LLM_MODEL || 'claude-sonnet-4-6';
    const { data: analysis } = await getLlm().structuredOutput(prompt, ANALYSIS_SCHEMA);

    // Guard: a schema recommendation without a schema in play is meaningless.
    if (!session.serviceId && analysis.schemaPromptRecommendation) {
      analysis.schemaPromptRecommendation.needed = false;
    }

    await persist(sessionId, analysis, model).catch((e) => console.warn('[session-analysis] persist failed:', e.message));
    return { analysis, cached: false, analyzedAt: new Date().toISOString(), model, serviceId: session.serviceId || null };
  }

  return { analyzeSession, buildPrompt, ANALYSIS_SCHEMA };
}

let _default;
function getSessionAnalysis() {
  if (!_default) _default = createSessionAnalysis();
  return _default;
}

module.exports = { createSessionAnalysis, getSessionAnalysis, ANALYSIS_SCHEMA, buildPrompt };
