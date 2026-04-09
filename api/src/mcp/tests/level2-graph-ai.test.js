const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');
const { ToolRegistry } = require('../server/ToolRegistry.js');
const { createGraphTools } = require('../tools/graph/index.js');
const { createAITools } = require('../tools/ai/index.js');

describe('Level 2 Graph & AI Tools', () => {
  let context;
  let registry;

  beforeEach(() => {
    context = new ToolExecutionContext();
    registry = new ToolRegistry();
    registry.registerBatch(createGraphTools());
    registry.registerBatch(createAITools());
  });

  describe('Registration', () => {
    it('should register all 11 Graph & AI tools', () => {
      expect(registry.listTools()).to.have.lengthOf(11);
    });

    it('should all be level 2', () => {
      registry.listTools().forEach(t => expect(t.level).to.equal(2));
    });

    it('should have correct categories', () => {
      const graphTools = registry.listTools().filter(t => t.category === 'graph');
      const aiTools = registry.listTools().filter(t => t.category === 'ai');
      expect(graphTools).to.have.lengthOf(6);
      expect(aiTools).to.have.lengthOf(5);
    });
  });

  // Graph Tools
  describe('graph.query', () => {
    it('should block write operations in read-only mode', async () => {
      const tool = registry.getTool('graph.query');
      try {
        await tool.execute({
          cypher: 'CREATE (n:Test {name: "test"})',
          readOnly: true
        }, context);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('WRITE_NOT_ALLOWED');
      }
    });

    it('should allow read queries', async () => {
      const tool = registry.getTool('graph.query');
      const result = await tool.execute({
        cypher: 'MATCH (n) RETURN n LIMIT 10',
        readOnly: true
      }, context);
      expect(result.data).to.have.property('records');
    });
  });

  describe('graph.create_node', () => {
    it('should generate node structure', async () => {
      const tool = registry.getTool('graph.create_node');
      const result = await tool.execute({
        labels: ['Person', 'User'],
        properties: { name: 'John', age: 30 }
      }, context);
      expect(result.data.labels).to.deep.equal(['Person', 'User']);
      expect(result.data.properties.name).to.equal('John');
      expect(result.data.id).to.be.a('string');
    });
  });

  describe('graph.create_edge', () => {
    it('should generate edge structure', async () => {
      const tool = registry.getTool('graph.create_edge');
      const result = await tool.execute({
        from: 'node-1',
        to: 'node-2',
        type: 'KNOWS',
        properties: { since: 2020 }
      }, context);
      expect(result.data.from).to.equal('node-1');
      expect(result.data.to).to.equal('node-2');
      expect(result.data.type).to.equal('KNOWS');
    });
  });

  describe('graph.find_path', () => {
    it('should return path structure', async () => {
      const tool = registry.getTool('graph.find_path');
      const result = await tool.execute({
        from: 'node-1',
        to: 'node-2',
        maxDepth: 5
      }, context);
      expect(result.data).to.have.property('paths');
      expect(result.data).to.have.property('found');
    });
  });

  describe('graph.neighbors', () => {
    it('should return neighbors structure', async () => {
      const tool = registry.getTool('graph.neighbors');
      const result = await tool.execute({
        nodeId: 'node-1',
        direction: 'both',
        depth: 2
      }, context);
      expect(result.data).to.have.property('neighbors');
      expect(result.data).to.have.property('count');
    });
  });

  describe('graph.traverse', () => {
    it('should return traversal structure', async () => {
      const tool = registry.getTool('graph.traverse');
      const result = await tool.execute({
        startNode: 'node-1',
        strategy: 'bfs',
        maxDepth: 3
      }, context);
      expect(result.data).to.have.property('nodes');
      expect(result.data).to.have.property('levels');
      expect(result.data).to.have.property('stats');
    });
  });

  // AI Tools
  describe('ai.complete', () => {
    it('should generate mock completion', async () => {
      const tool = registry.getTool('ai.complete');
      const result = await tool.execute({
        prompt: 'What is machine learning?',
        provider: 'mock'
      }, context);
      expect(result.data.text).to.be.a('string');
      expect(result.data.model).to.equal('mock');
    });

    it('should include usage stats', async () => {
      const tool = registry.getTool('ai.complete');
      const result = await tool.execute({
        prompt: 'Hello world',
        provider: 'mock'
      }, context);
      expect(result.data.usage).to.have.property('promptTokens');
      expect(result.data.usage).to.have.property('completionTokens');
    });
  });

  describe('ai.chat', () => {
    it('should handle conversation', async () => {
      const tool = registry.getTool('ai.chat');
      const result = await tool.execute({
        message: 'Hello!',
        history: [],
        provider: 'mock'
      }, context);
      expect(result.data.response).to.be.a('string');
      expect(result.data.history).to.be.an('array');
    });

    it('should maintain history', async () => {
      const tool = registry.getTool('ai.chat');
      const result = await tool.execute({
        message: 'Second message',
        history: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' }
        ],
        provider: 'mock'
      }, context);
      expect(result.data.history).to.have.lengthOf(4); // 2 history + new user + new assistant
    });
  });

  describe('ai.summarize', () => {
    it('should summarize text', async () => {
      const tool = registry.getTool('ai.summarize');
      const result = await tool.execute({
        text: 'Machine learning is a subset of artificial intelligence. It involves training algorithms on data to make predictions or decisions. Neural networks are a popular machine learning technique.',
        style: 'brief',
        provider: 'mock'
      }, context);
      expect(result.data.summary).to.be.a('string');
      expect(result.data.wordCount).to.be.a('number');
      expect(result.data.compressionRatio).to.be.greaterThan(1);
    });

    it('should extract key points', async () => {
      const tool = registry.getTool('ai.summarize');
      const result = await tool.execute({
        text: 'First important point here. Second significant finding. Third notable observation.',
        style: 'key_points',
        provider: 'mock'
      }, context);
      expect(result.data.keyPoints).to.be.an('array');
    });
  });

  describe('ai.classify', () => {
    it('should classify with categories', async () => {
      const tool = registry.getTool('ai.classify');
      const result = await tool.execute({
        text: 'What is the weather like today?',
        categories: ['question', 'statement', 'command'],
        provider: 'mock'
      }, context);
      expect(result.data.category).to.be.a('string');
      expect(result.data.confidence).to.be.a('number');
    });

    it('should support multi-label', async () => {
      const tool = registry.getTool('ai.classify');
      const result = await tool.execute({
        text: 'Please help me understand how this code works',
        categories: ['question', 'request', 'technical'],
        multiLabel: true,
        provider: 'mock'
      }, context);
      expect(result.data.categories).to.be.an('array');
      expect(result.data.confidences).to.be.an('object');
    });
  });

  describe('ai.extract', () => {
    it('should extract structured data', async () => {
      const tool = registry.getTool('ai.extract');
      const result = await tool.execute({
        text: 'Contact John at john@example.com or call 555-123-4567',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Person name' },
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number' }
          },
          required: ['email']
        },
        provider: 'mock'
      }, context);
      expect(result.data.data).to.be.an('object');
      expect(result.data.confidence).to.be.a('number');
    });

    it('should report missing fields', async () => {
      const tool = registry.getTool('ai.extract');
      const result = await tool.execute({
        text: 'Hello world',
        schema: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            url: { type: 'string' }
          },
          required: ['email', 'url']
        },
        provider: 'mock'
      }, context);
      expect(result.data.missingFields).to.be.an('array');
    });
  });
});
