'use strict';

/**
 * Vector DB Port — provider-agnostic interface for vector similarity search.
 *
 * Supports: Qdrant (REST client), PostgreSQL+pgvector (pg + vector type)
 * Select via VECTOR_DB_BACKEND env var: 'qdrant' | 'pgvector'
 *
 * Unified interface mirrors QdrantService public API.
 */

// ─── Qdrant Adapter ───────────────────────────────────────────────────────────

class QdrantAdapter {
  constructor() {
    this._service = require('../qdrant.service');
    this.type = 'qdrant';
  }

  // ── Collection management ──────────────────────────────────────────────────

  getCollectionName(fullNamespace) {
    return this._service.getCollectionName(fullNamespace);
  }

  initCollection() {
    return this._service.initCollection();
  }

  initCollectionForNamespace(fullNamespace) {
    return this._service.initCollectionForNamespace(fullNamespace);
  }

  initAllNamespaceCollections() {
    return this._service.initAllNamespaceCollections();
  }

  collectionExists(fullNamespace) {
    return this._service.collectionExists(fullNamespace);
  }

  getNamespaceStats(fullNamespace) {
    return this._service.getNamespaceStats(fullNamespace);
  }

  // ── Write operations ───────────────────────────────────────────────────────

  upsertPoints(points, fullNamespace) {
    return this._service.upsertPoints(points, fullNamespace);
  }

  deleteByNamespace(fullNamespace, additionalFilter) {
    return this._service.deleteByNamespace(fullNamespace, additionalFilter);
  }

  migrateNamespace(sourceNamespace, targetNamespace, batchSize, maxIterations) {
    return this._service.migrateNamespace(sourceNamespace, targetNamespace, batchSize, maxIterations);
  }

  // ── Search operations ──────────────────────────────────────────────────────

  searchSimilar(vector, limit, filter, fullNamespace) {
    return this._service.searchSimilar(vector, limit, filter, fullNamespace);
  }

  searchAcrossNamespaces(vector, namespaces, limit, filter) {
    return this._service.searchAcrossNamespaces(vector, namespaces, limit, filter);
  }

  searchWithNamespaceFilter(vector, limit, namespaceFilter, additionalFilter) {
    return this._service.searchWithNamespaceFilter(vector, limit, namespaceFilter, additionalFilter);
  }

  // ── Workspace operations ───────────────────────────────────────────────────

  createWorkspaceCollection(workspaceId) {
    return this._service.createWorkspaceCollection(workspaceId);
  }

  deleteWorkspaceCollection(workspaceIdOrCollectionName) {
    return this._service.deleteWorkspaceCollection(workspaceIdOrCollectionName);
  }

  workspaceUpsert(workspaceId, points) {
    return this._service.workspaceUpsert(workspaceId, points);
  }

  workspaceSearch(workspaceId, vector, options) {
    return this._service.workspaceSearch(workspaceId, vector, options);
  }

  workspaceGetVectors(workspaceId, pointIds) {
    return this._service.workspaceGetVectors(workspaceId, pointIds);
  }

  workspaceDeletePoints(workspaceId, pointIds) {
    return this._service.workspaceDeletePoints(workspaceId, pointIds);
  }

  workspaceCollectionExists(workspaceId) {
    return this._service.workspaceCollectionExists(workspaceId);
  }

  getWorkspaceCollectionInfo(workspaceId) {
    return this._service.getWorkspaceCollectionInfo(workspaceId);
  }
}

// ─── pgvector Adapter ─────────────────────────────────────────────────────────

const { PgvectorAdapter } = require('./adapters/PgvectorAdapter');

// ─── Factory & Singleton ──────────────────────────────────────────────────────

class VectorDBPort {
  constructor() {
    this.adapter = this._createAdapter();
  }

  _createAdapter() {
    const backend = process.env.VECTOR_DB_BACKEND || 'qdrant';
    switch (backend) {
      case 'pgvector':
        return new PgvectorAdapter();
      case 'qdrant':
      default:
        return new QdrantAdapter();
    }
  }

  get type() { return this.adapter.type; }

  getCollectionName(ns) { return this.adapter.getCollectionName(ns); }
  initCollection() { return this.adapter.initCollection(); }
  initCollectionForNamespace(ns) { return this.adapter.initCollectionForNamespace(ns); }
  initAllNamespaceCollections() { return this.adapter.initAllNamespaceCollections?.(); }
  collectionExists(ns) { return this.adapter.collectionExists(ns); }
  getNamespaceStats(ns) { return this.adapter.getNamespaceStats(ns); }

  upsertPoints(points, ns) { return this.adapter.upsertPoints(points, ns); }
  deleteByNamespace(ns, filter) { return this.adapter.deleteByNamespace(ns, filter); }
  migrateNamespace(src, dst, bs, max) { return this.adapter.migrateNamespace(src, dst, bs, max); }

  searchSimilar(vector, limit, filter, ns) { return this.adapter.searchSimilar(vector, limit, filter, ns); }
  searchAcrossNamespaces(vector, namespaces, limit, filter) { return this.adapter.searchAcrossNamespaces(vector, namespaces, limit, filter); }
  searchWithNamespaceFilter(vector, limit, nsFilter, addFilter) { return this.adapter.searchWithNamespaceFilter(vector, limit, nsFilter, addFilter); }

  createWorkspaceCollection(id) { return this.adapter.createWorkspaceCollection(id); }
  deleteWorkspaceCollection(id) { return this.adapter.deleteWorkspaceCollection(id); }
  workspaceUpsert(id, pts) { return this.adapter.workspaceUpsert(id, pts); }
  workspaceSearch(id, vec, opts) { return this.adapter.workspaceSearch(id, vec, opts); }
  workspaceGetVectors(id, ptIds) { return this.adapter.workspaceGetVectors(id, ptIds); }
  workspaceDeletePoints(id, ptIds) { return this.adapter.workspaceDeletePoints(id, ptIds); }
  workspaceCollectionExists(id) { return this.adapter.workspaceCollectionExists(id); }
  getWorkspaceCollectionInfo(id) { return this.adapter.getWorkspaceCollectionInfo(id); }
}

let _instance = null;

function getVectorDB() {
  if (!_instance) _instance = new VectorDBPort();
  return _instance;
}

module.exports = { VectorDBPort, QdrantAdapter, PgvectorAdapter, getVectorDB };
