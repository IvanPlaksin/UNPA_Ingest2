/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH TYPE SERVICE
 * CRUD operations for workflow graph node types and edge types
 *
 * Stores type definitions in Core namespace (core.types.*)
 * Used by AI Graph Builder Agent to discover and create node types
 * ═══════════════════════════════════════════════════════════════════════════
 */

const memgraphService = require('../memgraph.service');

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const CORE_NAMESPACE = 'core';
const TYPES_SUBNAMESPACE = 'types';

/**
 * Node type categories
 */
const NodeCategory = {
  EXECUTOR: 'executor',
  CONDITION: 'condition',
  TRANSFORMER: 'transformer',
  AGGREGATOR: 'aggregator',
  EVENT: 'event',
  GATEWAY: 'gateway',
  CONTROL: 'control',
  // Async Signal System + FormBuilder categories
  FORM: 'form',
  SIGNAL: 'signal',
  DATASOURCE: 'datasource',
  AGENT: 'agent',
  RUNTIME: 'runtime',
  AUDIT: 'audit',
  // FlowDesk configuration
  CONFIGURATION: 'configuration',
};

/**
 * Domain identifiers
 */
const Domain = {
  COMMON: 'common',
  INGESTION: 'ingestion',
  RAG: 'rag',
  WORKFLOW: 'workflow',
  INTEGRATION: 'integration',
  INFRASTRUCTURE: 'infrastructure',
  META: 'meta',
  // Async Signal System + FormBuilder domains
  FORMS: 'forms',
  SIGNALS: 'signals',
  AGENTS: 'agents',
  // FlowDesk
  FLOWDESK: 'flowdesk',
};

/**
 * Edge type identifiers
 */
const EdgeType = {
  DATA_FLOW: 'data_flow',
  CONTROL_FLOW: 'control_flow',
  CONDITIONAL: 'conditional',
  ERROR_HANDLING: 'error_handling',
  TIMEOUT: 'timeout',
  CASCADE: 'cascade',
  // Infrastructure edge types (SubGraph system)
  CONTAINS_MEMBER: 'contains_member',
  PORT_OF: 'port_of',
  BRIDGES_TO: 'bridges_to',
  CONNECTS_INTERNAL: 'connects_internal',
  SUBGRAPH_LINK: 'subgraph_link',
  // Async Signal System + FormBuilder edge types
  HAS_SECTION: 'has_section',
  HAS_FIELD: 'has_field',
  HAS_VALIDATION: 'has_validation',
  HAS_DISPLAY_CONDITION: 'has_display_condition',
  USES_DATA_SOURCE: 'uses_data_source',
  PRODUCES_SCHEMA: 'produces_schema',
  HAS_RESOLUTION_POLICY: 'has_resolution_policy',
  HAS_PARTICIPANT: 'has_participant',
  ON_TIMEOUT: 'on_timeout',
  SCOPED_TO_NAMESPACE: 'scoped_to_namespace',
  HAS_CONFIG: 'has_config',
  HAS_MEMBER: 'has_member',
  RESOLVED_BY: 'resolved_by',
  FOR_EXECUTION: 'for_execution',
  WAITING_ON: 'waiting_on',
};

// ────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS
// ────────────────────────────────────────────────────────────────────────────

class GraphTypeService {
  constructor() {
    this.memgraph = memgraphService;
    this.initialized = false;
  }

  /**
   * Initialize schema for type storage
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create constraints for NodeType
      await this.memgraph.executeQuery(`
        CREATE CONSTRAINT ON (nt:NodeType) ASSERT nt.fullName IS UNIQUE
      `).catch(() => {}); // Ignore if exists

      // Create constraints for EdgeType
      await this.memgraph.executeQuery(`
        CREATE CONSTRAINT ON (et:EdgeType) ASSERT et.name IS UNIQUE
      `).catch(() => {});

      // Create constraints for Domain
      await this.memgraph.executeQuery(`
        CREATE CONSTRAINT ON (d:Domain) ASSERT d.name IS UNIQUE
      `).catch(() => {});

      // Create indices
      await this.memgraph.executeQuery(`
        CREATE INDEX ON :NodeType(domain)
      `).catch(() => {});

      await this.memgraph.executeQuery(`
        CREATE INDEX ON :NodeType(category)
      `).catch(() => {});

      this.initialized = true;
      console.log('[GraphTypeService] Schema initialized');
    } catch (error) {
      console.error('[GraphTypeService] Schema init error:', error.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NODE TYPE CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new node type
   * @param {Object} nodeType - Node type definition
   * @returns {Promise<Object>} Created node type
   */
  async createNodeType(nodeType) {
    const {
      domain,
      name,
      category,
      displayName,
      description,
      icon,
      color,
      inputSchema,
      outputSchema,
      parameters,
      executorClass,
      retryPolicy,
      timeout,
    } = nodeType;

    const fullName = `${domain}.${name}`;
    const namespace = `${CORE_NAMESPACE}.${TYPES_SUBNAMESPACE}.nodes.${domain}`;

    const result = await this.memgraph.executeQuery(`
      MERGE (d:Domain { name: $domain })
      CREATE (nt:NodeType {
        fullName: $fullName,
        domain: $domain,
        name: $name,
        category: $category,
        displayName: $displayName,
        description: $description,
        icon: $icon,
        color: $color,
        inputSchema: $inputSchema,
        outputSchema: $outputSchema,
        parameters: $parameters,
        executorClass: $executorClass,
        retryPolicy: $retryPolicy,
        timeout: $timeout,
        namespace: $namespace,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      MERGE (nt)-[:BELONGS_TO]->(d)
      RETURN nt
    `, {
      domain,
      name,
      fullName,
      category: category || NodeCategory.EXECUTOR,
      displayName: displayName || name,
      description: description || '',
      icon: icon || 'box',
      color: color || '#6366f1',
      inputSchema: JSON.stringify(inputSchema || {}),
      outputSchema: JSON.stringify(outputSchema || {}),
      parameters: JSON.stringify(parameters || []),
      executorClass: executorClass || null,
      retryPolicy: JSON.stringify(retryPolicy || { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 }),
      timeout: timeout || 30000,
      namespace,
    });

    return this._formatNodeType(result.records[0]?.get('nt'));
  }

  /**
   * Get node type by full name
   * @param {string} fullName - Full name (domain.name)
   * @returns {Promise<Object|null>} Node type or null
   */
  async getNodeType(fullName) {
    const result = await this.memgraph.executeQuery(`
      MATCH (nt:NodeType { fullName: $fullName })
      RETURN nt
    `, { fullName });

    if (result.records.length === 0) return null;
    return this._formatNodeType(result.records[0].get('nt'));
  }

  /**
   * Get node type by domain and name
   * @param {string} domain - Domain name
   * @param {string} name - Type name
   * @returns {Promise<Object|null>} Node type or null
   */
  async getNodeTypeByDomainAndName(domain, name) {
    return this.getNodeType(`${domain}.${name}`);
  }

  /**
   * Update node type
   * @param {string} fullName - Full name to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated node type
   */
  async updateNodeType(fullName, updates) {
    const setClause = Object.keys(updates)
      .filter(k => k !== 'fullName' && k !== 'domain' && k !== 'name')
      .map(k => {
        if (typeof updates[k] === 'object') {
          return `nt.${k} = $${k}`;
        }
        return `nt.${k} = $${k}`;
      })
      .join(', ');

    if (!setClause) return this.getNodeType(fullName);

    const params = { fullName };
    Object.keys(updates).forEach(k => {
      params[k] = typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k];
    });

    const result = await this.memgraph.executeQuery(`
      MATCH (nt:NodeType { fullName: $fullName })
      SET ${setClause}, nt.updatedAt = datetime()
      RETURN nt
    `, params);

    if (result.records.length === 0) return null;
    return this._formatNodeType(result.records[0].get('nt'));
  }

  /**
   * Delete node type
   * @param {string} fullName - Full name to delete
   * @returns {Promise<boolean>} Success
   */
  async deleteNodeType(fullName) {
    const result = await this.memgraph.executeQuery(`
      MATCH (nt:NodeType { fullName: $fullName })
      DETACH DELETE nt
      RETURN count(*) as deleted
    `, { fullName });

    return result.records[0]?.get('deleted')?.toNumber() > 0;
  }

  /**
   * List all node types
   * @param {Object} filter - Optional filters
   * @returns {Promise<Object[]>} List of node types
   */
  async listNodeTypes(filter = {}) {
    let whereClause = '';
    const params = {};

    if (filter.domain) {
      whereClause = 'WHERE nt.domain = $domain';
      params.domain = filter.domain;
    }

    if (filter.category) {
      whereClause = whereClause
        ? `${whereClause} AND nt.category = $category`
        : 'WHERE nt.category = $category';
      params.category = filter.category;
    }

    const result = await this.memgraph.executeQuery(`
      MATCH (nt:NodeType)
      ${whereClause}
      RETURN nt
      ORDER BY nt.domain, nt.name
    `, params);

    return result.records.map(r => this._formatNodeType(r.get('nt')));
  }

  /**
   * List node types by domain
   * @param {string} domain - Domain name
   * @returns {Promise<Object[]>} List of node types
   */
  async listNodeTypesByDomain(domain) {
    return this.listNodeTypes({ domain });
  }

  /**
   * List node types by category
   * @param {string} category - Category name
   * @returns {Promise<Object[]>} List of node types
   */
  async listNodeTypesByCategory(category) {
    return this.listNodeTypes({ category });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EDGE TYPE CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new edge type
   * @param {Object} edgeType - Edge type definition
   * @returns {Promise<Object>} Created edge type
   */
  async createEdgeType(edgeType) {
    const {
      name,
      displayName,
      description,
      color,
      style,
      animated,
      allowedSources,
      allowedTargets,
      dataSchema,
    } = edgeType;

    const namespace = `${CORE_NAMESPACE}.${TYPES_SUBNAMESPACE}.edges`;

    const result = await this.memgraph.executeQuery(`
      CREATE (et:EdgeType {
        name: $name,
        displayName: $displayName,
        description: $description,
        color: $color,
        style: $style,
        animated: $animated,
        allowedSources: $allowedSources,
        allowedTargets: $allowedTargets,
        dataSchema: $dataSchema,
        namespace: $namespace,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      RETURN et
    `, {
      name,
      displayName: displayName || name,
      description: description || '',
      color: color || '#64748b',
      style: style || 'solid',
      animated: animated || false,
      allowedSources: JSON.stringify(allowedSources || ['*']),
      allowedTargets: JSON.stringify(allowedTargets || ['*']),
      dataSchema: JSON.stringify(dataSchema || {}),
      namespace,
    });

    return this._formatEdgeType(result.records[0]?.get('et'));
  }

  /**
   * Get edge type by name
   * @param {string} name - Edge type name
   * @returns {Promise<Object|null>} Edge type or null
   */
  async getEdgeType(name) {
    const result = await this.memgraph.executeQuery(`
      MATCH (et:EdgeType { name: $name })
      RETURN et
    `, { name });

    if (result.records.length === 0) return null;
    return this._formatEdgeType(result.records[0].get('et'));
  }

  /**
   * Update edge type
   * @param {string} name - Name to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated edge type
   */
  async updateEdgeType(name, updates) {
    const setClause = Object.keys(updates)
      .filter(k => k !== 'name')
      .map(k => `et.${k} = $${k}`)
      .join(', ');

    if (!setClause) return this.getEdgeType(name);

    const params = { name };
    Object.keys(updates).forEach(k => {
      params[k] = typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k];
    });

    const result = await this.memgraph.executeQuery(`
      MATCH (et:EdgeType { name: $name })
      SET ${setClause}, et.updatedAt = datetime()
      RETURN et
    `, params);

    if (result.records.length === 0) return null;
    return this._formatEdgeType(result.records[0].get('et'));
  }

  /**
   * Delete edge type
   * @param {string} name - Name to delete
   * @returns {Promise<boolean>} Success
   */
  async deleteEdgeType(name) {
    const result = await this.memgraph.executeQuery(`
      MATCH (et:EdgeType { name: $name })
      DELETE et
      RETURN count(*) as deleted
    `, { name });

    return result.records[0]?.get('deleted')?.toNumber() > 0;
  }

  /**
   * List all edge types
   * @returns {Promise<Object[]>} List of edge types
   */
  async listEdgeTypes() {
    const result = await this.memgraph.executeQuery(`
      MATCH (et:EdgeType)
      RETURN et
      ORDER BY et.name
    `);

    return result.records.map(r => this._formatEdgeType(r.get('et')));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOMAIN CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create or get domain
   * @param {Object} domain - Domain definition
   * @returns {Promise<Object>} Domain
   */
  async createDomain(domain) {
    const { name, displayName, description, color, icon } = domain;

    const result = await this.memgraph.executeQuery(`
      MERGE (d:Domain { name: $name })
      ON CREATE SET
        d.displayName = $displayName,
        d.description = $description,
        d.color = $color,
        d.icon = $icon,
        d.createdAt = datetime()
      ON MATCH SET
        d.displayName = $displayName,
        d.description = $description,
        d.color = $color,
        d.icon = $icon,
        d.updatedAt = datetime()
      RETURN d
    `, {
      name,
      displayName: displayName || name,
      description: description || '',
      color: color || '#6366f1',
      icon: icon || 'folder',
    });

    return this._formatDomain(result.records[0]?.get('d'));
  }

  /**
   * List all domains
   * @returns {Promise<Object[]>} List of domains
   */
  async listDomains() {
    const result = await this.memgraph.executeQuery(`
      MATCH (d:Domain)
      OPTIONAL MATCH (d)<-[:BELONGS_TO]-(nt:NodeType)
      RETURN d, count(nt) as nodeCount
      ORDER BY d.name
    `);

    return result.records.map(r => ({
      ...this._formatDomain(r.get('d')),
      nodeCount: r.get('nodeCount').toNumber(),
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPATIBILITY OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Set compatibility between node types
   * @param {string} sourceType - Source node type full name
   * @param {string} targetType - Target node type full name
   * @param {string} edgeType - Edge type name
   * @returns {Promise<boolean>} Success
   */
  async setCompatibility(sourceType, targetType, edgeType) {
    const result = await this.memgraph.executeQuery(`
      MATCH (s:NodeType { fullName: $sourceType })
      MATCH (t:NodeType { fullName: $targetType })
      MERGE (s)-[r:COMPATIBLE_WITH { edgeType: $edgeType }]->(t)
      RETURN r
    `, { sourceType, targetType, edgeType });

    return result.records.length > 0;
  }

  /**
   * Get compatible target types for a source type
   * @param {string} sourceType - Source node type full name
   * @returns {Promise<Object[]>} Compatible node types
   */
  async getCompatibleTargets(sourceType) {
    const result = await this.memgraph.executeQuery(`
      MATCH (s:NodeType { fullName: $sourceType })-[r:COMPATIBLE_WITH]->(t:NodeType)
      RETURN t, r.edgeType as edgeType
    `, { sourceType });

    return result.records.map(r => ({
      ...this._formatNodeType(r.get('t')),
      edgeType: r.get('edgeType'),
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCHEMA VALIDATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Validate a node against its type schema
   * @param {Object} node - Node data to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateNode(node) {
    const nodeType = await this.getNodeType(node.type || node.executorType);

    if (!nodeType) {
      return {
        valid: false,
        errors: [`Unknown node type: ${node.type || node.executorType}`],
      };
    }

    const errors = [];

    // Validate required parameters
    if (nodeType.parameters) {
      for (const param of nodeType.parameters) {
        if (param.required && !(param.name in (node.parameters || {}))) {
          errors.push(`Missing required parameter: ${param.name}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      nodeType,
    };
  }

  /**
   * Validate an edge against type constraints
   * @param {Object} edge - Edge data
   * @param {Object} sourceNode - Source node
   * @param {Object} targetNode - Target node
   * @returns {Promise<Object>} Validation result
   */
  async validateEdge(edge, sourceNode, targetNode) {
    const edgeType = await this.getEdgeType(edge.type || 'data_flow');

    if (!edgeType) {
      return {
        valid: false,
        errors: [`Unknown edge type: ${edge.type}`],
      };
    }

    const errors = [];

    // Check allowed sources
    if (edgeType.allowedSources[0] !== '*') {
      const sourceType = sourceNode.type || sourceNode.executorType;
      if (!edgeType.allowedSources.includes(sourceType)) {
        errors.push(`Edge type ${edge.type} not allowed from ${sourceType}`);
      }
    }

    // Check allowed targets
    if (edgeType.allowedTargets[0] !== '*') {
      const targetType = targetNode.type || targetNode.executorType;
      if (!edgeType.allowedTargets.includes(targetType)) {
        errors.push(`Edge type ${edge.type} not allowed to ${targetType}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      edgeType,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPATIBILITY DISCOVERY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find node types compatible with a source type
   * @param {Object} options - Search options
   * @param {string} options.sourceType - Source node type full name
   * @param {string} options.edgeType - Edge type filter (optional)
   * @returns {Promise<Object[]>} Compatible node types with scores
   */
  async findCompatibleNodeTypes({ sourceType, edgeType }) {
    // First try explicit compatibility relationships
    const explicitResult = await this.memgraph.executeQuery(`
      MATCH (s:NodeType { fullName: $sourceType })-[r:COMPATIBLE_WITH]->(t:NodeType)
      ${edgeType ? 'WHERE r.edgeType = $edgeType' : ''}
      RETURN t, r.edgeType as compatEdgeType, 1.0 as score, 'explicit' as reason
    `, { sourceType, edgeType: edgeType || null });

    const explicit = explicitResult.records.map(r => ({
      ...this._formatNodeType(r.get('t')),
      edgeType: r.get('compatEdgeType'),
      compatibilityScore: r.get('score'),
      reason: 'Explicitly configured as compatible',
    }));

    // If we have explicit results, return them
    if (explicit.length > 0) {
      return explicit;
    }

    // Otherwise, infer compatibility based on domain and category
    const sourceNode = await this.getNodeType(sourceType);
    if (!sourceNode) return [];

    const inferredResult = await this.memgraph.executeQuery(`
      MATCH (t:NodeType)
      WHERE t.fullName <> $sourceType
      WITH t,
        CASE
          WHEN t.domain = $domain THEN 0.8
          WHEN t.domain = 'common' THEN 0.6
          ELSE 0.4
        END as domainScore,
        CASE
          WHEN t.category IN ['executor', 'transformer'] THEN 0.7
          WHEN t.category = 'aggregator' THEN 0.5
          ELSE 0.3
        END as categoryScore
      RETURN t, (domainScore + categoryScore) / 2 as score
      ORDER BY score DESC
      LIMIT 10
    `, { sourceType, domain: sourceNode.domain });

    return inferredResult.records.map(r => ({
      ...this._formatNodeType(r.get('t')),
      compatibilityScore: r.get('score'),
      reason: 'Inferred from domain and category similarity',
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _formatNodeType(node) {
    if (!node) return null;
    const props = node.properties;
    return {
      fullName: props.fullName,
      domain: props.domain,
      name: props.name,
      category: props.category,
      displayName: props.displayName,
      description: props.description,
      icon: props.icon,
      color: props.color,
      inputSchema: this._parseJson(props.inputSchema),
      outputSchema: this._parseJson(props.outputSchema),
      parameters: this._parseJson(props.parameters),
      executorClass: props.executorClass,
      retryPolicy: this._parseJson(props.retryPolicy),
      timeout: props.timeout,
      namespace: props.namespace,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  _formatEdgeType(node) {
    if (!node) return null;
    const props = node.properties;
    return {
      name: props.name,
      displayName: props.displayName,
      description: props.description,
      color: props.color,
      style: props.style,
      animated: props.animated,
      allowedSources: this._parseJson(props.allowedSources),
      allowedTargets: this._parseJson(props.allowedTargets),
      dataSchema: this._parseJson(props.dataSchema),
      namespace: props.namespace,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  _formatDomain(node) {
    if (!node) return null;
    const props = node.properties;
    return {
      name: props.name,
      displayName: props.displayName,
      description: props.description,
      color: props.color,
      icon: props.icon,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  _parseJson(str) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON EXPORT
// ────────────────────────────────────────────────────────────────────────────

let instance = null;

function getGraphTypeService() {
  if (!instance) {
    instance = new GraphTypeService();
  }
  return instance;
}

module.exports = {
  GraphTypeService,
  getGraphTypeService,
  NodeCategory,
  Domain,
  EdgeType,
};
