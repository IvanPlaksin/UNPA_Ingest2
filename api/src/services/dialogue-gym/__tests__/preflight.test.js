'use strict';

/**
 * Dialogue Gym preflight — the gate that stops a run from measuring
 * infrastructure instead of the prompt. Fakes only; no live services.
 */

const preflight = require('../preflight.service');

const okCheck = (name, critical = true) => async () => ({ name, critical, ok: true, latencyMs: 1, detail: 'fine', error: null });
const badCheck = (name, critical = true, error = 'down') => async () => ({ name, critical, ok: false, latencyMs: 1, detail: null, error });

describe('runPreflight aggregation', () => {
  test('all green means ok', async () => {
    const r = await preflight.runPreflight({ checks: [okCheck('a'), okCheck('b')] });
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.checks).toHaveLength(2);
  });

  test('a critical failure fails the whole preflight', async () => {
    const r = await preflight.runPreflight({ checks: [okCheck('a'), badCheck('catalog')] });
    expect(r.ok).toBe(false);
    expect(r.failed.map((c) => c.name)).toEqual(['catalog']);
  });

  test('a non-critical failure warns but still passes', async () => {
    // The knowledge base only grounds INFO_QUESTION turns; losing it degrades
    // some scores but does not invalidate a whole run the way a dead catalog does.
    const r = await preflight.runPreflight({ checks: [okCheck('a'), badCheck('kb', false)] });
    expect(r.ok).toBe(true);
    expect(r.warned.map((c) => c.name)).toEqual(['kb']);
  });

  test('every check runs even after one fails — the operator needs the full picture', async () => {
    const seen = [];
    const spy = (name, ok) => async () => { seen.push(name); return { name, critical: true, ok, latencyMs: 1, detail: null, error: ok ? null : 'x' }; };
    await preflight.runPreflight({ checks: [spy('first', false), spy('second', true), spy('third', false)] });
    expect(seen).toEqual(['first', 'second', 'third']);
  });

  test('a check that throws is reported, not propagated', async () => {
    const thrower = async () => { throw new Error('boom'); };
    // Checks built through the module's own wrapper never throw; this guards the
    // contract that runPreflight itself is safe to call.
    await expect(preflight.runPreflight({ checks: [preflight.checkMemgraph] , read: thrower }))
      .resolves.toMatchObject({ ok: false });
  });
});

describe('assertReady gate', () => {
  test('throws a 503 carrying the failed checks', async () => {
    expect.assertions(3);
    try {
      await preflight.assertReady({ checks: [badCheck('service catalog', true, 'probe matched no service')] });
    } catch (err) {
      expect(err.status).toBe(503);
      expect(err.message).toMatch(/service catalog/);
      expect(err.preflight.failed).toHaveLength(1);
    }
  });

  test('returns the result when everything is up', async () => {
    await expect(preflight.assertReady({ checks: [okCheck('a')] })).resolves.toMatchObject({ ok: true });
  });
});

describe('the catalog check treats empty as down', () => {
  test('an empty result is a failure, not "no match"', async () => {
    // This is the whole point of the module: reachable-but-empty is exactly what
    // a dead Qdrant looks like, and it scores as a prompt failure in every run.
    const r = await preflight.checkServiceCatalog({ resolveSearch: async () => [] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/matched no service/);
    expect(r.error).toMatch(/identical to a prompt failure/);
  });

  test('hits pass and the top match is reported', async () => {
    const r = await preflight.checkServiceCatalog({
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-BE-TRE-HLT' }],
    });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/EO-HR-BE-TRE-HLT/);
  });

  test('non-service hits do not count as a working catalog', async () => {
    // An SR_STATUS or ARTICLE hit proves a different backend works, not this one.
    const r = await preflight.checkServiceCatalog({ resolveSearch: async () => [{ type: 'ARTICLE', title: 'x' }] });
    expect(r.ok).toBe(false);
  });

  test('a throwing backend fails the check rather than escaping', async () => {
    const r = await preflight.checkServiceCatalog({ resolveSearch: async () => { throw new Error('qdrant down'); } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/qdrant down/);
  });
});

describe('schema provider check', () => {
  const rows = (obj) => [{ get: (k) => obj[k] }];

  test('services with slots pass', async () => {
    const r = await preflight.checkSchemaProvider({ read: async () => rows({ svc: 84, slots: 528 }) });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/84 service\(s\) \/ 528 slot\(s\)/);
  });

  test('services without slots fail — intake stalls on the first question', async () => {
    const r = await preflight.checkSchemaProvider({ read: async () => rows({ svc: 84, slots: 0 }) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/zero SlotDef/);
  });

  test('no services at all fails', async () => {
    const r = await preflight.checkSchemaProvider({ read: async () => rows({ svc: 0, slots: 0 }) });
    expect(r.ok).toBe(false);
  });
});

describe('Altiora check', () => {
  test('401 from an authenticated root is healthy — it proves the service listens', async () => {
    process.env.ALTIORA_API_BASE = 'http://localhost:5000';
    const r = await preflight.checkAltiora({ fetch: async () => ({ status: 401 }) });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/401/);
  });

  test('5xx is not healthy', async () => {
    process.env.ALTIORA_API_BASE = 'http://localhost:5000';
    const r = await preflight.checkAltiora({ fetch: async () => ({ status: 503 }) });
    expect(r.ok).toBe(false);
  });

  test('a refused connection fails', async () => {
    process.env.ALTIORA_API_BASE = 'http://localhost:5000';
    const r = await preflight.checkAltiora({ fetch: async () => { throw new Error('ECONNREFUSED'); } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });
});

describe('report formatting', () => {
  test('names the down service and says why it matters', async () => {
    const result = await preflight.runPreflight({ checks: [okCheck('memgraph'), badCheck('service catalog', true, 'no hits')] });
    const text = preflight.formatReport(result);
    expect(text).toMatch(/\[OK  \] memgraph/);
    expect(text).toMatch(/\[FAIL\] service catalog/);
    expect(text).toMatch(/no hits/);
    expect(text).toMatch(/PREFLIGHT FAILED/);
  });

  test('a clean report says passed and counts warnings', async () => {
    const result = await preflight.runPreflight({ checks: [okCheck('a'), badCheck('kb', false)] });
    expect(preflight.formatReport(result)).toMatch(/PREFLIGHT PASSED.*1 warning/);
  });
});
