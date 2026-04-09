/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURAL FORM SERVICE
 *
 * Generates form specifications from STRUCTURAL + CONSTRAINT graphs.
 * Used by WAIT_FOR_INPUT nodes to produce rich, validated forms.
 *
 * Supports:
 *   - STRUCTURAL-based forms (new system)
 *   - Legacy parameterSchema forms (backward compatible)
 *   - Caching of compiled schemas
 *   - i18n via locale parameter
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { structuralToJsonSchema } = require('../compilers/structural-to-jsonschema');
const { constraintCompiler } = require('../compilers/constraint-compiler');
const { DataSourceService } = require('./datasource.service');
const { dataSourceRegistry } = require('./datasource-registry');

class StructuralFormService {
  constructor(memgraphService, options = {}) {
    this.memgraph = memgraphService;
    this._cache = new Map();
    this.dataSourceService = options.dataSourceService || new DataSourceService(memgraphService);
  }

  /**
   * Get full form specification for a WAIT_FOR_INPUT node.
   * If the node has structuralGraphId — use STRUCTURAL + CONSTRAINT.
   * Otherwise falls back to legacy parameterSchema.
   *
   * @param {object} nodeData - Node data with structuralGraphId or parameterSchema
   * @param {object} [options]
   * @param {string} [options.locale='en']
   * @returns {Promise<FormSpecification>}
   */
  async getFormSpecification(nodeData, options = {}) {
    const { locale = 'en', resolveDataSources = true, preloadAll = true } = options;

    if (nodeData.structuralGraphId) {
      return this._getStructuralForm(nodeData, locale, { resolveDataSources, preloadAll });
    }
    if (nodeData.parameterSchema) {
      return this._getLegacyForm(nodeData, locale);
    }
    throw new Error('Node has neither structuralGraphId nor parameterSchema');
  }

  /**
   * Generate form from STRUCTURAL + CONSTRAINT graphs.
   */
  async _getStructuralForm(nodeData, locale, dsOptions = {}) {
    const { structuralGraphId, constraintGraphId } = nodeData;
    const { resolveDataSources = true, preloadAll = true } = dsOptions;

    const cacheKey = `${structuralGraphId}:${constraintGraphId || 'auto'}:${locale}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // Load STRUCTURAL graph
    const structuralGraph = await this._loadGraphDefinition(structuralGraphId);
    if (!structuralGraph) {
      throw new Error(`STRUCTURAL graph not found: ${structuralGraphId}`);
    }
    if (structuralGraph.graphType !== 'STRUCTURAL') {
      throw new Error(`Graph ${structuralGraphId} is not STRUCTURAL (got ${structuralGraph.graphType})`);
    }

    // Compile STRUCTURAL to JSON Schema
    const baseJsonSchema = structuralToJsonSchema.compile(structuralGraph, { locale });

    // Load CONSTRAINT graph
    let constraintGraph = null;
    let frontendBundle = null;

    if (constraintGraphId) {
      constraintGraph = await this._loadGraphDefinition(constraintGraphId);
    } else {
      constraintGraph = await this._findConstraintForStructural(structuralGraphId);
    }

    if (constraintGraph && constraintGraph.graphType === 'CONSTRAINT') {
      frontendBundle = constraintCompiler.compileForFrontend(constraintGraph, structuralGraph);
    }

    // Resolve DataSource bindings
    let dataSources = {};
    let cascadingDependencies = {};

    if (resolveDataSources) {
      const dsResult = await this._resolveDataSources(structuralGraph, { preloadAll });
      dataSources = dsResult.dataSources;
      cascadingDependencies = dsResult.cascadingDependencies;
    }

    const formSpec = {
      jsonSchema: frontendBundle
        ? constraintCompiler.compileToJsonSchema(constraintGraph, baseJsonSchema)
        : baseJsonSchema,
      zodSchema: frontendBundle?.zodSchema || null,
      visibilityRules: frontendBundle?.visibilityRules || {},
      computedFields: frontendBundle?.computedFields || {},
      asyncValidations: frontendBundle?.asyncValidations || [],
      errorMessages: frontendBundle?.errorMessages || {},
      uiHints: this._extractUiHints(structuralGraph),
      fieldOrder: this._extractFieldOrder(structuralGraph),
      dataSources,
      cascadingDependencies,
      meta: {
        structuralGraphId,
        constraintGraphId: constraintGraph?.graphId || null,
        locale,
        generatedAt: new Date().toISOString(),
      },
    };

    this._cache.set(cacheKey, formSpec);
    return formSpec;
  }

  /**
   * Legacy fallback for nodes with parameterSchema.
   */
  _getLegacyForm(nodeData, locale) {
    return {
      jsonSchema: nodeData.parameterSchema,
      zodSchema: null,
      visibilityRules: {},
      computedFields: {},
      asyncValidations: [],
      errorMessages: {},
      uiHints: {},
      fieldOrder: Object.keys(nodeData.parameterSchema.properties || {}),
      meta: { legacy: true, locale },
    };
  }

  /**
   * Load a GraphDefinition from Memgraph by graphId.
   */
  async _loadGraphDefinition(graphId) {
    try {
      const rows = await this.memgraph.runQuery(`
        MATCH (g:GraphDefinition {graphId: $graphId})
        RETURN g.graphId AS graphId, g.graphType AS graphType,
               g.graphSubType AS graphSubType, g.graphDimension AS graphDimension,
               g.nodes AS nodes, g.edges AS edges,
               g.structuralGraphId AS structuralGraphId
      `, { graphId });

      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      return {
        graphId: row.graphId,
        graphType: row.graphType,
        graphSubType: row.graphSubType,
        graphDimension: row.graphDimension,
        structuralGraphId: row.structuralGraphId || null,
        nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : (row.nodes || []),
        edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : (row.edges || []),
      };
    } catch (error) {
      console.error(`[StructuralFormService] Failed to load graph ${graphId}:`, error.message);
      return null;
    }
  }

  /**
   * Find a CONSTRAINT graph linked to a STRUCTURAL via CONSTRAINS relationship.
   */
  async _findConstraintForStructural(structuralGraphId) {
    try {
      const rows = await this.memgraph.runQuery(`
        MATCH (c:GraphDefinition {graphType: 'CONSTRAINT'})-[:CONSTRAINS]->(s:GraphDefinition {graphId: $structuralGraphId})
        RETURN c.graphId AS graphId, c.graphType AS graphType,
               c.nodes AS nodes, c.edges AS edges,
               c.structuralGraphId AS structuralGraphId
        LIMIT 1
      `, { structuralGraphId });

      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      return {
        graphId: row.graphId,
        graphType: row.graphType,
        structuralGraphId: row.structuralGraphId || null,
        nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : (row.nodes || []),
        edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : (row.edges || []),
      };
    } catch (error) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // DataSource Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve all DataSource bindings in a STRUCTURAL graph.
   */
  async _resolveDataSources(structuralGraph, options = {}) {
    const dataSources = {};
    const cascadingDependencies = {};

    const nodes = structuralGraph.nodes || [];

    // Find all field nodes with DataSource bindings
    const dsFields = nodes.filter(n =>
      n.nodeType === 'FIELD' && n.dataSource?.dataSourceId
    );

    for (const fieldNode of dsFields) {
      const fieldName = fieldNode.name;
      const binding = fieldNode.dataSource;

      try {
        const dsSpec = await this._resolveFieldDataSource(fieldName, binding, options);
        dataSources[fieldName] = dsSpec;

        if (binding.dependsOn) {
          cascadingDependencies[fieldName] = {
            dependsOn: binding.dependsOn.field,
            dataSourceId: binding.dataSourceId,
            paramName: binding.dependsOn.paramName,
          };
        }
      } catch (error) {
        console.error(`Failed to resolve DataSource for field ${fieldName}:`, error.message);
        dataSources[fieldName] = { type: 'error', error: error.message };
      }
    }

    return { dataSources, cascadingDependencies };
  }

  /**
   * Resolve a single field's DataSource binding.
   * Returns one of: { type: 'preloaded' }, { type: 'search' }, { type: 'endpoint' }
   */
  async _resolveFieldDataSource(fieldName, binding, options = {}) {
    const { preloadAll = true } = options;

    const dsConfig = await this.dataSourceService.get(binding.dataSourceId);
    if (!dsConfig) {
      throw new Error(`DataSource not found: ${binding.dataSourceId}`);
    }

    const effectiveConfig = this._mergeDataSourceConfig(dsConfig, binding);

    // Search-based → return endpoint info for frontend autocomplete
    if (binding.operation === 'search') {
      return {
        type: 'search',
        dataSourceId: binding.dataSourceId,
        endpoint: `/api/v1/datasources/${binding.dataSourceId}/search`,
        minSearchLength: binding.minSearchLength || 2,
        debounceMs: binding.debounceMs || 300,
        valueField: effectiveConfig.config?.valueField || 'value',
        labelField: effectiveConfig.config?.labelField || 'label',
        showMetadata: binding.showMetadata || false,
        metadataTemplate: binding.metadataTemplate,
      };
    }

    // loadAll + preload enabled + no cascading → preload data
    if (binding.operation === 'loadAll' && preloadAll && !binding.dependsOn) {
      try {
        const result = await dataSourceRegistry.execute(effectiveConfig, 'loadAll', {
          filters: binding.staticFilters || {},
          limit: effectiveConfig.config?.maxLimit || 1000,
        });

        return {
          type: 'preloaded',
          dataSourceId: binding.dataSourceId,
          items: result.items,
          total: result.total,
          cached: result.cached || false,
          valueField: effectiveConfig.config?.valueField || 'value',
          labelField: effectiveConfig.config?.labelField || 'label',
        };
      } catch (error) {
        console.warn(`Preload failed for ${fieldName}, falling back to endpoint:`, error.message);
        return {
          type: 'endpoint',
          dataSourceId: binding.dataSourceId,
          endpoint: `/api/v1/datasources/${binding.dataSourceId}/load`,
          error: error.message,
        };
      }
    }

    // Cascading or preload disabled → return endpoint info
    return {
      type: 'endpoint',
      dataSourceId: binding.dataSourceId,
      endpoint: `/api/v1/datasources/${binding.dataSourceId}/load`,
      dependsOn: binding.dependsOn,
      staticFilters: binding.staticFilters,
      valueField: effectiveConfig.config?.valueField || 'value',
      labelField: effectiveConfig.config?.labelField || 'label',
    };
  }

  /**
   * Merge DataSource config with field-level binding overrides.
   */
  _mergeDataSourceConfig(dsConfig, binding) {
    const merged = { ...dsConfig };

    if (binding.valueField || binding.labelField) {
      merged.config = {
        ...merged.config,
        valueField: binding.valueField || merged.config?.valueField,
        labelField: binding.labelField || merged.config?.labelField,
      };
    }

    return merged;
  }

  // ---------------------------------------------------------------------------
  // UI Hints & Field Order
  // ---------------------------------------------------------------------------

  _extractUiHints(structuralGraph) {
    const hints = {};
    for (const node of structuralGraph.nodes || []) {
      if (node.uiHints && node.name) {
        hints[node.name] = node.uiHints;
      }
    }
    return hints;
  }

  _extractFieldOrder(structuralGraph) {
    return (structuralGraph.nodes || [])
      .filter(n => n.nodeType !== 'ROOT')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(n => n.name);
  }

  clearCache(graphId) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(graphId)) this._cache.delete(key);
    }
  }

  clearAllCache() {
    this._cache.clear();
  }
}

module.exports = { StructuralFormService };
