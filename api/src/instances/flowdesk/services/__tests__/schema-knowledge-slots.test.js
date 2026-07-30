'use strict';

/**
 * Per-slot knowledge base: slot description, indexing (vector point + graph node
 * with shared slotKbId), and free-text slot resolution. Hermetic — all effects
 * injected.
 */

const kb = require('../schema-knowledge.service');

const SNAPSHOT = {
  serviceId: 'EO-HR-SP-NPR-AHL',
  metadata: { title: 'Request Advance of Home Leave' },
  slots: [
    { slotId: 'dutyStation', type: 'string', promptHint: 'Duty station', helpText: 'Your current duty station', sectionLabel: 'Travel details' },
    { slotId: 'homeCountry', type: 'enum', promptHint: 'Country of home leave', presentOptions: [{ value: 'FR', label: 'France' }, { value: 'US', label: 'United States' }] },
  ],
};

describe('buildSlotDescription', () => {
  it('is deterministic and includes field label, service, section, help and options', () => {
    const d = kb.buildSlotDescription(SNAPSHOT, SNAPSHOT.slots[0]);
    expect(d).toBe(kb.buildSlotDescription(SNAPSHOT, SNAPSHOT.slots[0]));
    expect(d).toContain('Duty station');
    expect(d).toContain('Request Advance of Home Leave');
    expect(d).toContain('Travel details');
    const e = kb.buildSlotDescription(SNAPSHOT, SNAPSHOT.slots[1]);
    expect(e).toContain('France');
  });
});

describe('slotKbPointId', () => {
  it('is deterministic, UUID-shaped, and distinct per slot and from the service point', () => {
    const a = kb.slotKbPointId('EO-HR-SP-NPR-AHL', 'dutyStation');
    expect(a).toBe(kb.slotKbPointId('EO-HR-SP-NPR-AHL', 'dutyStation'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(kb.slotKbPointId('EO-HR-SP-NPR-AHL', 'homeCountry'));
    expect(a).not.toBe(kb.kbPointId('EO-HR-SP-NPR-AHL'));
  });
});

describe('indexSlotKnowledge', () => {
  it('rebuilds slot points (delete-by-service then upsert) and links each to its SlotDef', async () => {
    const calls = { qdrant: [], write: [] };
    const deps = {
      embed: async () => [0.1, 0.2],
      qdrant: async (method, path, body) => { calls.qdrant.push({ method, path, body }); return {}; },
      write: async (cypher, params) => { calls.write.push({ cypher, params }); return []; },
    };
    const res = await kb.indexSlotKnowledge(SNAPSHOT, deps);
    expect(res).toEqual({ serviceId: SNAPSHOT.serviceId, slots: 2 });

    // Clean-slate delete-by-service ran before the upsert.
    const del = calls.qdrant.find((c) => c.path.includes('/delete'));
    expect(del.body.filter.must).toEqual(expect.arrayContaining([
      { key: 'source', match: { value: 'slot_kb' } },
      { key: 'service_code', match: { value: SNAPSHOT.serviceId } },
    ]));
    const put = calls.qdrant.find((c) => c.method === 'PUT');
    expect(put.body.points).toHaveLength(2);
    const p0 = put.body.points[0];
    expect(p0.id).toBe(kb.slotKbPointId(SNAPSHOT.serviceId, 'dutyStation'));
    expect(p0.payload).toMatchObject({ source: 'slot_kb', slot_id: 'dutyStation', service_code: SNAPSHOT.serviceId, namespace: 'Altiora' });

    // Graph: delete-all-for-service then MERGE SlotKnowledge -[:DESCRIBES]-> SlotDef.
    expect(calls.write[0].cypher).toContain('DETACH DELETE');
    const merge = calls.write.find((c) => c.cypher.includes(':SlotKnowledge') && c.cypher.includes('DESCRIBES'));
    expect(merge).toBeTruthy();
    expect(merge.params.rows.map((r) => r.slotId)).toEqual(['dutyStation', 'homeCountry']);
  });
});

describe('resolveSlotFromText', () => {
  const idDuty = kb.slotKbPointId('EO-HR-SP-NPR-AHL', 'dutyStation');
  const idHome = kb.slotKbPointId('EO-HR-SP-NPR-AHL', 'homeCountry');
  const row = (m) => ({ get: (k) => m[k] });

  it('resolves an oblique phrase to the best slot via vector→graph, best-first', async () => {
    const deps = {
      embed: async () => [0.1],
      qdrant: async (method, path, body) => {
        expect(body.filter.must).toEqual(expect.arrayContaining([
          { key: 'source', match: { value: 'slot_kb' } },
          { key: 'service_code', match: { value: 'EO-HR-SP-NPR-AHL' } },
        ]));
        return { result: [
          { id: idHome, score: 0.55, payload: { kb_id: idHome, slot_id: 'homeCountry' } },
          { id: idDuty, score: 0.88, payload: { kb_id: idDuty, slot_id: 'dutyStation' } },
        ] };
      },
      read: async () => [
        row({ kbId: idDuty, slotId: 'dutyStation', promptHint: 'Duty station', type: 'string', section: 'travelDetails' }),
        row({ kbId: idHome, slotId: 'homeCountry', promptHint: 'Country of home leave', type: 'enum', section: null }),
      ],
    };
    const out = await kb.resolveSlotFromText('EO-HR-SP-NPR-AHL', 'where I am posted', deps);
    expect(out.map((s) => s.slotId)).toEqual(['dutyStation', 'homeCountry']); // 0.88 before 0.55
    expect(out[0]).toMatchObject({ promptHint: 'Duty station', type: 'string' });
  });

  it('returns [] when the service has no indexed slots', async () => {
    const out = await kb.resolveSlotFromText('EO-HR-SP-NPR-AHL', 'anything', {
      embed: async () => [0], qdrant: async () => ({ result: [] }), read: async () => [],
    });
    expect(out).toEqual([]);
  });
});
