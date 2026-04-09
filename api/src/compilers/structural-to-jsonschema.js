/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURAL → JSON SCHEMA COMPILER
 *
 * Compiles a STRUCTURAL graph into a JSON Schema (draft-07).
 * The resulting schema can be used with AJV for backend validation
 * or with form generators for dynamic UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { StructuralNodeType, FieldDataType, StructuralEdgeType } = require('../schemas/structural-graph.schema');

class StructuralToJsonSchemaCompiler {

  /**
   * Compile a STRUCTURAL graph into JSON Schema draft-07.
   * @param {object} structuralGraph - { nodes, edges, graphId, name }
   * @param {object} [options]
   * @param {string} [options.locale='en'] - Locale for i18n text
   * @returns {object} JSON Schema object
   */
  compile(structuralGraph, options = {}) {
    const { nodes, edges } = structuralGraph;
    const locale = options.locale || 'en';

    const children = this._buildChildrenMap(edges);

    const rootNode = nodes.find(n => n.nodeType === StructuralNodeType.ROOT);
    if (!rootNode) {
      throw new Error('STRUCTURAL graph must have a ROOT node');
    }

    const schema = this._compileNode(rootNode, nodes, children, locale);

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: structuralGraph.graphId,
      title: this._localize(rootNode.label, locale) || rootNode.name,
      ...schema,
    };
  }

  _buildChildrenMap(edges) {
    const map = new Map();
    for (const edge of edges) {
      if ([StructuralEdgeType.CONTAINS, StructuralEdgeType.ITEMS, StructuralEdgeType.OPTION].includes(edge.edgeType)) {
        if (!map.has(edge.source)) map.set(edge.source, []);
        map.get(edge.source).push({ targetId: edge.target, edgeType: edge.edgeType });
      }
    }
    return map;
  }

  _compileNode(node, allNodes, childrenMap, locale) {
    switch (node.nodeType) {
      case StructuralNodeType.ROOT:
      case StructuralNodeType.OBJECT:
        return this._compileObject(node, allNodes, childrenMap, locale);
      case StructuralNodeType.FIELD:
        return this._compileField(node, locale);
      case StructuralNodeType.ENUM:
        return this._compileEnum(node, locale);
      case StructuralNodeType.ARRAY:
        return this._compileArray(node, allNodes, childrenMap, locale);
      case StructuralNodeType.UNION:
        return this._compileUnion(node, allNodes, childrenMap, locale);
      case StructuralNodeType.REFERENCE:
        return { $ref: `#/definitions/${node.referencedStructuralId}` };
      default:
        throw new Error(`Unknown structural node type: ${node.nodeType}`);
    }
  }

  _compileObject(node, allNodes, childrenMap, locale) {
    const childEdges = childrenMap.get(node.nodeId) || [];
    const properties = {};
    const required = [];

    // Sort children by order
    const sortedChildren = childEdges
      .map(({ targetId }) => allNodes.find(n => n.nodeId === targetId))
      .filter(Boolean)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const childNode of sortedChildren) {
      const prop = {
        ...this._compileNode(childNode, allNodes, childrenMap, locale),
      };

      const title = this._localize(childNode.label, locale);
      if (title) prop.title = title;

      const desc = this._localize(childNode.description, locale);
      if (desc) prop.description = desc;

      if (childNode.defaultValue !== undefined) {
        prop.default = childNode.defaultValue;
      }

      properties[childNode.name] = prop;

      if (childNode.required) {
        required.push(childNode.name);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }

  _compileField(node) {
    const schema = { type: this._mapDataType(node.dataType) };

    const format = this._getFormat(node.dataType);
    if (format) schema.format = format;

    if (node.defaultValue !== undefined) schema.default = node.defaultValue;

    // DataSource binding extension
    if (node.dataSource) {
      schema['x-dataSource'] = {
        dataSourceId: node.dataSource.dataSourceId,
        operation: node.dataSource.operation,
        valueField: node.dataSource.valueField,
        labelField: node.dataSource.labelField,
        minSearchLength: node.dataSource.minSearchLength,
        debounceMs: node.dataSource.debounceMs,
        dependsOn: node.dataSource.dependsOn,
        staticFilters: node.dataSource.staticFilters,
        showMetadata: node.dataSource.showMetadata,
        metadataTemplate: node.dataSource.metadataTemplate,
      };
    }

    return schema;
  }

  _compileEnum(node, locale) {
    return {
      type: 'string',
      enum: node.enumValues,
    };
  }

  _compileArray(node, allNodes, childrenMap, locale) {
    const childEdges = childrenMap.get(node.nodeId) || [];
    const itemEdge = childEdges.find(c => c.edgeType === StructuralEdgeType.ITEMS);

    const schema = { type: 'array' };

    if (itemEdge) {
      const itemNode = allNodes.find(n => n.nodeId === itemEdge.targetId);
      if (itemNode) {
        schema.items = this._compileNode(itemNode, allNodes, childrenMap, locale);
      }
    }

    if (node.minItems !== undefined) schema.minItems = node.minItems;
    if (node.maxItems !== undefined) schema.maxItems = node.maxItems;

    return schema;
  }

  _compileUnion(node, allNodes, childrenMap, locale) {
    const childEdges = childrenMap.get(node.nodeId) || [];
    const options = childEdges
      .filter(c => c.edgeType === StructuralEdgeType.OPTION)
      .map(({ targetId }) => {
        const optNode = allNodes.find(n => n.nodeId === targetId);
        return optNode ? this._compileNode(optNode, allNodes, childrenMap, locale) : null;
      })
      .filter(Boolean);

    return { oneOf: options };
  }

  _mapDataType(dataType) {
    const mapping = {
      [FieldDataType.STRING]: 'string',
      [FieldDataType.TEXT]: 'string',
      [FieldDataType.EMAIL]: 'string',
      [FieldDataType.URL]: 'string',
      [FieldDataType.UUID]: 'string',
      [FieldDataType.DATE]: 'string',
      [FieldDataType.DATETIME]: 'string',
      [FieldDataType.TIME]: 'string',
      [FieldDataType.NUMBER]: 'number',
      [FieldDataType.INTEGER]: 'integer',
      [FieldDataType.BOOLEAN]: 'boolean',
      [FieldDataType.FILE]: 'string',
    };
    return mapping[dataType] || 'string';
  }

  _getFormat(dataType) {
    const formats = {
      [FieldDataType.EMAIL]: 'email',
      [FieldDataType.URL]: 'uri',
      [FieldDataType.UUID]: 'uuid',
      [FieldDataType.DATE]: 'date',
      [FieldDataType.DATETIME]: 'date-time',
      [FieldDataType.TIME]: 'time',
    };
    return formats[dataType];
  }

  _localize(i18nObj, locale) {
    if (!i18nObj) return undefined;
    return i18nObj[locale] || i18nObj.en || Object.values(i18nObj)[0];
  }
}

module.exports = {
  StructuralToJsonSchemaCompiler,
  structuralToJsonSchema: new StructuralToJsonSchemaCompiler(),
};
