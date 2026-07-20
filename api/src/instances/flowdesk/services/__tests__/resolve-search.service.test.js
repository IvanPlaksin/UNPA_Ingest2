'use strict';

/**
 * C3 test — unified retrieval service.
 *
 * Deterministic tests use injected backends (mapping, ranking, graceful
 * degradation) and validate against resolve-search.schema.json. Live smoke tests
 * hit real Qdrant (flowdesk_services → SERVICE) and real Memgraph (seeded
 * ServiceRequest → SR_STATUS), and are tolerant if infra returns nothing.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { createResolveSearch, getResolveSearch } = require('../resolve-search.service');
const { makeServiceBackend } = require('../backends/service.backend');
const { write, read, close } = require('../../schema-graph/driver');

const schema = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'resolve-search.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const CTX = { userId: 'u-1', lang: 'en', roles: ['staff'] };

jest.setTimeout(30000);
afterAll(async () => {
  await write(`MATCH (sr:ServiceRequest {srNumber:'SR-900001'}) DETACH DELETE sr`);
  await close();
});

describe('C3: orchestration + mapping (injected backends)', () => {
  const resolveSearch = createResolveSearch({
    serviceBackend: async (q) => (/laptop/i.test(q) ? [{ serviceId: 'IT-HW-LAP', title: 'Laptop', domain: 'IT', level: 3, version: 1, score: 0.9 }] : []),
    articleBackend: async (q) => (/password/i.test(q) ? [{ articleId: 'KB-1', title: 'Reset', answerSnippet: 'do X', sourceCollection: 'kb', score: 0.8 }] : []),
    srStatusBackend: async (n) => (n === 'SR-999' ? { srNumber: 'SR-999', status: 'OPEN', title: 'T' } : null),
  });

  test('laptop → SERVICE hit, valid union', async () => {
    const res = await resolveSearch('need a laptop', CTX);
    expect(validate(res)).toBe(true);
    expect(res[0].type).toBe('SERVICE');
    expect(res[0].schemaRef).toEqual({ serviceId: 'IT-HW-LAP', version: 1 });
  });

  test('SR ref → SR_STATUS ranked first with score 1.0', async () => {
    const res = await resolveSearch('status of SR-999 laptop', CTX);
    expect(validate(res)).toBe(true);
    expect(res[0].type).toBe('SR_STATUS');
    expect(res[0].score).toBe(1.0);
  });

  test('empty query → [] (early return)', async () => {
    expect(await resolveSearch('   ', CTX)).toEqual([]);
  });

  test('graceful degradation: a throwing SERVICE backend yields []', async () => {
    // makeServiceBackend wraps classify errors → []
    const backend = makeServiceBackend({ classify: async () => { throw new Error('qdrant down'); } });
    const rs = createResolveSearch({ serviceBackend: backend, articleBackend: async () => [], srStatusBackend: async () => null });
    const res = await rs('laptop', CTX);
    expect(res).toEqual([]);
  });
});

describe('C3: live SERVICE via Qdrant flowdesk_services', () => {
  test('"laptop" returns at least one SERVICE hit (or degrades cleanly)', async () => {
    const resolveSearch = getResolveSearch();
    const res = await resolveSearch('I need a new laptop for a staff member', CTX);
    expect(Array.isArray(res)).toBe(true);
    const services = res.filter((r) => r.type === 'SERVICE');
    if (services.length === 0) {
      console.warn('[C3 live] flowdesk_services returned no SERVICE hit — infra empty?');
    } else {
      expect(typeof services[0].serviceId).toBe('string');
      expect(services[0].schemaRef).toHaveProperty('serviceId');
      expect(typeof services[0].score).toBe('number');
    }
  });
});

describe('C3: live SR_STATUS via Memgraph', () => {
  test('seeded ServiceRequest is found by exact ref and ranked first', async () => {
    await write(
      `MERGE (sr:ServiceRequest {srNumber:'SR-900001'})
       SET sr.status='IN_PROGRESS', sr.serviceId='IT-HW-LAP', sr.createdAt='2026-07-14T00:00:00Z'`);
    const resolveSearch = getResolveSearch();
    const res = await resolveSearch('what is the status of SR-900001', CTX);
    expect(res[0].type).toBe('SR_STATUS');
    expect(res[0].srNumber).toBe('SR-900001');
    expect(res[0].status).toBe('IN_PROGRESS');
    expect(res[0].score).toBe(1.0);
    // confirm it was actually read from Memgraph
    const recs = await read(`MATCH (sr:ServiceRequest {srNumber:'SR-900001'}) RETURN sr.status AS s`);
    expect(recs[0].get('s')).toBe('IN_PROGRESS');
  });
});
