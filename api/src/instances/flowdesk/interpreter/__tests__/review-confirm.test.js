'use strict';

/**
 * Confirm-form review: a grouped, labelled, tabular summary of collected values
 * with per-field editability, and the ✎ edit-button flow.
 */

const { buildReview, createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

// Snapshot with a reference-derived (dictRef) slot + an enum, for buildReview and
// the edit-refusal path.
const SNAP = {
  serviceId: 'SVC-REVIEW', version: 1, phases: ['detail'],
  metadata: { title: 'Extension Request', approvalRequired: false },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', section: 'staffMemberInformation', promptHint: 'Index Number' },
    { slotId: 'grade', type: 'string', required: false, phase: 'detail', section: 'staffMemberInformation', promptHint: 'Grade', dictRef: { filters: [{ slotId: 'indexNumber' }] } },
    { slotId: 'reason', type: 'text', required: true, phase: 'detail', section: 'extensionDetails', promptHint: 'Reason for the Request' },
    { slotId: 'fundingSource', type: 'enum', required: true, phase: 'detail', section: 'fundingInformation', promptHint: 'Funding Source', presentOptions: [{ value: 'RB', label: 'Regular Budget' }, { value: 'XB', label: 'Extra-budgetary' }] },
  ],
};

// All-plain snapshot that a single message can complete (to reach confirm_form),
// with a FILLED dependent (priorExpiry dependsOn indexNumber) for the cascade note.
const SNAP_PLAIN = {
  serviceId: 'SVC-PLAIN', version: 1, phases: ['detail'],
  metadata: { title: 'Extension Request', approvalRequired: false },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', section: 'staffMemberInformation', promptHint: 'Index Number' },
    { slotId: 'priorExpiry', type: 'string', required: false, phase: 'detail', section: 'staffMemberInformation', promptHint: 'Prior Expiry', dependsOn: ['indexNumber'] },
    { slotId: 'reason', type: 'text', required: true, phase: 'detail', section: 'extensionDetails', promptHint: 'Reason for the Request' },
    { slotId: 'fundingSource', type: 'enum', required: true, phase: 'detail', section: 'fundingInformation', promptHint: 'Funding Source', presentOptions: [{ value: 'RB', label: 'Regular Budget' }, { value: 'XB', label: 'Extra-budgetary' }] },
  ],
};

function draftWith(serviceId, values) {
  const slots = {};
  for (const [k, v] of Object.entries(values)) slots[k] = { value: v, provenance: 'extracted' };
  return { serviceId, slots };
}

describe('buildReview — grouped, labelled, editable', () => {
  const review = buildReview(
    draftWith('SVC-REVIEW', { indexNumber: '12345678', grade: 'P-4', reason: 'Programme continuity', fundingSource: 'RB' }),
    SNAP,
  );

  test('rows are grouped by Altiora section with a humanized heading', () => {
    expect(review.title).toBe('Extension Request');
    expect(review.groups.map((g) => g.label)).toEqual(['Staff Member Information', 'Extension Details', 'Funding Information']);
  });

  test('each row uses the English field label (promptHint) and a display value', () => {
    const staff = review.groups[0].rows;
    expect(staff.find((r) => r.slotId === 'indexNumber')).toMatchObject({ label: 'Index Number', display: '12345678' });
    expect(review.groups[1].rows[0]).toMatchObject({ slotId: 'reason', label: 'Reason for the Request', display: 'Programme continuity' });
  });

  test('reference-derived (dictRef) values are NOT editable; plain/enum values are', () => {
    const grade = review.groups[0].rows.find((r) => r.slotId === 'grade');
    const index = review.groups[0].rows.find((r) => r.slotId === 'indexNumber');
    const funding = review.groups[2].rows.find((r) => r.slotId === 'fundingSource');
    expect(grade.editable).toBe(false);
    expect(index.editable).toBe(true);
    expect(funding.editable).toBe(true);
  });

  test('slots with no value are omitted', () => {
    const r2 = buildReview(draftWith('SVC-REVIEW', { indexNumber: '1' }), SNAP);
    expect(r2.groups.flatMap((g) => g.rows.map((x) => x.slotId))).toEqual(['indexNumber']);
  });
});

function makeEngine(snap) {
  const loadSnapshot = async (id) => (id === snap.serviceId ? snap : null);
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties?.route) return { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' };
      if (schema.properties?.serviceIntent) return { serviceIntent: 'extension request', pairs: [] };
      const m = (prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '';
      const p = schema.properties || {}; const out = {};
      if (p.indexNumber && /12345678/.test(m)) out.indexNumber = '12345678';
      if (p.priorExpiry && /2025-12-31/.test(m)) out.priorExpiry = '2025-12-31';
      if (p.reason && /continuity/.test(m)) out.reason = 'Programme continuity';
      if (p.fundingSource && /regular budget|\brb\b/i.test(m)) out.fundingSource = 'RB';
      return out;
    },
    completion: () => 'What is the value?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: snap.serviceId, title: snap.metadata.title, schemaRef: { serviceId: snap.serviceId, version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, fetchLovValues: async () => [] });
}

const FULL_MSG = 'Extension request, index number 12345678, prior expiry 2025-12-31, reason continuity, funding Regular Budget';

describe('confirm-form review + ✎ edit button', () => {
  test('completing the fill emits a structured, grouped review', async () => {
    const engine = makeEngine(SNAP_PLAIN);
    await engine.runTurn({ sessionId: 'r1', lang: 'en', message: FULL_MSG });                                  // asks beneficiary
    await engine.runTurn({ sessionId: 'r1', lang: 'en', controlAction: { slotId: 'beneficiary', action: 'confirm' } }); // asks location
    const r = await engine.runTurn({ sessionId: 'r1', lang: 'en', controlAction: { slotId: 'location', action: 'confirm' } }); // → confirm_form
    expect(r.responseType).toBe('confirm_form');
    expect(r.review).toBeTruthy();
    // the three Altiora sections are present (a leading context "Details" group for
    // the injected beneficiary/location may also appear)
    const labels = r.review.groups.map((g) => g.label);
    expect(labels).toEqual(expect.arrayContaining(['Staff Member Information', 'Extension Details', 'Funding Information']));
    expect(r.review.groups.flatMap((g) => g.rows).find((x) => x.slotId === 'indexNumber').editable).toBe(true);
  });

  test('clicking ✎ on an editable field asks for a new value and steers onto that slot', async () => {
    const engine = makeEngine(SNAP_PLAIN);
    await engine.runTurn({ sessionId: 'r2', lang: 'en', message: FULL_MSG });
    const r = await engine.runTurn({ sessionId: 'r2', lang: 'en', controlAction: { slotId: 'reason', action: 'edit' } });
    expect(r.responseType).toBe('edit_which_value');
    expect(r.askingSlot).toBe('reason');
    expect(r.response).toMatch(/Reason for the Request/);
  });

  test('editing a cascade source warns that dependents must be re-entered', async () => {
    const engine = makeEngine(SNAP_PLAIN);
    await engine.runTurn({ sessionId: 'r3', lang: 'en', message: FULL_MSG });
    const r = await engine.runTurn({ sessionId: 'r3', lang: 'en', controlAction: { slotId: 'indexNumber', action: 'edit' } });
    expect(r.askingSlot).toBe('indexNumber');
    expect(r.response).toMatch(/re-enter|Prior Expiry/i);
  });

  test('✎ is refused for a reference-derived value (edit the source instead)', async () => {
    const engine = makeEngine(SNAP);
    await engine.runTurn({ sessionId: 'r4', lang: 'en', message: 'Extension request, index number 12345678' });
    const r = await engine.runTurn({ sessionId: 'r4', lang: 'en', controlAction: { slotId: 'grade', action: 'edit' } });
    expect(r.response).toMatch(/lookup|based on/i);
  });
});
