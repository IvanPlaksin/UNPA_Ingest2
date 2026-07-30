'use strict';

/**
 * Contract 4A/4B — LLMProvider stub + reference interpreter node handlers.
 *
 * Provides:
 *   - MockLLMProvider: records calls; scripted structuredOutput/completion/embedding.
 *   - getLLMProvider(config): factory stub. Returns the mock for tests; real
 *     backends (claude-code spawn, claude-sdk, anthropic-api) are TODO for C4.
 *   - buildSlotExtractionSchema / runSlotExtract / runQuestionPlanner: reference
 *     node handlers showing the interpreter → LLMProvider contract, with the
 *     per-node LLM-method + tool whitelist enforced (interpreter-nodes.js).
 *
 * @module instances/flowdesk/contracts/llm-provider.stub
 */

const { assertLLMMethodAllowed } = require('./interpreter-nodes');

// ── Mock provider ───────────────────────────────────────────────────────────

class MockLLMProvider {
  /**
   * @param {Object} [scripts]
   * @param {Function} [scripts.structured] - (prompt, schema, opts) => data
   * @param {Function} [scripts.completion] - (prompt, opts) => text
   * @param {Function} [scripts.embedding]  - (text) => number[]
   */
  constructor(scripts = {}) {
    this.id = 'mock';
    this.calls = []; // {method, prompt, schema?, opts}
    this._scripts = scripts;
  }

  async structuredOutput(prompt, schema, opts = {}) {
    this.calls.push({ method: 'structuredOutput', prompt, schema, opts });
    const data = this._scripts.structured ? this._scripts.structured(prompt, schema, opts) : {};
    return { data, raw: JSON.stringify(data), provider: this.id, tokens: 42 };
  }

  async completion(prompt, opts = {}) {
    this.calls.push({ method: 'completion', prompt, opts });
    const text = this._scripts.completion ? this._scripts.completion(prompt, opts) : '';
    return { text, provider: this.id, tokens: 17 };
  }

  async embedding(text) {
    this.calls.push({ method: 'embedding', text });
    return this._scripts.embedding ? this._scripts.embedding(text) : [0, 0, 0];
  }
}

/**
 * Factory stub. Production (C4) wires:
 *   claude-code  → spawn CLI wrapper (services/ai/providers/claude-code.provider)
 *   claude-sdk   → Claude Agent SDK
 *   anthropic-api→ LLMProviderService (Anthropic direct API)
 */
function getLLMProvider(config = {}) {
  const provider = config.provider || process.env.LLM_PROVIDER || 'mock';
  if (provider === 'mock') return new MockLLMProvider(config.scripts);
  // TODO(C4): return real provider implementations.
  throw new Error(`[getLLMProvider] provider '${provider}' not wired yet (C4)`);
}

// ── Reference node handlers ─────────────────────────────────────────────────

/** JSON type per SchemaSnapshot slot.type (for extraction schema). */
function jsonTypeForSlot(type) {
  switch (type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    // Directory-backed slots are extracted as the raw mention (a string hint the
    // RESOLVERS node resolves against the directory) — not a final object.
    case 'location':
    case 'user': return 'string';
    default: return 'string'; // string, text, enum, date
  }
}

/**
 * Build the SLOT_EXTRACT structured-output schema for the currently active slots.
 * Only active-schema fields are extractable (aligns with CODEX-RULE-077).
 */
function buildSlotExtractionSchema(snapshot, activeSlotIds) {
  const props = {};
  for (const slot of snapshot.slots) {
    if (activeSlotIds && !activeSlotIds.includes(slot.slotId)) continue;
    const p = { type: jsonTypeForSlot(slot.type) };
    if (slot.type === 'enum' && slot.presentOptions) {
      p.enum = slot.presentOptions.map((o) => o.value);
    }
    props[slot.slotId] = p;
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: props,
    description: `Extract any slot values present in the user message for service ${snapshot.serviceId}. Omit slots not mentioned.`,
  };
}

const LANG_NAMES = { en: 'English', ru: 'Russian', fr: 'French', es: 'Spanish', ar: 'Arabic', zh: 'Chinese' };

/**
 * SLOT_EXTRACT node (kind: llm, method: structuredOutput).
 * Extracts slot values from free-form user text into a schema-bounded object,
 * returns DraftSR patches (provenance: extracted).
 */
async function runSlotExtract(provider, { snapshot, activeSlotIds, userText, lang, opts }) {
  assertLLMMethodAllowed('SLOT_EXTRACT', 'structuredOutput');
  const schema = buildSlotExtractionSchema(snapshot, activeSlotIds);
  const langName = LANG_NAMES[lang] || 'English';
  // Guidance keeps a real model honest: no invented placeholders, and a canonical
  // self-marker for first-person references (so "for myself" resolves to self
  // instead of "<UNKNOWN>"). Kept above the "User message:" anchor so prompt
  // parsers keying on it are unaffected.
  // The user writes in their selected language, but every stored VALUE must be in
  // English — the downstream directories/catalogs are English-only — so free-text
  // values are translated on extraction while codes/enums/emails stay literal.
  const guidance = `The user is writing in ${langName}; understand the message in that language. `
    + 'Extract ONLY values explicitly stated in the message; omit any slot not mentioned. '
    + 'If the user refers to themselves (I, me, my, myself, for me/myself), use the literal value "self" for person slots (author, beneficiary). '
    + 'Translate every extracted FREE-TEXT value into ENGLISH (the system and its directories are English-only). '
    + 'Keep enumerated option values, codes, identifiers, emails, phone numbers, numbers and dates EXACTLY as given — do not translate or alter those. '
    + 'Never output placeholders such as "unknown" or "<UNKNOWN>" — omit the slot instead.';
  const prompt = `${guidance}\n\nUser message:\n${userText}\n\nExtract the slot values.`;
  const PLACEHOLDER = /^<?\s*unknown\s*>?$/i;
  const { data } = await provider.structuredOutput(prompt, schema, opts);
  const patches = Object.entries(data || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'string' && PLACEHOLDER.test(v.trim())))
    .map(([slotId, value]) => ({ op: 'set', slotId, value, provenance: 'extracted' }));
  return { patches, schema };
}

/**
 * QUESTION_PLANNER node (kind: llm, method: completion).
 * Phrases the next question for the given unfilled slots. May ONLY reference
 * slots present in the active snapshot (CODEX-RULE-077) — the prompt is built
 * from snapshot slots, never free-form.
 */
async function runQuestionPlanner(provider, { snapshot, unfilledSlotIds, lang, opts, guidance }) {
  assertLLMMethodAllowed('QUESTION_PLANNER', 'completion');
  const known = new Set(snapshot.slots.map((s) => s.slotId));
  const invalid = (unfilledSlotIds || []).filter((id) => !known.has(id));
  if (invalid.length) {
    throw new Error(`[QUESTION_PLANNER] slots not in active schema: ${invalid.join(', ')} (CODEX-RULE-077)`);
  }
  // TASK-PROMPT-005: `helpText` (Altiora's field description + example) grounds the
  // phrasing — it carries real rules ("above 364 days needs a written justification")
  // the label alone does not convey. It informs HOW the question is asked; the slot
  // list stays schema-bounded (CODEX-RULE-077).
  const hints = snapshot.slots
    .filter((s) => unfilledSlotIds.includes(s.slotId))
    .map((s) => {
      const line = `- ${s.slotId}: ${s.promptHint || s.slotId}`;
      return s.helpText ? `${line}\n  Guidance: ${s.helpText.replace(/\n+/g, ' ')}` : line;
    })
    .join('\n');
  const langName = LANG_NAMES[lang] || 'English';
  // Operator guidance (ADMIN P5 prompt overlays): appended verbatim so admins can
  // tune question phrasing globally or per-service without a deploy. It may only
  // influence HOW questions are asked — the slot list stays schema-bounded (077).
  const extra = guidance ? `\n\nOperator guidance (follow when phrasing the question):\n${guidance}` : '';
  // The guidance above carries the assistant's persona (identity, tone), which on its own
  // makes the model greet and introduce itself again — mid-form, before every question.
  // Greeting the user is the client's job (it seeds one personalised greeting per
  // session), so the planner is constrained to emit the question and nothing else. Kept
  // LAST so it is the final word on output shape, whatever the persona guidance says.
  const prompt = `Ask the user for the following missing information. Reply in ${langName} only — regardless of the language the user has been writing in, never switch languages — as one short question:\n${hints}${extra}`
    + '\n\nOutput ONLY the question itself. The conversation is already under way: no greeting, no introducing yourself, no restating who you are or what you do, no sign-off, no preamble.';
  const { text } = await provider.completion(prompt, opts);
  return { question: text };
}

module.exports = {
  MockLLMProvider,
  getLLMProvider,
  buildSlotExtractionSchema,
  runSlotExtract,
  runQuestionPlanner,
};
