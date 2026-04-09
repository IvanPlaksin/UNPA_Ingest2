const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');
const { ToolRegistry } = require('../server/ToolRegistry.js');
const { createAllPrimitives } = require('../tools/primitives/index.js');
const { createTextTools } = require('../tools/text/index.js');
const { createPatternTools } = require('../tools/patterns/index.js');

describe('Level 3 Pattern Tools', () => {
  let context;
  let registry;
  let mockServer;

  beforeEach(() => {
    context = new ToolExecutionContext();
    registry = new ToolRegistry();
    registry.registerBatch(createAllPrimitives());
    registry.registerBatch(createTextTools());
    registry.registerBatch(createPatternTools());

    mockServer = { registry, config: {} };
  });

  describe('Registration', () => {
    it('should register all 8 Pattern tools', () => {
      const patternTools = registry.listTools().filter(t => t.category === 'pattern');
      expect(patternTools).to.have.lengthOf(8);
    });

    it('should all be level 3', () => {
      const patternTools = registry.listTools().filter(t => t.category === 'pattern');
      patternTools.forEach(t => expect(t.level).to.equal(3));
    });
  });

  describe('pattern.rag', () => {
    it('should return RAG structure with mock provider', async () => {
      const tool = registry.getTool('pattern.rag');
      const result = await tool.execute({
        query: 'What is machine learning?',
        provider: 'mock'
      }, context, mockServer);

      expect(result.data).to.have.property('answer');
      expect(result.data).to.have.property('sources');
      expect(result.data).to.have.property('confidence');
    });
  });

  describe('pattern.map_reduce', () => {
    it('should map over items and reduce', async () => {
      const tool = registry.getTool('pattern.map_reduce');
      const result = await tool.execute({
        data: ['hello', 'world', 'test'],
        mapTool: 'text.normalize',
        mapArgs: { operations: ['uppercase'] }
      }, context, mockServer);

      expect(result.data.mapResults).to.have.lengthOf(3);
      expect(result.data.stats.itemsProcessed).to.equal(3);
    });

    it('should chunk text and process', async () => {
      const tool = registry.getTool('pattern.map_reduce');
      const result = await tool.execute({
        data: 'First chunk of text. Second chunk of text. Third chunk of text.',
        mapTool: 'text.tokenize',
        mapArgs: { mode: 'words' },
        chunkSize: 25,
        chunkOverlap: 5
      }, context, mockServer);

      expect(result.data.stats.itemsProcessed).to.be.greaterThan(1);
    });
  });

  describe('pattern.chain', () => {
    it('should execute steps in sequence', async () => {
      const tool = registry.getTool('pattern.chain');
      const result = await tool.execute({
        steps: [
          { tool: 'text.normalize', args: { text: 'Hello World TEST', operations: ['lowercase'] }, outputKey: 'normalized' },
          { tool: 'text.tokenize', args: { text: 'hello world test', mode: 'words' }, outputKey: 'tokens' }
        ],
        collectAllOutputs: true
      }, context, mockServer);

      expect(result.data.stepsExecuted).to.equal(2);
      expect(result.data.outputs.normalized.text).to.equal('hello world test');
    });

    it('should handle multiple steps', async () => {
      const tool = registry.getTool('pattern.chain');
      const result = await tool.execute({
        steps: [
          { tool: 'primitive.set_value', args: { path: 'count', value: 10 } },
          { tool: 'primitive.get_value', args: { path: 'count' } }
        ]
      }, context, mockServer);

      expect(result.data.stepsExecuted).to.equal(2);
      expect(result.data.result).to.equal(10);
    });
  });

  describe('pattern.parallel', () => {
    it('should execute tasks in parallel', async () => {
      const tool = registry.getTool('pattern.parallel');
      const result = await tool.execute({
        tasks: [
          { id: 'task1', tool: 'text.normalize', args: { text: 'HELLO', operations: ['lowercase'] } },
          { id: 'task2', tool: 'text.normalize', args: { text: 'WORLD', operations: ['lowercase'] } },
          { id: 'task3', tool: 'text.hash', args: { text: 'test' } }
        ]
      }, context, mockServer);

      expect(result.data.succeeded).to.have.lengthOf(3);
      expect(result.data.results.task1.text).to.equal('hello');
      expect(result.data.results.task2.text).to.equal('world');
    });
  });

  describe('pattern.retry', () => {
    it('should succeed on first attempt', async () => {
      const tool = registry.getTool('pattern.retry');
      const result = await tool.execute({
        tool: 'text.normalize',
        args: { text: 'TEST', operations: ['lowercase'] },
        maxRetries: 3
      }, context, mockServer);

      expect(result.data.attempts).to.equal(1);
      expect(result.data.result.text).to.equal('test');
    });
  });

  describe('pattern.cache', () => {
    it('should cache and return cached result', async () => {
      const tool = registry.getTool('pattern.cache');

      // First call - cache miss
      const result1 = await tool.execute({
        tool: 'text.hash',
        args: { text: 'test data' },
        ttl: 60000
      }, context, mockServer);

      expect(result1.data.cached).to.be.false;

      // Second call - cache hit
      const result2 = await tool.execute({
        tool: 'text.hash',
        args: { text: 'test data' },
        ttl: 60000
      }, context, mockServer);

      expect(result2.data.cached).to.be.true;
      expect(result2.data.result.hash).to.equal(result1.data.result.hash);
    });

    it('should invalidate cache', async () => {
      const tool = registry.getTool('pattern.cache');

      // Populate cache
      await tool.execute({
        tool: 'text.hash',
        args: { text: 'test' },
        cacheKey: 'test-key'
      }, context, mockServer);

      // Invalidate
      const result = await tool.execute({
        tool: 'text.hash',
        cacheKey: 'test-key',
        operation: 'invalidate'
      }, context, mockServer);

      expect(result.data.invalidated).to.be.true;
    });
  });

  describe('pattern.batch', () => {
    it('should process items in batches', async () => {
      const tool = registry.getTool('pattern.batch');
      const result = await tool.execute({
        tool: 'text.normalize',
        items: ['HELLO', 'WORLD', 'TEST', 'BATCH'],
        argsTemplate: { text: '{{item}}', operations: ['lowercase'] },
        batchSize: 2
      }, context, mockServer);

      expect(result.data.successful).to.equal(4);
      expect(result.data.stats.batchCount).to.equal(2);
    });

    it('should continue on error if configured', async () => {
      const tool = registry.getTool('pattern.batch');
      const result = await tool.execute({
        tool: 'text.normalize',
        items: ['valid', null, 'also-valid'],
        argsTemplate: { text: '{{item}}', operations: ['lowercase'] },
        continueOnError: true
      }, context, mockServer);

      expect(result.data.successful).to.be.greaterThan(0);
    });
  });

  describe('pattern.pipeline', () => {
    it('should execute pipeline stages', async () => {
      const tool = registry.getTool('pattern.pipeline');
      const result = await tool.execute({
        stages: [
          { id: 'normalize', tool: 'text.normalize', args: { text: '  Hello World Test  ', operations: ['lowercase', 'trim'] } },
          { id: 'hash', tool: 'text.hash', args: { text: 'test' }, inputs: ['normalize'] }
        ],
        input: {}
      }, context, mockServer);

      expect(result.data.executionOrder).to.include('normalize');
      expect(result.data.executionOrder).to.include('hash');
      expect(result.data.stageOutputs.normalize.text).to.equal('hello world test');
    });

    it('should handle conditional stages', async () => {
      const tool = registry.getTool('pattern.pipeline');
      const result = await tool.execute({
        stages: [
          { id: 'check', tool: 'primitive.compare', args: { left: 10, op: 'gt', right: 5 } },
          {
            id: 'process',
            tool: 'text.normalize',
            args: { text: 'TEST', operations: ['lowercase'] },
            condition: { stage: 'check', op: 'eq', value: true }
          }
        ],
        input: {}
      }, context, mockServer);

      expect(result.data.stageOutputs.process.text).to.equal('test');
    });
  });
});
