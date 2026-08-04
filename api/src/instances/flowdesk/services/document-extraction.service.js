'use strict';

/**
 * DOC-2-001 — reading a user's document into the fields of their request.
 *
 * One model call: the document as a content block, the form's own field list as
 * the target, JSON back. Everything that makes it non-trivial is about not
 * trusting that JSON — the model is describing someone's scanned passport
 * against a thirty-field Altiora form, and a value it invents costs more than a
 * value it misses.
 *
 * THIS SERVICE NEVER WRITES TO THE DRAFT. It returns what it read and how sure
 * it is; showing that to the user and recording their answer is the agent's
 * job, through the confirm control and `draft_update` that already exist. The
 * ratify pattern is not re-implemented here, and there is deliberately no path
 * from a document straight into a request.
 *
 * @module instances/flowdesk/services/document-extraction.service
 */

const {
  prepareContentBlock, textBlock, validateFileSize,
} = require('../../../services/ai/llm-provider/multimodal');

/** Codes the agent branches on; the messages are what the user reads. */
class ExtractionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Read at CALL time, not at module load.
 *
 * Ivan's ruling: the extraction model is an instance setting rather than a code
 * constant, so it can be switched on a running deployment and measured against
 * real documents. A module-level const would freeze whatever was in the
 * environment when the process started.
 */
function extractionModel() {
  return process.env.FLOWDESK_EXTRACTION_MODEL || 'claude-haiku-4-5';
}

/**
 * The page ceiling belongs to the MODEL, not to us: ~100 pages on a
 * 200K-context model, ~600 on a 1M one. Since the model is now configurable,
 * the number is unknowable here — which is why we detect the refusal instead of
 * pre-checking, and why the message the user reads carries no number.
 */
const TOO_LONG = /\b(page|pages|too long|too large|exceeds?\s+the\s+maximum|prompt is too long)\b/i;

const TOO_LONG_MESSAGE =
  'This document is too large for me to read in full. '
  + 'Please attach just the pages containing the information you need.';

/**
 * One line per field, in the model's own terms.
 *
 * Built from the slot fields that actually exist on a SchemaSnapshot —
 * `promptHint` is the question Altiora asks, `helpText` its guidance, and
 * `fieldMeaning` the generated description used when there is no human text.
 * Enum domains arrive as `presentOptions` of `{value,label}`, and the VALUE is
 * what a draft stores, so the value is what the model is asked for: given only
 * labels it returns the label, and the write is then rejected downstream.
 */
function describeSlot(slot) {
  const parts = [`- ${slot.slotId}`];

  const human = slot.promptHint || slot.fieldMeaning || slot.slotId;
  parts.push(`(${slot.type || 'text'}${slot.required ? ', required' : ''}): ${human}`);

  const guidance = slot.helpText || (slot.promptHint ? slot.fieldMeaning : null);
  if (guidance) parts.push(`— ${guidance}`);

  if (Array.isArray(slot.presentOptions) && slot.presentOptions.length) {
    const shown = slot.presentOptions.slice(0, 25)
      .map((o) => (o.label && o.label !== o.value ? `${o.value} (${o.label})` : `${o.value}`))
      .join(' | ');
    const more = slot.presentOptions.length > 25 ? ` | …${slot.presentOptions.length - 25} more` : '';
    parts.push(`\n    allowed values — return the value, not the label: ${shown}${more}`);
  }
  if (slot.multi) parts.push('\n    multiple values allowed — return an array');

  return parts.join(' ');
}

/**
 * Slots worth asking the model about.
 *
 * A slot whose value the FORM resolves from its own dictionary is excluded:
 * those are cascade fields (duty station → building → room) that the wizard
 * fills itself and discards anything we send, so an extracted guess is at best
 * ignored and at worst contradicts what the form decides.
 *
 * Directory-resolved slots (`resolverRef`) ARE included, deliberately. The
 * model returns the NAME as written in the document; the existing resolver then
 * turns that into a directory record with the usual confirm-or-choose. That is
 * how a beneficiary reaches the draft everywhere else.
 */
function extractableSlots(snapshot) {
  const slots = (snapshot && snapshot.slots) || [];
  return slots.filter((s) => s && s.slotId && s.extractable !== false);
}

function buildSystemPrompt(slots) {
  return `You extract information from a document so a UN service request form can be pre-filled.

FIELDS TO LOOK FOR:
${slots.map(describeSlot).join('\n')}

RULES
- Extract only what the document actually states. Do not infer, complete or invent a value.
- Omit any field the document does not contain. An absent field is a correct answer; a guessed one is not.
- confidence: "high" when the document states it plainly, "medium" when it follows from the text, "low" when you are unsure.
- Dates: ISO 8601 (YYYY-MM-DD).
- People and places: copy the wording of the document; do not normalise or translate names.
- For a field with allowed values, return one of the listed values exactly. If none fits, omit the field.

Reply with JSON only — no prose, no markdown fences:
{"extracted": {"<slotId>": <value>}, "confidence": {"<slotId>": "high"|"medium"|"low"}}`;
}

/**
 * Every balanced `{...}` region in a string, braces inside string literals
 * ignored.
 *
 * Needed because the two shortcuts both fail on real replies. The greedy
 * `/\{[\s\S]*\}/` takes from the FIRST brace to the LAST, so a sentence like
 * "(note: {} means nothing found)" before the object swallows the prose and
 * parses as nothing. A lazy match takes the `{}` and stops. Scanning for
 * balance finds both regions and lets the caller pick.
 */
function balancedObjects(raw) {
  const out = [];
  let depth = 0; let start = -1; let inStr = false; let esc = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth += 1; continue; }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) { out.push(raw.slice(start, i + 1)); start = -1; }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

/**
 * Get the JSON out of a reply that was asked for JSON and may not have obliged.
 *
 * Candidates in order of trust: the whole string, a fenced block, then each
 * balanced object found in the prose — longest first, since the extraction
 * result is the substantial one and a stray `{}` is not. A candidate only wins
 * if it actually looks like a result, so an incidental object earlier in the
 * text cannot shadow the real one.
 */
function parseJsonReply(text) {
  const raw = String(text || '').trim();
  const candidates = [raw];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  candidates.push(...balancedObjects(raw).sort((a, b) => b.length - a.length));

  let fallback = null;
  for (const c of candidates) {
    let parsed;
    try { parsed = JSON.parse(c); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    if (Object.prototype.hasOwnProperty.call(parsed, 'extracted')) return parsed;
    if (!fallback) fallback = parsed;
  }
  if (fallback) return fallback;
  throw new ExtractionError('PARSE_FAILED', 'I could not read the result of examining this document.');
}

const CONFIDENCE = new Set(['high', 'medium', 'low']);

/**
 * Keep only what a draft could actually accept.
 *
 * Three things are dropped, and each has been seen from a real model: a slotId
 * that is not in this form (invention), an enum value outside the declared
 * domain (a label instead of a value, or a plausible-sounding option that does
 * not exist), and an empty string (the model's way of saying "not found" when
 * it has been told to omit). Letting any of them through would put a value in
 * front of the user for confirmation that the form cannot store.
 */
function sanitise(parsed, slots) {
  const bySlot = new Map(slots.map((s) => [s.slotId, s]));
  const extracted = {};
  const confidence = {};
  const rejected = [];

  const rawValues = (parsed && parsed.extracted && typeof parsed.extracted === 'object') ? parsed.extracted : {};
  const rawConf = (parsed && parsed.confidence && typeof parsed.confidence === 'object') ? parsed.confidence : {};

  for (const [slotId, value] of Object.entries(rawValues)) {
    const slot = bySlot.get(slotId);
    if (!slot) { rejected.push({ slotId, reason: 'unknown field' }); continue; }
    if (value === null || value === undefined || value === '') continue;

    if (Array.isArray(slot.presentOptions) && slot.presentOptions.length) {
      const allowed = new Set(slot.presentOptions.map((o) => String(o.value)));
      const values = Array.isArray(value) ? value : [value];
      const good = values.filter((v) => allowed.has(String(v)));
      if (!good.length) { rejected.push({ slotId, reason: 'value not among the allowed options' }); continue; }
      extracted[slotId] = slot.multi ? good : good[0];
    } else if (slot.multi) {
      extracted[slotId] = Array.isArray(value) ? value : [value];
    } else {
      extracted[slotId] = Array.isArray(value) ? value[0] : value;
    }

    const c = String(rawConf[slotId] || '').toLowerCase();
    confidence[slotId] = CONFIDENCE.has(c) ? c : 'medium';
  }

  return { extracted, confidence, rejected };
}

/**
 * The cache key: which form this extraction was for.
 *
 * `contentHash` when the snapshot carries one, because a schema can be edited
 * without its version moving; the version is the fallback. Re-running against a
 * different form is not optional — the target fields have changed.
 */
function schemaKey(snapshot) {
  if (!snapshot) return null;
  const stamp = (snapshot.metadata && snapshot.metadata.contentHash) || snapshot.version || 'v1';
  return `${snapshot.serviceId}:${stamp}`;
}

/**
 * Read one document against one form.
 *
 * @param {Buffer|string} fileData the document
 * @param {string} fileName for the messages the user reads
 * @param {string} mimeType
 * @param {object} snapshot SchemaSnapshot — supplies the target fields
 * @param {{provider?:object, model?:string, maxTokens?:number}} [opts]
 * @returns {Promise<{extracted:object, confidence:object, rejected:Array, model:string, usage:object}>}
 * @throws {ExtractionError} FILE_TOO_LARGE | UNSUPPORTED_TYPE | NO_FIELDS | DOCUMENT_TOO_LONG | PARSE_FAILED | EXTRACTION_FAILED
 */
async function extractFromDocument(fileData, fileName, mimeType, snapshot, opts = {}) {
  const slots = extractableSlots(snapshot);
  if (!slots.length) {
    throw new ExtractionError('NO_FIELDS', 'This request has no fields I can fill from a document.', { fileName });
  }

  if (Buffer.isBuffer(fileData)) {
    try {
      validateFileSize(fileData.length, fileName);
    } catch (err) {
      throw new ExtractionError('FILE_TOO_LARGE', TOO_LONG_MESSAGE, { fileName, size: fileData.length, cause: err.message });
    }
  }

  let documentBlock;
  try {
    documentBlock = prepareContentBlock(fileData, mimeType);
  } catch (err) {
    throw new ExtractionError('UNSUPPORTED_TYPE', 'I cannot read this kind of file.', { fileName, mimeType, cause: err.message });
  }

  const provider = opts.provider
    || require('../../../services/ai/llm-provider').getLLMProvider({ provider: 'anthropic-api' });
  const model = opts.model || extractionModel();

  let reply;
  try {
    reply = await provider.completionWithContent(
      [documentBlock, textBlock('Extract the fields listed in your instructions from this document. JSON only.')],
      { system: buildSystemPrompt(slots), model, maxTokens: opts.maxTokens || 2048 },
    );
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (TOO_LONG.test(msg)) {
      throw new ExtractionError('DOCUMENT_TOO_LONG', TOO_LONG_MESSAGE, { fileName, cause: msg });
    }
    throw new ExtractionError(
      'EXTRACTION_FAILED',
      'I could not read this document. It may be damaged, or scanned too faintly to make out.',
      { fileName, cause: msg },
    );
  }

  const { extracted, confidence, rejected } = sanitise(parseJsonReply(reply.text), slots);
  return {
    extracted,
    confidence,
    rejected,
    model: reply.model || model,
    usage: { tokens: reply.tokens, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, cost: reply.cost },
  };
}

module.exports = {
  extractFromDocument,
  schemaKey,
  extractionModel,
  extractableSlots,
  ExtractionError,
  // exported for the tests that assert on prompt content
  _internals: { describeSlot, buildSystemPrompt, parseJsonReply, sanitise },
};
