const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');
const { ToolRegistry } = require('../server/ToolRegistry.js');
const { createTextTools } = require('../tools/text/index.js');
const { createExtractionTools } = require('../tools/extraction/index.js');
const { createVectorTools } = require('../tools/vector/index.js');

describe('Level 2 Tools', () => {
  let context;
  let registry;

  beforeEach(() => {
    context = new ToolExecutionContext();
    registry = new ToolRegistry();
    registry.registerBatch(createTextTools());
    registry.registerBatch(createExtractionTools());
    registry.registerBatch(createVectorTools());
  });

  describe('Registration', () => {
    it('should register all 15 Level 2 tools', () => {
      expect(registry.listTools()).to.have.lengthOf(15);
    });

    it('should all be level 2', () => {
      registry.listTools().forEach(t => expect(t.level).to.equal(2));
    });
  });

  // Text Tools
  describe('text.chunk', () => {
    it('should chunk text', async () => {
      const tool = registry.getTool('text.chunk');
      const result = await tool.execute({
        text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        chunkSize: 20,
        overlap: 0
      }, context);
      expect(result.data.chunks.length).to.be.greaterThan(1);
    });
  });

  describe('text.tokenize', () => {
    it('should tokenize into words', async () => {
      const tool = registry.getTool('text.tokenize');
      const result = await tool.execute({
        text: 'Hello world, this is a test.',
        mode: 'words'
      }, context);
      expect(result.data.tokens).to.include('Hello');
      expect(result.data.tokens).to.include('world');
    });

    it('should remove stopwords', async () => {
      const tool = registry.getTool('text.tokenize');
      const result = await tool.execute({
        text: 'This is a test',
        mode: 'words',
        removeStopwords: true
      }, context);
      expect(result.data.tokens).to.not.include('this');
      expect(result.data.tokens).to.not.include('is');
      expect(result.data.tokens).to.not.include('a');
    });
  });

  describe('text.normalize', () => {
    it('should normalize text', async () => {
      const tool = registry.getTool('text.normalize');
      const result = await tool.execute({
        text: '  Hello   World  ',
        operations: ['trim', 'lowercase', 'removeExtraSpaces']
      }, context);
      expect(result.data.text).to.equal('hello world');
    });
  });

  describe('text.template', () => {
    it('should render template', async () => {
      const tool = registry.getTool('text.template');
      const result = await tool.execute({
        template: 'Hello, {{name}}! You are {{age}} years old.',
        variables: { name: 'Ivan', age: 30 }
      }, context);
      expect(result.data.text).to.equal('Hello, Ivan! You are 30 years old.');
      expect(result.data.substitutions).to.equal(2);
    });

    it('should handle missing variables', async () => {
      const tool = registry.getTool('text.template');
      const result = await tool.execute({
        template: 'Hello, {{name}}!',
        variables: {},
        defaultValue: 'Guest'
      }, context);
      expect(result.data.text).to.equal('Hello, Guest!');
      expect(result.data.missing).to.deep.equal(['name']);
    });
  });

  describe('text.extract_keywords', () => {
    it('should extract keywords', async () => {
      const tool = registry.getTool('text.extract_keywords');
      const result = await tool.execute({
        text: 'Machine learning algorithms are used in artificial intelligence applications.',
        maxKeywords: 5
      }, context);
      expect(result.data.keywords.length).to.be.at.most(5);
      expect(result.data.keywords.some(k => k.keyword.includes('learning') || k.keyword.includes('machine'))).to.be.true;
    });
  });

  describe('text.hash', () => {
    it('should generate hash', async () => {
      const tool = registry.getTool('text.hash');
      const result = await tool.execute({
        text: 'Hello World',
        algorithm: 'sha256'
      }, context);
      expect(result.data.hash).to.be.a('string');
      expect(result.data.hash.length).to.equal(64); // sha256 hex length
    });
  });

  // Extraction Tools
  describe('extraction.regex', () => {
    it('should extract with regex', async () => {
      const tool = registry.getTool('extraction.regex');
      const result = await tool.execute({
        text: 'Email: john@example.com, jane@test.org',
        pattern: '[\\w.-]+@[\\w.-]+\\.\\w+'
      }, context);
      expect(result.data.count).to.equal(2);
    });

    it('should return capture groups', async () => {
      const tool = registry.getTool('extraction.regex');
      const result = await tool.execute({
        text: 'Date: 2024-01-15',
        pattern: '(\\d{4})-(\\d{2})-(\\d{2})',
        groups: true
      }, context);
      expect(result.data.matches[0].groups).to.deep.equal(['2024', '01', '15']);
    });
  });

  describe('extraction.json_path', () => {
    it('should extract with JMESPath', async () => {
      const tool = registry.getTool('extraction.json_path');
      const result = await tool.execute({
        data: { users: [{ name: 'A' }, { name: 'B' }] },
        expression: 'users[*].name'
      }, context);
      expect(result.data.result).to.deep.equal(['A', 'B']);
    });
  });

  describe('extraction.entities', () => {
    it('should extract entities', async () => {
      const tool = registry.getTool('extraction.entities');
      const result = await tool.execute({
        text: 'Contact john@example.com or visit https://example.com',
        types: ['email', 'url']
      }, context);
      expect(result.data.entities.email.length).to.equal(1);
      expect(result.data.entities.url.length).to.equal(1);
    });
  });

  describe('extraction.structure', () => {
    it('should extract markdown structure', async () => {
      const tool = registry.getTool('extraction.structure');
      const result = await tool.execute({
        text: '# Heading 1\n\nSome text\n\n## Heading 2\n\n- Item 1\n- Item 2',
        format: 'markdown',
        elements: ['headings', 'lists']
      }, context);
      expect(result.data.structure.headings.length).to.equal(2);
      expect(result.data.structure.lists.length).to.be.greaterThan(0);
    });
  });

  // Vector Tools
  describe('vector.embed', () => {
    it('should generate mock embeddings', async () => {
      const tool = registry.getTool('vector.embed');
      const result = await tool.execute({
        text: 'Hello world',
        provider: 'mock'
      }, context);
      expect(result.data.embeddings).to.have.lengthOf(1);
      expect(result.data.embeddings[0]).to.have.lengthOf(384);
    });

    it('should generate embeddings for multiple texts', async () => {
      const tool = registry.getTool('vector.embed');
      const result = await tool.execute({
        text: ['First', 'Second', 'Third'],
        provider: 'mock'
      }, context);
      expect(result.data.embeddings).to.have.lengthOf(3);
    });
  });

  describe('vector.similarity', () => {
    it('should calculate cosine similarity', async () => {
      const tool = registry.getTool('vector.similarity');
      const result = await tool.execute({
        vectorA: [1, 0, 0],
        vectorB: [1, 0, 0],
        metric: 'cosine'
      }, context);
      expect(result.data.similarity).to.be.closeTo(1.0, 0.001);
    });

    it('should compare against multiple vectors', async () => {
      const tool = registry.getTool('vector.similarity');
      const result = await tool.execute({
        vectorA: [1, 0, 0],
        vectorB: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        metric: 'cosine',
        topK: 2
      }, context);
      expect(result.data.similarities).to.have.lengthOf(2);
      expect(result.data.similarities[0].index).to.equal(0);
    });
  });

  describe('vector.cluster', () => {
    it('should cluster vectors', async () => {
      const tool = registry.getTool('vector.cluster');
      const result = await tool.execute({
        vectors: [
          [1, 0], [1.1, 0.1], [0.9, -0.1],  // Cluster 1
          [0, 1], [0.1, 1.1], [-0.1, 0.9],  // Cluster 2
          [-1, 0], [-1.1, 0.1], [-0.9, -0.1] // Cluster 3
        ],
        k: 3,
        seed: 42
      }, context);
      expect(result.data.clusters).to.have.lengthOf(3);
      expect(result.data.assignments).to.have.lengthOf(9);
      expect(result.data.converged).to.be.true;
    });
  });
});
