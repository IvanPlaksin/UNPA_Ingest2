const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');
const { createAllPrimitives } = require('../tools/primitives/index.js');
const { ToolRegistry } = require('../server/ToolRegistry.js');

describe('Primitives', () => {
  let context;
  let registry;

  beforeEach(() => {
    context = new ToolExecutionContext();
    registry = new ToolRegistry();
    const primitives = createAllPrimitives();
    registry.registerBatch(primitives);
  });

  describe('Registration', () => {
    it('should register all 17 primitives', () => {
      expect(registry.listTools()).to.have.lengthOf(17);
    });

    it('should all be level 1', () => {
      registry.listTools().forEach(t => expect(t.level).to.equal(1));
    });

    it('should all be category primitive', () => {
      registry.listTools().forEach(t => expect(t.category).to.equal('primitive'));
    });

    it('should all be safetyLevel AUTO', () => {
      registry.listTools().forEach(t => expect(t.safetyLevel).to.equal('AUTO'));
    });
  });

  describe('primitive.get_value / primitive.set_value', () => {
    it('should set and get simple value', async () => {
      const setTool = registry.getTool('primitive.set_value');
      const getTool = registry.getTool('primitive.get_value');

      await setTool.execute({ path: 'user.name', value: 'Ivan' }, context);
      const result = await getTool.execute({ path: 'user.name' }, context);

      expect(result.data).to.equal('Ivan');
    });

    it('should return default for missing path', async () => {
      const getTool = registry.getTool('primitive.get_value');
      const result = await getTool.execute({ path: 'missing', defaultValue: 'default' }, context);
      expect(result.data).to.equal('default');
    });
  });

  describe('primitive.transform', () => {
    it('should transform with JMESPath', async () => {
      const tool = registry.getTool('primitive.transform');
      const result = await tool.execute({
        data: { users: [{ name: 'A' }, { name: 'B' }] },
        expression: 'users[*].name'
      }, context);
      expect(result.data).to.deep.equal(['A', 'B']);
    });
  });

  describe('primitive.validate', () => {
    it('should validate against schema', async () => {
      const tool = registry.getTool('primitive.validate');
      const result = await tool.execute({
        data: { name: 'Ivan', age: 30 },
        schema: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' }, age: { type: 'integer' } }
        }
      }, context);
      expect(result.data.valid).to.be.true;
    });

    it('should return errors for invalid data', async () => {
      const tool = registry.getTool('primitive.validate');
      const result = await tool.execute({
        data: { age: 'not a number' },
        schema: { type: 'object', properties: { age: { type: 'integer' } } }
      }, context);
      expect(result.data.valid).to.be.false;
      expect(result.data.errors).to.have.length.greaterThan(0);
    });
  });

  describe('primitive.compare', () => {
    it('should compare with eq', async () => {
      const tool = registry.getTool('primitive.compare');
      expect((await tool.execute({ left: 5, op: 'eq', right: 5 }, context)).data).to.be.true;
      expect((await tool.execute({ left: 5, op: 'eq', right: 6 }, context)).data).to.be.false;
    });

    it('should compare with gt/lt', async () => {
      const tool = registry.getTool('primitive.compare');
      expect((await tool.execute({ left: 10, op: 'gt', right: 5 }, context)).data).to.be.true;
      expect((await tool.execute({ left: 3, op: 'lt', right: 5 }, context)).data).to.be.true;
    });

    it('should compare with contains', async () => {
      const tool = registry.getTool('primitive.compare');
      expect((await tool.execute({ left: 'hello world', op: 'contains', right: 'world' }, context)).data).to.be.true;
    });
  });

  describe('primitive.aggregate', () => {
    it('should sum numbers', async () => {
      const tool = registry.getTool('primitive.aggregate');
      const result = await tool.execute({ data: [1, 2, 3, 4, 5], op: 'sum' }, context);
      expect(result.data).to.equal(15);
    });

    it('should calculate average', async () => {
      const tool = registry.getTool('primitive.aggregate');
      const result = await tool.execute({ data: [10, 20, 30], op: 'avg' }, context);
      expect(result.data).to.equal(20);
    });

    it('should aggregate by field', async () => {
      const tool = registry.getTool('primitive.aggregate');
      const result = await tool.execute({
        data: [{ score: 10 }, { score: 20 }],
        op: 'sum',
        field: 'score'
      }, context);
      expect(result.data).to.equal(30);
    });
  });

  describe('primitive.filter', () => {
    it('should filter with simple predicate', async () => {
      const tool = registry.getTool('primitive.filter');
      const result = await tool.execute({
        data: [{ age: 25 }, { age: 35 }, { age: 45 }],
        predicate: { field: 'age', op: 'gt', value: 30 }
      }, context);
      expect(result.data).to.have.lengthOf(2);
    });

    it('should filter with AND predicate', async () => {
      const tool = registry.getTool('primitive.filter');
      const result = await tool.execute({
        data: [{ age: 25, active: true }, { age: 35, active: false }, { age: 45, active: true }],
        predicate: { and: [{ field: 'age', op: 'gt', value: 30 }, { field: 'active', op: 'eq', value: true }] }
      }, context);
      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].age).to.equal(45);
    });
  });

  describe('primitive.map', () => {
    it('should map with JMESPath', async () => {
      const tool = registry.getTool('primitive.map');
      const result = await tool.execute({
        data: [{ user: { name: 'A' } }, { user: { name: 'B' } }],
        transform: 'user.name'
      }, context);
      expect(result.data).to.deep.equal(['A', 'B']);
    });
  });

  describe('primitive.merge', () => {
    it('should deep merge objects', async () => {
      const tool = registry.getTool('primitive.merge');
      const result = await tool.execute({
        objects: [{ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 }],
        strategy: 'deep'
      }, context);
      expect(result.data).to.deep.equal({ a: 1, b: { x: 1, y: 2 }, c: 3 });
    });
  });

  describe('primitive.split', () => {
    it('should split string', async () => {
      const tool = registry.getTool('primitive.split');
      const result = await tool.execute({ data: 'a,b,c', delimiter: ',' }, context);
      expect(result.data).to.deep.equal(['a', 'b', 'c']);
    });

    it('should chunk array', async () => {
      const tool = registry.getTool('primitive.split');
      const result = await tool.execute({ data: [1, 2, 3, 4, 5], chunkSize: 2 }, context);
      expect(result.data).to.deep.equal([[1, 2], [3, 4], [5]]);
    });
  });

  describe('primitive.emit_event / primitive.wait_signal', () => {
    it('should emit and receive signal', async () => {
      const emitTool = registry.getTool('primitive.emit_event');
      const waitTool = registry.getTool('primitive.wait_signal');

      // Emit after small delay
      setTimeout(async () => {
        await emitTool.execute({ event: 'test_signal', payload: { data: 123 } }, context);
      }, 50);

      const result = await waitTool.execute({ signal: 'test_signal', timeout: 1000 }, context);
      expect(result.data).to.deep.equal({ data: 123 });
    });
  });

  describe('primitive.checkpoint', () => {
    it('should create and restore checkpoint', async () => {
      const setTool = registry.getTool('primitive.set_value');
      const getTool = registry.getTool('primitive.get_value');
      const checkpointTool = registry.getTool('primitive.checkpoint');

      await setTool.execute({ path: 'counter', value: 1 }, context);
      await checkpointTool.execute({ name: 'cp1' }, context);
      await setTool.execute({ path: 'counter', value: 100 }, context);

      context.restoreCheckpoint('cp1');
      const result = await getTool.execute({ path: 'counter' }, context);
      expect(result.data).to.equal(1);
    });
  });

  describe('primitive.generate_id', () => {
    it('should generate uuid', async () => {
      const tool = registry.getTool('primitive.generate_id');
      const result = await tool.execute({ type: 'uuid' }, context);
      expect(result.data).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate with prefix', async () => {
      const tool = registry.getTool('primitive.generate_id');
      const result = await tool.execute({ type: 'uuid', prefix: 'node_' }, context);
      expect(result.data).to.match(/^node_[0-9a-f-]+$/i);
    });
  });
});
