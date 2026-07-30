'use strict';

/**
 * ChatActionLog (Phase 9) — governance audit trail for chat-initiated ACTs
 * (submit / approve / reject). Mirrors `chat-telemetry.service.js`: dual
 * persistence (Memgraph `(:ChatSession)-[:HAS_ACTION_LOG]->(:ChatActionLog)` +
 * JSONL firehose), best-effort (an audit-write failure must NEVER break the
 * action), env-gated, injectable write for tests.
 *
 * Distinct label `:ChatActionLog` (namespace 'FlowDesk') so it never collides
 * with the CORE BackLog `:ActionLogEntry`. Field set follows the PO-approved
 * schema; `motivation` is first-class (Codex BA-060).
 *
 * @module instances/flowdesk/services/chat-action-log.service
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEXT_CAP = 4000;
const LOG_DIR = path.join(process.cwd(), 'logs', 'chat');

let _write = null;
function graphWrite(cypher, params) {
  if (!_write) _write = require('../schema-graph/driver').write;
  return _write(cypher, params);
}

function enabled() {
  return String(process.env.FLOWDESK_CHAT_TELEMETRY || 'true') !== 'false';
}
function cap(s) { const str = s == null ? null : String(s); return str && str.length > TEXT_CAP ? str.slice(0, TEXT_CAP) : str; }

let _dirReady = false;
function jsonlAppend(record) {
  try {
    if (!_dirReady) { fs.mkdirSync(LOG_DIR, { recursive: true }); _dirReady = true; }
    const date = new Date().toISOString().slice(0, 10);
    fs.appendFile(path.join(LOG_DIR, `action-log-${date}.jsonl`), JSON.stringify(record) + '\n', () => {});
  } catch { /* firehose is best-effort */ }
}

/**
 * Record one ACT audit entry (best-effort). Never throws.
 * @param {object} e
 * @param {string} e.sessionId
 * @param {string} [e.userId] @param {string} [e.userEmail] @param {string} [e.orgCode]
 * @param {string} [e.turnId]
 * @param {string} e.actionType  'SUBMIT_SR' | 'APPROVE_ITEM' | 'REJECT_ITEM'
 * @param {object} [e.actionParams]
 * @param {string} [e.targetLabel] @param {string} [e.targetId]
 * @param {string} [e.srNumber] @param {string} [e.ticketId]
 * @param {boolean} [e.confirmationShown] @param {boolean} [e.confirmationAccepted]
 * @param {string} e.status  'PENDING' | 'EXECUTED' | 'FAILED' | 'DENIED' | 'CANCELLED'
 * @param {object} [e.result] @param {string} [e.error]
 * @param {string} e.motivation
 * @returns {Promise<object>} the record (for tests)
 */
async function recordAction(e) {
  const record = {
    id: crypto.randomUUID(),
    nodeType: 'ChatActionLog',
    namespace: 'FlowDesk',
    ts: new Date().toISOString(),
    sessionId: e.sessionId || null,
    userId: e.userId || null,
    userEmail: e.userEmail || null,
    orgCode: e.orgCode || null,
    turnId: e.turnId || null,
    actionType: e.actionType || null,
    actionParamsJson: JSON.stringify(e.actionParams || {}),
    targetLabel: e.targetLabel || null,
    targetId: e.targetId || null,
    srNumber: e.srNumber || null,
    ticketId: e.ticketId || null,
    confirmationShown: !!e.confirmationShown,
    confirmationAccepted: !!e.confirmationAccepted,
    status: e.status || 'PENDING',
    resultJson: JSON.stringify(e.result || null),
    error: cap(e.error) || null,
    motivation: cap(e.motivation) || null,
  };

  if (!enabled()) return record;

  // Dual write, both best-effort — never let audit failure break the action.
  jsonlAppend(record);
  try {
    await graphWrite(
      `MERGE (s:ChatSession {sessionId: $sessionId})
       CREATE (a:ChatActionLog $props)
       CREATE (s)-[:HAS_ACTION_LOG {addedAt: $ts}]->(a)`,
      { sessionId: record.sessionId, ts: record.ts, props: record },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[chat-action-log] graph write failed (non-fatal): ${err.message}`);
  }
  return record;
}

/** Fetch the audit trail for a session (admin/tests). */
async function getBySession(sessionId) {
  const { read } = require('../schema-graph/driver');
  const recs = await read(
    `MATCH (:ChatSession {sessionId: $sessionId})-[:HAS_ACTION_LOG]->(a:ChatActionLog)
     RETURN a ORDER BY a.ts`, { sessionId },
  );
  return recs.map((r) => r.get('a').properties);
}

/** Test seam. */
function _setDeps({ write } = {}) { if (write) _write = write; }
function _reset() { _write = null; }

module.exports = { recordAction, getBySession, _setDeps, _reset };
