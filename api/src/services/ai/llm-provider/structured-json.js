'use strict';

/**
 * Shared structured-output helpers for LLMProvider implementations:
 * JSON extraction from free-form text + JSON-Schema validation (ajv).
 *
 * @module services/ai/llm-provider/structured-json
 */

const Ajv = require('ajv');

const _ajv = new Ajv({ allErrors: true, strict: false });
const _validatorCache = new WeakMap();

/**
 * Multi-level JSON extraction: direct parse → ```json fence → first {…} → first […].
 * @param {string} text
 * @returns {Object|Array|null}
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* */ } }
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* */ } }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* */ } }
  return null;
}

/**
 * Validate data against a JSON Schema. Compiled validators are cached per schema object.
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSchema(data, schema) {
  let validate = _validatorCache.get(schema);
  if (!validate) { validate = _ajv.compile(schema); _validatorCache.set(schema, validate); }
  const valid = validate(data);
  const errors = valid ? [] : (validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { valid, errors };
}

/**
 * Build a strict "return ONLY JSON matching this schema" system prompt.
 */
function buildStrictJsonSystem(schema, firmer = false) {
  const base =
    'You are a strict JSON generator. Output ONLY a single valid JSON value that ' +
    'conforms to the following JSON Schema. No markdown, no code fences, no commentary.\n\n' +
    'JSON Schema:\n' + JSON.stringify(schema, null, 2);
  return firmer
    ? base + '\n\nCRITICAL: your previous reply was not parseable. Reply with ONLY the raw JSON value, starting with { or [.'
    : base;
}

module.exports = { extractJSON, validateSchema, buildStrictJsonSystem };
