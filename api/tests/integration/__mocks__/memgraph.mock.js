/**
 * In-memory Memgraph mock for integration tests.
 * Stores nodes/relationships in Maps. Supports basic MATCH/CREATE/DELETE patterns.
 */
'use strict';

class MemgraphMock {
  constructor() {
    this.nodes = new Map();
    this.rels = new Map();
    this._idSeq = 1;
    this.queryLog = [];
  }

  /** Simulate neo4j session.run() → { records } */
  async executeQuery(cypher, params = {}) {
    this.queryLog.push({ cypher, params, ts: Date.now() });

    // Return helper: wrap raw JS values as neo4j-style records
    const makeRecord = (obj) => ({
      get: (key) => obj[key],
      toObject: () => obj,
      keys: Object.keys(obj),
      _fields: Object.values(obj)
    });

    const upper = cypher.toUpperCase();

    // RETURN 1 (health check)
    if (upper.includes('RETURN 1')) {
      return { records: [makeRecord({ health: 1 })] };
    }

    // COUNT queries
    if (upper.includes('COUNT(')) {
      return { records: [makeRecord({ c: { low: this.nodes.size } })] };
    }

    // CREATE → store node
    if (upper.startsWith('CREATE')) {
      const id = params.id || `n-${this._idSeq++}`;
      const node = { id, ...params, _createdAt: Date.now() };
      this.nodes.set(id, node);
      return { records: [makeRecord({ n: node })] };
    }

    // DELETE
    if (upper.includes('DELETE') || upper.includes('DETACH DELETE')) {
      if (params.id) this.nodes.delete(params.id);
      return { records: [] };
    }

    // SET (update)
    if (upper.includes('SET')) {
      if (params.id && this.nodes.has(params.id)) {
        Object.assign(this.nodes.get(params.id), params);
        return { records: [makeRecord({ n: this.nodes.get(params.id) })] };
      }
      return { records: [] };
    }

    // MATCH by id
    if (params.id && this.nodes.has(params.id)) {
      return { records: [makeRecord({ n: this.nodes.get(params.id) })] };
    }

    // MATCH all (no specific id)
    if (upper.startsWith('MATCH')) {
      const all = [...this.nodes.values()].map(n => makeRecord({ n }));
      return { records: all };
    }

    return { records: [] };
  }

  /** session() mock */
  session() {
    const self = this;
    return {
      run: (c, p) => self.executeQuery(c, p),
      close: async () => {}
    };
  }

  /** verifyConnectivity mock */
  async verifyConnectivity() { return true; }

  /**
   * runQuery() — alias used by workspace service.
   * Returns array of plain objects (not { records: [...] }).
   */
  async runQuery(cypher, params = {}) {
    const result = await this.executeQuery(cypher, params);
    return result.records.map(rec => rec.toObject());
  }

  reset() {
    this.nodes.clear();
    this.rels.clear();
    this._idSeq = 1;
    this.queryLog = [];
  }
}

module.exports = { MemgraphMock };
