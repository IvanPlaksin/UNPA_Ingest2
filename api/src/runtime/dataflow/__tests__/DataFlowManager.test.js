/**
 * Tests for PortManager and DataFlowManager
 */

const { PortManager, PortState } = require('../PortManager');
const { DataFlowManager, TransformType } = require('../DataFlowManager');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const mockTools = {
  'text.sanitize': {
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      },
      required: ['text']
    },
    outputSchema: {
      type: 'object',
      properties: {
        sanitized: { type: 'string' },
        stats: { type: 'object' }
      }
    }
  },
  'extraction.entities': {
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        language: { type: 'string' }
      },
      required: ['text']
    },
    outputSchema: {
      type: 'object',
      properties: {
        entities: { type: 'array' },
        count: { type: 'number' }
      }
    }
  },
  'graph.create_node': {
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        properties: { type: 'object' }
      },
      required: ['type']
    },
    outputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        created: { type: 'boolean' }
      }
    }
  },
  'primitive.log': {
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        level: { type: 'string' }
      },
      required: ['message']
    }
    // No outputSchema - will use default _result port
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PORT MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('PortManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PortManager();
  });

  describe('port registration', () => {
    test('registers input and output ports from tool definition', () => {
      pm.registerPorts('node-1', mockTools['text.sanitize']);

      const inputs = pm.getInputPorts('node-1');
      const outputs = pm.getOutputPorts('node-1');

      expect(inputs).toHaveLength(1);
      expect(inputs[0].id).toBe('text');
      expect(inputs[0].required).toBe(true);
      expect(inputs[0].direction).toBe('input');

      expect(outputs).toHaveLength(2);
      expect(outputs.map(p => p.id)).toContain('sanitized');
      expect(outputs.map(p => p.id)).toContain('stats');
    });

    test('creates default _result port when no outputSchema', () => {
      pm.registerPorts('log-node', mockTools['primitive.log']);

      const outputs = pm.getOutputPorts('log-node');
      expect(outputs).toHaveLength(1);
      expect(outputs[0].id).toBe('_result');
    });

    test('marks required ports correctly', () => {
      pm.registerPorts('entity-node', mockTools['extraction.entities']);

      const inputs = pm.getInputPorts('entity-node');
      const textPort = inputs.find(p => p.id === 'text');
      const langPort = inputs.find(p => p.id === 'language');

      expect(textPort.required).toBe(true);
      expect(langPort.required).toBe(false);
    });
  });

  describe('port access', () => {
    beforeEach(() => {
      pm.registerPorts('node-1', mockTools['text.sanitize']);
    });

    test('getPort returns specific port', () => {
      const port = pm.getPort('node-1', 'text');
      expect(port).toBeDefined();
      expect(port.id).toBe('text');
      expect(port.nodeId).toBe('node-1');
    });

    test('getPort returns undefined for non-existent port', () => {
      const port = pm.getPort('node-1', 'nonexistent');
      expect(port).toBeUndefined();
    });

    test('getDefaultInputPort returns first input port', () => {
      const port = pm.getDefaultInputPort('node-1');
      expect(port).toBeDefined();
      expect(port.direction).toBe('input');
    });

    test('getDefaultOutputPort returns first output port', () => {
      const port = pm.getDefaultOutputPort('node-1');
      expect(port).toBeDefined();
      expect(port.direction).toBe('output');
    });
  });

  describe('data operations', () => {
    beforeEach(() => {
      pm.registerPorts('node-1', mockTools['text.sanitize']);
    });

    test('setPortData sets data and state', () => {
      pm.setPortData('node-1', 'text', 'Hello World');

      const port = pm.getPort('node-1', 'text');
      expect(port.data).toBe('Hello World');
      expect(port.state).toBe(PortState.READY);
      expect(port.timestamp).toBeDefined();
    });

    test('getPortData retrieves data', () => {
      pm.setPortData('node-1', 'text', 'Test Data');
      const data = pm.getPortData('node-1', 'text');
      expect(data).toBe('Test Data');
    });

    test('isNodeInputReady checks required ports', () => {
      expect(pm.isNodeInputReady('node-1')).toBe(false);

      pm.setPortData('node-1', 'text', 'data');
      expect(pm.isNodeInputReady('node-1')).toBe(true);
    });

    test('collectInput gathers all ready input data', () => {
      pm.registerPorts('entity-node', mockTools['extraction.entities']);

      pm.setPortData('entity-node', 'text', 'Some text');
      pm.setPortData('entity-node', 'language', 'en');

      const collected = pm.collectInput('entity-node');
      expect(collected).toEqual({
        text: 'Some text',
        language: 'en'
      });
    });

    test('collectInput only includes READY ports', () => {
      pm.registerPorts('entity-node', mockTools['extraction.entities']);
      pm.setPortData('entity-node', 'text', 'Some text');
      // language not set

      const collected = pm.collectInput('entity-node');
      expect(collected).toEqual({ text: 'Some text' });
      expect(collected.language).toBeUndefined();
    });

    test('distributeOutput distributes to output ports', () => {
      pm.distributeOutput('node-1', {
        sanitized: 'Clean text',
        stats: { words: 2 }
      });

      expect(pm.getPortData('node-1', 'sanitized')).toBe('Clean text');
      expect(pm.getPortData('node-1', 'stats')).toEqual({ words: 2 });
    });
  });

  describe('reset', () => {
    test('resets all ports to EMPTY', () => {
      pm.registerPorts('node-1', mockTools['text.sanitize']);
      pm.setPortData('node-1', 'text', 'data');
      pm.setPortData('node-1', 'sanitized', 'clean');

      pm.reset();

      expect(pm.getPort('node-1', 'text').state).toBe(PortState.EMPTY);
      expect(pm.getPort('node-1', 'text').data).toBeNull();
      expect(pm.getPort('node-1', 'sanitized').state).toBe(PortState.EMPTY);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA FLOW MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DataFlowManager', () => {
  let pm;
  let dfm;

  // Test DAG: sanitize → entities → create_node
  const testEdges = [
    {
      id: 'e1',
      source: 'sanitize',
      target: 'entities',
      sourceHandle: 'sanitized',
      targetHandle: 'text'
    },
    {
      id: 'e2',
      source: 'entities',
      target: 'create_node',
      sourceHandle: 'entities',
      targetHandle: 'properties'
    }
  ];

  beforeEach(() => {
    pm = new PortManager();
    pm.registerPorts('sanitize', mockTools['text.sanitize']);
    pm.registerPorts('entities', mockTools['extraction.entities']);
    pm.registerPorts('create_node', mockTools['graph.create_node']);

    dfm = new DataFlowManager(pm, testEdges);
  });

  describe('initialization', () => {
    test('resolves edges with explicit handles', () => {
      const edge = dfm.getEdge('e1');
      expect(edge.sourcePortId).toBe('sanitized');
      expect(edge.targetPortId).toBe('text');
    });

    test('uses default ports when handles not specified', () => {
      const pm2 = new PortManager();
      pm2.registerPorts('A', mockTools['text.sanitize']);
      pm2.registerPorts('B', mockTools['extraction.entities']);

      const dfm2 = new DataFlowManager(pm2, [
        { id: 'e1', source: 'A', target: 'B' } // No handles
      ]);

      const edge = dfm2.getEdge('e1');
      expect(edge.sourcePortId).toBe('sanitized'); // First output
      expect(edge.targetPortId).toBe('text');      // First input
    });
  });

  describe('propagateOutput', () => {
    test('propagates data through edge', () => {
      const results = dfm.propagateOutput('sanitize', {
        sanitized: 'Clean text here',
        stats: { chars: 15 }
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].edgeId).toBe('e1');

      // Check data arrived at target
      const targetData = pm.getPortData('entities', 'text');
      expect(targetData).toBe('Clean text here');
    });

    test('propagates to multiple downstream nodes', () => {
      // Add another edge from sanitize
      const pm2 = new PortManager();
      pm2.registerPorts('sanitize', mockTools['text.sanitize']);
      pm2.registerPorts('entities', mockTools['extraction.entities']);
      pm2.registerPorts('log', mockTools['primitive.log']);

      const edges = [
        { id: 'e1', source: 'sanitize', target: 'entities', sourceHandle: 'sanitized', targetHandle: 'text' },
        { id: 'e2', source: 'sanitize', target: 'log', sourceHandle: 'sanitized', targetHandle: 'message' }
      ];

      const dfm2 = new DataFlowManager(pm2, edges);

      const results = dfm2.propagateOutput('sanitize', { sanitized: 'Text' });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);

      expect(pm2.getPortData('entities', 'text')).toBe('Text');
      expect(pm2.getPortData('log', 'message')).toBe('Text');
    });
  });

  describe('getReadyDownstreamNodes', () => {
    test('returns nodes with all inputs ready', () => {
      // sanitize completes
      dfm.propagateOutput('sanitize', { sanitized: 'text', stats: {} });

      const ready = dfm.getReadyDownstreamNodes('sanitize');
      expect(ready).toContain('entities');
    });

    test('does not return nodes missing required inputs', () => {
      // Entity node needs 'type' as well as 'properties'
      // create_node won't be ready after just entities output
      dfm.propagateOutput('entities', { entities: [], count: 0 });

      const ready = dfm.getReadyDownstreamNodes('entities');
      // create_node requires 'type' which is not set
      expect(ready).not.toContain('create_node');
    });
  });

  describe('PICK transform', () => {
    test('applies PICK transform correctly', () => {
      const pm2 = new PortManager();
      pm2.registerPorts('A', mockTools['text.sanitize']);
      pm2.registerPorts('B', mockTools['extraction.entities']);

      const edges = [{
        id: 'e1',
        source: 'A',
        target: 'B',
        sourceHandle: 'stats',
        targetHandle: 'text',
        data: {
          transform: {
            type: TransformType.PICK,
            fields: ['wordCount']
          }
        }
      }];

      const dfm2 = new DataFlowManager(pm2, edges);

      dfm2.propagateOutput('A', {
        sanitized: 'text',
        stats: { wordCount: 5, charCount: 20, lineCount: 1 }
      });

      const result = pm2.getPortData('B', 'text');
      expect(result).toEqual({ wordCount: 5 });
    });
  });

  describe('validateEdgeCompatibility', () => {
    test('returns valid for properly connected edges', () => {
      const result = dfm.validateEdgeCompatibility();
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test('warns about non-existent source port', () => {
      const pm2 = new PortManager();
      pm2.registerPorts('A', mockTools['text.sanitize']);
      pm2.registerPorts('B', mockTools['extraction.entities']);

      const dfm2 = new DataFlowManager(pm2, [{
        id: 'e1',
        source: 'A',
        target: 'B',
        sourceHandle: 'nonexistent',
        targetHandle: 'text'
      }]);

      const result = dfm2.validateEdgeCompatibility();
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('nonexistent');
    });

    test('warns about non-existent target port', () => {
      const pm2 = new PortManager();
      pm2.registerPorts('A', mockTools['text.sanitize']);
      pm2.registerPorts('B', mockTools['extraction.entities']);

      const dfm2 = new DataFlowManager(pm2, [{
        id: 'e1',
        source: 'A',
        target: 'B',
        sourceHandle: 'sanitized',
        targetHandle: 'badport'
      }]);

      const result = dfm2.validateEdgeCompatibility();
      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('badport'))).toBe(true);
    });
  });

  describe('graph structure queries', () => {
    test('getEntryNodes returns nodes with no incoming edges', () => {
      const entries = dfm.getEntryNodes();
      expect(entries).toContain('sanitize');
      expect(entries).not.toContain('entities');
    });

    test('getExitNodes returns nodes with no outgoing edges', () => {
      const exits = dfm.getExitNodes();
      expect(exits).toContain('create_node');
      expect(exits).not.toContain('entities');
    });

    test('getAllDownstreamNodes returns transitive closure', () => {
      const downstream = dfm.getAllDownstreamNodes('sanitize');
      expect(downstream).toContain('entities');
      expect(downstream).toContain('create_node');
    });

    test('getUpstreamNodes returns direct upstream', () => {
      const upstream = dfm.getUpstreamNodes('entities');
      expect(upstream).toContain('sanitize');
    });
  });

  describe('end-to-end flow', () => {
    test('data flows through 3-node pipeline', () => {
      // Node 1 completes
      dfm.propagateOutput('sanitize', { sanitized: 'cleaned text', stats: {} });
      expect(pm.isNodeInputReady('entities')).toBe(true);

      // Node 2 completes
      dfm.propagateOutput('entities', { entities: ['entity1', 'entity2'], count: 2 });

      // Check data arrived (but create_node still needs 'type')
      const props = pm.getPortData('create_node', 'properties');
      expect(props).toEqual(['entity1', 'entity2']);

      // Manually set 'type' and check ready
      pm.setPortData('create_node', 'type', 'Entity');
      expect(pm.isNodeInputReady('create_node')).toBe(true);

      // Collect input for create_node
      const input = pm.collectInput('create_node');
      expect(input.properties).toEqual(['entity1', 'entity2']);
      expect(input.type).toBe('Entity');
    });
  });
});
