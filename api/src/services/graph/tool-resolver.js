/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOOL RESOLVER - SDA Stage 2
 * Deterministic tool resolution based on IntentDescriptor from Stage 1
 *
 * Key features:
 * - Maps IntentDescriptor domains to concrete MCP tools
 * - Groups tools by functional roles (INPUT, PROCESS, ANALYZE, etc.)
 * - Supports new domains: devops, hr, finance, legal, operations, knowledge
 * - Provides completeness checks for intent fulfillment
 *
 * Pipeline integration:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [TaskPlanner(S3)] → [GraphCompiler(S4)]
 *
 * @module services/graph/tool-resolver
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  DOMAINS,
  getCapabilityForIntent,
  isModifyingIntent
} = require('./intent-rules');

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ResolvedToolSet
 * @property {Array} tools - Filtered array of resolved tools
 * @property {Object} byRole - Tools grouped by role (INPUT, PROCESS, ANALYZE, etc.)
 * @property {number} totalResolved - Count of resolved tools
 * @property {number} totalAvailable - Count of available tools before filtering
 * @property {number} filterRatio - Ratio of resolved/available
 * @property {Object} completeness - Completeness check result
 * @property {string[]} missingCapabilities - Missing capabilities if any
 * @property {string} forPrompt - Formatted tool list for LLM prompt
 */

/**
 * @typedef {Object} CompletenessResult
 * @property {boolean} complete - Whether all required capabilities are present
 * @property {string[]} missing - List of missing capabilities
 * @property {number} score - Completeness score 0.0-1.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// TOOL ROLES ENUM
// ═══════════════════════════════════════════════════════════════════════════

const TOOL_ROLES = {
  INPUT: 'INPUT',
  PROCESS: 'PROCESS',
  ANALYZE: 'ANALYZE',
  SEARCH: 'SEARCH',
  STORE: 'STORE',
  CONTROL: 'CONTROL',
  AUXILIARY: 'AUXILIARY'
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL RESOLVER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ToolResolver {
  /**
   * @param {Object} [mcpRegistry=null] - Optional MCP registry for tool lookup
   */
  constructor(mcpRegistry = null) {
    this.registry = mcpRegistry;

    // Capability → tool mapping
    // Each capability is an abstract "ability" that IntentDescriptor may require
    this.capabilityMap = {
      'text_cleanup': ['text.sanitize', 'text.normalize'],
      'language_detection': ['text.detect_language'],
      'text_splitting': ['text.chunk', 'text.tokenize'],
      'text_generation': ['text.summarize', 'text.translate'],
      'entity_extraction': ['extraction.entities', 'extraction.keywords'],
      'relation_extraction': ['extraction.relations'],
      'classification': ['extraction.intent', 'extraction.sentiment', 'extraction.topics', 'ai.classify'],
      'embedding': ['vector.embed', 'vector.batch_embed'],
      'vector_search': ['vector.search', 'vector.similarity'],
      'vector_storage': ['vector.write', 'vector.delete'],
      'graph_read': ['graph.query', 'graph.traverse', 'graph.find_path', 'graph.match_pattern', 'graph.subgraph'],
      'graph_write': ['graph.create_node', 'graph.create_edge', 'graph.update_node', 'graph.merge_nodes'],
      'graph_delete': ['graph.delete_node'],
      'ai_reasoning': ['ai.generate', 'ai.chat', 'ai.structured_output'],
      'gnn_analysis': ['ai.gnn_predict_links', 'ai.gnn_classify_nodes', 'ai.gnn_detect_anomalies', 'ai.gnn_find_similar'],
      'flow_control': ['control.condition', 'control.switch', 'control.parallel', 'control.loop', 'control.try_catch'],
      'data_transform': ['primitive.transform', 'primitive.filter', 'primitive.map', 'primitive.reduce', 'primitive.merge'],
      'data_access': ['primitive.get_value', 'primitive.set_value'],
      'monitoring': ['primitive.log', 'primitive.checkpoint', 'primitive.emit_event']
    };

    // Role classification — what role does a tool play in the graph
    this.toolRoles = {
      [TOOL_ROLES.INPUT]: [
        'text.sanitize', 'text.normalize', 'text.detect_language',
        'primitive.get_value', 'text.read', 'data.load'
      ],
      [TOOL_ROLES.PROCESS]: [
        'text.chunk', 'text.tokenize', 'text.split', 'text.join', 'text.template',
        'extraction.entities', 'extraction.relations', 'extraction.keywords', 'extraction.topics',
        'vector.embed', 'vector.batch_embed',
        'primitive.transform', 'primitive.filter', 'primitive.map', 'primitive.reduce'
      ],
      [TOOL_ROLES.ANALYZE]: [
        'ai.generate', 'ai.chat', 'ai.classify', 'ai.structured_output',
        'extraction.intent', 'extraction.sentiment',
        'ai.gnn_predict_links', 'ai.gnn_classify_nodes', 'ai.gnn_detect_anomalies', 'ai.gnn_find_similar',
        'text.summarize', 'text.translate'
      ],
      [TOOL_ROLES.SEARCH]: [
        'vector.search', 'vector.similarity',
        'graph.query', 'graph.traverse', 'graph.find_path', 'graph.match_pattern', 'graph.subgraph'
      ],
      [TOOL_ROLES.STORE]: [
        'vector.write', 'vector.delete',
        'graph.create_node', 'graph.create_edge', 'graph.update_node', 'graph.merge_nodes', 'graph.delete_node',
        'primitive.set_value', 'data.save'
      ],
      [TOOL_ROLES.CONTROL]: [
        'control.condition', 'control.switch', 'control.parallel', 'control.loop', 'control.try_catch',
        'control.if', 'control.fork', 'control.join'
      ],
      [TOOL_ROLES.AUXILIARY]: [
        'primitive.log', 'primitive.checkpoint', 'primitive.emit_event',
        'primitive.merge', 'primitive.delay', 'primitive.generate_id',
        'text.hash', 'text.encode', 'text.decode'
      ]
    };

    // Domain → capabilities mapping (for IntentDescriptor domains)
    // Updated to include new domains from intent-rules.js
    this.domainToCapabilities = {
      // Original domains (backward compatibility)
      'text_processing': ['text_cleanup', 'text_splitting', 'language_detection', 'text_generation'],
      'entity_extraction': ['entity_extraction', 'relation_extraction'],
      'vector_search': ['embedding', 'vector_search', 'vector_storage'],
      'graph_ops': ['graph_read', 'graph_write', 'graph_delete'],
      'ai_generation': ['ai_reasoning'],
      'classification': ['classification'],
      'gnn_analysis': ['gnn_analysis'],
      'general': ['data_access', 'flow_control', 'monitoring'],

      // New domains from intent-rules.js
      'devops': ['ado_operations', 'git_operations', 'data_access', 'flow_control'],
      'hr': ['data_access', 'entity_extraction', 'ai_reasoning', 'classification'],
      'finance': ['data_access', 'entity_extraction', 'data_transform', 'ai_reasoning'],
      'legal': ['text_cleanup', 'entity_extraction', 'ai_reasoning', 'vector_search', 'classification'],
      'operations': ['data_access', 'entity_extraction', 'flow_control', 'monitoring'],
      'knowledge': ['text_cleanup', 'text_splitting', 'entity_extraction', 'embedding', 'vector_search', 'graph_read', 'graph_write', 'ai_reasoning']
    };

    // ADO-specific tools (new capability)
    this.capabilityMap['ado_operations'] = [
      'primitive.getWorkItem', 'primitive.fetchAndIngestADO',
      'ado.fetchWorkItems', 'ado.createWorkItem', 'ado.updateWorkItem',
      'ado.getCommits', 'ado.getProjects'
    ];

    // Git-specific tools (new capability)
    this.capabilityMap['git_operations'] = [
      'git.clone', 'git.commit', 'git.push', 'git.pull', 'git.diff'
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve tools for a given IntentDescriptor
   * @param {Object} intent - IntentDescriptor from IntentClassifier
   * @param {Array} availableTools - All tools from MCP registry
   * @returns {ResolvedToolSet}
   */
  resolve(intent, availableTools) {
    if (!intent || !availableTools) {
      return this._emptyResult(availableTools?.length || 0);
    }

    // 1. Map required capabilities to concrete tool IDs
    const requiredToolIds = new Set();

    // From requiredCapabilities (domains from IntentClassifier)
    for (const capability of (intent.requiredCapabilities || [])) {
      const toolIds = this._resolveCapability(capability);
      toolIds.forEach(id => requiredToolIds.add(id));
    }

    // From allDomains as backup
    for (const domain of (intent.allDomains || [])) {
      const toolIds = this._resolveCapability(domain);
      toolIds.forEach(id => requiredToolIds.add(id));
    }

    // 2. Add always-needed tools based on intent
    this._addImpliedTools(intent, requiredToolIds);

    // 3. Filter available tools to only resolved ones
    const resolvedTools = availableTools.filter(tool => {
      const toolId = this._getToolId(tool);
      // Match by exact ID or by prefix
      return requiredToolIds.has(toolId) || this._matchesAnyRequired(toolId, requiredToolIds);
    });

    // 4. Classify by role
    const byRole = this._classifyByRole(resolvedTools);

    // 5. Check completeness — can this intent be fulfilled?
    const completeness = this._checkCompleteness(intent, byRole);

    // 6. Build result
    return {
      tools: resolvedTools,
      byRole,
      totalResolved: resolvedTools.length,
      totalAvailable: availableTools.length,
      filterRatio: availableTools.length > 0 ? resolvedTools.length / availableTools.length : 0,
      completeness,
      missingCapabilities: completeness.missing,
      // Formatted for LLM prompt in Stage 3
      forPrompt: this._formatForPrompt(byRole, intent)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPABILITY RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve capability/domain to concrete tool IDs
   * @private
   */
  _resolveCapability(capability) {
    // Direct match in capabilityMap
    if (this.capabilityMap[capability]) {
      return this.capabilityMap[capability];
    }

    // Fuzzy match — capability might be a domain name from IntentClassifier
    const mappedCapabilities = this.domainToCapabilities[capability] || [];
    return mappedCapabilities.flatMap(cap => this.capabilityMap[cap] || []);
  }

  /**
   * Add implied tools based on intent characteristics
   * @private
   */
  _addImpliedTools(intent, toolIds) {
    // Every graph needs basic data flow
    toolIds.add('primitive.get_value');
    toolIds.add('primitive.set_value');

    // Parallel intent → add control.parallel
    if (intent.expectsParallel) {
      toolIds.add('control.parallel');
      toolIds.add('control.fork');
      toolIds.add('control.join');
    }

    // Complex graphs likely need conditions
    if (intent.complexity === 'high') {
      toolIds.add('control.condition');
      toolIds.add('control.try_catch');
      toolIds.add('control.if');
    }

    // Medium complexity → basic conditions
    if (intent.complexity === 'medium') {
      toolIds.add('control.condition');
      toolIds.add('control.if');
    }

    // Intent-specific implied tools
    switch (intent.intent) {
      case 'ingest':
        // Ingest always needs storage
        toolIds.add('vector.write');
        toolIds.add('graph.create_node');
        toolIds.add('graph.create_edge');
        toolIds.add('text.sanitize');
        toolIds.add('text.chunk');
        toolIds.add('vector.embed');
        break;

      case 'query':
        // Query always needs search
        toolIds.add('vector.search');
        toolIds.add('graph.query');
        toolIds.add('ai.generate');
        break;

      case 'transform':
        // Transform needs processing and merging
        toolIds.add('primitive.transform');
        toolIds.add('primitive.merge');
        toolIds.add('graph.merge_nodes');
        break;

      case 'route':
        // Routing needs classification and conditions
        toolIds.add('ai.classify');
        toolIds.add('extraction.intent');
        toolIds.add('control.switch');
        break;

      case 'approve':
        // Approval workflows need conditions
        toolIds.add('control.condition');
        toolIds.add('control.switch');
        break;

      case 'monitor':
        // Monitoring needs logging and events
        toolIds.add('primitive.log');
        toolIds.add('primitive.emit_event');
        toolIds.add('primitive.checkpoint');
        break;

      case 'analyze':
        // Analysis needs AI and reporting
        toolIds.add('ai.generate');
        toolIds.add('text.summarize');
        break;

      // New intents from intent-rules.js
      case 'create':
        // Create operations need storage
        toolIds.add('graph.create_node');
        toolIds.add('graph.create_edge');
        toolIds.add('primitive.set_value');
        break;

      case 'read':
        // Read operations need search/fetch
        toolIds.add('graph.query');
        toolIds.add('vector.search');
        toolIds.add('primitive.get_value');
        break;

      case 'update':
        // Update operations need read and write
        toolIds.add('graph.update_node');
        toolIds.add('primitive.get_value');
        toolIds.add('primitive.set_value');
        break;

      case 'delete':
        // Delete operations
        toolIds.add('graph.delete_node');
        toolIds.add('vector.delete');
        break;

      case 'extract':
        // Extraction needs NLP tools
        toolIds.add('extraction.entities');
        toolIds.add('extraction.relations');
        toolIds.add('extraction.keywords');
        toolIds.add('text.sanitize');
        break;

      case 'aggregate':
        // Aggregation needs transform and summarize
        toolIds.add('primitive.reduce');
        toolIds.add('primitive.merge');
        toolIds.add('text.summarize');
        toolIds.add('ai.generate');
        break;

      case 'compare':
        // Comparison needs analysis
        toolIds.add('ai.generate');
        toolIds.add('vector.similarity');
        toolIds.add('primitive.transform');
        break;

      case 'link':
        // Linking entities
        toolIds.add('graph.create_edge');
        toolIds.add('graph.merge_nodes');
        toolIds.add('extraction.relations');
        break;

      case 'export':
        // Export data
        toolIds.add('primitive.transform');
        toolIds.add('data.save');
        toolIds.add('primitive.get_value');
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROLE CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Classify tools by functional role
   * @private
   */
  _classifyByRole(tools) {
    const byRole = {
      [TOOL_ROLES.INPUT]: [],
      [TOOL_ROLES.PROCESS]: [],
      [TOOL_ROLES.ANALYZE]: [],
      [TOOL_ROLES.SEARCH]: [],
      [TOOL_ROLES.STORE]: [],
      [TOOL_ROLES.CONTROL]: [],
      [TOOL_ROLES.AUXILIARY]: []
    };

    for (const tool of tools) {
      const toolId = this._getToolId(tool);
      let assigned = false;

      // Check each role's tool list
      for (const [role, toolIds] of Object.entries(this.toolRoles)) {
        if (this._matchesRole(toolId, toolIds)) {
          byRole[role].push(tool);
          assigned = true;
          break;
        }
      }

      // Default to AUXILIARY if no match
      if (!assigned) {
        byRole[TOOL_ROLES.AUXILIARY].push(tool);
      }
    }

    return byRole;
  }

  /**
   * Check if toolId matches any in the role's tool list
   * @private
   */
  _matchesRole(toolId, roleToolIds) {
    // Exact match
    if (roleToolIds.includes(toolId)) {
      return true;
    }

    // Prefix match (e.g., 'text.normalize' matches 'text.*')
    for (const roleToolId of roleToolIds) {
      if (toolId.startsWith(roleToolId.replace('*', ''))) {
        return true;
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETENESS CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if resolved tools can fulfill the intent
   * @private
   */
  _checkCompleteness(intent, byRole) {
    const missing = [];

    // Every intent needs at least INPUT tools
    if (byRole[TOOL_ROLES.INPUT].length === 0) {
      missing.push('INPUT tools');
    }

    // Intent-specific requirements
    switch (intent.intent) {
      case 'ingest':
        if (byRole[TOOL_ROLES.STORE].length === 0) {
          missing.push('STORE tools for ingest');
        }
        if (byRole[TOOL_ROLES.PROCESS].length === 0) {
          missing.push('PROCESS tools for ingest');
        }
        break;

      case 'query':
        if (byRole[TOOL_ROLES.SEARCH].length === 0) {
          missing.push('SEARCH tools for query');
        }
        if (byRole[TOOL_ROLES.ANALYZE].length === 0) {
          missing.push('ANALYZE tools for query response');
        }
        break;

      case 'transform':
        if (byRole[TOOL_ROLES.PROCESS].length === 0) {
          missing.push('PROCESS tools for transform');
        }
        break;

      case 'route':
      case 'approve':
        if (byRole[TOOL_ROLES.CONTROL].length === 0) {
          missing.push('CONTROL tools for routing/approval');
        }
        break;

      case 'analyze':
        if (byRole[TOOL_ROLES.ANALYZE].length === 0) {
          missing.push('ANALYZE tools for analysis');
        }
        break;
    }

    // Parallel execution needs control tools
    if (intent.expectsParallel && byRole[TOOL_ROLES.CONTROL].length === 0) {
      missing.push('CONTROL tools for parallel execution');
    }

    return {
      complete: missing.length === 0,
      missing,
      score: missing.length === 0 ? 1.0 : Math.max(0, 1 - missing.length * 0.2)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Format resolved tools for LLM prompt in Stage 3
   * Instead of flat list — structured by role
   * @private
   */
  _formatForPrompt(byRole, intent) {
    let prompt = `Available tools for "${intent.intent}" task (${intent.complexity} complexity):\n\n`;

    const roleDescriptions = {
      [TOOL_ROLES.INPUT]: 'Data input and normalization',
      [TOOL_ROLES.PROCESS]: 'Data processing and transformation',
      [TOOL_ROLES.ANALYZE]: 'AI analysis and generation',
      [TOOL_ROLES.SEARCH]: 'Search and retrieval',
      [TOOL_ROLES.STORE]: 'Data storage and persistence',
      [TOOL_ROLES.CONTROL]: 'Flow control and branching',
      [TOOL_ROLES.AUXILIARY]: 'Utilities and helpers'
    };

    for (const [role, tools] of Object.entries(byRole)) {
      if (tools.length === 0) continue;

      prompt += `## ${role} (${roleDescriptions[role]}):\n`;
      for (const tool of tools) {
        const toolId = this._getToolId(tool);
        const desc = tool.description || '';
        prompt += `- ${toolId}${desc ? ': ' + desc : ''}\n`;
      }
      prompt += '\n';
    }

    // Add guidance based on intent
    prompt += `\nGuidance for "${intent.intent}":\n`;
    switch (intent.intent) {
      case 'ingest':
        prompt += '- Start with INPUT tools for data normalization\n';
        prompt += '- Use PROCESS tools for chunking and embedding\n';
        prompt += '- End with STORE tools for persistence\n';
        break;
      case 'query':
        prompt += '- Use SEARCH tools for retrieval from vector/graph stores\n';
        prompt += '- Use ANALYZE tools to generate the response\n';
        break;
      case 'transform':
        prompt += '- Use PROCESS tools for data transformation\n';
        prompt += '- Consider CONTROL tools for complex transformations\n';
        break;
      default:
        prompt += '- Follow the logical flow from INPUT → PROCESS → OUTPUT\n';
    }

    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get tool ID from tool object
   * @private
   */
  _getToolId(tool) {
    return tool.name || tool.id || tool.toolId || '';
  }

  /**
   * Check if toolId matches any required ID (with prefix matching)
   * @private
   */
  _matchesAnyRequired(toolId, requiredToolIds) {
    for (const required of requiredToolIds) {
      // Exact match
      if (toolId === required) return true;

      // Prefix match: if required is 'text.sanitize', toolId 'text.sanitize.v2' matches
      if (toolId.startsWith(required + '.')) return true;

      // Category match: if required is 'text.*', toolId 'text.anything' matches
      const category = required.split('.')[0];
      if (toolId.startsWith(category + '.') && required.endsWith('.*')) return true;
    }
    return false;
  }

  /**
   * Return empty result structure
   * @private
   */
  _emptyResult(totalAvailable) {
    return {
      tools: [],
      byRole: {
        [TOOL_ROLES.INPUT]: [],
        [TOOL_ROLES.PROCESS]: [],
        [TOOL_ROLES.ANALYZE]: [],
        [TOOL_ROLES.SEARCH]: [],
        [TOOL_ROLES.STORE]: [],
        [TOOL_ROLES.CONTROL]: [],
        [TOOL_ROLES.AUXILIARY]: []
      },
      totalResolved: 0,
      totalAvailable,
      filterRatio: 0,
      completeness: { complete: false, missing: ['No intent provided'], score: 0 },
      missingCapabilities: ['No intent provided'],
      forPrompt: 'No tools resolved - intent not provided.'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get statistics about capability coverage
   * @returns {Object} Capability statistics
   */
  getCapabilityStats() {
    const stats = {
      totalCapabilities: Object.keys(this.capabilityMap).length,
      totalToolMappings: 0,
      capabilityCoverage: {}
    };

    for (const [cap, tools] of Object.entries(this.capabilityMap)) {
      stats.capabilityCoverage[cap] = tools.length;
      stats.totalToolMappings += tools.length;
    }

    return stats;
  }

  /**
   * Get available capabilities
   * @returns {string[]}
   */
  getAvailableCapabilities() {
    return Object.keys(this.capabilityMap);
  }

  /**
   * Get available roles
   * @returns {string[]}
   */
  getAvailableRoles() {
    return Object.values(TOOL_ROLES);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create ToolResolver instance
 * @param {Object} [mcpRegistry=null] - Optional MCP registry
 * @returns {ToolResolver}
 */
function createToolResolver(mcpRegistry = null) {
  return new ToolResolver(mcpRegistry);
}

module.exports = {
  ToolResolver,
  createToolResolver,
  TOOL_ROLES
};
