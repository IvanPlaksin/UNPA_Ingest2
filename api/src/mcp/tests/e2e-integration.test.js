const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { createGXEServer, createAllTools } = require('../index.js');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');

describe('E2E Integration Tests', function() {
  this.timeout(60000); // Longer timeout for real services

  let server;
  let context;

  before(async () => {
    server = await createGXEServer();
    context = new ToolExecutionContext();
  });

  after(async () => {
    if (server?.serviceConnector) {
      await server.serviceConnector.close();
    }
  });

  describe('Tool Registration', () => {
    it('should register all 57 tools', () => {
      const tools = server.registry.listTools();
      expect(tools.length).to.be.at.least(57);
    });

    it('should have tools at all 4 levels', () => {
      const tools = server.registry.listTools();
      const levels = new Set(tools.map(t => t.level));
      expect(levels).to.include(1);
      expect(levels).to.include(2);
      expect(levels).to.include(3);
      expect(levels).to.include(4);
    });

    it('should have all tool categories', () => {
      const tools = server.registry.listTools();
      const categories = new Set(tools.map(t => t.category));
      expect(categories).to.include('primitive');
      expect(categories).to.include('text');
      expect(categories).to.include('extraction');
      expect(categories).to.include('vector');
      expect(categories).to.include('graph');
      expect(categories).to.include('ai');
      expect(categories).to.include('pattern');
      expect(categories).to.include('meta');
    });
  });

  describe('Text Processing Pipeline', () => {
    it('should process text through normalize -> tokenize -> hash chain', async () => {
      const chainTool = server.registry.getTool('pattern.chain');
      const result = await chainTool.execute({
        steps: [
          {
            tool: 'text.normalize',
            args: { text: '  Hello World TEST  ', operations: ['lowercase', 'trim'] },
            outputKey: 'normalized'
          },
          {
            tool: 'text.tokenize',
            args: { text: 'hello world test', mode: 'words' },
            outputKey: 'tokens'
          },
          {
            tool: 'text.hash',
            args: { text: 'hello world test' },
            outputKey: 'hash'
          }
        ],
        collectAllOutputs: true
      }, context, server);

      expect(result.data.stepsExecuted).to.equal(3);
      expect(result.data.outputs.normalized.text).to.equal('hello world test');
      expect(result.data.outputs.tokens.tokens).to.include('hello');
      expect(result.data.outputs.hash.hash).to.be.a('string');
    });
  });

  describe('Extraction Pipeline', () => {
    it('should extract entities and structure from text', async () => {
      const text = `
        # Project Overview
        The project manager John Smith (john@company.com) announced a deadline of 2024-12-31.
        Contact Bob at bob@test.org for technical details.
        Budget: $150,000
      `;

      // Extract regex patterns
      const regexTool = server.registry.getTool('extraction.regex');
      const emailResult = await regexTool.execute({
        text,
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'
      }, context, server);
      expect(emailResult.data.matches.length).to.be.at.least(2);

      // Extract structure
      const structTool = server.registry.getTool('extraction.structure');
      const structResult = await structTool.execute({
        text,
        format: 'markdown'
      }, context, server);
      expect(structResult.data.structure).to.be.an('object');
    });
  });

  describe('Vector Operations (Mock)', () => {
    it('should embed and compute similarity', async () => {
      const embedTool = server.registry.getTool('vector.embed');
      const simTool = server.registry.getTool('vector.similarity');

      // Embed two texts
      const embed1 = await embedTool.execute({
        text: 'machine learning algorithms',
        provider: 'mock'
      }, context, server);

      const embed2 = await embedTool.execute({
        text: 'deep neural networks',
        provider: 'mock'
      }, context, server);

      expect(embed1.data.embeddings[0]).to.be.an('array');
      expect(embed2.data.embeddings[0]).to.be.an('array');

      // Compute similarity
      const similarity = await simTool.execute({
        vectorA: embed1.data.embeddings[0],
        vectorB: embed2.data.embeddings[0]
      }, context, server);

      expect(similarity.data.similarity).to.be.a('number');
      expect(similarity.data.similarity).to.be.within(-1, 1);
    });
  });

  describe('AI Operations (Mock)', () => {
    it('should generate completion', async () => {
      const completeTool = server.registry.getTool('ai.complete');
      const result = await completeTool.execute({
        prompt: 'Explain machine learning in simple terms',
        provider: 'mock',
        maxTokens: 100
      }, context, server);

      expect(result.data.text).to.be.a('string');
      expect(result.data.model).to.equal('mock');
    });

    it('should summarize text', async () => {
      const summarizeTool = server.registry.getTool('ai.summarize');
      const result = await summarizeTool.execute({
        text: 'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed. It focuses on developing computer programs that can access data and use it to learn for themselves.',
        provider: 'mock'
      }, context, server);

      expect(result.data.summary).to.be.a('string');
    });
  });

  describe('Pattern Compositions', () => {
    it('should execute parallel tasks', async () => {
      const parallelTool = server.registry.getTool('pattern.parallel');
      const result = await parallelTool.execute({
        tasks: [
          { id: 'hash1', tool: 'text.hash', args: { text: 'test1' } },
          { id: 'hash2', tool: 'text.hash', args: { text: 'test2' } },
          { id: 'hash3', tool: 'text.hash', args: { text: 'test3' } }
        ]
      }, context, server);

      expect(result.data.succeeded).to.have.lengthOf(3);
      expect(result.data.results.hash1.hash).to.not.equal(result.data.results.hash2.hash);
    });

    it('should batch process items', async () => {
      const batchTool = server.registry.getTool('pattern.batch');
      const result = await batchTool.execute({
        tool: 'text.normalize',
        items: ['HELLO', 'WORLD', 'TEST', 'BATCH', 'DATA'],
        argsTemplate: { text: '{{item}}', operations: ['lowercase'] },
        batchSize: 2
      }, context, server);

      expect(result.data.successful).to.equal(5);
      expect(result.data.stats.batchCount).to.equal(3);
    });

    it('should execute pipeline with DAG', async () => {
      const pipelineTool = server.registry.getTool('pattern.pipeline');
      const result = await pipelineTool.execute({
        stages: [
          { id: 'normalize', tool: 'text.normalize', args: { text: '  TEST DATA  ', operations: ['lowercase', 'trim'] }, inputs: [] },
          { id: 'tokenize', tool: 'text.tokenize', args: { text: 'test data', mode: 'words' }, inputs: ['normalize'] },
          { id: 'hash', tool: 'text.hash', args: { text: 'test data' }, inputs: ['normalize'] }
        ],
        input: {}
      }, context, server);

      expect(result.data.executionOrder).to.include('normalize');
      expect(result.data.stageOutputs.normalize.text).to.equal('test data');
      expect(result.data.stageOutputs.hash.hash).to.be.a('string');
    });
  });

  describe('Meta Operations', () => {
    it('should introspect system capabilities', async () => {
      const introspectTool = server.registry.getTool('meta.introspect');
      const result = await introspectTool.execute({
        target: 'capabilities'
      }, context, server);

      expect(result.data.data.features.hasAI).to.be.true;
      expect(result.data.data.features.hasGraph).to.be.true;
      expect(result.data.data.features.hasVector).to.be.true;
      expect(result.data.data.features.hasMeta).to.be.true;
    });

    it('should optimize pipeline', async () => {
      const optimizeTool = server.registry.getTool('meta.optimize');
      const result = await optimizeTool.execute({
        pipeline: [
          { id: 'a', tool: 'text.normalize', inputs: [] },
          { id: 'b', tool: 'text.hash', inputs: [] },
          { id: 'c', tool: 'ai.complete', inputs: ['a'] },
          { id: 'd', tool: 'text.tokenize', inputs: ['a', 'b'] }
        ],
        optimizations: ['parallelize', 'cache']
      }, context, server);

      expect(result.data.improvements.length).to.be.greaterThan(0);
      expect(result.data.estimatedSpeedup).to.be.greaterThan(1);
    });

    it('should execute tool in sandbox', async () => {
      const sandboxTool = server.registry.getTool('meta.sandbox');
      const result = await sandboxTool.execute({
        tool: 'text.hash',
        args: { text: 'sandboxed test' },
        isolation: 'context',
        timeout: 5000
      }, context, server);

      expect(result.data.result.hash).to.be.a('string');
      expect(result.data.sandbox.isolated).to.be.true;
    });
  });

  describe('Full RAG Pipeline (Mock)', () => {
    it('should execute RAG pattern', async () => {
      const ragTool = server.registry.getTool('pattern.rag');
      try {
        const result = await ragTool.execute({
          query: 'What is machine learning?',
          provider: 'mock'
        }, context, server);

        expect(result.data).to.have.property('answer');
        expect(result.data).to.have.property('sources');
        expect(result.data).to.have.property('confidence');
      } catch (error) {
        // RAG requires Qdrant collection - skip if not available
        if (error.message.includes('Collection') && error.message.includes("doesn't exist")) {
          console.log('      (Skipped: Qdrant collection not available)');
          return;
        }
        throw error;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle tool not found gracefully', async () => {
      const result = await server.executeTool('nonexistent.tool', {});
      expect(result.isError).to.be.true;
    });

    it('should respect safety guards for write operations', async () => {
      const queryTool = server.registry.getTool('graph.query');
      try {
        await queryTool.execute({
          cypher: 'CREATE (n:Test)',
          readOnly: true
        }, context, server);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('WRITE_NOT_ALLOWED');
      }
    });
  });
});
