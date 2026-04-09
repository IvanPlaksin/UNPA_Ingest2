const { BaseTool } = require('../primitives/BaseTool.js');

class IntrospectTool extends BaseTool {
  getDefinition() {
    return {
      id: 'meta.introspect',
      name: 'System Introspection',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Introspect the GXE system: tools, metrics, capabilities',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['tools', 'tool', 'metrics', 'capabilities', 'context', 'registry', 'all'],
            default: 'tools',
            description: 'What to introspect'
          },
          toolId: { type: 'string', description: 'Specific tool ID (for target=tool)' },
          filter: {
            type: 'object',
            properties: {
              level: { type: 'integer' },
              category: { type: 'string' },
              safetyLevel: { type: 'string' }
            },
            description: 'Filter tools'
          },
          detailed: { type: 'boolean', default: false, description: 'Include detailed info' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          data: { description: 'Introspection results' },
          timestamp: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 20 }
    };
  }

  async execute(args, context, server) {
    const { target = 'tools', toolId, filter, detailed = false } = args;

    let data;

    switch (target) {
      case 'tool':
        data = this.introspectTool(toolId, server, detailed);
        break;
      case 'tools':
        data = this.introspectTools(server, filter, detailed);
        break;
      case 'metrics':
        data = this.introspectMetrics(server);
        break;
      case 'capabilities':
        data = this.introspectCapabilities(server);
        break;
      case 'context':
        data = this.introspectContext(context);
        break;
      case 'registry':
        data = this.introspectRegistry(server);
        break;
      case 'all':
        data = {
          tools: this.introspectTools(server, filter, false),
          metrics: this.introspectMetrics(server),
          capabilities: this.introspectCapabilities(server),
          registry: this.introspectRegistry(server)
        };
        break;
      default:
        data = null;
    }

    return this.success({
      target,
      data,
      timestamp: Date.now()
    });
  }

  introspectTool(toolId, server, detailed) {
    if (!toolId) {
      return { error: 'toolId required' };
    }

    const tool = server?.registry?.getTool(toolId);
    if (!tool) {
      return { error: `Tool not found: ${toolId}` };
    }

    const def = tool.getDefinition();

    const result = {
      id: def.id,
      name: def.name,
      version: def.version,
      level: def.level,
      category: def.category,
      description: def.description,
      safetyLevel: def.safetyLevel,
      sideEffects: def.sideEffects
    };

    if (detailed) {
      result.inputSchema = def.inputSchema;
      result.outputSchema = def.outputSchema;
      result.resourceEstimate = def.resourceEstimate;
      result._dynamic = def._dynamic || false;
      result._createdAt = def._createdAt;
    }

    return result;
  }

  introspectTools(server, filter, detailed) {
    const tools = server?.registry?.listTools() || [];

    let filtered = tools;
    if (filter) {
      filtered = tools.filter(t => {
        if (filter.level !== undefined && t.level !== filter.level) return false;
        if (filter.category && t.category !== filter.category) return false;
        if (filter.safetyLevel && t.safetyLevel !== filter.safetyLevel) return false;
        return true;
      });
    }

    const byLevel = {};
    const byCategory = {};

    for (const tool of filtered) {
      byLevel[tool.level] = (byLevel[tool.level] || 0) + 1;
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    }

    const result = {
      total: filtered.length,
      byLevel,
      byCategory,
      list: detailed
        ? filtered
        : filtered.map(t => ({
            id: t.id,
            name: t.name,
            level: t.level,
            category: t.category,
            safetyLevel: t.safetyLevel
          }))
    };

    return result;
  }

  introspectMetrics(server) {
    const collector = server?.metricsCollector;
    if (!collector) {
      return { available: false };
    }

    return {
      available: true,
      summary: collector.getSummary?.() || {},
      toolMetrics: collector.getToolMetrics?.() || {}
    };
  }

  introspectCapabilities(server) {
    const registry = server?.registry;
    const tools = registry?.listTools() || [];

    // Analyze capabilities by category
    const categories = new Set(tools.map(t => t.category));
    const levels = new Set(tools.map(t => t.level));

    const capabilities = {
      categories: Array.from(categories),
      levels: Array.from(levels).sort(),
      features: {
        hasAI: tools.some(t => t.category === 'ai'),
        hasGraph: tools.some(t => t.category === 'graph'),
        hasVector: tools.some(t => t.category === 'vector'),
        hasPatterns: tools.some(t => t.category === 'pattern'),
        hasMeta: tools.some(t => t.category === 'meta'),
        canSelfModify: tools.some(t => t.id === 'meta.create_tool')
      },
      safetyLevels: {
        auto: tools.filter(t => t.safetyLevel === 'AUTO').length,
        requiresApproval: tools.filter(t => t.safetyLevel === 'REQUIRES_APPROVAL').length,
        godMode: tools.filter(t => t.safetyLevel === 'GOD_MODE').length
      },
      sideEffects: {
        read: tools.filter(t => t.sideEffects?.includes('READ')).length,
        write: tools.filter(t => t.sideEffects?.includes('WRITE')).length,
        delete: tools.filter(t => t.sideEffects?.includes('DELETE')).length,
        externalCall: tools.filter(t => t.sideEffects?.includes('EXTERNAL_CALL')).length
      }
    };

    return capabilities;
  }

  introspectContext(context) {
    if (!context) {
      return { available: false };
    }

    return {
      available: true,
      sessionId: context.sessionId,
      executionId: context.executionId,
      stateKeys: Array.from(context.state?.keys?.() || []),
      checkpoints: Array.from(context.checkpoints?.keys?.() || []),
      startTime: context.startTime,
      duration: Date.now() - context.startTime
    };
  }

  introspectRegistry(server) {
    const registry = server?.registry;
    if (!registry) {
      return { available: false };
    }

    return {
      available: true,
      toolCount: registry.tools?.size || 0,
      dynamicTools: Array.from(registry.tools?.values() || [])
        .filter(t => t.getDefinition()?._dynamic)
        .map(t => t.getDefinition()?.id)
    };
  }
}

module.exports = { IntrospectTool };
