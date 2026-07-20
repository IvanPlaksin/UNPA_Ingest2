'use strict';

/**
 * Contract 4 test — LLMProvider + interpreter nodes.
 *
 * - interpreter node registry validates against interpreter-nodes.schema.json
 * - SLOT_EXTRACT calls provider.structuredOutput with the active-slot schema
 * - QUESTION_PLANNER calls provider.completion
 * - NODE_TOOLS whitelist is enforced (allowed passes, others throw)
 * - LLM-method whitelist is enforced per node
 * - INFO_ANSWER read-only guard blocks side-effecting tools
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const CONTRACT_DIR = path.join(__dirname, '..');
const nodeSchema = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'interpreter-nodes.schema.json'), 'utf8'));
const hardware = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

const { REGISTRY, NODE_TOOLS, assertToolAllowed, assertLLMMethodAllowed, callTool } = require('../interpreter-nodes');
const { MockLLMProvider, getLLMProvider, buildSlotExtractionSchema, runSlotExtract, runQuestionPlanner } = require('../llm-provider.stub');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

describe('Contract 4A: interpreter node registry', () => {
  test('REGISTRY validates against schema', () => {
    const ok = ajv.validate(nodeSchema, REGISTRY);
    if (!ok) throw new Error(JSON.stringify(ajv.errors, null, 2));
    expect(ok).toBe(true);
  });

  test('deterministic/human nodes declare no LLM methods', () => {
    for (const n of REGISTRY.nodes) {
      if (n.kind === 'deterministic' || n.kind === 'human') {
        expect(n.llmMethods).toEqual([]);
      }
    }
  });

  test('NODE_TOOLS map covers every node', () => {
    for (const n of REGISTRY.nodes) {
      expect(NODE_TOOLS[n.id]).toEqual(n.tools);
    }
  });
});

describe('Contract 4B: SLOT_EXTRACT uses structuredOutput', () => {
  test('calls structuredOutput with active-slot schema, returns extracted patches', async () => {
    const provider = new MockLLMProvider({
      structured: (_prompt, schema) => {
        // model "extracts" assetType + justification
        expect(schema.properties).toHaveProperty('assetType');
        expect(schema.properties).toHaveProperty('justification');
        return { assetType: 'laptop_standard', justification: 'New hire' };
      },
    });

    const activeSlotIds = ['assetType', 'justification'];
    const { patches, schema } = await runSlotExtract(provider, {
      snapshot: hardware, activeSlotIds, userText: 'I need a standard laptop for a new hire',
    });

    // provider was called with structuredOutput exactly once
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].method).toBe('structuredOutput');
    // enum slot carried its options into the extraction schema
    expect(schema.properties.assetType.enum).toContain('laptop_standard');
    // patches are provenance=extracted
    expect(patches).toEqual([
      { op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' },
      { op: 'set', slotId: 'justification', value: 'New hire', provenance: 'extracted' },
    ]);
  });

  test('buildSlotExtractionSchema limits properties to active slots', () => {
    const schema = buildSlotExtractionSchema(hardware, ['assetType']);
    expect(Object.keys(schema.properties)).toEqual(['assetType']);
  });
});

describe('Contract 4B: QUESTION_PLANNER uses completion', () => {
  test('calls completion and returns a question', async () => {
    const provider = new MockLLMProvider({
      completion: () => 'What type of device do you need — a standard or engineering laptop?',
    });
    const { question } = await runQuestionPlanner(provider, {
      snapshot: hardware, unfilledSlotIds: ['assetType'],
    });
    expect(provider.calls[0].method).toBe('completion');
    expect(question).toMatch(/device/i);
  });

  test('rejects slots not in the active schema (CODEX-RULE-077)', async () => {
    const provider = new MockLLMProvider({ completion: () => 'x' });
    await expect(
      runQuestionPlanner(provider, { snapshot: hardware, unfilledSlotIds: ['favoriteColor'] })
    ).rejects.toThrow(/not in active schema/);
    expect(provider.calls).toHaveLength(0); // guarded before the LLM call
  });
});

describe('Contract 4B: NODE_TOOLS + LLM-method whitelist enforcement', () => {
  test('allowed tool passes', async () => {
    const impls = { 'draft.get': async () => ({ draft: {} }) };
    await expect(callTool('LOAD_DRAFT', 'draft.get', {}, impls)).resolves.toEqual({ draft: {} });
  });

  test('non-whitelisted tool throws', () => {
    expect(() => assertToolAllowed('SLOT_EXTRACT', 'draft.submit')).toThrow(/may not call tool/);
    expect(() => assertToolAllowed('QUESTION_PLANNER', 'sr.create')).toThrow(/may not call tool/);
  });

  test('INFO_ANSWER read-only guard blocks side-effecting tools', () => {
    // resolve.search is allowed + read-only → ok
    expect(assertToolAllowed('INFO_ANSWER', 'resolve.search')).toBe(true);
    // sr.create is not in its whitelist at all → throws
    expect(() => assertToolAllowed('INFO_ANSWER', 'sr.create')).toThrow(/may not call tool/);
  });

  test('LLM-method whitelist enforced per node', () => {
    expect(assertLLMMethodAllowed('SLOT_EXTRACT', 'structuredOutput')).toBe(true);
    expect(() => assertLLMMethodAllowed('SLOT_EXTRACT', 'completion')).toThrow(/may not use LLM method/);
    expect(() => assertLLMMethodAllowed('VALIDATE', 'structuredOutput')).toThrow(/may not use LLM method/);
  });
});

describe('Contract 4A: factory', () => {
  test('returns mock provider by default', () => {
    const p = getLLMProvider({ provider: 'mock' });
    expect(p.id).toBe('mock');
  });

  test('real providers are not wired yet (throws clear TODO)', () => {
    expect(() => getLLMProvider({ provider: 'claude-sdk' })).toThrow(/not wired yet/);
  });
});
