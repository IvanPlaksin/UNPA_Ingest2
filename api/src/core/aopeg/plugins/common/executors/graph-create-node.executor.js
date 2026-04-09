/**
 * Graph Create Node Executor — creates or merges a node in Memgraph
 */

const { BaseExecutor } = require('../../plugin-base');

class GraphCreateNodeExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'graph.create_node';
    this.displayName = 'Graph Create Node';
    this.description = 'Creates or merges a node with a given label and properties in Memgraph';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Node label' },
        properties: { type: 'object', description: 'Node properties' },
        merge_key: {
          type: 'string',
          description: 'If provided, MERGE on this key instead of CREATE',
        },
      },
      required: ['label', 'properties'],
    };
  }

  async execute(parameters, context) {
    const label = this.getRequiredParam(parameters, 'label');
    const properties = this.getRequiredParam(parameters, 'properties');
    const mergeKey = this.getParam(parameters, 'merge_key', null);

    // Sanitize label: only allow alphanumeric and underscore
    const sanitizedLabel = label.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitizedLabel !== label) {
      return this.error('INVALID_LABEL', `Label contains invalid characters: ${label}`, false);
    }

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      let cypher;
      let params;

      if (mergeKey) {
        // MERGE on the specified key, then SET remaining properties
        const mergeValue = properties[mergeKey];
        if (mergeValue === undefined) {
          return this.error(
            'INVALID_MERGE_KEY',
            `merge_key '${mergeKey}' not found in properties`,
            false,
          );
        }

        cypher = `MERGE (n:${sanitizedLabel} {${mergeKey}: $mergeValue}) SET n += $props RETURN n`;
        params = { mergeValue, props: properties };
      } else {
        cypher = `CREATE (n:${sanitizedLabel}) SET n = $props RETURN n`;
        params = { props: properties };
      }

      const result = await memgraph.executeQuery(cypher, params);

      const record = result.records?.[0];
      const node = record?.get ? record.get('n') : record?._fields?.[0];
      const nodeId = node?.identity != null ? String(node.identity) : null;

      return this.success(
        { created: true, label: sanitizedLabel, properties, node_id: nodeId },
        { merge: !!mergeKey, merge_key: mergeKey },
        1.0,
      );
    } catch (error) {
      return this.error('GRAPH_CREATE_ERROR', `Failed to create node: ${error.message}`, true);
    }
  }
}

module.exports = { GraphCreateNodeExecutor };
