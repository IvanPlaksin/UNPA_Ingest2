const Ajv = require('ajv');
const toolSchema = require('../schemas/tool-definition.schema.json');

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.ajv = new Ajv({ allErrors: true });
    this.validateToolDef = this.ajv.compile(toolSchema);
  }

  register(tool) {
    // Validate tool definition
    const definition = tool.getDefinition();
    if (!this.validateToolDef(definition)) {
      throw new Error(`Invalid tool definition for ${definition.id}: ${JSON.stringify(this.validateToolDef.errors)}`);
    }

    // Check duplicate
    if (this.tools.has(definition.id)) {
      throw new Error(`Tool already registered: ${definition.id}`);
    }

    this.tools.set(definition.id, tool);
    return true;
  }

  registerBatch(tools) {
    const registered = [];
    for (const tool of tools) {
      this.register(tool);
      registered.push(tool.getDefinition().id);
    }
    return registered;
  }

  getTool(id) {
    return this.tools.get(id) || null;
  }

  listTools() {
    return Array.from(this.tools.values()).map(t => t.getDefinition());
  }

  listByCategory(category) {
    return this.listTools().filter(t => t.category === category);
  }

  listByLevel(level) {
    return this.listTools().filter(t => t.level === level);
  }

  listByNamespace(namespace) {
    return this.listTools().filter(t => t.toolNamespace === namespace);
  }

  listByNamespaceAndCategory(namespace, category) {
    return this.listTools().filter(t => t.toolNamespace === namespace && t.category === category);
  }

  hasTool(id) {
    return this.tools.has(id);
  }

  unregister(id) {
    return this.tools.delete(id);
  }

  getStats() {
    const tools = this.listTools();
    return {
      total: tools.length,
      byLevel: {
        1: tools.filter(t => t.level === 1).length,
        2: tools.filter(t => t.level === 2).length,
        3: tools.filter(t => t.level === 3).length,
        4: tools.filter(t => t.level === 4).length
      },
      byCategory: tools.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {}),
      byNamespace: tools.reduce((acc, t) => {
        const ns = t.toolNamespace || 'UNASSIGNED';
        acc[ns] = (acc[ns] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

module.exports = { ToolRegistry };
