'use strict';

/**
 * Translator — English → Russian for arena transcripts (bilingual review).
 *
 * Adds a Russian variant ALONGSIDE the original English so a Russian-speaking
 * reviewer can read/judge runs. Uses Haiku by default (cheap); injectable llm
 * for tests. Translations are persisted on ArenaTurn as *Ru fields and shown
 * under the English text in the CLIs.
 *
 * @module services/dialogue-gym/translator
 */

const TRANSLATE_SCHEMA = {
  type: 'object',
  description: 'Russian translations of a chat turn (preserve meaning and tone).',
  properties: {
    userRu: { type: 'string', description: 'Russian translation of the user message.' },
    agentRu: { type: 'string', description: 'Russian translation of the agent message.' },
  },
  required: ['userRu', 'agentRu'],
};

function defaultLlm() {
  const { getLLMProvider } = require('../ai/llm-provider');
  return getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude-code',
    model: process.env.DIALOGUE_GYM_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001',
  });
}

/**
 * Translate one turn's user + agent text to Russian.
 * @returns {Promise<{userMessageRu:string, agentResponseRu:string, tokens:number, costUsd:number}>}
 */
async function translateTurn(turn, opts = {}) {
  const llm = opts.llm || defaultLlm();
  const user = String(turn.userMessage || '');
  const agent = String(turn.agentResponse || '');
  if (!user && !agent) return { userMessageRu: '', agentResponseRu: '', tokens: 0, costUsd: 0 };
  const prompt = [
    'Translate the following two chat messages from English to natural, professional Russian.',
    'Preserve meaning, tone and register (UN service-desk context). Keep any service codes, form names and IDs verbatim.',
    'Return ONLY the structured translation.',
    '',
    `USER (English): ${user || '(empty)'}`,
    `AGENT (English): ${agent || '(empty)'}`,
  ].join('\n');
  const res = await llm.structuredOutput(prompt, TRANSLATE_SCHEMA, { temperature: 0.1, maxTokens: 1200 });
  const d = res.data || {};
  return {
    userMessageRu: String(d.userRu || ''),
    agentResponseRu: String(d.agentRu || ''),
    tokens: (res.inputTokens || 0) + (res.outputTokens || 0),
    costUsd: res.costUsd || 0,
  };
}

/**
 * Translate a list of turns (sequential — Haiku is fast; keeps rate friendly).
 * @param {Array} turns
 * @param {object} [opts] { llm, onProgress, force }
 * @returns {Promise<Array<{turnId, userMessageRu, agentResponseRu}>>}
 */
async function translateTurns(turns, opts = {}) {
  const out = [];
  for (const t of turns || []) {
    if (!opts.force && t.userMessageRu != null && t.agentResponseRu != null && (t.userMessageRu !== '' || t.agentResponseRu !== '')) {
      out.push({ turnId: t.turnId, userMessageRu: t.userMessageRu, agentResponseRu: t.agentResponseRu, skipped: true });
      continue;
    }
    const tr = await translateTurn(t, opts);
    out.push({ turnId: t.turnId, ...tr });
    if (opts.onProgress) opts.onProgress({ turnId: t.turnId, ...tr });
  }
  return out;
}

module.exports = { translateTurn, translateTurns, TRANSLATE_SCHEMA };
