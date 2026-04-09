const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');
const { ToolRegistry } = require('../server/ToolRegistry.js');
const { createAllPrimitives } = require('../tools/primitives/index.js');
const { createTextTools } = require('../tools/text/index.js');
const { createPatternTools } = require('../tools/patterns/index.js');
const { createMetaTools } = require('../tools/meta/index.js');

describe('Level 4 Meta Tools', () => {
  let context;
  let registry;
  let mockServer;

  beforeEach(() => {
    context = new ToolExecutionContext();
    registry = new ToolRegistry();
    registry.registerBatch(createAllPrimitives());
    registry.registerBatch(createTextTools());
    registry.registerBatch(createPatternTools());
    registry.registerBatch(createMetaTools());

    mockServer = { registry, config: {} };
  });

  describe('Registration', () => {
    it('should register all 6 Meta tools', () => {
      const metaTools = registry.listTools().filter(t => t.category === 'meta');
      expect(metaTools).to.have.lengthOf(6);
    });

    it('should all be level 4', () => {
      const metaTools = registry.listTools().filter(t => t.category === 'meta');
      metaTools.forEach(t => expect(t.level).to.equal(4));
    });
  });

  describe('meta.create_tool', () => {
    it('should create a template-based tool', async () => {
      const tool = registry.getTool('meta.create_tool');
      const result = await tool.execute({
        definition: {
          id: 'text.greeting',
          name: 'Greeting Tool',
          description: 'A greeting tool',
          category: 'text'
        },
        implementation: {
          type: 'template',
          template: 'Hello, {{name}}!'
        }
      }, context, mockServer);

      expect(result.data.toolId).to.equal('text.greeting');
      expect(result.data.registered).to.be.true;
    });

    it('should create a pipeline-based tool', async () => {
      const tool = registry.getTool('meta.create_tool');
      const result = await tool.execute({
        definition: {
          id: 'text.processor',
          name: 'Text Processor',
          description: 'Process text',
          category: 'text'
        },
        implementation: {
          type: 'pipeline',
          pipeline: [
            { tool: 'text.normalize', args: { operations: ['lowercase', 'trim'] } },
            { tool: 'text.tokenize', args: { mode: 'words' } }
          ]
        }
      }, context, mockServer);

      expect(result.data.toolId).to.equal('text.processor');
      expect(result.data.registered).to.be.true;
    });

    it('should validate tool specification', async () => {
      const tool = registry.getTool('meta.create_tool');
      try {
        await tool.execute({
          definition: {
            id: 'invalid-id',  // Invalid pattern
            name: 'Invalid Tool',
            description: 'Test'
          }
        }, context, mockServer);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('INVALID_ID');
      }
    });
  });

  describe('meta.compose', () => {
    it('should compose tools in sequence mode', async () => {
      const tool = registry.getTool('meta.compose');
      const result = await tool.execute({
        name: 'test-composition',
        tools: [
          { tool: 'text.normalize', args: { text: '  HELLO WORLD  ', operations: ['lowercase', 'trim'] } },
          { tool: 'text.hash', args: { text: 'hello world' } }
        ],
        mode: 'sequence'
      }, context, mockServer);

      expect(result.data.toolCount).to.equal(2);
      expect(result.data.result).to.exist;
    });

    it('should compose tools in parallel mode', async () => {
      const tool = registry.getTool('meta.compose');
      const result = await tool.execute({
        name: 'parallel-composition',
        tools: [
          { tool: 'text.normalize', args: { text: 'TEST1', operations: ['lowercase'] } },
          { tool: 'text.normalize', args: { text: 'TEST2', operations: ['lowercase'] } },
          { tool: 'text.hash', args: { text: 'test' } }
        ],
        mode: 'parallel'
      }, context, mockServer);

      expect(result.data.toolCount).to.equal(3);
      expect(result.data.result).to.exist;
    });

    it('should handle conditional composition', async () => {
      const tool = registry.getTool('meta.compose');
      const result = await tool.execute({
        name: 'conditional-composition',
        tools: [
          { tool: 'primitive.compare', args: { left: 10, op: 'gt', right: 5 } },
          {
            tool: 'text.normalize',
            args: { text: 'MATCH', operations: ['lowercase'] },
            condition: { op: 'eq', value: true }
          }
        ],
        mode: 'conditional',
        input: true
      }, context, mockServer);

      expect(result.data.toolCount).to.equal(2);
    });
  });

  describe('meta.introspect', () => {
    it('should introspect a specific tool', async () => {
      const tool = registry.getTool('meta.introspect');
      const result = await tool.execute({
        target: 'tool',
        toolId: 'text.normalize'
      }, context, mockServer);

      expect(result.data.data).to.have.property('id', 'text.normalize');
      expect(result.data.data).to.have.property('name');
    });

    it('should list all capabilities', async () => {
      const tool = registry.getTool('meta.introspect');
      const result = await tool.execute({
        target: 'capabilities'
      }, context, mockServer);

      expect(result.data.data).to.have.property('categories');
      expect(result.data.data).to.have.property('levels');
      expect(result.data.data).to.have.property('features');
    });

    it('should introspect registry', async () => {
      const tool = registry.getTool('meta.introspect');
      const result = await tool.execute({
        target: 'registry'
      }, context, mockServer);

      expect(result.data.data).to.have.property('toolCount');
      expect(result.data.data.toolCount).to.be.greaterThan(30);
    });

    it('should introspect execution context', async () => {
      // Set some state first
      context.set('test.key', 'test.value');

      const tool = registry.getTool('meta.introspect');
      const result = await tool.execute({
        target: 'context'
      }, context, mockServer);

      expect(result.data.data).to.have.property('stateKeys');
    });
  });

  describe('meta.validate_tool', () => {
    it('should validate a correct tool definition', async () => {
      const tool = registry.getTool('meta.validate_tool');
      const result = await tool.execute({
        definition: {
          id: 'test.valid',
          name: 'Valid Test Tool',
          version: '1.0.0',
          level: 2,
          category: 'test',
          description: 'A valid test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            }
          }
        }
      }, context, mockServer);

      expect(result.data.valid).to.be.true;
      expect(result.data.errors).to.have.lengthOf(0);
    });

    it('should detect missing required fields', async () => {
      const tool = registry.getTool('meta.validate_tool');
      const result = await tool.execute({
        definition: {
          name: 'Missing ID Tool'
          // Missing id, version, level, category
        }
      }, context, mockServer);

      expect(result.data.valid).to.be.false;
      expect(result.data.errors.length).to.be.greaterThan(0);
    });

    it('should validate input schema structure', async () => {
      const tool = registry.getTool('meta.validate_tool');
      const result = await tool.execute({
        definition: {
          id: 'test.bad_schema',
          name: 'Bad Schema Tool',
          version: '1.0.0',
          level: 2,
          category: 'test',
          description: 'Tool with invalid schema',
          inputSchema: {
            // Missing type
            properties: {}
          }
        }
      }, context, mockServer);

      // Should still validate but may have warnings
      expect(result.data).to.have.property('valid');
    });
  });

  describe('meta.optimize', () => {
    it('should detect parallelizable stages', async () => {
      const tool = registry.getTool('meta.optimize');
      const result = await tool.execute({
        pipeline: [
          { id: 'a', tool: 'text.normalize', inputs: [] },
          { id: 'b', tool: 'text.hash', inputs: [] },
          { id: 'c', tool: 'text.tokenize', inputs: ['a', 'b'] }
        ],
        optimizations: ['parallelize']
      }, context, mockServer);

      expect(result.data.improvements.some(i => i.type === 'parallelize')).to.be.true;
    });

    it('should detect duplicate operations', async () => {
      const tool = registry.getTool('meta.optimize');
      const result = await tool.execute({
        pipeline: [
          { id: 'a', tool: 'text.hash', args: { text: 'test' } },
          { id: 'b', tool: 'text.hash', args: { text: 'test' } }
        ],
        optimizations: ['dedupe']
      }, context, mockServer);

      expect(result.data.improvements.some(i => i.type === 'dedupe')).to.be.true;
    });

    it('should add caching recommendations', async () => {
      const tool = registry.getTool('meta.optimize');
      const result = await tool.execute({
        pipeline: [
          { id: 'expensive', tool: 'ai.complete', args: { prompt: 'test' } }
        ],
        optimizations: ['cache']
      }, context, mockServer);

      expect(result.data.improvements.some(i => i.type === 'cache')).to.be.true;
    });

    it('should apply multiple optimizations', async () => {
      const tool = registry.getTool('meta.optimize');
      const result = await tool.execute({
        pipeline: [
          { id: 'a', tool: 'text.normalize', inputs: [] },
          { id: 'b', tool: 'text.hash', inputs: [] },
          { id: 'c', tool: 'ai.complete', inputs: ['a'] }
        ],
        optimizations: ['parallelize', 'cache', 'reorder']
      }, context, mockServer);

      expect(result.data.improvements.length).to.be.greaterThan(0);
      expect(result.data.original).to.have.property('stages');
    });
  });

  describe('meta.sandbox', () => {
    it('should execute tool in sandbox', async () => {
      const tool = registry.getTool('meta.sandbox');
      const result = await tool.execute({
        tool: 'text.normalize',
        args: { text: 'HELLO', operations: ['lowercase'] },
        isolation: 'context'
      }, context, mockServer);

      expect(result.data.result.text).to.equal('hello');
      expect(result.data.sandbox.isolated).to.be.true;
    });

    it('should handle dry run', async () => {
      const tool = registry.getTool('meta.sandbox');
      const result = await tool.execute({
        tool: 'text.hash',
        args: { text: 'test' },
        dryRun: true
      }, context, mockServer);

      expect(result.data.sandbox.dryRun).to.be.true;
      expect(result.data.sandbox.wouldExecute).to.be.true;
      expect(result.data.result).to.be.null;
    });

    it('should block restricted tools', async () => {
      const tool = registry.getTool('meta.sandbox');
      try {
        await tool.execute({
          tool: 'text.normalize',
          args: { text: 'test' },
          blockedTools: ['text.normalize']
        }, context, mockServer);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('TOOL_BLOCKED');
      }
    });

    it('should respect allowed tools list', async () => {
      const tool = registry.getTool('meta.sandbox');
      try {
        await tool.execute({
          tool: 'text.hash',
          args: { text: 'test' },
          allowedTools: ['text.normalize']  // text.hash not in list
        }, context, mockServer);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('TOOL_NOT_ALLOWED');
      }
    });

    it('should track state changes in sandbox', async () => {
      const tool = registry.getTool('meta.sandbox');
      const result = await tool.execute({
        tool: 'primitive.set_value',
        args: { path: 'sandbox.test', value: 'sandboxed' },
        isolation: 'context',
        captureOutput: true
      }, context, mockServer);

      expect(result.data.sandbox.stateChanges).to.be.an('array');
    });

    it('should handle execution timeout', async function() {
      this.timeout(5000);
      const tool = registry.getTool('meta.sandbox');

      // Use a tool that should complete quickly
      const result = await tool.execute({
        tool: 'text.hash',
        args: { text: 'quick test' },
        timeout: 5000
      }, context, mockServer);

      expect(result.data.sandbox.duration).to.be.lessThan(5000);
    });
  });
});
