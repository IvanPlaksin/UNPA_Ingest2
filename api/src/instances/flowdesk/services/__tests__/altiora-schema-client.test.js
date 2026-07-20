'use strict';

/**
 * IP-1a test — AltioraSchemaClient: detect/schema/version contracts, our
 * provider ranking (which deliberately contradicts Altiora's MatchScore), and
 * the 404-is-not-an-error mappings.
 */

const {
  createAltioraSchemaClient,
  scoreProvider,
} = require('../altiora-schema-client');
const {
  createAltioraClient,
  AltioraAuthError,
  AltioraServerError,
} = require('../altiora-client');

const BASE = 'http://localhost:5000';
const KEY = 'test-api-key';

// A duty station is a GUID in Altiora, so a realistic location path is long —
// which is precisely what breaks Altiora's own 50+LEN scoring.
const DS_GVA = '/2/756/4f6d1e3a-9c7b-4a21-8f5e-1d2c3b4a5e6f/';
const DS_NY = '/1/840/8a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9/';

/** Minimal fetch double: returns queued responses and records the calls made. */
function makeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const { status = 200, body = null } = next;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === null ? '' : JSON.stringify(body)),
      json: async () => body,
    };
  };
  impl.calls = calls;
  return impl;
}

function makeClient(responses) {
  const fetchImpl = makeFetch(responses);
  const http = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 1 });
  return { client: createAltioraSchemaClient({ client: http }), fetchImpl };
}

/** ProviderDetectionResponse as ASP.NET serializes it (camelCase). */
function provider(ousId, overrides = {}) {
  return {
    organizationUnitServiceId: ousId,
    providerOrgUnitId: 10 + ousId,
    providerName: `Unit ${ousId}`,
    serviceName: 'Laptop Request',
    matchedLocationScope: null,
    matchedOrgScope: null,
    matchScore: 10,
    useIneed: false,
    managerOnly: false,
    requestTitleMode: 'optional',
    requestDescriptionMode: 'optional',
    ...overrides,
  };
}

describe('IP-1a: detectProviders', () => {
  test('posts the detect contract with trailing-slash-normalized paths', async () => {
    const { client, fetchImpl } = makeClient([{ status: 200, body: [provider(42)] }]);

    await client.detectProviders('svc-guid', {
      locationPath: '/2/756/ds-guid', // no trailing slash
      beneficiaryOrgUnitPath: '/5/9',
    });

    const { url, body } = fetchImpl.calls[0];
    expect(url).toBe(`${BASE}/api/ServiceDistribution/detect`);
    expect(body).toEqual({
      ServiceId: 'svc-guid',
      LocationPath: '/2/756/ds-guid/',
      BeneficiaryOrgUnitPath: '/5/9/',
      IsSla: false,
    });
  });

  test('maps the response into our provider shape, focal point included', async () => {
    const { client } = makeClient([{
      status: 200,
      body: [provider(42, {
        matchedLocationScope: DS_GVA,
        focalPointUserId: 'u-1',
        focalPointFirstName: 'Ada',
        focalPointLastName: 'Lovelace',
        focalPointEmail: 'ada@un.org',
        managerOnly: true,
        useIneed: true,
        ineedCode: 'INEED-7',
      })],
    }]);

    const [p] = await client.detectProviders('svc-guid', { locationPath: DS_GVA });

    expect(p.organizationUnitServiceId).toBe(42);
    expect(p.providerName).toBe('Unit 42');
    expect(p.focalPoint).toEqual({ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@un.org' });
    expect(p.managerOnly).toBe(true);
    expect(p.ineedCode).toBe('INEED-7');
  });

  test('reads PascalCase too, since the serializer casing is not pinned', async () => {
    const { client } = makeClient([{
      status: 200,
      body: [{ OrganizationUnitServiceId: 7, ProviderName: 'Unit 7', MatchedLocationScope: DS_NY }],
    }]);

    const [p] = await client.detectProviders('svc-guid', { locationPath: DS_NY });

    expect(p.organizationUnitServiceId).toBe(7);
    expect(p.providerName).toBe('Unit 7');
  });

  test('404 means "not offered here", not a failure — returns an empty list', async () => {
    const { client } = makeClient([{
      status: 404,
      body: { message: 'No suitable provider found for this request context.' },
    }]);

    await expect(client.detectProviders('svc-guid', { locationPath: DS_GVA })).resolves.toEqual([]);
  });

  test('drops rows without an OrganizationUnitServiceId — they are unusable downstream', async () => {
    const { client } = makeClient([{
      status: 200,
      body: [provider(42), { providerName: 'orphan' }],
    }]);

    const out = await client.detectProviders('svc-guid', {});
    expect(out).toHaveLength(1);
    expect(out[0].organizationUnitServiceId).toBe(42);
  });

  test('propagates real failures instead of swallowing them', async () => {
    const { client } = makeClient([{ status: 401, body: { message: 'nope' } }]);
    await expect(client.detectProviders('svc-guid', {})).rejects.toBeInstanceOf(AltioraAuthError);
  });

  test('rejects a missing serviceId before making a call', async () => {
    const { client, fetchImpl } = makeClient([{ status: 200, body: [] }]);
    await expect(client.detectProviders(null, {})).rejects.toThrow(/serviceId is required/);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe('IP-1a: provider ranking', () => {
  test('a specific location match outranks a global provider — inverting Altiora', async () => {
    // Altiora would rank these the other way round: global scores 100, the
    // Geneva match scores 50+LEN(~40) = ~90.
    const { client } = makeClient([{
      status: 200,
      body: [
        provider(1, { matchedLocationScope: null, matchScore: 100 }),   // global
        provider(2, { matchedLocationScope: DS_GVA, matchScore: 90 }),  // specific
      ],
    }]);

    const out = await client.detectProviders('svc-guid', { locationPath: DS_GVA });

    expect(out.map((p) => p.organizationUnitServiceId)).toEqual([2, 1]);
  });

  test('among specific matches, the deeper scope wins', async () => {
    const country = '/2/756/';
    const { client } = makeClient([{
      status: 200,
      body: [
        provider(1, { matchedLocationScope: country }),
        provider(2, { matchedLocationScope: DS_GVA }),
      ],
    }]);

    const out = await client.detectProviders('svc-guid', { locationPath: DS_GVA });

    expect(out.map((p) => p.organizationUnitServiceId)).toEqual([2, 1]);
  });

  test('a scope that does not corroborate the match ranks above global, below a real match', () => {
    // Guards Altiora's random-scope defect: the reported scope can belong to a
    // different scope row than the one that actually matched.
    const real = scoreProvider({ matchedLocationScope: DS_GVA }, DS_GVA);
    const bogus = scoreProvider({ matchedLocationScope: DS_NY }, DS_GVA);
    const global = scoreProvider({ matchedLocationScope: null }, DS_GVA);

    expect(real).toBeGreaterThan(bogus);
    expect(bogus).toBeGreaterThan(global);
  });

  test('scores off the trailing-slash-normalized path, so /2/756 and /2/756/ agree', () => {
    expect(scoreProvider({ matchedLocationScope: '/2/756' }, '/2/756/x/'))
      .toBe(scoreProvider({ matchedLocationScope: '/2/756/' }, '/2/756/x/'));
  });

  test('keeps Altiora MatchScore for diagnostics but never orders by it', async () => {
    const { client } = makeClient([{
      status: 200,
      body: [provider(1, { matchedLocationScope: null, matchScore: 100 })],
    }]);

    const [p] = await client.detectProviders('svc-guid', { locationPath: DS_GVA });

    expect(p.altioraMatchScore).toBe(100);
    expect(p.score).toBe(50);
  });
});

describe('IP-1a: getSchema', () => {
  const FORM = {
    fields: [{ id: 'os', label: 'Operating System', type: 'select', required: true, options: ['Windows', 'macOS'] }],
    rules: [],
  };

  test('fetches the bare FormDefinition by OrganizationUnitServiceId', async () => {
    const { client, fetchImpl } = makeClient([{ status: 200, body: FORM }]);

    const out = await client.getSchema(42);

    expect(fetchImpl.calls[0].url).toBe(`${BASE}/api/ServiceDistribution/42/schema`);
    expect(out).toEqual(FORM);
  });

  test('no published schema (404) resolves to null', async () => {
    const { client } = makeClient([{ status: 404, body: null }]);
    await expect(client.getSchema(42)).resolves.toBeNull();
  });

  test('retries a 5xx and succeeds on the replay', async () => {
    const { client, fetchImpl } = makeClient([
      { status: 500, body: { message: 'boom' } },
      { status: 200, body: FORM },
    ]);

    await expect(client.getSchema(42)).resolves.toEqual(FORM);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('gives up after retries on a persistent 5xx', async () => {
    const { client } = makeClient([{ status: 500, body: { message: 'boom' } }]);
    await expect(client.getSchema(42)).rejects.toBeInstanceOf(AltioraServerError);
  });

  test.each([[0], [-1], ['abc'], [null], [1.5]])(
    'rejects a non-positive-integer ousId (%p) before making a call',
    async (bad) => {
      const { client, fetchImpl } = makeClient([{ status: 200, body: FORM }]);
      await expect(client.getSchema(bad)).rejects.toThrow(/positive integer/);
      expect(fetchImpl.calls).toHaveLength(0);
    },
  );
});

describe('IP-1a: getSchemaVersion', () => {
  test('returns the invalidation probe fields', async () => {
    const { client, fetchImpl } = makeClient([{
      status: 200,
      body: {
        organizationUnitServiceId: 42,
        schemaId: 7,
        version: 3,
        updatedAt: '2026-07-15T10:00:00Z',
        contentHash: 'abc123',
      },
    }]);

    const out = await client.getSchemaVersion(42);

    expect(fetchImpl.calls[0].url).toBe(`${BASE}/api/ServiceDistribution/42/schema/version`);
    expect(out).toEqual({
      organizationUnitServiceId: 42,
      schemaId: 7,
      version: 3,
      updatedAt: '2026-07-15T10:00:00Z',
      contentHash: 'abc123',
    });
  });

  test('no published schema (404) resolves to null', async () => {
    const { client } = makeClient([{ status: 404, body: null }]);
    await expect(client.getSchemaVersion(42)).resolves.toBeNull();
  });

  test('reads PascalCase too', async () => {
    const { client } = makeClient([{
      status: 200,
      body: { OrganizationUnitServiceId: 42, SchemaId: 7, Version: 3, ContentHash: 'abc123' },
    }]);

    const out = await client.getSchemaVersion(42);
    expect(out.contentHash).toBe('abc123');
    expect(out.version).toBe(3);
  });
});
