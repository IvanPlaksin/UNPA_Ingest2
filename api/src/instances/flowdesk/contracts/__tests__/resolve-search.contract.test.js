'use strict';

/**
 * Contract 3 test — resolve.search.
 *
 * Validates the typed-union output against resolve-search.schema.json and the
 * orchestration invariants (SR exact-match priority, service tiers, article
 * deflection, cross-type ranking, limit) using mock backends.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { resolveSearch } = require('../resolve-search.stub');

const CONTRACT_DIR = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'resolve-search.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateResults = ajv.compile(schema);

function assertValid(results) {
  const ok = validateResults(results);
  if (!ok) throw new Error('ResolveResult[] invalid:\n' + JSON.stringify(validateResults.errors, null, 2));
}

const CTX = { userId: 'u-1', missionId: 'MONUSCO', lang: 'en', roles: ['staff'] };

// Mock backends
const backends = {
  async searchServices(query) {
    if (/laptop|hardware|device/i.test(query)) {
      return [
        { serviceId: 'IT-HW-LAP', title: 'Laptop provisioning', domain: 'IT', level: 3, version: 1, score: 0.91 },
        { serviceId: 'IT-HW-MON', title: 'Monitor request', domain: 'IT', level: 3, version: 1, score: 0.62 },
      ];
    }
    return [];
  },
  async searchArticles(query) {
    if (/password|reset|login/i.test(query)) {
      return [
        { articleId: 'KB-1007', title: 'How to reset your password', summary: 'Self-service reset via Unite ID.', sourceCollection: 'it_knowledge', answerSnippet: 'Go to id.un.org → Forgot password.', score: 0.88 },
      ];
    }
    return [];
  },
  async getSRStatus(srNumber) {
    if (srNumber === 'SR-12345') {
      return { srNumber: 'SR-12345', status: 'IN_PROGRESS', title: 'Laptop for new hire', createdAt: '2026-07-10T09:00:00Z', updatedAt: '2026-07-13T14:00:00Z' };
    }
    return null;
  },
};

describe('Contract 3: resolve.search typed union', () => {
  test('query "laptop" → SERVICE hits, typed + valid + tiered', async () => {
    const res = await resolveSearch('I need a laptop', CTX, { backends });
    assertValid(res);
    expect(res.length).toBe(2);
    expect(res.every((r) => r.type === 'SERVICE')).toBe(true);
    expect(res[0].serviceId).toBe('IT-HW-LAP');
    expect(res[0].confidence).toBe('high');       // 0.91, gap 0.29
    expect(res[0].schemaRef).toEqual({ serviceId: 'IT-HW-LAP', version: 1 });
  });

  test('query "SR-12345" → SR_STATUS exact, score 1.0, ranked first', async () => {
    const res = await resolveSearch('what is the status of SR-12345?', CTX, { backends });
    assertValid(res);
    expect(res[0].type).toBe('SR_STATUS');
    expect(res[0].srNumber).toBe('SR-12345');
    expect(res[0].score).toBe(1.0);
    expect(res[0].status).toBe('IN_PROGRESS');
  });

  test('query "password reset" → ARTICLE with deflection snippet', async () => {
    const res = await resolveSearch('how do I do a password reset', CTX, { backends });
    assertValid(res);
    expect(res.length).toBe(1);
    expect(res[0].type).toBe('ARTICLE');
    expect(res[0].articleId).toBe('KB-1007');
    expect(res[0].answerSnippet).toMatch(/id\.un\.org/);
  });

  test('cross-type ranking: SR exact first, then services by score', async () => {
    // Mixed query: contains an SR ref AND service keywords
    const res = await resolveSearch('laptop status SR-12345', CTX, { backends });
    assertValid(res);
    expect(res[0].type).toBe('SR_STATUS');
    expect(res[1].type).toBe('SERVICE');
    expect(res[1].serviceId).toBe('IT-HW-LAP');
    // scores strictly non-increasing after the SR boost
    const svcScores = res.filter((r) => r.type === 'SERVICE').map((r) => r.score);
    expect(svcScores).toEqual([...svcScores].sort((a, b) => b - a));
  });

  test('limit is honoured (default 5)', async () => {
    const many = {
      async searchServices() {
        return Array.from({ length: 8 }, (_, i) => ({ serviceId: `IT-HW-X${i}`, title: `svc${i}`, version: 1, score: 0.5 - i * 0.01 }));
      },
      async searchArticles() { return []; },
      async getSRStatus() { return null; },
    };
    const res = await resolveSearch('hardware', CTX, { backends: many });
    expect(res.length).toBe(5);
  });

  test('no matches → empty array (valid)', async () => {
    const res = await resolveSearch('completely unrelated gibberish', CTX, { backends });
    assertValid(res);
    expect(res).toEqual([]);
  });

  test('inert default backends → empty array (no infra needed)', async () => {
    const res = await resolveSearch('laptop', CTX);
    expect(res).toEqual([]);
  });
});
