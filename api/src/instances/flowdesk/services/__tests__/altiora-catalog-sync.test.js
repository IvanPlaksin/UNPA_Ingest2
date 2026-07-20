'use strict';

/**
 * I-2 — catalog sync: Altiora → Qdrant `flowdesk_services`.
 * All I/O injected; no live Altiora / Qdrant / TEI.
 */

const { syncCatalog, buildText, domainOf, mapPayload } = require('../altiora-catalog-sync');

const SVC = {
  serviceId: '43861495-7982-4b6f-a3a6-3299b1716345',
  serviceCode: 'EO-FIN-GM-GA-ACA',
  displayName: 'Amendment to the Contribution Agreement',
  briefDescription: 'Request an amendment to an existing contribution agreement.',
  detailedDescription: 'Use this when donor terms change and the agreement must be revised.',
  parentDisplayName: 'Grants Administration',
  approvalRequired: true,
  defaultSlaHours: 72,
  hierarchyPath: 'EO/FIN/GM/GA',
  managerOnly: false,
};
const SVC2 = { ...SVC, serviceId: 'aaaa1111-0000-0000-0000-000000000002', serviceCode: 'EO-HR-BE-TRE-AHL', displayName: 'Advance Home Leave Queries', briefDescription: 'Questions about advance home leave entitlement.', detailedDescription: null, parentDisplayName: 'Travel & Entitlements', approvalRequired: false, defaultSlaHours: 24 };

function harness({ services = [SVC, SVC2], purgeStale = false, counts = [1728, 79] } = {}) {
  const calls = [];
  const client = { get: async (p) => { calls.push(`GET ${p}`); return services; } };
  const embed = async (texts) => texts.map((_, i) => new Array(1024).fill(i / 1000));
  let getCount = 0;
  const qdrantFetch = async (method, path, body) => {
    calls.push(`${method} ${path.split('?')[0]}`);
    if (method === 'GET') return { result: { points_count: counts[Math.min(getCount++, counts.length - 1)] } };
    if (path.includes('/points/delete')) { calls.push(`DELETE_FILTER ${JSON.stringify(body.filter)}`); return {}; }
    if (method === 'PUT') { calls.push(`UPSERT ${body.points.length}`); calls.lastPoints = body.points; return {}; }
    return {};
  };
  return { client, embed, qdrantFetch, calls, run: () => syncCatalog({ client, embed, qdrantFetch, purgeStale }) };
}

describe('I-2: pure mapping', () => {
  test('buildText joins name + descriptions, dropping duplicates', () => {
    expect(buildText(SVC)).toBe('Amendment to the Contribution Agreement. Request an amendment to an existing contribution agreement. Use this when donor terms change and the agreement must be revised.');
    expect(buildText({ displayName: 'X', briefDescription: 'x', detailedDescription: null })).toBe('X.'); // case-insensitive dedupe
    expect(buildText({})).toBe(''); // nothing to embed
  });

  test('domainOf takes the first two code segments', () => {
    expect(domainOf('EO-FIN-GM-GA-ACA')).toBe('EO-FIN');
    expect(domainOf('EO-HR-BE-TRE-AHL')).toBe('EO-HR');
    expect(domainOf('')).toBeNull();
  });

  test('payload satisfies the classifyUserIntent contract + carries the catalog GUID', () => {
    const p = mapPayload(SVC);
    // fields semantic-search.js reads
    for (const k of ['text', 'lang', 'service_code', 'service_name', 'domain_code', 'category']) {
      expect(p[k]).toBeDefined();
    }
    expect(p.service_code).toBe('EO-FIN-GM-GA-ACA');
    expect(p.domain_code).toBe('EO-FIN');
    expect(p.category).toBe('Grants Administration');
    // I-3 needs the GUID; provenance marks it syncable/purgeable
    expect(p.service_guid).toBe(SVC.serviceId);
    expect(p.source).toBe('altiora');
    expect(p.approval_required).toBe(true);
    expect(p.sla_hours).toBe(72);
  });
});

describe('I-2: syncCatalog', () => {
  test('fetches requestable, embeds, upserts with GUID ids (idempotent)', async () => {
    const h = harness();
    const res = await h.run();
    expect(res).toMatchObject({ fetched: 2, upserted: 2, purged: 0 });
    expect(h.calls).toContain('GET /api/servicecatalog/requestable');
    expect(h.calls).toContain('UPSERT 2');
    // point id === catalog GUID ⇒ re-sync overwrites in place
    expect(h.calls.lastPoints.map((p) => p.id)).toEqual([SVC.serviceId, SVC2.serviceId]);
    expect(h.calls.lastPoints[0].vector).toHaveLength(1024);
  });

  test('skips malformed catalog rows (no GUID / no code)', async () => {
    const h = harness({ services: [SVC, { displayName: 'junk' }, { serviceId: 'x' }] });
    const res = await h.run();
    expect(res.fetched).toBe(1);
    expect(res.upserted).toBe(1);
  });

  test('additive by default — no delete call', async () => {
    const h = harness();
    await h.run();
    expect(h.calls.some((c) => c.includes('/points/delete'))).toBe(false);
  });

  test('--purge-stale deletes only non-altiora points and reports the delta', async () => {
    const h = harness({ purgeStale: true, counts: [1728, 79] });
    const res = await h.run();
    expect(res.purged).toBe(1728 - 79);
    const del = h.calls.find((c) => c.startsWith('DELETE_FILTER'));
    expect(del).toContain('must_not');
    expect(del).toContain('altiora'); // never deletes what we just synced
  });
});
