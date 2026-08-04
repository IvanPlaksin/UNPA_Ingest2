/**
 * RadixConnector — the shape of a retrieval endpoint declared in a workspace.
 *
 * A connector is CONFIGURATION, not knowledge. It says "search this workspace
 * this way, and label the result this category" — the workspace's own
 * declaration of what it can answer. That is why it is a `:RadixConnector` node
 * and not a 13th draft type: drafts are curated knowledge that goes through
 * validation, contradiction detection and promotion, and running configuration
 * through those pipelines would be a category error in the literal sense.
 *
 * It also moves retrieval logic out of env vars and into the graph, which is
 * where this project keeps its programs ("Graph = Program").
 *
 * @module services/radix/connector/connector.schema
 */

'use strict';

const DRAFT_TYPES = Object.freeze([
  'entity', 'relationship', 'business_rule', 'schema', 'workflow', 'calculation',
  'concept', 'policy', 'decision', 'requirement', 'anomaly', 'api_contract'
]);

const KNOWLEDGE_FAMILIES = Object.freeze([
  'STRUCTURAL', 'BEHAVIORAL', 'SEMANTIC', 'OPERATIONAL', 'CONTEXTUAL'
]);

const DEFAULTS = Object.freeze({
  enabled: true,
  priority: 0,
  vectorThreshold: 0.78,
  maxElements: 10,
  tokenBudget: 1500,
  // Empty means "no filter". Memgraph rejects a null literal inside a CREATE
  // property map, so absence is expressed as an empty list, never as null.
  draftTypes: [],
  knowledgeFamilies: [],
  excludeStatuses: ['REJECTED', 'PROMOTED'],
  preamble: ''
});

/**
 * Preambles that are part of the CONTRACT for a category, not decoration.
 *
 * `serviceCatalog` is the load-bearing case. Naming a context section after the
 * service catalogue invites the model to take a service code from it and call
 * `draft_create` — which the chat rejects, because that tool only accepts codes
 * `catalog_search` returned in the same session. The guard sentence is what
 * stops the model walking into that dead end.
 *
 * These are PREPENDED and cannot be edited away: a custom preamble is appended
 * after them. An admin tuning wording must not be able to delete a guardrail
 * that was paid for with a live defect.
 */
const CATEGORY_GUARDS = Object.freeze({
  serviceCatalog:
    'The following describes services that exist, so you can understand what the user needs. '
    + 'It is NOT a source of service codes: to start a request you must still call '
    + 'catalog_search and use a code it returns.'
});

/** Categories may be referenced in prompts and section headers. */
const CATEGORY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{1,39}$/;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Validates and normalizes connector input.
 *
 * @param {Object} input
 * @param {boolean} [partial=false] - Update mode: only validate supplied fields
 * @returns {{valid: boolean, errors: string[], value: Object}}
 */
function validateConnector(input, partial = false) {
  const errors = [];
  const value = {};
  const src = input || {};

  const has = (key) => src[key] !== undefined && src[key] !== null;

  if (!partial || has('name')) {
    const name = String(src.name || '').trim();
    if (!name) errors.push('name is required');
    else if (name.length > 120) errors.push('name must be 120 characters or fewer');
    else value.name = name;
  }

  if (!partial || has('category')) {
    const category = String(src.category || '').trim();
    if (!category) {
      errors.push('category is required');
    } else if (!CATEGORY_PATTERN.test(category)) {
      errors.push(
        'category must start with a letter and contain only letters, digits and underscores '
        + '(2-40 chars)'
      );
    } else {
      value.category = category;
    }
  }

  if (has('enabled')) value.enabled = Boolean(src.enabled);
  if (has('priority')) {
    const p = Number(src.priority);
    if (!Number.isFinite(p)) errors.push('priority must be a number');
    else value.priority = Math.trunc(clamp(p, -100, 100));
  }

  if (has('vectorThreshold')) {
    const t = Number(src.vectorThreshold);
    if (!Number.isFinite(t)) errors.push('vectorThreshold must be a number');
    else value.vectorThreshold = clamp(t, 0, 1);
  }

  if (has('maxElements')) {
    const m = Number(src.maxElements);
    if (!Number.isFinite(m)) errors.push('maxElements must be a number');
    else value.maxElements = Math.trunc(clamp(m, 1, 50));
  }

  if (has('tokenBudget')) {
    const b = Number(src.tokenBudget);
    if (!Number.isFinite(b)) errors.push('tokenBudget must be a number');
    else value.tokenBudget = Math.trunc(clamp(b, 100, 5000));
  }

  const list = (key, allowed, label) => {
    if (!has(key)) return;
    if (!Array.isArray(src[key])) {
      errors.push(`${key} must be an array`);
      return;
    }
    const items = src[key].map((v) => String(v));
    const bad = allowed ? items.filter((v) => !allowed.includes(v)) : [];
    if (bad.length) errors.push(`${key} has unknown ${label}: ${bad.join(', ')}`);
    else value[key] = items;
  };

  list('draftTypes', DRAFT_TYPES, 'draft types');
  list('knowledgeFamilies', KNOWLEDGE_FAMILIES, 'knowledge families');
  list('excludeStatuses', null, 'statuses');

  if (has('preamble')) {
    const p = String(src.preamble);
    if (p.length > 2000) errors.push('preamble must be 2000 characters or fewer');
    else value.preamble = p;
  }

  return { valid: errors.length === 0, errors, value };
}

/**
 * Applies defaults to a validated connector.
 *
 * @param {Object} value
 * @returns {Object}
 */
function withDefaults(value) {
  return { ...DEFAULTS, ...value };
}

/**
 * Builds the text that introduces this connector's section in the prompt.
 *
 * The category guard always comes first and cannot be removed by configuration.
 * A custom preamble is additional wording, never a replacement.
 *
 * @param {Object} connector
 * @returns {string}
 */
function buildPreamble(connector) {
  const guard = CATEGORY_GUARDS[connector && connector.category];
  const custom = (connector && connector.preamble) ? String(connector.preamble).trim() : '';
  return [guard, custom].filter(Boolean).join(' ');
}

module.exports = {
  DEFAULTS,
  DRAFT_TYPES,
  KNOWLEDGE_FAMILIES,
  CATEGORY_GUARDS,
  CATEGORY_PATTERN,
  validateConnector,
  withDefaults,
  buildPreamble
};
