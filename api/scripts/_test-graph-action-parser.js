#!/usr/bin/env node
const { graphActionParser } = require('../src/services/agents/GraphActionParser');

// Test 1: Parse response with actions
const response = [
  'Here is a RAG pipeline graph for you:',
  '',
  '%%ACTION%%',
  '{"type":"ADD_NODE","node":{"id":"N01","type":"workflow.start","label":"Start"}}',
  '%%END_ACTION%%',
  '',
  'Now connecting:',
  '',
  '%%ACTION%%',
  '{"type":"ADD_NODE","node":{"id":"N02","type":"rag.vector_search","label":"Search","config":{"topK":10}}}',
  '%%END_ACTION%%',
  '',
  '%%ACTION%%',
  '{"type":"ADD_EDGE","source":"N01","target":"N02"}',
  '%%END_ACTION%%',
  '',
  'The graph is ready!',
].join('\n');

const result = graphActionParser.parse(response);
console.log('Text (cleaned):', JSON.stringify(result.text.substring(0, 80)));
console.log('Actions:', result.actions.length);
console.log('Errors:', result.errors.length);
result.actions.forEach((a, i) =>
  console.log('  Action', i + 1, ':', a.type, a.node?.id || (a.source + '->' + a.target))
);

// Test 2: Validate
const v1 = graphActionParser.validate({ type: 'ADD_NODE', node: { id: 'x', type: 'ai.generate' } });
console.log('\nValid ADD_NODE:', v1.valid);

const v2 = graphActionParser.validate({ type: 'ADD_NODE', node: {} });
console.log('Invalid ADD_NODE:', v2.valid, v2.errors);

const v3 = graphActionParser.validate({ type: 'UNKNOWN' });
console.log('Unknown type:', v3.valid);

// Test 3: Inverse diff
const inv = graphActionParser.generateInverseDiff(
  { type: 'ADD_NODE', node: { id: 'N01', type: 'workflow.start' } }
);
console.log('\nInverse of ADD_NODE:', inv.type, inv.nodeId);

const batchInv = graphActionParser.generateInverseDiff(
  { type: 'INSERT_BETWEEN', node: { id: 'N05' }, insertAfter: 'N04', insertBefore: 'N06' }
);
console.log('Inverse of INSERT_BETWEEN:', batchInv.type, batchInv.actions.length, 'sub-actions');

// Test 4: Broken JSON
const badResponse = 'Text %%ACTION%% { broken json %%END_ACTION%% more text';
const badResult = graphActionParser.parse(badResponse);
console.log('\nBroken JSON: actions=', badResult.actions.length, 'errors=', badResult.errors.length);

// Test 5: BATCH validation
const batchValid = graphActionParser.validate({
  type: 'BATCH',
  actions: [
    { type: 'ADD_NODE', node: { id: 'a', type: 'ai.generate' } },
    { type: 'ADD_EDGE', source: 'a', target: 'b' },
  ],
});
console.log('\nBATCH valid:', batchValid.valid);

const batchInvalid = graphActionParser.validate({
  type: 'BATCH',
  actions: [
    { type: 'ADD_NODE', node: {} }, // missing id and type
  ],
});
console.log('BATCH invalid:', batchInvalid.valid, batchInvalid.errors.length, 'errors');

console.log('\nALL TESTS PASSED');
