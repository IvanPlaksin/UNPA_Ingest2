/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURAL GRAPH SCHEMA
 *
 * A STRUCTURAL graph defines data structure — analogous to a class/interface/
 * JSON Schema, but expressed as a graph. Used for:
 *   - Form generation (WAIT_FOR_INPUT nodes reference STRUCTURAL)
 *   - STORABLE graph validation (STORABLE CONFORMS_TO STRUCTURAL)
 *   - Type checking when passing data between nodes
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const StructuralNodeType = {
  ROOT: 'ROOT',           // Root schema node
  FIELD: 'FIELD',         // Simple typed field
  OBJECT: 'OBJECT',       // Nested object (group of fields)
  ARRAY: 'ARRAY',         // Array of items
  ENUM: 'ENUM',           // Enumeration of values
  REFERENCE: 'REFERENCE', // Reference to another STRUCTURAL graph
  UNION: 'UNION',         // One of several types (oneOf)
};

// ────────────────────────────────────────────────────────────────────────────
// FIELD DATA TYPES
// ────────────────────────────────────────────────────────────────────────────

const FieldDataType = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  DATE: 'date',           // ISO date (YYYY-MM-DD)
  DATETIME: 'datetime',   // ISO datetime
  TIME: 'time',           // ISO time (HH:MM:SS)
  EMAIL: 'email',
  URL: 'url',
  UUID: 'uuid',
  TEXT: 'text',           // Multiline string
  FILE: 'file',           // File reference
  ANY: 'any',             // No type constraint
};

// ────────────────────────────────────────────────────────────────────────────
// EDGE TYPES
// ────────────────────────────────────────────────────────────────────────────

const StructuralEdgeType = {
  CONTAINS: 'CONTAINS',       // Parent → Child field
  ITEMS: 'ITEMS',             // Array → Item type
  OPTION: 'OPTION',           // Union → Option type
  EXTENDS: 'EXTENDS',         // Inheritance
  REFERENCES: 'REFERENCES',   // Reference to another STRUCTURAL
};

// ────────────────────────────────────────────────────────────────────────────
// BUILDER
// ────────────────────────────────────────────────────────────────────────────

class StructuralGraphBuilder {
  constructor(name, options = {}) {
    this.graphId = options.graphId || `structural_${name}_${Date.now()}`;
    this.name = name;
    this.namespace = options.namespace || 'CORE';
    this.nodes = [];
    this.edges = [];
    this._nodeCounter = 0;

    // Create root node
    this.rootId = this._addNode({
      nodeType: StructuralNodeType.ROOT,
      name,
      label: options.label || { en: name },
    });
  }

  _generateNodeId() {
    return `node_${++this._nodeCounter}`;
  }

  _addNode(nodeData) {
    const nodeId = nodeData.nodeId || this._generateNodeId();
    this.nodes.push({ ...nodeData, nodeId });
    return nodeId;
  }

  _addEdge(sourceId, targetId, edgeType) {
    this.edges.push({
      edgeId: `edge_${sourceId}_${targetId}`,
      source: sourceId,
      target: targetId,
      edgeType,
    });
  }

  /**
   * Add a simple typed field.
   * @param {string} name
   * @param {string} dataType - One of FieldDataType values
   * @param {object} [options]
   * @param {object} [options.dataSource] - DataSource binding config
   */
  addField(name, dataType, options = {}) {
    const nodeId = this._addNode({
      nodeType: StructuralNodeType.FIELD,
      name,
      dataType,
      label: options.label || { en: name },
      description: options.description,
      defaultValue: options.defaultValue,
      required: options.required || false,
      order: options.order || this.nodes.length,
      uiHints: options.uiHints,
      dataSource: options.dataSource
        ? this._normalizeDataSourceBinding(options.dataSource)
        : null,
    });

    this._addEdge(this.rootId, nodeId, StructuralEdgeType.CONTAINS);
    return this;
  }

  /**
   * Add an enum field.
   */
  addEnum(name, values, options = {}) {
    const nodeId = this._addNode({
      nodeType: StructuralNodeType.ENUM,
      name,
      enumValues: values,
      enumLabels: options.enumLabels,
      label: options.label || { en: name },
      description: options.description,
      defaultValue: options.defaultValue,
      required: options.required || false,
      order: options.order || this.nodes.length,
      uiHints: options.uiHints,
    });

    this._addEdge(this.rootId, nodeId, StructuralEdgeType.CONTAINS);
    return this;
  }

  /**
   * Add a nested object with sub-fields.
   */
  addObject(name, builderFn, options = {}) {
    const objectId = this._addNode({
      nodeType: StructuralNodeType.OBJECT,
      name,
      label: options.label || { en: name },
      description: options.description,
      order: options.order || this.nodes.length,
    });

    this._addEdge(this.rootId, objectId, StructuralEdgeType.CONTAINS);

    const nestedBuilder = {
      addField: (fieldName, dataType, fieldOptions = {}) => {
        const fieldId = this._addNode({
          nodeType: StructuralNodeType.FIELD,
          name: fieldName,
          dataType,
          label: fieldOptions.label || { en: fieldName },
          description: fieldOptions.description,
          defaultValue: fieldOptions.defaultValue,
          required: fieldOptions.required || false,
          order: fieldOptions.order || this.nodes.length,
          uiHints: fieldOptions.uiHints,
        });
        this._addEdge(objectId, fieldId, StructuralEdgeType.CONTAINS);
        return nestedBuilder;
      },
      addEnum: (fieldName, values, fieldOptions = {}) => {
        const fieldId = this._addNode({
          nodeType: StructuralNodeType.ENUM,
          name: fieldName,
          enumValues: values,
          enumLabels: fieldOptions.enumLabels,
          label: fieldOptions.label || { en: fieldName },
          required: fieldOptions.required || false,
          order: fieldOptions.order || this.nodes.length,
        });
        this._addEdge(objectId, fieldId, StructuralEdgeType.CONTAINS);
        return nestedBuilder;
      },
    };

    builderFn(nestedBuilder);
    return this;
  }

  /**
   * Add an array field with item type.
   */
  addArray(name, itemType, options = {}) {
    const arrayId = this._addNode({
      nodeType: StructuralNodeType.ARRAY,
      name,
      label: options.label || { en: name },
      minItems: options.minItems,
      maxItems: options.maxItems,
      order: options.order || this.nodes.length,
    });

    this._addEdge(this.rootId, arrayId, StructuralEdgeType.CONTAINS);

    const itemId = this._addNode({
      nodeType: StructuralNodeType.FIELD,
      name: `${name}_item`,
      dataType: itemType,
    });

    this._addEdge(arrayId, itemId, StructuralEdgeType.ITEMS);
    return this;
  }

  /**
   * Add a field bound to a DataSource (select / autocomplete).
   * @param {string} name
   * @param {string} dataSourceId - GraphId of the DataSource
   * @param {object} [options]
   * @param {boolean} [options.searchable] - true → autocomplete, false → select
   * @param {object} [options.dataSourceOptions] - Extra DataSource binding overrides
   */
  addDataSourceField(name, dataSourceId, options = {}) {
    return this.addField(name, FieldDataType.STRING, {
      ...options,
      dataSource: {
        dataSourceId,
        operation: options.searchable ? 'search' : 'loadAll',
        ...options.dataSourceOptions,
      },
      uiHints: {
        widget: options.searchable ? 'autocomplete' : 'select',
        ...options.uiHints,
      },
    });
  }

  /**
   * Add a cascading field that depends on another field's value.
   * @param {string} name
   * @param {string} dataSourceId
   * @param {string} dependsOnField - Name of the parent field
   * @param {string} paramName - Parameter name sent to DataSource
   * @param {object} [options]
   */
  addCascadingField(name, dataSourceId, dependsOnField, paramName, options = {}) {
    return this.addDataSourceField(name, dataSourceId, {
      ...options,
      dataSourceOptions: {
        ...options.dataSourceOptions,
        dependsOn: { field: dependsOnField, paramName },
      },
    });
  }

  /**
   * Normalize and validate a DataSource binding configuration.
   */
  _normalizeDataSourceBinding(binding) {
    if (!binding.dataSourceId) {
      throw new Error('dataSource.dataSourceId is required');
    }

    return {
      dataSourceId: binding.dataSourceId,
      operation: binding.operation || 'loadAll',
      valueField: binding.valueField || null,
      labelField: binding.labelField || null,
      minSearchLength: binding.minSearchLength ?? 2,
      debounceMs: binding.debounceMs ?? 300,
      dependsOn: binding.dependsOn || null,
      staticFilters: binding.staticFilters || null,
      showMetadata: binding.showMetadata || false,
      metadataTemplate: binding.metadataTemplate || null,
    };
  }

  /**
   * Build the final graph definition.
   */
  build() {
    return {
      graphId: this.graphId,
      graphType: 'STRUCTURAL',
      graphSubType: null,
      graphDimension: 'DATA',
      namespace: this.namespace,
      name: this.name,
      nodes: this.nodes,
      edges: this.edges,
    };
  }
}

module.exports = {
  StructuralNodeType,
  FieldDataType,
  StructuralEdgeType,
  StructuralGraphBuilder,
};
