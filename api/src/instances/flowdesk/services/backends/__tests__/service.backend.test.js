'use strict';

/**
 * SERVICE retrieval backend (C3 + IP-KB): hybrid graph+vector path with a
 * pure-vector fallback. All deps injected — hermetic.
 */

const { makeServiceBackend } = require('../service.backend');

describe('service.backend — hybrid + fallback', () => {
  const HYBRID_HIT = [{ serviceId: 'EO-HR-SA-SS-ISP', title: 'Support', domain: 'EO-HR', score: 0.9, source: 'hybrid' }];
  const CLASSIFY_RES = {
    top_match: { service_code: 'EO-FIN-GM-GA-ACA', service_name: 'Grant', domain_code: 'EO-FIN', score: 0.6 },
    alternatives: [],
  };

  it('uses the hybrid path when it returns hits (graph+vector via linkage)', async () => {
    let classifyCalled = false;
    const backend = makeServiceBackend({
      hybridEnabled: true,
      hybrid: async () => HYBRID_HIT,
      classify: async () => { classifyCalled = true; return CLASSIFY_RES; },
      versionOf: async () => 2,
    });
    const out = await backend('I need IT help', { lang: 'en' });
    expect(classifyCalled).toBe(false);
    expect(out).toEqual([{ serviceId: 'EO-HR-SA-SS-ISP', title: 'Support', domain: 'EO-HR', level: 3, version: 2, score: 0.9 }]);
  });

  it('falls back to pure-vector classify when hybrid returns nothing', async () => {
    const backend = makeServiceBackend({
      hybridEnabled: true,
      hybrid: async () => [],
      classify: async () => CLASSIFY_RES,
      versionOf: async () => 1,
    });
    const out = await backend('grant application', {});
    expect(out).toEqual([{ serviceId: 'EO-FIN-GM-GA-ACA', title: 'Grant', domain: 'EO-FIN', level: 3, version: 1, score: 0.6 }]);
  });

  it('falls back when the hybrid path throws (no regression)', async () => {
    const backend = makeServiceBackend({
      hybridEnabled: true,
      hybrid: async () => { throw new Error('memgraph down'); },
      classify: async () => CLASSIFY_RES,
    });
    const out = await backend('grant', {});
    expect(out[0].serviceId).toBe('EO-FIN-GM-GA-ACA');
  });

  it('skips hybrid entirely when disabled', async () => {
    let hybridCalled = false;
    const backend = makeServiceBackend({
      hybridEnabled: false,
      hybrid: async () => { hybridCalled = true; return HYBRID_HIT; },
      classify: async () => CLASSIFY_RES,
    });
    await backend('x', {});
    expect(hybridCalled).toBe(false);
  });
});
