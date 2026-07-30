'use strict';

/**
 * IP-KB — schema knowledge base: description building, vector+graph indexing with
 * shared-id linkage, and hybrid (vector → graph) service search.
 *
 * All external effects (TEI embed, Qdrant, Memgraph) are injected as seams so the
 * suite is hermetic — no live services touched.
 */

const kb = require('../schema-knowledge.service');
const { aiPointId } = require('../schema-enrichment.service');

const SNAPSHOT = {
  serviceId: 'EO-HR-SA-SS-ISP',
  version: 1,
  phases: ['detail'],
  metadata: { title: 'Information / Support Services', altioraOusId: 59, approvalRequired: false },
  slots: [
    { slotId: 'subject', type: 'string', required: true, promptHint: 'Subject / Title', helpText: 'A short subject line' },
    { slotId: 'description', type: 'text', required: true, promptHint: 'Description' },
    { slotId: 'docsAttached', type: 'enum', required: true, promptHint: 'Are supporting documents attached?',
      presentOptions: [{ value: 'Yes', label: 'Yes - please list below' }, { value: 'No', label: 'No' }] },
  ],
};

describe('buildSchemaDescription', () => {
  it('is deterministic and includes title, slot labels, help and options', () => {
    const text = kb.buildSchemaDescription(SNAPSHOT);
    expect(text).toBe(kb.buildSchemaDescription(SNAPSHOT)); // stable
    expect(text).toContain('Information / Support Services');
    expect(text).toContain('Subject / Title');
    expect(text).toContain('A short subject line');
    expect(text).toContain('Yes - please list below');
  });

  it('leads with a P7 ai_description and appends keywords when present', () => {
    const text = kb.buildSchemaDescription(SNAPSHOT, {
      enrichment: { text: 'Raise an IT support enquiry.', keywords: ['help desk', 'support ticket'] },
    });
    expect(text.startsWith('Raise an IT support enquiry.')).toBe(true);
    expect(text).toContain('help desk');
  });

  it('works with no describable slots (title only)', () => {
    const bare = { serviceId: 'X-Y', metadata: { title: 'Bare' }, slots: [{ slotId: 'a', type: 'string' }] };
    expect(kb.buildSchemaDescription(bare)).toContain('Bare');
  });
});

describe('kbPointId', () => {
  it('is deterministic, UUID-shaped, and distinct from the P7 ai_description id', () => {
    const id = kb.kbPointId('EO-HR-SA-SS-ISP');
    expect(id).toBe(kb.kbPointId('EO-HR-SA-SS-ISP'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toBe(aiPointId('EO-HR-SA-SS-ISP'));
  });
});

describe('indexSchemaKnowledge', () => {
  function makeDeps() {
    const calls = { qdrant: [], write: [] };
    return {
      calls,
      getEnrichment: async () => null, // hermetic: no DB read
      // indexSchemaKnowledge embeds the SERVICE description first, then each slot
      // (indexSlotKnowledge). Keep the first (service) embed for the assertions.
      embed: async (text) => { if (calls.embed === undefined) calls.embed = text; return [0.1, 0.2, 0.3]; },
      qdrant: async (method, path, body) => { calls.qdrant.push({ method, path, body }); return {}; },
      write: async (cypher, params) => { calls.write.push({ cypher, params }); return []; },
    };
  }

  it('upserts a schema_kb point keyed by kbId and links it to the graph by the same kbId', async () => {
    const deps = makeDeps();
    const res = await kb.indexSchemaKnowledge(SNAPSHOT, deps);

    const kbId = kb.kbPointId(SNAPSHOT.serviceId);
    expect(res).toEqual({ serviceId: SNAPSHOT.serviceId, kbId, chars: expect.any(Number), slots: expect.any(Number) });

    // Qdrant upsert: shared id, schema_kb provenance, Altiora namespace, shared kb_id in payload.
    const upsert = deps.calls.qdrant.find((c) => c.method === 'PUT');
    const point = upsert.body.points[0];
    expect(point.id).toBe(kbId);
    expect(point.payload.source).toBe('schema_kb');
    expect(point.payload.namespace).toBe('Altiora');
    expect(point.payload.kb_id).toBe(kbId);
    expect(point.payload.service_code).toBe(SNAPSHOT.serviceId);

    // Graph MERGE uses the SAME kbId and links to ServiceDef (shared-id linkage).
    const merge = deps.calls.write[0];
    expect(merge.cypher).toContain(':ServiceKnowledge');
    expect(merge.cypher).toContain('DESCRIBES');
    expect(merge.params.kbId).toBe(kbId);
    expect(merge.params.ns).toBe('Altiora');
    expect(merge.params.sid).toBe(SNAPSHOT.serviceId);
  });

  it('merges a stored P7 enrichment into the indexed text', async () => {
    const deps = makeDeps();
    deps.getEnrichment = async () => ({ text: 'IT support enquiry.', keywords: ['help desk'] });
    await kb.indexSchemaKnowledge(SNAPSHOT, deps);
    expect(deps.calls.embed).toContain('IT support enquiry.');
    expect(deps.calls.embed).toContain('help desk');
  });

  it('skips when the description is empty', async () => {
    const deps = makeDeps();
    const res = await kb.indexSchemaKnowledge({ serviceId: '', metadata: {}, slots: [] }, deps)
      .catch((e) => e);
    expect(res).toBeInstanceOf(Error); // serviceId required
  });
});

describe('removeSchemaKnowledge', () => {
  it('deletes the point and the namespace-scoped graph node', async () => {
    const calls = { qdrant: [], write: [] };
    await kb.removeSchemaKnowledge('EO-HR-SA-SS-ISP', {
      qdrant: async (m, p, b) => { calls.qdrant.push({ m, p, b }); return {}; },
      write: async (cypher, params) => { calls.write.push({ cypher, params }); return []; },
    });
    const kbId = kb.kbPointId('EO-HR-SA-SS-ISP');
    expect(calls.qdrant[0].b.points).toEqual([kbId]);
    expect(calls.write[0].cypher).toContain('DETACH DELETE');
    expect(calls.write[0].params.ns).toBe('Altiora');
  });
});

describe('hybridSearchServices', () => {
  const kbId1 = kb.kbPointId('EO-HR-SA-SS-ISP');
  const kbId2 = kb.kbPointId('EO-FIN-GM-GA-ACA');

  function graphRow(map) { return { get: (k) => map[k] }; }

  it('joins vector hits to the graph by shared kbId and reranks by vector score', async () => {
    const deps = {
      embed: async () => [0.1, 0.2],
      qdrant: async () => ({
        result: [
          { id: kbId2, score: 0.71, payload: { kb_id: kbId2 } },
          { id: kbId1, score: 0.92, payload: { kb_id: kbId1 } },
        ],
      }),
      read: async (cypher, params) => {
        expect(cypher).toContain(':ServiceKnowledge');
        expect(params.kbIds).toEqual(expect.arrayContaining([kbId1, kbId2]));
        return [
          graphRow({ kbId: kbId1, serviceId: 'EO-HR-SA-SS-ISP', title: 'Support', approvalRequired: false, slotCount: 3 }),
          graphRow({ kbId: kbId2, serviceId: 'EO-FIN-GM-GA-ACA', title: 'Grant', approvalRequired: true, slotCount: 5 }),
        ];
      },
    };
    const out = await kb.hybridSearchServices('I need IT help', deps);
    expect(out.map((s) => s.serviceId)).toEqual(['EO-HR-SA-SS-ISP', 'EO-FIN-GM-GA-ACA']); // 0.92 before 0.71
    expect(out[0]).toMatchObject({ title: 'Support', domain: 'EO-HR', slotCount: 3, source: 'hybrid' });
    expect(out[1].approvalRequired).toBe(true);
  });

  it('returns [] when nothing is indexed (enables fallback)', async () => {
    const out = await kb.hybridSearchServices('anything', {
      embed: async () => [0], qdrant: async () => ({ result: [] }), read: async () => [],
    });
    expect(out).toEqual([]);
  });
});
