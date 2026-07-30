'use strict';

/**
 * AltioraApprovalService (P9-006) — the chat's APPROVE / REJECT capability over
 * Altiora's approval queue. Like AltioraTicketService (submit), this is a REAL
 * side-effecting write into the ITSM of record, so the interpreter gates it with
 * ACT authorization (checkAct + a live acting token) BEFORE calling here — this
 * service does the HTTP, not the governance.
 *
 * Endpoints (P9-000 recon §1, AuthorizationsController.cs):
 *   GET  /api/authorizations/pending            — items awaiting THIS user's
 *        decision (auto-scoped to the acting bearer). The only reliable way to
 *        know the user is an approver AND to map a human ticket number → the
 *        integer authorization-record id the decision endpoint needs.
 *   POST /api/authorizations/{id}/decision      — AuthorizationDecisionDto
 *        { Status: 'Approved' | 'Denied', Justification }. Server-gated by
 *        CanUserApproveAsync → 403 if not the approver; Justification is
 *        MANDATORY on 'Denied'; 400 if the item was already processed.
 *
 * Identity: runs under the acting-user bearer (via the default AltioraClient) so
 * the decision is recorded as the real approver. The ACT gate upstream forbids the
 * service-account fallback for this action.
 *
 * The client collapses 401 AND 403 into AltioraAuthError; we re-key a 403 to a
 * distinct NOT_APPROVER code here so the chat can say "you're not the approver"
 * rather than "session expired".
 *
 * @module instances/flowdesk/services/altiora-approval.service
 */

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };
const named = (o) => pick(o || {}, ['name', 'Name', 'displayName', 'DisplayName', 'fullName', 'FullName']);

/** Altiora authorization record → the compact shape the chat matches + confirms against. */
function mapAuthorization(a = {}) {
  return {
    authorizationId: pick(a, ['id', 'Id', 'authorizationId', 'AuthorizationId']),
    ticketNumber: pick(a, ['rfsNumber', 'RfsNumber', 'ticketNumber', 'TicketNumber']),
    ticketId: pick(a, ['ticketId', 'TicketId']),
    title: pick(a, ['title', 'Title', 'subject', 'Subject', 'serviceName', 'ServiceName']),
    requester: named(pick(a, ['requester', 'Requester'])) || pick(a, ['requesterName', 'RequesterName']),
    status: pick(a, ['status', 'Status']),
    createdAt: pick(a, ['createdAt', 'CreatedAt', 'requestedAt', 'RequestedAt']),
  };
}

class ApprovalError extends Error {
  constructor(message, code) { super(message); this.name = 'ApprovalError'; this.code = code; }
}

function createAltioraApprovalService(deps = {}) {
  const clientOf = () => deps.client || require('./altiora-client').getAltioraClient();

  /** The acting user's pending approval queue (mapped, acting-user scoped). */
  async function getPendingAuthorizations() {
    const res = await clientOf().get('/api/authorizations/pending');
    const items = Array.isArray(res) ? res : (pick(res, ['items', 'Items']) || []);
    return items.map(mapAuthorization);
  }

  /**
   * Find the single pending authorization matching a human ticket number. Returns
   * the mapped item, or null if it is not in the user's queue (⇒ nothing to approve
   * / not the approver — the caller decides the message). Ambiguous suffix matches
   * are treated as no-match (the caller then offers the queue to pick from).
   */
  async function findByTicket(ticketNumber) {
    const norm = String(ticketNumber || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!norm) return null;
    const items = await getPendingAuthorizations();
    const exact = items.filter((a) => String(a.ticketNumber || '').toUpperCase() === norm);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    const suffix = items.filter((a) => String(a.ticketNumber || '').toUpperCase().endsWith(norm));
    return suffix.length === 1 ? suffix[0] : null;
  }

  /**
   * Post an approve/reject decision. `decision` is our verb ('approve'|'reject');
   * it maps to Altiora's Status ('Approved'|'Denied'). Justification is required to
   * reject (enforced here AND by Altiora).
   * @returns {Promise<{ok:true, authorizationId, decision:'Approved'|'Denied'}>}
   * @throws  ApprovalError('JUSTIFICATION_REQUIRED') | ApprovalError('NOT_APPROVER')
   *          | ApprovalError('ALREADY_PROCESSED') | the underlying AltioraError.
   */
  async function submitDecision(authorizationId, decision, justification = null) {
    if (authorizationId == null || authorizationId === '') throw new ApprovalError('missing authorization id', 'MISSING_ID');
    const Status = String(decision).toLowerCase() === 'reject' ? 'Denied' : 'Approved';
    const just = justification == null ? null : String(justification).trim();
    if (Status === 'Denied' && !just) throw new ApprovalError('a justification is required to reject', 'JUSTIFICATION_REQUIRED');

    try {
      await clientOf().post(`/api/authorizations/${encodeURIComponent(authorizationId)}/decision`,
        { Status, Justification: just }, { timeoutMs: 30000 });
      return { ok: true, authorizationId, decision: Status };
    } catch (err) {
      // The client collapses 401/403; re-key a 403 (not the approver) distinctly.
      if (err && err.status === 403) throw new ApprovalError('you are not the approver for this item', 'NOT_APPROVER');
      if (err && err.status === 400) throw new ApprovalError('this item has already been processed', 'ALREADY_PROCESSED');
      throw err;
    }
  }

  return { getPendingAuthorizations, findByTicket, submitDecision, mapAuthorization };
}

let _default;
function getAltioraApprovalService() {
  if (!_default) _default = createAltioraApprovalService();
  return _default;
}

module.exports = { createAltioraApprovalService, getAltioraApprovalService, mapAuthorization, ApprovalError };
