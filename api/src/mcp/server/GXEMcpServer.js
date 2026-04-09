const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { ToolRegistry } = require('./ToolRegistry.js');
const { SafetyGuard } = require('./SafetyGuard.js');
const { MetricsCollector } = require('./MetricsCollector.js');
const { ToolExecutionContext } = require('./ToolExecutionContext.js');

class GXEMcpServer {
  constructor(config = {}) {
    this.config = config;
    this.registry = new ToolRegistry();
    this.safetyGuard = new SafetyGuard(config.safety || {});
    this.metricsCollector = new MetricsCollector();
    this.contexts = new Map();
    this.server = null;
    this.serviceConnector = null;
  }

  /**
   * Initialize ServiceConnector for real provider connections
   * @param {object} options - Init options { llm, vector, graph, embedding }
   */
  async initServices(options = {}) {
    try {
      const { getServiceConnector } = require('../services/ServiceConnector.js');
      this.serviceConnector = getServiceConnector(this.config);
      await this.serviceConnector.init(options);
      console.error('[GXEMcpServer] ServiceConnector initialized:', this.serviceConnector.getStatus());
      return this.serviceConnector.getStatus();
    } catch (error) {
      console.error('[GXEMcpServer] ServiceConnector init failed:', error.message);
      return { error: error.message };
    }
  }

  initServer() {
    if (this.server) return;

    this.server = new Server(
      { name: 'gxe-tools', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  setupHandlers() {
    // List tools (includes built-in discovery tools)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        ...this.registry.listTools().map(def => ({
          name: def.id,
          description: def.description,
          inputSchema: def.inputSchema
        })),
        ...this._getBuiltInToolDefinitions()
      ]
    }));

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      // Handle built-in tools first
      const builtIn = this._handleBuiltInTool(name, args);
      if (builtIn) return builtIn;
      return this.executeTool(name, args);
    });
  }

  /** Built-in discovery tools (not in registry) */
  _getBuiltInToolDefinitions() {
    return [
      {
        name: 'list_tools_by_namespace',
        description: 'List available tools filtered by knowledge namespace (CODEX=standards/governance, CORE=platform infrastructure, PROJECT=target project analysis)',
        inputSchema: {
          type: 'object',
          properties: {
            namespace: {
              type: 'string',
              enum: ['CODEX', 'CORE', 'PROJECT'],
              description: 'Knowledge domain to filter by'
            },
            category: {
              type: 'string',
              description: 'Optional: filter by category within namespace'
            },
            includeSchemas: {
              type: 'boolean',
              description: 'Include input/output schemas in response (default: false)'
            }
          },
          required: ['namespace']
        }
      },
      {
        name: 'get_tool_stats',
        description: 'Get tool registry statistics: counts by level, category, and namespace',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
  }

  _handleBuiltInTool(name, args = {}) {
    if (name === 'list_tools_by_namespace') {
      const { namespace, category, includeSchemas } = args;
      let tools;
      if (category) {
        tools = this.registry.listByNamespaceAndCategory(namespace, category);
      } else {
        tools = this.registry.listByNamespace(namespace);
      }
      const result = tools.map(t => {
        const info = { id: t.id, name: t.name, category: t.category, description: t.description, toolNamespace: t.toolNamespace };
        if (includeSchemas) {
          info.inputSchema = t.inputSchema;
          info.outputSchema = t.outputSchema;
        }
        return info;
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ namespace, category: category || 'all', count: result.length, tools: result }) }]
      };
    }

    if (name === 'get_tool_stats') {
      return {
        content: [{ type: 'text', text: JSON.stringify(this.registry.getStats()) }]
      };
    }

    return null; // not a built-in tool
  }

  async executeTool(toolId, args, parentContext = null) {
    const tool = this.registry.getTool(toolId);
    if (!tool) {
      return this.errorResponse('TOOL_NOT_FOUND', `Tool not found: ${toolId}`);
    }

    // Get or create context
    const context = parentContext || new ToolExecutionContext();

    // Safety check
    const safetyResult = await this.safetyGuard.check(tool, args, {
      recursionDepth: context.get('_recursionDepth') || 0
    });

    if (!safetyResult.allowed) {
      return this.errorResponse('SAFETY_BLOCK', safetyResult.reason, {
        requiredApproval: safetyResult.requiredApproval,
        approvalKey: safetyResult.approvalKey
      });
    }

    // Execute
    const startTime = Date.now();
    try {
      const result = await tool.execute(args, context, this);

      this.metricsCollector.record(toolId, {
        duration: Date.now() - startTime,
        success: true,
        ...result.metrics
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.data)
        }],
        _meta: {
          toolId,
          executionId: context.executionId,
          duration: Date.now() - startTime
        }
      };
    } catch (error) {
      this.metricsCollector.record(toolId, {
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      });
      return this.errorResponse('EXECUTION_ERROR', error.message);
    }
  }

  errorResponse(code, message, extra = {}) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: code, message, ...extra })
      }],
      isError: true
    };
  }

  registerTools(tools) {
    return this.registry.registerBatch(tools);
  }

  async start() {
    this.initServer();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`GXE MCP Server started. Tools: ${this.registry.listTools().length}`);
  }

  // For HTTP transport (alternative)
  async handleRequest(request) {
    if (request.method === 'tools/list') {
      return {
        tools: [
          ...this.registry.listTools().map(def => ({
            name: def.id,
            description: def.description,
            inputSchema: def.inputSchema
          })),
          ...this._getBuiltInToolDefinitions()
        ]
      };
    }
    if (request.method === 'tools/call') {
      const builtIn = this._handleBuiltInTool(request.params.name, request.params.arguments);
      if (builtIn) return builtIn;
      return this.executeTool(request.params.name, request.params.arguments);
    }
    throw new Error(`Unknown method: ${request.method}`);
  }
}

module.exports = { GXEMcpServer };
