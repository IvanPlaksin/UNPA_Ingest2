/**
 * Input Sanitizer Middleware (PH-001)
 *
 * Strips HTML tags and known prompt-injection patterns from text fields
 * in request bodies. Applied globally to all POST/PUT/PATCH routes.
 *
 * Lightweight — no external dependency. Uses regex-based stripping.
 *
 * @module middleware/sanitizer
 */

'use strict';

const LOG_PREFIX = '[Sanitizer]';

// Fields whose string values should be stripped of HTML/scripts
const SANITIZE_FIELDS = new Set([
  'query', 'message', 'content', 'name', 'description',
  'text', 'title', 'note', 'rationale', 'reason', 'changelog'
]);

// Common prompt-injection patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?prior/gi,
  /you\s+are\s+now\s+(a\s+)?/gi,
  /new\s+instructions\s*:/gi,
  /\bsystem\s*:\s*/gi,
  /<\|.*?\|>/g,                       // special tokens (<|im_start|>, etc.)
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi
];

/**
 * Strip HTML tags from a string (no external dep).
 */
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // remove <script> blocks
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // remove <style> blocks
    .replace(/<[^>]+>/g, '')                                             // remove all tags
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')  // decode common entities
    .replace(/on\w+\s*=/gi, '');                                         // remove event handlers (onerror=, onclick=)
}

/**
 * Filter known prompt-injection patterns. Replaces with '[filtered]'.
 * Returns the sanitised string + a flag indicating whether anything was filtered.
 */
function filterInjection(str) {
  if (typeof str !== 'string') return { value: str, filtered: false };
  let filtered = false;
  let result = str;
  for (const pattern of INJECTION_PATTERNS) {
    const prev = result;
    result = result.replace(pattern, '[filtered]');
    if (result !== prev) filtered = true;
  }
  return { value: result, filtered };
}

/**
 * Recursively sanitise an object's string values.
 * Only sanitises keys in SANITIZE_FIELDS (nested objects are always walked).
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 10) return obj; // prevent stack overflow on deep nesting
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj; // top-level strings not sanitised (only field values)
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item, depth + 1));

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && SANITIZE_FIELDS.has(key)) {
        const stripped = stripHtml(value);
        const { value: safe, filtered } = filterInjection(stripped);
        if (filtered) {
          console.warn(`${LOG_PREFIX} Prompt injection pattern filtered in field "${key}"`);
        }
        result[key] = safe;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

/**
 * Express middleware that sanitises req.body on mutating requests.
 */
function sanitizeInput(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

module.exports = { sanitizeInput, stripHtml, filterInjection, sanitizeObject, SANITIZE_FIELDS };
