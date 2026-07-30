'use strict';

/**
 * Hand-off from the chat to Altiora's own request form.
 *
 * The chat collects the whole schema conversationally, then hands control to
 * `CreateRequestWizard`, which opens as a modal prefilled with what was gathered. That
 * hand-off is one-way by design: the wizard is a dialog whose only exits are submit or
 * cancel, so the user is warned first — after it opens, AI-assisted filling is over.
 *
 * Two pure helpers live here so both are testable without the engine:
 *   draftToInitialFormData – DraftSR → the wizard's `initialFormData` shape
 *   postSubmitServices     – the "what else can I help with" menu shown after submit
 *
 * @module instances/flowdesk/interpreter/form-handoff
 */

const { isAutofillCascadeSlot, autofillHandledByForm } = require('./cascade-resolver');

/**
 * DraftSR → the wizard's `initialFormData`.
 *
 * Schema answers travel under `dynamicData`, keyed by the ORIGINAL Altiora field id —
 * the materializer already recorded that correspondence in
 * `snapshot.metadata.fieldIdMapping`, so no second mapping mechanism is needed.
 *
 * Directory-resolved slots hold an object; the wizard's own fields expect the same
 * shape it would have produced, so objects pass through untouched and only scalars are
 * stringified where the form expects text.
 *
 * @param {Object} draft     DraftSR
 * @param {Object} snapshot  SchemaSnapshot (carries metadata.fieldIdMapping)
 * @returns {Object} initialFormData for CreateRequestWizard
 */
function draftToInitialFormData(draft, snapshot) {
  const mapping = (snapshot && snapshot.metadata && snapshot.metadata.fieldIdMapping) || {};
  const slots = (draft && draft.slots) || {};
  const bySlotId = new Map(((snapshot && snapshot.slots) || []).map((s) => [s.slotId, s]));

  const dynamicData = {};
  for (const [slotId, sv] of Object.entries(slots)) {
    if (!sv || sv.value === undefined || sv.value === null || sv.value === '') continue;
    // Autofill cascade fields: in the default 'wizard' gate the Altiora form resolves
    // them from its own dictionary lookup and discards anything we send, so passing them
    // is pointless (and would mask a mismatch) — leave them out. In 'agent' gate the chat
    // resolved them itself, so carry the values into the form.
    if (isAutofillCascadeSlot(bySlotId.get(slotId)) && autofillHandledByForm()) continue;
    const fieldId = mapping[slotId];
    if (!fieldId) continue; // platform-only slot (beneficiary/location) — carried below
    // A multi-select is stored as an array; Altiora's form reads it as a JSON string
    // (DynamicForm.parseChecklistValue), which is exactly what the submit path emits.
    dynamicData[fieldId] = Array.isArray(sv.value) ? JSON.stringify(sv.value) : sv.value;
  }

  const out = { dynamicData };

  // The wizard's step 1 has its OWN request-level fields (title / description) that are
  // NOT part of the schema, so nothing in dynamicData ever reaches them — they render
  // blank unless seeded here. Title defaults to the service name (a meaningful
  // "Request Title"); a description is carried only if the chat gathered one.
  if (snapshot && snapshot.metadata && snapshot.metadata.title) out.title = snapshot.metadata.title;
  const desc = slots.description && slots.description.value;
  if (desc && typeof desc === 'string' && desc.trim()) out.description = desc.trim();

  // The universal context slots the interpreter collects for every service map onto the
  // wizard's own step-1 fields rather than onto schema fields.
  const bene = slots.beneficiary && slots.beneficiary.value;
  const author = slots.author && slots.author.value;
  if (bene) {
    // The resolver stamps the current user with mode:'self'; the request is also for
    // self when the beneficiary resolves to the very user who is raising it (same
    // userId as the author). Either way the wizard wants beneficiary:'self', NOT an
    // 'other' + a beneficiaryUser echoing the requester — which is what a naive
    // "it's an object, so it's someone else" reading produced.
    const beneId = typeof bene === 'object' ? (bene.userId || bene.id) : null;
    const authorId = author && typeof author === 'object' ? (author.userId || author.id) : null;
    const isSelf = String(bene) === 'self'
      || (typeof bene === 'object' && bene.mode === 'self')
      || (beneId && authorId && String(beneId) === String(authorId));
    if (isSelf) {
      out.beneficiary = 'self';
    } else if (beneId) {
      out.beneficiary = 'other';
      // The wizard keys the submitted beneficiary off `.id`; our directory object uses
      // `userId`, so mirror it (keeping the rest for display).
      out.beneficiaryUser = { ...bene, id: bene.id || bene.userId };
    }
  }
  const loc = slots.location && slots.location.value;
  if (loc && typeof loc === 'object') out.location = loc;

  // The authorizer: the wizard keys the manual approver off `.id` and mirrors it into
  // `manualApproverUserId` — feed both so its needsApproval path is pre-filled rather
  // than left to auto-resolution.
  const appr = slots.manualApprover && slots.manualApprover.value;
  if (appr && typeof appr === 'object') {
    const aid = appr.id || appr.userId;
    out.manualApprover = { ...appr, id: aid };
    if (aid) out.manualApproverUserId = aid;
  }

  // Colleagues given read-only visibility → the wizard's MultiEmployeeSelector, an array
  // of directory users keyed by `.id`.
  const shared = slots.sharedWith && slots.sharedWith.value;
  if (Array.isArray(shared) && shared.length) {
    out.sharedWith = shared.map((u) => (u && typeof u === 'object' ? { ...u, id: u.id || u.userId } : u));
  }

  return out;
}

/**
 * The menu offered once a request has been created: what the assistant can do next.
 *
 * Deliberately a short showcase rather than every routable intent — field help and
 * navigation arise from context rather than from a menu, and tasks/mail are adjacent
 * integrations rather than core offers. Approvals appear only for users who may act.
 *
 * @param {Object} S            localized ui strings bundle
 * @param {boolean} canApprove  whether the acting user is ACT-authorized
 * @returns {Array} controls[] with a single choice control
 */
function postSubmitServices(S, canApprove) {
  const options = [
    { value: 'NEW_INTENT', label: S.services.newRequest },
    { value: 'INFO_QUESTION', label: S.services.findInfo },
    { value: 'MY_REQUESTS', label: S.services.myRequests },
    { value: 'CATALOG_BROWSE', label: S.services.catalog },
  ];
  if (canApprove) options.push({ value: 'ACT_APPROVE', label: S.services.approvals });
  return [{ id: 'ctrl-services', type: 'choice', slotId: '__services__', options }];
}

module.exports = { draftToInitialFormData, postSubmitServices };
