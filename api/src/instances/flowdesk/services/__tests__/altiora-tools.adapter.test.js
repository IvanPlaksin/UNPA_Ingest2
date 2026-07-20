'use strict';

/**
 * F9.4g test — AltioraToolsAdapter: allowlist enforcement + Altiora isolation.
 */

const { createAltioraTools, ToolNotAllowedError } = require('../altiora-tools.adapter');

describe('F9.4: Altiora tools allowlist', () => {
  test('allowed tools pass isAllowed; unrelated tools are blocked', () => {
    const tools = createAltioraTools();
    expect(tools.isAllowed('kb.search')).toBe(true);
    expect(tools.isAllowed('catalog.search')).toBe(true);
    expect(tools.isAllowed('sr.status')).toBe(true);
    expect(tools.isAllowed('directory.resolveUser')).toBe(true);
    // Denied: platform tools unrelated to the Altiora chat
    expect(tools.isAllowed('backlog.list')).toBe(false);
    expect(tools.isAllowed('codex.createRule')).toBe(false);
    expect(tools.isAllowed('index.ingest')).toBe(false);
    expect(tools.isAllowed('query_knowledge_graph')).toBe(false);
  });

  test('calling a blocked tool throws ToolNotAllowedError', async () => {
    const tools = createAltioraTools();
    await expect(tools.call('backlog.list', {})).rejects.toBeInstanceOf(ToolNotAllowedError);
    await expect(tools.call('codex.createRule', {})).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
  });

  test('kb.search always applies the Altiora namespace', async () => {
    let seenNs = null;
    const articleBackend = async (_q, ctx) => { seenNs = ctx.namespace; return []; };
    const tools = createAltioraTools({ articleBackend });
    await tools.call('kb.search', { query: 'password reset', context: {} });
    expect(seenNs).toBe('Altiora');
  });

  test('namespace override is honoured (config)', async () => {
    let seenNs = null;
    const tools = createAltioraTools({ namespace: 'AltioraX', articleBackend: async (_q, ctx) => { seenNs = ctx.namespace; return []; } });
    await tools.call('kb.search', { query: 'x', context: {} });
    expect(seenNs).toBe('AltioraX');
  });

  test('directory tools route through the adapter', async () => {
    const directory = { resolveUser: async (q) => [{ userId: 'U9', name: q }] };
    const tools = createAltioraTools({ directory });
    const r = await tools.call('directory.resolveUser', { query: 'Test' });
    expect(r[0].userId).toBe('U9');
  });

  test('convenience wrappers go through the allowlist', async () => {
    const tools = createAltioraTools({
      serviceBackend: async () => [{ serviceId: 'IT-HW-LAP', title: 'Laptop', version: 1, score: 0.9 }],
      articleBackend: async () => [],
      srBackend: async () => null,
    });
    const svc = await tools.searchServices('laptop', {});
    expect(svc[0].serviceId).toBe('IT-HW-LAP');
  });
});
