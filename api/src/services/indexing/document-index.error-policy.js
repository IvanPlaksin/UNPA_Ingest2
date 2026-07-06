'use strict';
/**
 * DocumentIndexErrorPolicy — deterministic error taxonomy + response methodology.
 *
 * Every harvest/enrich failure is classified into a stable CATEGORY, and each
 * category carries a documented RESPONSE METHODOLOGY (what the system should do)
 * plus a default severity. This is the deterministic layer the circuit breaker,
 * the incident engine and the AI responder all build on — the AI can extend the
 * response methodology at runtime (see document-index.criticality), but the base
 * classification stays fast and dependency-free.
 */

// Ordered categories — first match wins in classify().
const CATEGORIES = {
  CONFIG_MISSING: {
    id: 'CONFIG_MISSING',
    label: 'Configuration missing',
    severity: 'high',
    transient: false,
    methodology:
      'Non-transient: the adapter has no URL/endpoint/credentials configured. ' +
      'Retrying is pointless — quarantine the source immediately (long cooldown) ' +
      'and escalate for a config fix (set the source URL / template / auth).',
    defaultAction: 'quarantine_long',
  },
  ACCESS_BLOCKED: {
    id: 'ACCESS_BLOCKED',
    label: 'Access blocked (401/403/WAF)',
    severity: 'high',
    transient: false,
    methodology:
      'The remote refuses the request (auth required, forbidden, or WAF/bot ' +
      'challenge). Back off, retry with browser-like headers; if it persists, ' +
      'quarantine and escalate (needs credentials, headers, or an allow-list).',
    defaultAction: 'backoff_then_quarantine',
  },
  RATE_LIMITED: {
    id: 'RATE_LIMITED',
    label: 'Rate limited (429/503/202)',
    severity: 'medium',
    transient: true,
    methodology:
      'The remote is throttling us. Apply exponential backoff and resume later; ' +
      'consider lowering per-source concurrency. Self-heals — no escalation ' +
      'unless it never clears.',
    defaultAction: 'backoff_exponential',
  },
  NOT_FOUND: {
    id: 'NOT_FOUND',
    label: 'Not found (404)',
    severity: 'low',
    transient: false,
    methodology:
      'The page/endpoint does not exist — usually the end of pagination or a ' +
      'moved path. Treat as end-of-source (mark complete); escalate only if it ' +
      'happens on page 1 (broken endpoint).',
    defaultAction: 'mark_complete',
  },
  NETWORK: {
    id: 'NETWORK',
    label: 'Network / timeout',
    severity: 'medium',
    transient: true,
    methodology:
      'Transient connectivity failure (timeout, reset, DNS). Short backoff and ' +
      'retry; self-heals. Escalate only on a sustained spike (source or local ' +
      'network down).',
    defaultAction: 'backoff_short',
  },
  SERVER_ERROR: {
    id: 'SERVER_ERROR',
    label: 'Remote server error (5xx)',
    severity: 'medium',
    transient: true,
    methodology:
      'The remote is failing (500/502/504). Back off and retry later; usually ' +
      'transient on their side.',
    defaultAction: 'backoff_exponential',
  },
  PARSE_ERROR: {
    id: 'PARSE_ERROR',
    label: 'Parse / adapter error',
    severity: 'medium',
    transient: false,
    methodology:
      'The response could not be parsed (unexpected format, schema drift). ' +
      'Likely an adapter bug or a changed remote format — quarantine and ' +
      'escalate for an adapter fix.',
    defaultAction: 'backoff_then_quarantine',
  },
  UNKNOWN: {
    id: 'UNKNOWN',
    label: 'Unclassified',
    severity: 'low',
    transient: true,
    methodology: 'Unrecognized failure. Apply a default short backoff and observe; ' +
      'escalate if it clusters on one source.',
    defaultAction: 'backoff_short',
  },
};

/**
 * Classify a telemetry error entry (or a raw {status, message}) into a category id.
 */
function classify(entry = {}) {
  const status = entry.status;
  const m = String(entry.message || '').toLowerCase();

  if (/url not configured|not configured|missing url|no url|missing endpoint|no endpoint/.test(m)) return 'CONFIG_MISSING';
  if (status === 401 || status === 403 || /forbidden|unauthorized|waf|challenge|access denied|captcha/.test(m)) return 'ACCESS_BLOCKED';
  if (status === 429 || status === 503 || status === 202 || /rate.?limit|too many requests|throttl/.test(m)) return 'RATE_LIMITED';
  if (status === 404 || /\bnot found\b|404/.test(m)) return 'NOT_FOUND';
  if (status === 500 || status === 502 || status === 504 || /internal server error|bad gateway|gateway timeout/.test(m)) return 'SERVER_ERROR';
  if (/timeout|etimedout|econnreset|econnrefused|enotfound|eai_again|socket hang up|network|dns/.test(m)) return 'NETWORK';
  if (/unexpected token|json|parse|cheerio|invalid xml|malformed|cannot read propert/.test(m)) return 'PARSE_ERROR';
  return 'UNKNOWN';
}

function categoryOf(entry) { return CATEGORIES[classify(entry)]; }

/** Aggregate a list of entries into per-category counts (+ methodology). */
function categorize(entries = []) {
  const counts = {};
  for (const e of entries) {
    const id = e.category || classify(e);
    counts[id] = (counts[id] || 0) + 1;
  }
  return Object.keys(CATEGORIES)
    .filter(id => counts[id])
    .map(id => ({
      id,
      label: CATEGORIES[id].label,
      severity: CATEGORIES[id].severity,
      methodology: CATEGORIES[id].methodology,
      defaultAction: CATEGORIES[id].defaultAction,
      count: counts[id],
    }))
    .sort((a, b) => b.count - a.count);
}

module.exports = { CATEGORIES, classify, categoryOf, categorize };
