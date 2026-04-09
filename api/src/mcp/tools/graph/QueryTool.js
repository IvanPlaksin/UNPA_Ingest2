const { BaseTool } = require('../primitives/BaseTool.js');

// Lazy-load memgraphService to avoid circular deps at import time
let _memgraphService = null;
function getMemgraph() {
  if (!_memgraphService) {
    _memgraphService = require('../../../services/memgraph.service.js');
  }
  return _memgraphService;
}

class QueryTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.query',
      name: 'Graph Query',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Execute Cypher query against graph database (Neo4j/Memgraph)',
      inputSchema: {
        type: 'object',
        required: ['cypher'],
        properties: {
          cypher: { type: 'string', description: 'Cypher query to execute' },
          params: { type: 'object', description: 'Query parameters' },
          database: { type: 'string', description: 'Database name (Neo4j)' },
          readOnly: { type: 'boolean', default: true, description: 'Ensure query is read-only' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          records: { type: 'array' },
          summary: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const { cypher, params = {}, database, readOnly = true } = args;

    // Safety check for read-only mode
    if (readOnly) {
      const writeKeywords = ['CREATE', 'MERGE', 'DELETE', 'SET', 'REMOVE', 'DROP'];
      const upperQuery = cypher.toUpperCase();
      for (const keyword of writeKeywords) {
        if (upperQuery.includes(keyword)) {
          return this.error('WRITE_NOT_ALLOWED', `Write operation "${keyword}" not allowed in read-only mode`);
        }
      }
    }

    const graphConfig = server?.config?.graph || {};
    const provider = graphConfig.provider || process.env.GRAPH_PROVIDER || 'memgraph';

    try {
      let result;
      if (provider === 'service' || server?.serviceConnector?.hasProvider('graph')) {
        result = await this.executeService(cypher, params, server);
      } else if (provider === 'neo4j') {
        result = await this.executeNeo4j(cypher, params, database, graphConfig);
      } else {
        result = await this.executeMemgraph(cypher, params, graphConfig);
      }
      return this.success(result);
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        return this.success({ records: [], summary: { error: 'Graph database not available' } });
      }
      throw error;
    }
  }

  /**
   * Execute Cypher via Memgraph's Bolt driver (memgraphService singleton).
   * The previous HTTP-based approach (port 7444) does not support data queries.
   */
  async executeMemgraph(cypher, params, _config) {
    const memgraph = getMemgraph();

    // Use longer timeout for MCP tool queries (30s)
    const result = await memgraph.executeQuery(cypher, params, { timeout: 30000 });

    // Convert neo4j-driver Record objects to plain JS objects
    const records = result.records.map(record => {
      const obj = {};
      for (const key of record.keys) {
        obj[key] = this._toPlainValue(record.get(key));
      }
      return obj;
    });

    return {
      records,
      summary: {
        provider: 'memgraph',
        resultAvailableAfter: result.summary?.resultAvailableAfter?.toNumber?.() ?? 0,
        rowCount: records.length
      }
    };
  }

  /**
   * Recursively convert neo4j-driver types (Node, Relationship, Integer, Path)
   * to plain JSON-serializable objects.
   */
  _toPlainValue(val) {
    if (val === null || val === undefined) return val;

    // neo4j Integer → JS number
    if (val.toNumber) return val.toNumber();

    // neo4j Node
    if (val.labels && val.properties !== undefined) {
      return {
        _id: val.properties?.id || val.properties?._id || val.identity?.toNumber?.() || val.identity,
        labels: val.labels,
        properties: this._flattenProps(val.properties)
      };
    }

    // neo4j Relationship
    if (val.type && val.start !== undefined && val.end !== undefined) {
      return {
        type: val.type,
        startNodeId: val.start?.toNumber?.() || val.start,
        endNodeId: val.end?.toNumber?.() || val.end,
        properties: this._flattenProps(val.properties)
      };
    }

    // neo4j Path
    if (val.segments) {
      return {
        nodes: (val.segments || []).map(s => this._toPlainValue(s.start))
          .concat(val.end ? [this._toPlainValue(val.end)] : []),
        relationships: (val.segments || []).map(s => this._toPlainValue(s.relationship)),
        length: val.segments?.length || 0
      };
    }

    // Arrays
    if (Array.isArray(val)) return val.map(v => this._toPlainValue(v));

    // Plain objects (property maps)
    if (typeof val === 'object' && val.constructor === Object) {
      return this._flattenProps(val);
    }

    return val;
  }

  /**
   * Flatten property map — convert any neo4j Integer values to plain numbers.
   */
  _flattenProps(props) {
    if (!props) return {};
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      out[k] = (v && v.toNumber) ? v.toNumber() : v;
    }
    return out;
  }

  async executeNeo4j(cypher, params, database, config) {
    const host = config.host || process.env.NEO4J_HOST || 'localhost';
    const port = config.httpPort || process.env.NEO4J_HTTP_PORT || 7474;
    const user = config.user || process.env.NEO4J_USER || 'neo4j';
    const password = config.password || process.env.NEO4J_PASSWORD || 'password';

    const url = `http://${host}:${port}/db/${database || 'neo4j'}/tx/commit`;
    const auth = Buffer.from(`${user}:${password}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        statements: [{ statement: cypher, parameters: params }]
      })
    });

    if (!response.ok) {
      throw new Error(`Neo4j error: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map(e => e.message).join('; '));
    }

    const result = data.results[0] || {};
    const records = (result.data || []).map(row => {
      const record = {};
      (result.columns || []).forEach((col, i) => {
        record[col] = row.row[i];
      });
      return record;
    });

    return {
      records,
      summary: { provider: 'neo4j', columns: result.columns }
    };
  }

  async executeService(cypher, params, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('graph')) {
      throw new Error('ServiceConnector graph provider not available');
    }

    const result = await connector.graphQuery(cypher, params);
    return {
      records: result.records,
      summary: { provider: 'service', ...result.summary }
    };
  }
}

module.exports = { QueryTool };
