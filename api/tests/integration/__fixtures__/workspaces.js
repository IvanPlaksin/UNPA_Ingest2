/**
 * Test fixtures for workspace integration tests.
 */
'use strict';

const WORKSPACE_FIXTURE = {
  name: 'Test Workspace',
  description: 'Integration test workspace',
  domain: 'testing',
  createdBy: 'test-user',
  tags: ['integration', 'test']
};

const DRAFT_FIXTURE = {
  type: 'entity',
  name: 'TestEntity',
  description: 'A test entity for integration',
  properties: { key: 'value' },
  sourceId: 'src-1'
};

const EDGE_FIXTURE = {
  sourceNodeId: 'draft-1',
  targetNodeId: 'draft-2',
  relationType: 'RELATES_TO',
  confidence: 0.85
};

const SOURCE_FIXTURE = {
  name: 'test-source.json',
  sourceType: 'FILE',
  config: { path: '/test/source.json' }
};

const STATUS_TRANSITIONS = {
  valid: [
    ['CREATED', 'PROFILING'],
    ['PROFILING', 'READY'],
    ['READY', 'EXTRACTING'],
    ['EXTRACTING', 'READY'],
    ['READY', 'REVIEW'],
    ['REVIEW', 'PROMOTED']
  ],
  invalid: [
    ['CREATED', 'PROMOTED'],
    ['PROMOTED', 'CREATED'],
    ['ARCHIVED', 'READY'],
    ['CREATED', 'REVIEW']
  ]
};

module.exports = {
  WORKSPACE_FIXTURE,
  DRAFT_FIXTURE,
  EDGE_FIXTURE,
  SOURCE_FIXTURE,
  STATUS_TRANSITIONS
};
