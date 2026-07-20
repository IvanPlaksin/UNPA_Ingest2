'use strict';

/**
 * I-1 test — AltioraClient: dual-gate auth headers, error mapping, retry policy,
 * and service-token caching.
 */

const {
  createAltioraClient,
  createServiceTokenProvider,
  createActingTokenProvider,
  AltioraAuthError,
  AltioraValidationError,
  AltioraNotFoundError,
  AltioraServerError,
  AltioraUnavailableError,
} = require('../altiora-client');
const { runWithActingUser } = require('../acting-user.context');

const BASE = 'http://localhost:5000';
const KEY = 'test-api-key';

/** Minimal fetch double: returns queued responses and records the calls made. */
function makeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === 'function') return next();
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

/** Builds an unsigned JWT whose payload carries the given `exp` (seconds). */
function jwtWithExp(expSeconds) {
  const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: expSeconds })).toString('base64url');
  return `header.${payload}.sig`;
}

describe('I-1: AltioraClient auth gates', () => {
  test('sends the API-Key on every request and the bearer from the tokenProvider', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: { ok: true } }]);
    const client = createAltioraClient({
      baseUrl: BASE, apiKey: KEY, fetchImpl,
      tokenProvider: async () => 'tok-123',
    });

    await client.get('/api/users/me');

    const { url, init } = fetchImpl.calls[0];
    expect(url).toBe('http://localhost:5000/api/users/me');
    expect(init.headers['API-Key']).toBe(KEY);
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  test('a per-call token overrides the provider (acting as the end user)', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = createAltioraClient({
      baseUrl: BASE, apiKey: KEY, fetchImpl,
      tokenProvider: async () => 'service-token',
    });

    await client.get('/api/servicecatalog/search', { token: 'user-token' });

    expect(fetchImpl.calls[0].init.headers.Authorization).toBe('Bearer user-token');
  });

  test('serialises query params and JSON bodies', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: [] }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl });

    await client.get('/api/servicecatalog/search', { query: { q: 'laptop', limit: 10 } });
    expect(fetchImpl.calls[0].url).toBe(
      'http://localhost:5000/api/servicecatalog/search?q=laptop&limit=10');

    await client.post('/api/ServiceDistribution/detect', { ServiceId: 'guid-1' });
    const post = fetchImpl.calls[1].init;
    expect(post.method).toBe('POST');
    expect(post.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(post.body)).toEqual({ ServiceId: 'guid-1' });
  });
});

describe('I-1: AltioraClient error mapping', () => {
  const cases = [
    [401, AltioraAuthError],
    [403, AltioraAuthError],
    [404, AltioraNotFoundError],
    [400, AltioraValidationError],
  ];

  test.each(cases)('HTTP %i maps to the right error type', async (status, Type) => {
    const fetchImpl = makeFetch([{ status, body: { Message: 'nope' } }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl });

    await expect(client.get('/api/x')).rejects.toBeInstanceOf(Type);
  });

  test('preserves Altiora\'s 400 body so the chat can surface Message to the user', async () => {
    const body = { ErrorCode: 'E1', ClientErrorCode: 'C1', Message: 'Invalid location' };
    const fetchImpl = makeFetch([{ status: 400, body }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl });

    await expect(client.post('/api/tickets', {})).rejects.toMatchObject({
      status: 400,
      code: 'ALTIORA_VALIDATION',
      body,
    });
  });

  test('a network failure surfaces as AltioraUnavailableError', async () => {
    const fetchImpl = makeFetch([() => Promise.reject(new Error('ECONNREFUSED'))]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 0 });

    await expect(client.get('/api/x')).rejects.toBeInstanceOf(AltioraUnavailableError);
  });
});

describe('I-1: AltioraClient retry policy', () => {
  test('retries a GET on 5xx and succeeds on a later attempt', async () => {
    const fetchImpl = makeFetch([
      { status: 503, body: { Message: 'busy' } },
      { status: 200, body: { ok: true } },
    ]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 2 });

    await expect(client.get('/api/x')).resolves.toEqual({ ok: true });
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('gives up after exhausting retries', async () => {
    const fetchImpl = makeFetch([{ status: 500, body: { Message: 'boom' } }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 1 });

    await expect(client.get('/api/x')).rejects.toBeInstanceOf(AltioraServerError);
    expect(fetchImpl.calls).toHaveLength(2); // initial + 1 retry
  });

  test('never replays a POST — a duplicate ticket is worse than a failed one', async () => {
    const fetchImpl = makeFetch([{ status: 500, body: { Message: 'boom' } }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 3 });

    await expect(client.post('/api/tickets', {})).rejects.toBeInstanceOf(AltioraServerError);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test('does not retry a 4xx — it is a verdict, not a blip', async () => {
    const fetchImpl = makeFetch([{ status: 400, body: { Message: 'bad' } }]);
    const client = createAltioraClient({ baseUrl: BASE, apiKey: KEY, fetchImpl, retries: 3 });

    await expect(client.get('/api/x')).rejects.toBeInstanceOf(AltioraValidationError);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});

describe('I-1: service token provider', () => {
  test('logs in once and reuses the cached token until it nears expiry', async () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    const fetchImpl = makeFetch([{ status: 200, body: { token, userId: 'u1' } }]);
    const provider = createServiceTokenProvider({
      baseUrl: BASE, apiKey: KEY, email: 'svc@x', password: 'p', fetchImpl,
    });

    await expect(provider()).resolves.toBe(token);
    await expect(provider()).resolves.toBe(token);
    expect(fetchImpl.calls).toHaveLength(1);

    const { url, init } = fetchImpl.calls[0];
    expect(url).toBe('http://localhost:5000/api/auth/login');
    expect(init.headers['API-Key']).toBe(KEY);
    expect(JSON.parse(init.body)).toEqual({ email: 'svc@x', password: 'p' });
  });

  test('re-logs in once the cached token has expired', async () => {
    const expired = jwtWithExp(Math.floor(Date.now() / 1000) - 10);
    const fresh = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    const fetchImpl = makeFetch([
      { status: 200, body: { token: expired } },
      { status: 200, body: { token: fresh } },
    ]);
    const provider = createServiceTokenProvider({
      baseUrl: BASE, apiKey: KEY, email: 'svc@x', password: 'p', fetchImpl,
    });

    await expect(provider()).resolves.toBe(expired);
    await expect(provider()).resolves.toBe(fresh);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('bad credentials surface as AltioraAuthError', async () => {
    const fetchImpl = makeFetch([{ status: 401, body: { Message: 'Invalid credentials' } }]);
    const provider = createServiceTokenProvider({
      baseUrl: BASE, apiKey: KEY, email: 'svc@x', password: 'wrong', fetchImpl,
    });

    await expect(provider()).rejects.toBeInstanceOf(AltioraAuthError);
  });
});

describe('I-1: acting identity (outbound-auth hybrid)', () => {
  test('inside a request, acts as the end user rather than the service account', async () => {
    const serviceProvider = jest.fn(async () => 'service-token');
    const provider = createActingTokenProvider(serviceProvider);

    const token = await runWithActingUser({ userId: 'u1', token: 'user-token' }, () => provider());

    expect(token).toBe('user-token');
    expect(serviceProvider).not.toHaveBeenCalled();
  });

  test('outside a request (background job), falls back to the service account', async () => {
    const serviceProvider = jest.fn(async () => 'service-token');
    const provider = createActingTokenProvider(serviceProvider);

    await expect(provider()).resolves.toBe('service-token');
    expect(serviceProvider).toHaveBeenCalledTimes(1);
  });

  test('a user context without a token falls back to the service account', async () => {
    const serviceProvider = jest.fn(async () => 'service-token');
    const provider = createActingTokenProvider(serviceProvider);

    const token = await runWithActingUser({ userId: 'u1', token: null }, () => provider());

    expect(token).toBe('service-token');
  });

  test('the acting identity reaches the wire as the bearer', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = createAltioraClient({
      baseUrl: BASE, apiKey: KEY, fetchImpl,
      tokenProvider: createActingTokenProvider(async () => 'service-token'),
    });

    await runWithActingUser({ userId: 'u1', token: 'user-token' },
      () => client.get('/api/users/me'));

    expect(fetchImpl.calls[0].init.headers.Authorization).toBe('Bearer user-token');
  });

  test('context does not leak across concurrent requests', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = createAltioraClient({
      baseUrl: BASE, apiKey: KEY, fetchImpl,
      tokenProvider: createActingTokenProvider(async () => 'service-token'),
    });

    await Promise.all([
      runWithActingUser({ userId: 'a', token: 'token-a' }, () => client.get('/api/a')),
      runWithActingUser({ userId: 'b', token: 'token-b' }, () => client.get('/api/b')),
    ]);

    const byUrl = Object.fromEntries(
      fetchImpl.calls.map((c) => [c.url, c.init.headers.Authorization]));
    expect(byUrl['http://localhost:5000/api/a']).toBe('Bearer token-a');
    expect(byUrl['http://localhost:5000/api/b']).toBe('Bearer token-b');
  });
});
