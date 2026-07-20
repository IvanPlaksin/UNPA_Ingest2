'use strict';

/**
 * AltioraTicketService (I-7) — turns a completed DraftSR into a REAL Altiora
 * Service Request via `POST /api/tickets`. This is where the chat stops being a
 * self-contained demo and starts writing into the ITSM of record.
 *
 * The load-bearing detail: Altiora's `FormDataJson` must be keyed by the ORIGINAL
 * Altiora field ids (`field_1781818874087`), not our readable slotIds. The
 * dialogue needs slotIds; Altiora needs its own ids; the bridge is the
 * `metadata.fieldIdMapping` the schema materializer (I-4) stamped onto the
 * snapshot precisely for this moment. Posting slotIds would produce a ticket whose
 * form data Altiora cannot render or route.
 *
 * Acting identity (spec §13, ratified): in-turn submit acts as the END USER (their
 * proxy-forwarded bearer), so the ticket is created by its own requester and no
 * `HelpdeskExecute` is needed. `RequesterId` is only set for a genuine on-behalf
 * submit (beneficiary ≠ actor), which DOES require that role. Absent an acting
 * user (a smoke test hitting the chat directly, no proxy), the client falls back
 * to the service account — fine for dev verification.
 *
 * POST is never retried by AltioraClient (duplicate-ticket risk); this service
 * relies on that and never re-posts on its own.
 *
 * @module instances/flowdesk/services/altiora-ticket.service
 */

const SUBJECT_HINT = /subject|title|summary|topic/i;
const DESCRIPTION_HINT = /descr|detail|notes|comment|reason|justif/i;

/** A slot value coming from a directory resolver is an object; scalars pass through. */
function scalar(v) {
  if (v && typeof v === 'object') return v.name || v.label || v.value || v.id || v.userId || JSON.stringify(v);
  return v;
}

/** DraftSR.slots → Altiora FormDataJson, keyed by the ORIGINAL Altiora field ids. */
function buildFormData(draft, snapshot) {
  const mapping = (snapshot.metadata && snapshot.metadata.fieldIdMapping) || {};
  const out = {};
  for (const [slotId, sv] of Object.entries(draft.slots || {})) {
    if (!sv || sv.value === undefined || sv.value === null || sv.value === '') continue;
    const altioraId = mapping[slotId];
    if (!altioraId) continue; // slot not part of the Altiora form (e.g. a resolver-only slot)
    out[altioraId] = scalar(sv.value);
  }
  return out;
}

/** Pick a human Title/Description from the filled slots, falling back to the service name. */
function deriveTitleDescription(draft, snapshot) {
  const title = snapshot.metadata.title || draft.serviceId;
  let subject = null;
  let description = null;
  for (const slot of snapshot.slots) {
    const sv = draft.slots[slot.slotId];
    if (!sv || sv.value === undefined || sv.value === null || sv.value === '') continue;
    const val = scalar(sv.value);
    if (!subject && SUBJECT_HINT.test(slot.slotId)) subject = val;
    if (!description && DESCRIPTION_HINT.test(slot.slotId)) description = val;
  }
  return {
    Title: String(subject || title).slice(0, 200),
    Description: String(description || subject || title).slice(0, 2000),
  };
}

/**
 * DraftSR → CreateTicketDto (spec §8). Only fields we can populate are included —
 * Altiora treats absent optional fields sensibly, and sending nulls it does not
 * expect is a good way to trip its 400 path.
 */
function mapDraftToTicketDto(draft, snapshot, actingUser) {
  const ousId = snapshot.metadata && snapshot.metadata.altioraOusId;
  const { Title, Description } = deriveTitleDescription(draft, snapshot);

  const dto = {
    Title,
    Description,
    ServiceCode: draft.serviceId,          // catalog code, e.g. EO-HR-SA-SS-ISP
    OrganizationUnitServiceId: ousId,      // the distribution key the form hangs off
    FormDataJson: JSON.stringify(buildFormData(draft, snapshot)),
    Status: 'New',
  };

  // Beneficiary: a resolved directory user in a beneficiary/for-whom slot.
  const beneSlot = draft.slots.beneficiary || draft.slots.forWhom || draft.slots.employee;
  const beneId = beneSlot && beneSlot.value && (beneSlot.value.userId || beneSlot.value.id);
  const actorId = actingUser && (actingUser.userId || actingUser.id);
  if (beneId && beneId !== actorId) {
    dto.BeneficiaryId = beneId;
    if (actorId) dto.RequesterId = actorId; // genuine on-behalf → needs HelpdeskExecute
  }

  // Location: a resolved duty station, if the form gathered one.
  const locSlot = draft.slots.location || draft.slots.dutyStation || draft.slots.facility;
  const dsId = locSlot && locSlot.value && (locSlot.value.dutyStationId || locSlot.value.code || locSlot.value.id);
  if (dsId != null) dto.DutyStationId = dsId;

  // Approver: only when the form resolved one (no approval services in dev yet).
  const apprSlot = draft.slots.approver;
  const apprId = apprSlot && apprSlot.value && (apprSlot.value.userId || apprSlot.value.id);
  if (apprId) dto.ManualApproverUserId = apprId;

  return dto;
}

/**
 * @param {Object} [deps]
 * @param {Object} [deps.client]        - AltioraClient (default: acting-user-bound singleton)
 * @param {Function} [deps.getActingUser]
 */
function createAltioraTicketService(deps = {}) {
  const getUser = deps.getActingUser || require('./acting-user.context').getActingUser;
  const clientOf = () => deps.client || require('./altiora-client').getAltioraClient();

  /**
   * Create the Altiora ticket for a completed draft.
   * @returns {Promise<{srNumber, ticketId, status, altiora:true}>}
   * @throws  AltioraValidationError (400) / AltioraAuthError (401/403) / AltioraServerError (5xx),
   *          each preserving Altiora's `{ErrorCode, ClientErrorCode, Message}` body.
   */
  async function createTicket(draft, snapshot) {
    if (!(snapshot.metadata && snapshot.metadata.altioraOusId)) {
      throw new Error('[altiora-ticket] snapshot is not Altiora-backed (no altioraOusId) — cannot submit to Altiora');
    }
    const dto = mapDraftToTicketDto(draft, snapshot, getUser());
    // Ticket creation is a heavy write on Altiora's side (insert + workflow task
    // generation + SignalR broadcast) and routinely exceeds the client's 15s
    // default. Since POST is never retried (duplicate-ticket risk), a premature
    // client timeout would surface an error to the user for a ticket that WAS
    // created — so wait longer for the real response.
    const res = await clientOf().post('/api/tickets', dto, { timeoutMs: 60000 });
    const t = res || {};
    return {
      srNumber: t.ticketNumber || t.TicketNumber || null,
      ticketId: t.ticketId || t.TicketId || null,
      status: t.status || t.Status || 'New',
      altiora: true,
    };
  }

  return { createTicket, mapDraftToTicketDto, buildFormData };
}

let _default;
function getAltioraTicketService() {
  if (!_default) _default = createAltioraTicketService();
  return _default;
}

module.exports = {
  createAltioraTicketService,
  getAltioraTicketService,
  mapDraftToTicketDto,
  buildFormData,
  deriveTitleDescription,
};
