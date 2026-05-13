'use strict';

/**
 * PostgreSQL + pgvector adapter for VectorDBPort.
 *
 * Maps Qdrant-style operations to a unified `embeddings` table with
 * HNSW index (cosine similarity, 1024 dimensions).
 *
 * Schema (single unified table, collection_name discriminates namespaces):
 *   CREATE TABLE public.embeddings (
 *     id          TEXT        PRIMARY KEY,
 *     collection  TEXT        NOT NULL,
 *     vector      VECTOR(1024) NOT NULL,
 *     payload     JSONB       NOT NULL DEFAULT '{}',
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 */

const { Pool } = require('pg');

// ─── Qdrant filter → SQL WHERE translator ─────────────────────────────────────

function translateFilter(filter, paramOffset = 0) {
  if (!filter) return { sql: '', params: [] };

  const conditions = [];
  const params = [];

  function idx() { return params.length + paramOffset; }

  function processCondition(cond) {
    if (cond.key && cond.match !== undefined) {
      const val = cond.match.value ?? cond.match;
      params.push(val);
      conditions.push(`payload->>'${cond.key}' = $${idx()}`);
    } else if (cond.key && cond.range) {
      const { gte, lte, gt, lt } = cond.range;
      if (gte !== undefined) { params.push(gte); conditions.push(`(payload->>'${cond.key}')::numeric >= $${idx()}`); }
      if (lte !== undefined) { params.push(lte); conditions.push(`(payload->>'${cond.key}')::numeric <= $${idx()}`); }
      if (gt !== undefined) { params.push(gt); conditions.push(`(payload->>'${cond.key}')::numeric > $${idx()}`); }
      if (lt !== undefined) { params.push(lt); conditions.push(`(payload->>'${cond.key}')::numeric < $${idx()}`); }
    }
  }

  if (filter.must) filter.must.forEach(processCondition);
  if (filter.should) filter.should.forEach(processCondition); // simplified: treat as AND
  if (filter.must_not) {
    filter.must_not.forEach(c => {
      const val = c.match?.value ?? c.match;
      if (val !== undefined) {
        params.push(val);
        conditions.push(`payload->>'${c.key}' != $${idx()}`);
      }
    });
  }

  return {
    sql: conditions.length ? 'AND ' + conditions.join(' AND ') : '',
    params,
  };
}

// ─── PgvectorAdapter ──────────────────────────────────────────────────────────

class PgvectorAdapter {
  constructor() {
    this.type = 'pgvector';
    this._pool = null;
    this._vectorDim = parseInt(process.env.VECTOR_DIM || '1024', 10);
    this._initialized = new Set();
  }

  _initPool() {
    if (this._pool) return this._pool;
    this._pool = new Pool({
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
      ssl: process.env.POSTGRES_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    this._pool.on('error', (err) => {
      console.error('[PgvectorAdapter] Pool error:', err.message);
    });
    return this._pool;
  }

  async _ensureSchema(client) {
    if (this._initialized.has('schema')) return;
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.embeddings (
        id         TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        vector     VECTOR(${this._vectorDim}) NOT NULL,
        payload    JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_collection_idx
        ON public.embeddings (collection)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_payload_idx
        ON public.embeddings USING GIN (payload)
    `);
    // HNSW index for cosine similarity
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw_idx
        ON public.embeddings USING hnsw (vector vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `).catch(() => {
      // Fallback to ivfflat if hnsw not available
      return client.query(`
        CREATE INDEX IF NOT EXISTS embeddings_vector_ivfflat_idx
          ON public.embeddings USING ivfflat (vector vector_cosine_ops)
          WITH (lists = 100)
      `).catch(() => {}); // ok if no rows yet
    });
    this._initialized.add('schema');
  }

  _collectionName(fullNamespace) {
    if (!fullNamespace) return 'default';
    return fullNamespace;
  }

  _workspaceCollection(workspaceId) {
    return `workspace_${workspaceId}`;
  }

  // ── Collection management ────────────────────────────────────────────────────

  async initCollection() {
    return this.initCollectionForNamespace(null);
  }

  async initCollectionForNamespace(fullNamespace = null) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      return { name: this._collectionName(fullNamespace), status: 'ok' };
    } finally {
      client.release();
    }
  }

  async initAllNamespaceCollections() {
    return this.initCollection();
  }

  async collectionExists(fullNamespace = null) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      const col = this._collectionName(fullNamespace);
      const r = await client.query(
        'SELECT 1 FROM public.embeddings WHERE collection = $1 LIMIT 1',
        [col]
      );
      return r.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async getNamespaceStats(fullNamespace = null) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const col = this._collectionName(fullNamespace);
      const r = await client.query(
        'SELECT COUNT(*) AS cnt FROM public.embeddings WHERE collection = $1',
        [col]
      );
      return { vectorsCount: parseInt(r.rows[0]?.cnt ?? 0, 10), collection: col };
    } finally {
      client.release();
    }
  }

  getCollectionName(fullNamespace) {
    return this._collectionName(fullNamespace);
  }

  // ── Write operations ─────────────────────────────────────────────────────────

  async upsertPoints(points, fullNamespace = null) {
    if (!points || points.length === 0) return;
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      const col = this._collectionName(fullNamespace);
      for (const point of points) {
        const vector = Array.isArray(point.vector) ? point.vector : point.vector;
        await client.query(
          `INSERT INTO public.embeddings (id, collection, vector, payload)
           VALUES ($1, $2, $3::vector, $4::jsonb)
           ON CONFLICT (id) DO UPDATE
             SET collection = EXCLUDED.collection,
                 vector     = EXCLUDED.vector,
                 payload    = EXCLUDED.payload`,
          [point.id, col, JSON.stringify(vector), JSON.stringify(point.payload || {})]
        );
      }
    } finally {
      client.release();
    }
  }

  async deleteByNamespace(fullNamespace, additionalFilter = null) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const col = this._collectionName(fullNamespace);
      const { sql: filterSql, params: filterParams } = translateFilter(additionalFilter, 1);
      await client.query(
        `DELETE FROM public.embeddings WHERE collection = $1 ${filterSql}`,
        [col, ...filterParams]
      );
    } finally {
      client.release();
    }
  }

  async migrateNamespace(sourceNamespace, targetNamespace, batchSize = 100) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const src = this._collectionName(sourceNamespace);
      const dst = this._collectionName(targetNamespace);
      await client.query(
        `INSERT INTO public.embeddings (id, collection, vector, payload)
         SELECT id, $2, vector, payload FROM public.embeddings WHERE collection = $1
         ON CONFLICT (id) DO UPDATE SET
           collection = EXCLUDED.collection,
           vector = EXCLUDED.vector,
           payload = EXCLUDED.payload`,
        [src, dst]
      );
    } finally {
      client.release();
    }
  }

  // ── Search operations ────────────────────────────────────────────────────────

  async searchSimilar(vector, limit = 5, filter = null, fullNamespace = null) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      const col = this._collectionName(fullNamespace);
      const { sql: filterSql, params: filterParams } = translateFilter(filter, 2);
      const vectorParam = JSON.stringify(vector);

      const r = await client.query(
        `SELECT id, payload, 1 - (vector <=> $1::vector) AS score
         FROM public.embeddings
         WHERE collection = $2 ${filterSql}
         ORDER BY vector <=> $1::vector
         LIMIT $${3 + filterParams.length}`,
        [vectorParam, col, ...filterParams, limit]
      );

      return r.rows.map(row => ({
        id: row.id,
        score: row.score,
        payload: row.payload,
      }));
    } finally {
      client.release();
    }
  }

  async searchAcrossNamespaces(vector, namespaces, limit = 5, filter = null) {
    if (!namespaces || namespaces.length === 0) return [];
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      const colList = namespaces.map(ns => this._collectionName(ns));
      const { sql: filterSql, params: filterParams } = translateFilter(filter, 1 + colList.length);
      const vectorParam = JSON.stringify(vector);

      const placeholders = colList.map((_, i) => `$${2 + i}`).join(', ');
      const r = await client.query(
        `SELECT id, collection, payload, 1 - (vector <=> $1::vector) AS score
         FROM public.embeddings
         WHERE collection IN (${placeholders}) ${filterSql}
         ORDER BY vector <=> $1::vector
         LIMIT $${2 + colList.length + filterParams.length}`,
        [vectorParam, ...colList, ...filterParams, limit]
      );

      return r.rows.map(row => ({
        id: row.id,
        score: row.score,
        payload: row.payload,
        namespace: row.collection,
      }));
    } finally {
      client.release();
    }
  }

  async searchWithNamespaceFilter(vector, limit = 5, namespaceFilter = null, additionalFilter = null) {
    const namespaces = namespaceFilter
      ? (Array.isArray(namespaceFilter) ? namespaceFilter : [namespaceFilter])
      : null;
    return this.searchAcrossNamespaces(vector, namespaces || [], limit, additionalFilter);
  }

  // ── Workspace operations ──────────────────────────────────────────────────────

  async createWorkspaceCollection(workspaceId) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await this._ensureSchema(client);
      return { workspaceId, collection: this._workspaceCollection(workspaceId), status: 'ok' };
    } finally {
      client.release();
    }
  }

  async deleteWorkspaceCollection(workspaceIdOrName) {
    const col = workspaceIdOrName.startsWith('workspace_')
      ? workspaceIdOrName
      : this._workspaceCollection(workspaceIdOrName);
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM public.embeddings WHERE collection = $1', [col]);
    } finally {
      client.release();
    }
  }

  async workspaceUpsert(workspaceId, points) {
    return this.upsertPoints(points, this._workspaceCollection(workspaceId));
  }

  async workspaceSearch(workspaceId, vector, { limit = 10, type, status, scoreThreshold = 0.0 } = {}) {
    const filter = {};
    if (type) filter.must = [{ key: 'type', match: { value: type } }];
    if (status) {
      filter.must = filter.must || [];
      filter.must.push({ key: 'status', match: { value: status } });
    }
    const results = await this.searchSimilar(
      vector, limit, Object.keys(filter).length ? filter : null,
      this._workspaceCollection(workspaceId)
    );
    return results.filter(r => r.score >= scoreThreshold);
  }

  async workspaceGetVectors(workspaceId, pointIds) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const col = this._workspaceCollection(workspaceId);
      const placeholders = pointIds.map((_, i) => `$${i + 2}`).join(', ');
      const r = await client.query(
        `SELECT id, payload FROM public.embeddings WHERE collection = $1 AND id IN (${placeholders})`,
        [col, ...pointIds]
      );
      return r.rows.map(row => ({ id: row.id, payload: row.payload }));
    } finally {
      client.release();
    }
  }

  async workspaceDeletePoints(workspaceId, pointIds) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const col = this._workspaceCollection(workspaceId);
      const placeholders = pointIds.map((_, i) => `$${i + 2}`).join(', ');
      await client.query(
        `DELETE FROM public.embeddings WHERE collection = $1 AND id IN (${placeholders})`,
        [col, ...pointIds]
      );
    } finally {
      client.release();
    }
  }

  async workspaceCollectionExists(workspaceId) {
    return this.collectionExists(this._workspaceCollection(workspaceId));
  }

  async getWorkspaceCollectionInfo(workspaceId) {
    return this.getNamespaceStats(this._workspaceCollection(workspaceId));
  }

  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }
  }
}

module.exports = { PgvectorAdapter, translateFilter };
