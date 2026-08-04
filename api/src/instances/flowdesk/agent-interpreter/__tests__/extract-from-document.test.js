'use strict';

/**
 * DOC-2-002 — the extract_from_document tool.
 *
 * The load-bearing assertions are about what the tool REFUSES to do: it never
 * writes to the draft, it does not run without a chosen service, and one broken
 * document does not cost the user the values from a good one. The happy path is
 * the easy part.
 */

const { createAgentTools } = require('../agent-tools');

const SNAPSHOT = {
  serviceId: 'svc-travel',
  version: 3,
  metadata: { contentHash: 'abc123' },
  slots: [
    { slotId: 'beneficiary', type: 'directory', promptHint: 'Who is this for?' },
    { slotId: 'travelDate', type: 'date', promptHint: 'Date of travel' },
    { slotId: 'purpose', type: 'text', promptHint: 'Purpose' },
  ],
};

const ATT_PDF = {
  attachmentId: 'att-1', fileName: 'itinerary.pdf', contentType: 'application/pdf',
  size: 1000, canExtract: true, extractionStatus: 'pending', extractedData: null, extractedForSchema: null,
};

/** A store double that behaves like the real one for the fields this tool uses. */
function mkStore(initial = [ATT_PDF]) {
  const rows = initial.map((r) => ({ ...r }));
  const updates = [];
  return {
    rows,
    updates,
    STATUS: { PENDING: 'pending', DONE: 'done', FAILED: 'failed', SKIPPED: 'skipped' },
    getExtractable: async () => rows.filter((r) => r.canExtract),
    updateAttachment: async (sessionId, id, patch) => {
      updates.push({ id, patch });
      const i = rows.findIndex((r) => r.attachmentId === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch };
      return rows[i];
    },
  };
}

function mkTools({
  draft = { sessionId: 's1', serviceId: 'svc-travel' },
  snapshot = SNAPSHOT,
  store = mkStore(),
  token = 'user-tok',
  extractImpl,
  downloadImpl,
} = {}) {
  const downloads = [];
  const extracts = [];
  const draftWrites = [];

  const tools = createAgentTools({
    draftService: {
      get: async () => draft,
      update: async (...a) => { draftWrites.push(a); return draft; },
      create: async () => draft,
    },
    loadSnapshot: async () => snapshot,
    attachmentsStore: store,
    getActingToken: () => token,
    altioraClient: {
      downloadAttachment: async (t, id) => {
        downloads.push({ t, id });
        if (downloadImpl) return downloadImpl(t, id);
        return Buffer.from('%PDF-1.7');
      },
    },
    extraction: {
      schemaKey: (s) => `${s.serviceId}:${s.metadata?.contentHash || s.version}`,
      ExtractionError: class ExtractionError extends Error {
        constructor(code, message) { super(message); this.code = code; }
      },
      extractFromDocument: async (bytes, fileName, mime, snap) => {
        extracts.push({ fileName, mime });
        if (extractImpl) return extractImpl(fileName, snap);
        return {
          extracted: { travelDate: '2026-09-01' },
          confidence: { travelDate: 'high' },
          rejected: [],
        };
      },
    },
  });

  return { tools, downloads, extracts, draftWrites, store };
}

const CTX = { sessionId: 's1', session: {}, userId: 'u1', lang: 'en' };
const run = (tools, input = {}) => tools.execute('extract_from_document', input, CTX);

describe('DOC-2-002: it is registered as a tool', () => {
  test('appears in TOOL_SCHEMAS with an attachmentIds input', () => {
    const { tools } = mkTools();
    const schema = tools.TOOL_SCHEMAS.find((t) => t.name === 'extract_from_document');
    expect(schema).toBeDefined();
    expect(schema.input_schema.properties.attachmentIds.type).toBe('array');
    expect(schema.input_schema.required).toBeUndefined();   // reading everything is the default
  });

  test('its description tells the model the values are proposed, and names the order', () => {
    const { tools } = mkTools();
    const d = tools.TOOL_SCHEMAS.find((t) => t.name === 'extract_from_document').description;
    expect(d).toMatch(/PROPOSED, never recorded/);
    expect(d).toMatch(/emit_control/);
    expect(d).toMatch(/draft_update/);
    expect(d).toMatch(/service must already be chosen/i);
  });
});

describe('DOC-2-002: the happy path', () => {
  test('downloads, extracts and returns the values as a proposal', async () => {
    const { tools, downloads, extracts } = mkTools();

    const out = await run(tools);

    expect(out.ok).toBe(true);
    expect(out.extracted).toEqual({ travelDate: '2026-09-01' });
    expect(out.confidence).toEqual({ travelDate: 'high' });
    expect(out.sources).toEqual(['itinerary.pdf']);
    expect(downloads).toEqual([{ t: 'user-tok', id: 'att-1' }]);
    expect(extracts).toHaveLength(1);
  });

  test('NEVER writes to the draft — the instruction is to ask first', async () => {
    const { tools, draftWrites } = mkTools();
    const out = await run(tools);

    expect(draftWrites).toHaveLength(0);
    expect(out.tellUser).toMatch(/PROPOSED, not recorded/);
    expect(out.tellUser).toMatch(/emit_control/);
    expect(out.tellUser).toMatch(/draft_update only after the user agrees/);
  });

  test('stores the result against the form it was extracted for', async () => {
    const { tools, store } = mkTools();
    await run(tools);

    expect(store.updates).toHaveLength(1);
    expect(store.updates[0].patch).toMatchObject({
      extractionStatus: 'done',
      extractedForSchema: 'svc-travel:abc123',
      extractionError: null,
    });
    expect(store.updates[0].patch.extractedData.extracted).toEqual({ travelDate: '2026-09-01' });
  });

  test('a document with nothing in it says so instead of pretending', async () => {
    const { tools } = mkTools({
      extractImpl: () => ({ extracted: {}, confidence: {}, rejected: [] }),
    });
    const out = await run(tools);

    expect(out.ok).toBe(true);
    expect(out.extracted).toEqual({});
    expect(out.tellUser).toMatch(/did not contain any of the fields/i);
    expect(out.tellUser).toMatch(/carry on asking the user directly/i);
  });

  test('reads only the named attachments when told to', async () => {
    const store = mkStore([ATT_PDF, { ...ATT_PDF, attachmentId: 'att-2', fileName: 'other.pdf' }]);
    const { tools, extracts } = mkTools({ store });

    await run(tools, { attachmentIds: ['att-2'] });

    expect(extracts.map((e) => e.fileName)).toEqual(['other.pdf']);
  });
});

describe('DOC-2-002: prerequisites', () => {
  test('with no draft it refuses and tells the model to resolve the service first', async () => {
    const { tools, downloads } = mkTools({ draft: null });
    const out = await run(tools);

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no request in hand/i);
    expect(out.tellUser).toMatch(/ask what they need/i);
    expect(downloads).toHaveLength(0);
  });

  test('a draft without a service is the same refusal', async () => {
    const { tools } = mkTools({ draft: { sessionId: 's1' } });
    expect((await run(tools)).ok).toBe(false);
  });

  test('without an acting user it refuses rather than failing on the download', async () => {
    const { tools, downloads } = mkTools({ token: null });
    const out = await run(tools);

    expect(out.ok).toBe(false);
    expect(out.tellUser).toMatch(/session has expired/i);
    expect(downloads).toHaveLength(0);
  });

  test('with nothing readable attached it says what would work', async () => {
    const { tools } = mkTools({ store: mkStore([]) });
    const out = await run(tools);

    expect(out.ok).toBe(false);
    expect(out.tellUser).toMatch(/PDF or a photo/i);
  });

  test('a .docx-only session counts as nothing readable', async () => {
    // getExtractable already filters on canExtract; this is the tool honouring it.
    const store = mkStore([{ ...ATT_PDF, canExtract: false, fileName: 'form.docx' }]);
    const { tools } = mkTools({ store });
    expect((await run(tools)).ok).toBe(false);
  });

  test('unknown attachment ids are refused', async () => {
    const { tools } = mkTools();
    const out = await run(tools, { attachmentIds: ['nope'] });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not on this conversation/i);
  });
});

describe('DOC-2-002: caching', () => {
  const cached = {
    ...ATT_PDF,
    extractionStatus: 'done',
    extractedForSchema: 'svc-travel:abc123',
    extractedData: { extracted: { purpose: 'Conference' }, confidence: { purpose: 'high' }, rejected: [] },
  };

  test('a result already taken for THIS form is reused, with no model call', async () => {
    const { tools, extracts, downloads } = mkTools({ store: mkStore([cached]) });

    const out = await run(tools);

    expect(out.extracted).toEqual({ purpose: 'Conference' });
    expect(extracts).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });

  test('a result taken for a DIFFERENT form is re-extracted — the fields have changed', async () => {
    const stale = { ...cached, extractedForSchema: 'svc-travel:OLDHASH' };
    const { tools, extracts } = mkTools({ store: mkStore([stale]) });

    const out = await run(tools);

    expect(extracts).toHaveLength(1);
    expect(out.extracted).toEqual({ travelDate: '2026-09-01' });
  });

  test('a previously FAILED document is retried', async () => {
    const failed = { ...ATT_PDF, extractionStatus: 'failed', extractionError: 'timeout' };
    const { tools, extracts } = mkTools({ store: mkStore([failed]) });

    expect((await run(tools)).ok).toBe(true);
    expect(extracts).toHaveLength(1);
  });

  test('a mixed set extracts only what is not cached', async () => {
    const store = mkStore([cached, { ...ATT_PDF, attachmentId: 'att-2', fileName: 'new.pdf' }]);
    const { tools, extracts } = mkTools({ store });

    const out = await run(tools);

    expect(extracts.map((e) => e.fileName)).toEqual(['new.pdf']);
    expect(out.sources).toEqual(['itinerary.pdf', 'new.pdf']);
    expect(out.extracted).toEqual({ purpose: 'Conference', travelDate: '2026-09-01' });
  });
});

describe('DOC-2-002: one bad document does not lose the good one', () => {
  const two = [ATT_PDF, { ...ATT_PDF, attachmentId: 'att-2', fileName: 'broken.pdf' }];

  test('a failure is reported alongside the values that were read', async () => {
    const { tools } = mkTools({
      store: mkStore(two),
      extractImpl: (fileName) => {
        if (fileName === 'broken.pdf') { const e = new Error('too large'); e.code = 'DOCUMENT_TOO_LONG'; throw e; }
        return { extracted: { travelDate: '2026-09-01' }, confidence: { travelDate: 'high' }, rejected: [] };
      },
    });

    const out = await run(tools);

    expect(out.ok).toBe(true);
    expect(out.extracted).toEqual({ travelDate: '2026-09-01' });
    expect(out.sources).toEqual(['itinerary.pdf']);
    expect(out.failures).toEqual([{ fileName: 'broken.pdf', code: 'DOCUMENT_TOO_LONG', message: 'too large' }]);
  });

  test('the failing document is marked failed in the store, the good one done', async () => {
    const store = mkStore(two);
    const { tools } = mkTools({
      store,
      extractImpl: (fileName) => {
        if (fileName === 'broken.pdf') throw new Error('unreadable');
        return { extracted: {}, confidence: {}, rejected: [] };
      },
    });

    await run(tools);

    const byId = Object.fromEntries(store.updates.map((u) => [u.id, u.patch]));
    expect(byId['att-1'].extractionStatus).toBe('done');
    expect(byId['att-2'].extractionStatus).toBe('failed');
    expect(byId['att-2'].extractionError).toBe('unreadable');
  });

  test('when every document fails, it says so and hands the turn back', async () => {
    const { tools } = mkTools({
      store: mkStore(two),
      extractImpl: () => { throw new Error('unreadable'); },
    });

    const out = await run(tools);

    expect(out.ok).toBe(false);
    expect(out.failures).toHaveLength(2);
    expect(out.tellUser).toMatch(/carry on asking the fields yourself/i);
  });

  test('a download failure is handled like an extraction failure', async () => {
    const { tools } = mkTools({ downloadImpl: () => { throw new Error('404 not found'); } });
    const out = await run(tools);

    expect(out.ok).toBe(false);
    expect(out.failures[0].message).toMatch(/404/);
  });
});

describe('DOC-2-002: merging several documents', () => {
  const merge = () => mkTools().tools.mergeExtractions;

  test('combines fields found in different documents', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { travelDate: '2026-09-01' }, confidence: { travelDate: 'high' } },
      { fileName: 'b.pdf', extracted: { purpose: 'Conference' }, confidence: { purpose: 'medium' } },
    ]);
    expect(out.extracted).toEqual({ travelDate: '2026-09-01', purpose: 'Conference' });
  });

  test('higher confidence wins a disagreement', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { purpose: 'Holiday' }, confidence: { purpose: 'low' } },
      { fileName: 'b.pdf', extracted: { purpose: 'Conference' }, confidence: { purpose: 'high' } },
    ]);
    expect(out.extracted.purpose).toBe('Conference');
    expect(out.confidence.purpose).toBe('high');
  });

  test('lower confidence does not overwrite higher, even arriving later', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { purpose: 'Conference' }, confidence: { purpose: 'high' } },
      { fileName: 'b.pdf', extracted: { purpose: 'Holiday' }, confidence: { purpose: 'low' } },
    ]);
    expect(out.extracted.purpose).toBe('Conference');
  });

  test('on equal confidence the later document wins — a correction follows the original', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { travelDate: '2026-09-01' }, confidence: { travelDate: 'high' } },
      { fileName: 'b.pdf', extracted: { travelDate: '2026-09-08' }, confidence: { travelDate: 'high' } },
    ]);
    expect(out.extracted.travelDate).toBe('2026-09-08');
  });

  test('A DISAGREEMENT IS REPORTED, not silently resolved', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { beneficiary: 'Ivan Plaksin' }, confidence: { beneficiary: 'high' } },
      { fileName: 'b.pdf', extracted: { beneficiary: 'Maria Santos' }, confidence: { beneficiary: 'medium' } },
    ]);

    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].slotId).toBe('beneficiary');
    expect(out.conflicts[0].kept).toBe('Ivan Plaksin');
    expect(out.conflicts[0].alternatives).toEqual([
      { value: 'Ivan Plaksin', fileName: 'a.pdf', confidence: 'high' },
      { value: 'Maria Santos', fileName: 'b.pdf', confidence: 'medium' },
    ]);
  });

  test('the same value in both documents is agreement, not conflict', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { purpose: 'Conference' }, confidence: { purpose: 'high' } },
      { fileName: 'b.pdf', extracted: { purpose: 'Conference' }, confidence: { purpose: 'high' } },
    ]);
    expect(out.conflicts).toEqual([]);
  });

  test('a falsy value is still a value — held by presence, not truthiness', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: { purpose: 0 }, confidence: { purpose: 'high' } },
      { fileName: 'b.pdf', extracted: { purpose: 'guess' }, confidence: { purpose: 'low' } },
    ]);
    expect(out.extracted.purpose).toBe(0);
  });

  test('rejected values are carried through with the document they came from', () => {
    const out = merge()([
      { fileName: 'a.pdf', extracted: {}, confidence: {}, rejected: [{ slotId: 'cabinClass', reason: 'value not among the allowed options' }] },
    ]);
    expect(out.rejected).toEqual([{ fileName: 'a.pdf', slotId: 'cabinClass', reason: 'value not among the allowed options' }]);
  });
});

describe('DOC-2-002: conflicts and rejections reach the model', () => {
  test('a conflict is surfaced and the instruction says to flag it', async () => {
    const store = mkStore([ATT_PDF, { ...ATT_PDF, attachmentId: 'att-2', fileName: 'b.pdf' }]);
    const { tools } = mkTools({
      store,
      extractImpl: (fileName) => ({
        extracted: { beneficiary: fileName === 'itinerary.pdf' ? 'Ivan Plaksin' : 'Maria Santos' },
        confidence: { beneficiary: 'high' },
        rejected: [],
      }),
    });

    const out = await run(tools);

    expect(out.conflicts).toHaveLength(1);
    expect(out.tellUser).toMatch(/conflicts/);
  });

  test('nothing rejected and nothing conflicting means neither key is present', async () => {
    const { tools } = mkTools();
    const out = await run(tools);
    expect(out).not.toHaveProperty('conflicts');
    expect(out).not.toHaveProperty('rejected');
    expect(out).not.toHaveProperty('failures');
  });
});
