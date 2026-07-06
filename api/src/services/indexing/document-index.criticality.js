'use strict';
/**
 * DocumentIndexCriticality — configurable, AI-extendable action-criticality policy.
 *
 * Every remediation action (whether proposed by the deterministic engine or the
 * Claude Code responder) is rated for criticality. Actions at/under the
 * auto-apply ceiling are executed autonomously; anything above is escalated to a
 * human admin for approval on the dashboard.
 *
 * The policy is persisted as JSON and can be edited by the admin OR extended by
 * the AI at runtime (new action types, new response methodologies, tuned
 * thresholds) — this is what lets the response strategy adapt "on the fly".
 */

const fs = require('fs');
const path = require('path');

const DIR  = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const FILE = path.join(DIR, 'criticality-policy.json');

// Criticality scale: 0 (trivial) … 100 (dangerous). Auto-apply ceiling gates
// autonomous execution; above it → escalate for admin approval.
const DEFAULT_POLICY = {
  autoApplyMaxCriticality: 40,
  actions: {
    notify_admin:       { criticality: 5,  label: 'Notify admin (escalation only)', safe: true,  reversible: true },
    extend_policy:      { criticality: 15, label: 'AI tunes its own response policy', safe: true, reversible: true },
    set_backoff:        { criticality: 20, label: 'Apply temporary backoff to a source', safe: true, reversible: true },
    pause_source:       { criticality: 20, label: 'Quarantine a source temporarily', safe: true, reversible: true },
    resume_source:      { criticality: 25, label: 'Lift quarantine/backoff for a source', safe: true, reversible: true },
    reindex_source:     { criticality: 30, label: 'Reset cursor & re-harvest a source', safe: true, reversible: true },
    adjust_concurrency: { criticality: 35, label: 'Change number of indexing workers', safe: true, reversible: true },
    enable_source:      { criticality: 50, label: 'Enable a disabled source', safe: false, reversible: true },
    set_source_headers: { criticality: 55, label: 'Set request headers/User-Agent for a source', safe: false, reversible: true },
    set_source_config:  { criticality: 70, label: 'Change source config (URL/template/auth)', safe: false, reversible: true },
    disable_source:     { criticality: 75, label: 'Disable a source entirely', safe: false, reversible: true },
  },
  // Free-form response methodologies the AI can append to (institutional memory).
  methodologies: [],
  updatedAt: null,
  updatedBy: 'default',
};

let policy = null;

function ensureDir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ } }

function load() {
  if (policy) return policy;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Merge onto defaults so newly-shipped action types are always present.
    policy = {
      ...DEFAULT_POLICY,
      ...raw,
      actions: { ...DEFAULT_POLICY.actions, ...(raw.actions || {}) },
      methodologies: raw.methodologies || [],
    };
  } catch {
    policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  }
  return policy;
}

function persist() {
  ensureDir();
  try { fs.writeFileSync(FILE, JSON.stringify(policy, null, 2)); } catch { /* best-effort */ }
}

function getPolicy() { return load(); }

/** Numeric criticality for an action. An explicit action.criticality wins (clamped). */
function rate(action = {}) {
  const p = load();
  if (Number.isFinite(action.criticality)) return Math.max(0, Math.min(100, action.criticality));
  const def = p.actions[action.type];
  if (def && Number.isFinite(def.criticality)) return def.criticality;
  return 85; // unknown action type → escalate by default
}

function isAutoApplicable(action = {}) {
  const p = load();
  return rate(action) <= p.autoApplyMaxCriticality;
}

/**
 * Merge a patch into the policy (admin edit OR AI extend_policy).
 * @param {Object} patch { autoApplyMaxCriticality?, actions?, methodologies?(append) }
 */
function updatePolicy(patch = {}, by = 'admin') {
  const p = load();
  if (Number.isFinite(patch.autoApplyMaxCriticality)) {
    p.autoApplyMaxCriticality = Math.max(0, Math.min(100, patch.autoApplyMaxCriticality));
  }
  if (patch.actions && typeof patch.actions === 'object') {
    for (const [k, v] of Object.entries(patch.actions)) {
      p.actions[k] = { ...(p.actions[k] || {}), ...v };
    }
  }
  if (Array.isArray(patch.methodologies)) {
    for (const m of patch.methodologies) {
      p.methodologies.push({ at: nowIso(), by, note: String(m).slice(0, 2000) });
    }
  } else if (patch.methodology) {
    p.methodologies.push({ at: nowIso(), by, note: String(patch.methodology).slice(0, 2000) });
  }
  p.updatedAt = nowIso();
  p.updatedBy = by;
  persist();
  return p;
}

function nowIso() { return new Date().toISOString(); }

module.exports = { getPolicy, rate, isAutoApplicable, updatePolicy, FILE };
