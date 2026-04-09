/**
 * FlowDesk Template Store — fetches notification/dialog templates from Memgraph.
 *
 * Templates are stored as (:NotificationTemplate) nodes in namespace FLOWDESK.
 * Each template has a unique `key` and a `body` containing the template string.
 * Placeholders use {{varName}} syntax and are resolved at runtime.
 *
 * Usage:
 *   const tpl = require('./template-store');
 *   const text = await tpl.render('find_user.not_found', { searchTerm: 'Alice' });
 */

'use strict';

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

/** In-memory cache: key → body string.  Populated on first access. */
const _cache = new Map();
let _loaded = false;

/**
 * Load all NotificationTemplate nodes into cache.
 * Safe to call multiple times — only loads once.
 */
async function loadAll() {
  if (_loaded) return;
  try {
    const rows = await mg().runQuery(`
      MATCH (t:NotificationTemplate)
      WHERE t.namespace = 'FLOWDESK'
      RETURN t.key AS key, t.body AS body
    `);
    for (const r of rows) {
      if (r.key && r.body) _cache.set(r.key, r.body);
    }
    _loaded = true;
  } catch (err) {
    console.warn('[TemplateStore] Failed to load templates from Memgraph, using fallbacks:', err.message);
  }
}

/**
 * Resolve {{placeholder}} tokens in a template body.
 */
function interpolate(template, vars = {}) {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path) => {
    const val = path.split('.').reduce((o, k) => (o == null ? '' : o[k]), vars);
    return val == null ? '' : String(val);
  });
}

/**
 * Get raw template body by key (no interpolation).
 * Returns the template string or the provided fallback.
 */
async function get(key, fallback = '') {
  await loadAll();
  return _cache.get(key) ?? fallback;
}

/**
 * Render a template: fetch from cache + interpolate variables.
 * @param {string} key    Template key, e.g. 'find_user.not_found'
 * @param {object} vars   Variables for {{placeholder}} replacement
 * @param {string} [fallback] Fallback if template not found
 * @returns {Promise<string>}
 */
async function render(key, vars = {}, fallback) {
  const body = await get(key, fallback);
  if (!body) return '';
  return interpolate(body, vars);
}

/**
 * Invalidate cache so next get/render reloads from DB.
 */
function invalidate() {
  _cache.clear();
  _loaded = false;
}

module.exports = { loadAll, get, render, invalidate, interpolate };
