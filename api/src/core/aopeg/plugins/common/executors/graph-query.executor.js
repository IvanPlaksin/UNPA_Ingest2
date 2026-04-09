/**
 * Graph Query Executor — executes a Cypher query against Memgraph
 */

const { BaseExecutor } = require('../../plugin-base');

class GraphQueryExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'graph.query';
    this.displayName = 'Graph Query';
    this.description = 'Executes a Cypher query against Memgraph and returns the results';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        cypher: { type: 'string', description: 'Cypher query to execute' },
        params: { type: 'object', default: {}, description: 'Query parameters' },
        single: {
          type: 'boolean',
          default: false,
          description: 'If true, return only the first record',
        },
      },
      required: ['cypher'],
    };
  }

  async execute(parameters, context) {
    const cypher = this.getRequiredParam(parameters, 'cypher');
    const params = this.getParam(parameters, 'params', {});
    const single = this.getParam(parameters, 'single', false);

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      const result = await memgraph.executeQuery(cypher, params);

      const records = (result.records || []).map((record) => {
        if (record.toObject) {
          return record.toObject();
        }
        if (record._fields && record.keys) {
          const obj = {};
          record.keys.forEach((key, i) => {
            obj[key] = record._fields[i];
          });
          return obj;
        }
        return record;
      });

      const output = single
        ? { record: records[0] || null, count: records.length > 0 ? 1 : 0 }
        : { records, count: records.length };

      return this.success(
        output,
        { cypher, single },
        1.0,
      );
    } catch (error) {
      return this.error('GRAPH_QUERY_ERROR', `Cypher query failed: ${error.message}`, true);
    }
  }
}

module.exports = { GraphQueryExecutor };
