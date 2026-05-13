'use strict';

/**
 * Graph DB Port — provider-agnostic interface for Cypher graph queries.
 *
 * Supports: Memgraph (bolt/neo4j-driver), PostgreSQL+AGE (openCypher via pg)
 * Select via GRAPH_DB_BACKEND env var: 'memgraph' | 'postgres-age'
 *
 * Unified interface:
 *   runQuery(cypher, params, options)            → neo4j-style result
 *   runBatch(queries, options)                   → array of results
 *   runWithNamespace(cypher, params, ns, opts)   → filtered result
 *   verifyConnectivity()
 *   getStats()
 */

// ─── Memgraph Adapter ─────────────────────────────────────────────────────────

class MemgraphAdapter {
  constructor() {
    this._service = require('../memgraph.service');
    this.type = 'memgraph';
  }

  // Backward compat: some callers access .driver directly for withSession/withWriteTransaction
  get driver() {
    return this._service.driver;
  }

  runQuery(cypher, params = {}, options = {}) {
    return this._service.executeQuery(cypher, params, options);
  }

  runBatch(queries, options = {}) {
    return this._service.executeInSession(queries, options.parentTensorId ?? null);
  }

  runWithNamespace(cypher, params = {}, namespaceFilter = null, options = {}) {
    return this._service.queryWithNamespace(cypher, params, namespaceFilter, options.parentTensorId ?? null);
  }

  verifyConnectivity() {
    return this._service.verifyConnectivity();
  }

  getStats() {
    return this._service.getStats?.() ?? {};
  }

  async close() {
    // Managed by singleton — no-op here
  }
}

// ─── PostgreSQL + Apache AGE Adapter ─────────────────────────────────────────

const { PostgresAGEAdapter } = require('./adapters/PostgresAGEAdapter');

// ─── Factory & Singleton ──────────────────────────────────────────────────────

class GraphDBPort {
  constructor() {
    this.adapter = this._createAdapter();
  }

  _createAdapter() {
    const backend = process.env.GRAPH_DB_BACKEND || 'memgraph';
    switch (backend) {
      case 'postgres-age':
        return new PostgresAGEAdapter();
      case 'memgraph':
      default:
        return new MemgraphAdapter();
    }
  }

  get type() { return this.adapter.type; }
  get driver() { return this.adapter.driver; }

  runQuery(cypher, params, options) {
    return this.adapter.runQuery(cypher, params, options);
  }

  runBatch(queries, options) {
    return this.adapter.runBatch(queries, options);
  }

  runWithNamespace(cypher, params, namespaceFilter, options) {
    return this.adapter.runWithNamespace(cypher, params, namespaceFilter, options);
  }

  verifyConnectivity() {
    return this.adapter.verifyConnectivity();
  }

  getStats() {
    return this.adapter.getStats();
  }

  close() {
    return this.adapter.close();
  }
}

let _instance = null;

function getGraphDB() {
  if (!_instance) _instance = new GraphDBPort();
  return _instance;
}

module.exports = { GraphDBPort, MemgraphAdapter, PostgresAGEAdapter, getGraphDB };
