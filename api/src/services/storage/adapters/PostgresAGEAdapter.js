'use strict';

/**
 * PostgreSQL + Apache AGE adapter for GraphDBPort.
 *
 * Translates neo4j-driver style Cypher queries to AGE openCypher via pg.
 *
 * Key design decisions:
 * - AGE v1.6.0 does not support $1 parameter binding inside cypher() body.
 *   Parameters are inlined via safe literal substitution (string quote-escaping).
 * - AGE returns all values as agtype (JSON-encoded strings); deserialized back to JS.
 * - Results mimic neo4j-driver Result objects (records[], record.get(), record.keys).
 * - Node objects: AGE {id, label, properties} → compat wrapper with .properties, .labels.
 */

const { Pool } = require('pg');

// ─── Value formatting (JS → AGE Cypher literal) ──────────────────────────────

function formatAGEValue(v) {
  if (v === null || v === undefined) return 'NULL';
  // neo4j-driver Integer objects
  if (v && typeof v === 'object' && typeof v.toNumber === 'function') {
    return v.toNumber().toString();
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toString() : 'NULL';
  if (typeof v === 'string') {
    // Single-quote escape: replace ' → \' and \ → \\
    return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  if (Array.isArray(v)) {
    return '[' + v.map(formatAGEValue).join(', ') + ']';
  }
  if (typeof v === 'object') {
    const pairs = Object.entries(v)
      .map(([k, val]) => `${k}: ${formatAGEValue(val)}`)
      .join(', ');
    return '{' + pairs + '}';
  }
  return formatAGEValue(String(v));
}

// ─── AGE Cypher compatibility rewrites ───────────────────────────────────────
// AGE v1.6 does not support:
//   1. WHERE n:Label predicate syntax → rewrite to WHERE 'Label' IN labels(n)
//   2. Reserved words as property names (e.g. `order`) in ORDER BY expressions
//   3. MERGE ... ON CREATE SET / ON MATCH SET → rewrite to MERGE ... SET (upsert semantics preserved)

// AGE reserved words that cannot be used as bare property names in Cypher expressions.
// These must be quoted/renamed when appearing as .propName in ORDER BY or RETURN.
// Workaround: rename to a non-reserved alias in ORDER BY context.
const AGE_RESERVED_PROPS = new Set(['order', 'limit', 'skip', 'return', 'where', 'with', 'match', 'create', 'delete', 'set', 'union', 'call', 'yield']);

// AGE reserved words that cannot be used as RETURN/WITH column aliases.
// Rewritten as _alias_ → restored transparently in makeRecord.
const AGE_RESERVED_ALIASES = new Set(['count', 'sum', 'avg', 'min', 'max', 'type', 'end', 'start', 'keys', 'index', 'group', 'namespace', 'center', 'node', 'left', 'right']);

function rewriteWhereLabels(cypher) {
  // Replace n:Label inside WHERE clauses with 'Label' IN labels(n)
  // Stops at WITH/RETURN/ORDER BY/LIMIT/SKIP/SET/DELETE (next clause)
  let result = cypher.replace(
    /\bWHERE\b([\s\S]*?)(?=\s*\b(?:WITH|RETURN|ORDER\s+BY|LIMIT|SKIP|UNION|SET|REMOVE|DELETE)\b|\s*$)/gi,
    (full, body) => {
      const rewritten = body.replace(
        /\b([a-zA-Z_]\w*):([a-zA-Z_]\w+)\b/g,
        (_, varName, label) => `'${label}' IN labels(${varName})`
      );
      return 'WHERE' + rewritten;
    }
  );

  // Rewrite ORDER BY clauses:
  //   - Remove if referencing reserved property names (n.order, n.limit etc.)
  //   - Rename bare alias references that are reserved aliases (ORDER BY namespace → ORDER BY _namespace_)
  result = result.replace(
    /\bORDER\s+BY\s+([\s\S]*?)(?=\s*\b(?:LIMIT|SKIP|RETURN|WITH|UNION)\b|\s*$)/gi,
    (full, orderBody) => {
      const hasReservedProp = AGE_RESERVED_PROPS.has(
        (orderBody.match(/\.(\w+)/g) || []).map(m => m.slice(1).toLowerCase()).find(p => AGE_RESERVED_PROPS.has(p))
      );
      if (hasReservedProp) return '';
      // Rename reserved alias references (bare words, not property access)
      const rewrittenBody = orderBody.replace(
        /\b([a-zA-Z_]\w*)\b/g,
        (word) => AGE_RESERVED_ALIASES.has(word.toLowerCase()) ? `_${word.toLowerCase()}_` : word
      );
      return 'ORDER BY ' + rewrittenBody;
    }
  );

  // Rename reserved words used as RETURN/WITH aliases: AS count → AS _count_
  // makeRecord restores the original name transparently.
  result = result.replace(
    /\bAS\s+([a-zA-Z_]\w*)\b/gi,
    (full, alias) => AGE_RESERVED_ALIASES.has(alias.toLowerCase())
      ? `AS _${alias.toLowerCase()}_`
      : full
  );

  // Rewrite MERGE ... ON CREATE SET clauses ... ON MATCH SET clauses ...
  // AGE does not support ON CREATE SET / ON MATCH SET — combine into a single SET.
  // Strategy: keep ON CREATE SET properties, drop ON MATCH SET (upsert-on-create semantics).
  // This is safe for initialization patterns (seed data, metadata nodes).
  result = result.replace(
    /\bON\s+CREATE\s+SET\s+([\s\S]*?)(?=\s*\b(?:ON\s+MATCH\s+SET|RETURN|WITH|MERGE|MATCH|CREATE|DELETE|REMOVE|UNION)\b|\s*$)/gi,
    (_, createBody) => 'SET ' + createBody
  );
  result = result.replace(
    /\bON\s+MATCH\s+SET\s+([\s\S]*?)(?=\s*\b(?:ON\s+CREATE\s+SET|RETURN|WITH|MERGE|MATCH|CREATE|DELETE|REMOVE|UNION)\b|\s*$)/gi,
    () => ''
  );

  return result;
}

// ─── Cypher param substitution ────────────────────────────────────────────────

function substituteCypherParams(cypher, params) {
  if (!params || Object.keys(params).length === 0) return cypher;

  // Sort keys by descending length so $nodeId doesn't partially match $node
  const keys = Object.keys(params).sort((a, b) => b.length - a.length);

  let result = cypher;
  for (const key of keys) {
    const regex = new RegExp('\\$' + key + '(?![a-zA-Z0-9_])', 'g');
    result = result.replace(regex, formatAGEValue(params[key]));
  }
  return result;
}

// ─── RETURN clause parsing ─────────────────────────────────────────────────────

// Split a comma-separated expression list, respecting parentheses depth
function splitReturnList(str) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

// Extract alias from a single RETURN expression: "n.id AS id" → "id", "n" → "n"
function extractAlias(expr) {
  const asMatch = expr.match(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i);
  if (asMatch) return asMatch[1];

  // Simple variable or path: "n", "m", "edge"
  const simpleVar = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (simpleVar) return simpleVar[1];

  // Property access: "n.id" → alias "n_id" (dot not valid in SQL identifier)
  const propAccess = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (propAccess) return `${propAccess[1]}_${propAccess[2]}`;

  // Function call or complex expression without AS: generate positional name
  return null;
}

// Parse the outermost RETURN clause of a Cypher query
// Returns null if no RETURN found (write-only queries)
function parseReturnColumns(cypher) {
  // Match the last RETURN keyword (handles WITH...RETURN patterns)
  // Stop at ORDER BY / LIMIT / SKIP / UNION
  const returnMatch = cypher.match(
    /\bRETURN\b\s+([\s\S]+?)(?:\s+ORDER\s+BY\b|\s+LIMIT\b|\s+SKIP\b|\s+UNION\b|\s*$)/i
  );
  if (!returnMatch) return null;

  const returnBody = returnMatch[1].trim();
  if (returnBody === '*') return ['*']; // special case

  const items = splitReturnList(returnBody);
  const columns = [];

  for (let i = 0; i < items.length; i++) {
    const alias = extractAlias(items[i]);
    columns.push(alias || `col_${i}`);
  }

  return columns;
}

// ─── agtype → JS deserialization ──────────────────────────────────────────────

function wrapAgeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if ('label' in obj && 'properties' in obj && !('start_id' in obj)) {
    return { identity: obj.id, labels: [obj.label], properties: obj.properties, _ageNode: true };
  }
  if ('start_id' in obj && 'end_id' in obj) {
    return { identity: obj.id, type: obj.label, start: obj.start_id, end: obj.end_id, properties: obj.properties, _ageRel: true };
  }
  return obj;
}

function deserializeAgtype(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;

  // Strip ALL AGE type cast suffixes — they appear after each element in collect() arrays too
  let clean = v.replace(/::(?:vertex|edge|path|agtype)/gi, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        return parsed.map(wrapAgeObject);
      }
      return wrapAgeObject(parsed);
    }
    return parsed;
  } catch {
    return clean;
  }
}

// ─── neo4j-driver compatible Record ───────────────────────────────────────────

// Resolve a column key: try direct, lowercase, and _reserved_ rewrite
function resolveCol(row, key) {
  if (row[key] !== undefined) return row[key];
  if (row[key.toLowerCase()] !== undefined) return row[key.toLowerCase()];
  // key may have been rewritten as _key_ for reserved aliases
  const rewritten = `_${key.toLowerCase()}_`;
  if (row[rewritten] !== undefined) return row[rewritten];
  return undefined;
}

// Restore original alias name: _count_ → count
function restoreAlias(col) {
  const m = col.match(/^_([a-z_]+)_$/);
  return m ? m[1] : col;
}

function makeRecord(row, columns) {
  // Expose original alias names (strip _reserved_ wrapping)
  const userColumns = columns.map(restoreAlias);
  return {
    keys: userColumns,
    get(key) {
      return deserializeAgtype(resolveCol(row, key));
    },
    toObject() {
      return Object.fromEntries(
        userColumns.map((uk, i) => [uk, deserializeAgtype(resolveCol(row, columns[i]))])
      );
    },
  };
}

// neo4j-driver compatible Result
function makeResult(rows, columns, cypher, params) {
  return {
    records: rows.map(row => makeRecord(row, columns)),
    summary: {
      query: { text: cypher, parameters: params },
      counters: {
        nodesCreated: () => 0,
        nodesDeleted: () => 0,
        relationshipsCreated: () => 0,
        relationshipsDeleted: () => 0,
      },
    },
  };
}

// ─── neo4j-driver compatible Session / Transaction / Driver shim ─────────────
// Allows callers that use withSession(driver, fn) / withWriteTransaction(driver, fn)
// (neo4j-driver API) to work transparently against AGE.

class AGETransaction {
  constructor(adapter) { this._adapter = adapter; }
  async run(cypher, params = {}) { return this._adapter.runQuery(cypher, params); }
}

class AGESession {
  constructor(adapter) { this._adapter = adapter; }
  async run(cypher, params = {}) { return this._adapter.runQuery(cypher, params); }
  async writeTransaction(fn) { return fn(new AGETransaction(this._adapter)); }
  async readTransaction(fn) { return fn(new AGETransaction(this._adapter)); }
  async close() {}
}

class AGEDriver {
  constructor(adapter) { this._adapter = adapter; }
  session() { return new AGESession(this._adapter); }
  async close() {}
}

// ─── PostgresAGEAdapter ───────────────────────────────────────────────────────

class PostgresAGEAdapter {
  constructor() {
    this.type = 'postgres-age';
    this._pool = null;
    this._graphName = process.env.AGE_GRAPH_NAME || 'unpa';
    this.driver = new AGEDriver(this);
    this._countCache = new Map(); // key → { value, expiresAt }
  }

  _getCachedCount(key) {
    const entry = this._countCache.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.value;
    return null;
  }

  _setCachedCount(key, value, ttlMs = 5 * 60 * 1000) {
    this._countCache.set(key, { value, expiresAt: Date.now() + ttlMs });
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
      console.error('[PostgresAGEAdapter] Pool error:', err.message);
    });
    return this._pool;
  }

  _buildQuery(cypher, params) {
    const substituted = rewriteWhereLabels(substituteCypherParams(cypher, params));
    const columns = parseReturnColumns(substituted);

    let asClause;
    let finalColumns;

    if (!columns) {
      // Write-only query (no RETURN)
      asClause = 'AS (r ag_catalog.agtype)';
      finalColumns = [];
    } else if (columns[0] === '*') {
      // RETURN * — fallback: single column wrapper
      asClause = 'AS (r ag_catalog.agtype)';
      finalColumns = ['r'];
    } else {
      asClause = 'AS (' + columns.map(c => `"${c}" ag_catalog.agtype`).join(', ') + ')';
      finalColumns = columns;
    }

    const sql = `SELECT * FROM cypher('${this._graphName}', $$ ${substituted} $$) ${asClause}`;
    return { sql, columns: finalColumns };
  }

  async runQuery(cypher, params = {}, options = {}) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      // Guard against runaway full-graph scans (e.g. OPTIONAL MATCH on 46K nodes)
      await client.query("SET statement_timeout = '30000'");
      const { sql, columns } = this._buildQuery(cypher, params);
      const pgResult = await client.query(sql);
      return makeResult(pgResult.rows, columns, cypher, params);
    } catch (err) {
      console.error('[PostgresAGEAdapter] Query error:', err.message);
      console.error('[PostgresAGEAdapter] Cypher:', cypher.substring(0, 200));
      throw err;
    } finally {
      client.release();
    }
  }

  async runBatch(queries, options = {}) {
    if (!queries || queries.length === 0) return [];
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = '30000'");
      const results = [];
      for (const { cypher, params = {} } of queries) {
        const { sql, columns } = this._buildQuery(cypher, params);
        const pgResult = await client.query(sql);
        results.push(makeResult(pgResult.rows, columns, cypher, params));
      }
      return results;
    } finally {
      client.release();
    }
  }

  async runWithNamespace(cypher, params = {}, namespaceFilter = null, options = {}) {
    // Namespace filtering: add WHERE clause at SQL level if namespace is filtered
    // For now: append namespace filter to params and let query handle it
    if (namespaceFilter) {
      const ns = Array.isArray(namespaceFilter) ? namespaceFilter : [namespaceFilter];
      // Add namespace param — queries using namespace filtering should reference $namespace
      params = { ...params, namespace: ns[0], namespaces: ns };
    }
    return this.runQuery(cypher, params, options);
  }

  async verifyConnectivity() {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      const r = await client.query(
        `SELECT * FROM cypher('${this._graphName}', $$ RETURN 1 AS ok $$) AS (ok ag_catalog.agtype)`
      );
      return r.rows.length === 1;
    } finally {
      client.release();
    }
  }

  getStats() {
    const pool = this._pool;
    return {
      type: 'postgres-age',
      totalConnections: pool?.totalCount ?? 0,
      idleConnections: pool?.idleCount ?? 0,
      waitingClients: pool?.waitingCount ?? 0,
    };
  }

  /**
   * Resolve the Cypher label name for an AGE graphid.
   * AGE graphid = (label_id << 48) | entry_id — top 16 bits encode the label.
   * Querying ag_catalog directly is O(1) and avoids a full vertex scan.
   */
  async getVertexLabelById(graphId) {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      const bigIntId = BigInt(graphId);
      const labelId = Number(bigIntId >> BigInt(48));
      const result = await client.query(
        `SELECT l.name FROM ag_catalog.ag_label l
         WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
           AND l.id = $2 AND l.kind = 'v' LIMIT 1`,
        [this._graphName, labelId]
      );
      return result.rows[0]?.name || null;
    } catch (err) {
      console.error('[PostgresAGEAdapter] getVertexLabelById failed for', graphId, ':', err.message);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Return all non-system vertex label names for this graph.
   * Cached per adapter instance after first call.
   */
  async _getVertexLabels(client) {
    if (this._vertexLabels) return this._vertexLabels;
    const res = await client.query(
      `SELECT l.name FROM ag_catalog.ag_label l
       WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
         AND l.kind = 'v'
         AND l.name NOT LIKE '_ag_label%'`,
      [this._graphName]
    );
    this._vertexLabels = res.rows.map(r => r.name);
    return this._vertexLabels;
  }

  /**
   * Create server-side PL/pgSQL functions that count vertices/edges by namespace.
   * Replaces the 150-subquery UNION ALL approach — runs entirely on the DB server,
   * so only one network round-trip is needed regardless of label count.
   */
  async ensureCountFunctions() {
    const pool = this._initPool();
    const client = await pool.connect();
    try {
      // All ag_catalog references are wrapped in EXECUTE (dynamic SQL) so PostgreSQL
      // does not validate them against the ag_catalog schema at function-creation time.
      // This avoids "permission denied for schema ag_catalog" on Azure Flexible Server
      // where the app user has USAGE on ag_catalog (for queries) but not CREATE access
      // needed for static PL/pgSQL body symbol resolution.
      //
      // Skipping label tables with relpages=0 reduces iterations from ~150 to only
      // populated tables, cutting cold-call time from 3s+ to sub-second.
      await client.query(`
        CREATE OR REPLACE FUNCTION public.unpa_count_ns_nodes(graph_name text, target_ns text)
        RETURNS bigint AS $func$
        DECLARE
          total bigint := 0;
          cnt   bigint;
          lname text;
        BEGIN
          PERFORM set_config('enable_seqscan', 'off', true);
          FOR lname IN EXECUTE format(
            'SELECT l.name FROM ag_catalog.ag_label l
             JOIN pg_class c ON c.relname = l.name
               AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = %L)
             WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = %L)
               AND l.kind = ''v'' AND l.name NOT LIKE ''_ag_label%%''
               AND c.relpages > 0',
            graph_name, graph_name
          )
          LOOP
            EXECUTE format(
              'SELECT COUNT(*) FROM %I.%I WHERE (properties::text::jsonb->>''namespace'') = $1',
              graph_name, lname
            )
            INTO cnt USING target_ns;
            total := total + COALESCE(cnt, 0);
          END LOOP;
          RETURN total;
        END;
        $func$ LANGUAGE plpgsql;
      `);

      // Edge counting: edges don't carry a namespace property — namespace is
      // determined by the source vertex. Steps:
      //   1. Collect GXE vertex IDs into a temp table with a btree index
      //      (avoids start_id::bigint cast which prevents index use on edge tables)
      //   2. Count edges whose start_id appears in the temp table via JOIN
      //      (temp table index → merge/hash join, not seq scan)
      await client.query(`
        CREATE OR REPLACE FUNCTION public.unpa_count_ns_edges(graph_name text, target_ns text)
        RETURNS bigint AS $func$
        DECLARE
          total   bigint := 0;
          cnt     bigint;
          lname   text;
          vid_sql text := '';
          has_ids boolean;
        BEGIN
          -- Phase 1: collect namespace vertex IDs.
          -- Disable seqscan so the planner uses the functional namespace index
          -- on each vertex label table (vertex tables can hold millions of rows
          -- across many namespaces; index scan is orders of magnitude faster here).
          PERFORM set_config('enable_seqscan', 'off', true);

          FOR lname IN EXECUTE format(
            'SELECT l.name FROM ag_catalog.ag_label l
             JOIN pg_class c ON c.relname = l.name
               AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = %L)
             WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = %L)
               AND l.kind = ''v'' AND l.name NOT LIKE ''_ag_label%%''
               AND c.relpages > 0',
            graph_name, graph_name
          )
          LOOP
            IF vid_sql <> '' THEN vid_sql := vid_sql || ' UNION ALL '; END IF;
            vid_sql := vid_sql || format(
              'SELECT id FROM %I.%I WHERE (properties::text::jsonb->>''namespace'') = %L',
              graph_name, lname, target_ns
            );
          END LOOP;

          IF vid_sql = '' THEN RETURN 0; END IF;

          -- graphid has no CAST to int8/bigint in AGE 1.6; store as text.
          -- PRIMARY KEY gives a btree index so the COUNT JOIN can hash or probe efficiently.
          EXECUTE 'CREATE TEMP TABLE IF NOT EXISTS _unpa_ns_vids (id text PRIMARY KEY) ON COMMIT DELETE ROWS';
          EXECUTE 'TRUNCATE _unpa_ns_vids';
          EXECUTE 'INSERT INTO _unpa_ns_vids SELECT id::text FROM (' || vid_sql || ') t';

          EXECUTE 'SELECT EXISTS(SELECT 1 FROM _unpa_ns_vids LIMIT 1)' INTO has_ids;
          IF NOT has_ids THEN RETURN 0; END IF;

          -- Phase 2: count edges whose start vertex is in the namespace.
          -- Re-enable seqscan: edge table COUNT(*) JOIN _unpa_ns_vids uses a hash join
          -- which requires scanning both sides; the seqscan restriction only forces
          -- the planner to evaluate dead-end index plans before falling back anyway.
          PERFORM set_config('enable_seqscan', 'on', true);

          FOR lname IN EXECUTE format(
            'SELECT l.name FROM ag_catalog.ag_label l
             JOIN pg_class c ON c.relname = l.name
               AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = %L)
             WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = %L)
               AND l.kind = ''e'' AND l.name NOT LIKE ''_ag_label%%''
               AND c.relpages > 0',
            graph_name, graph_name
          )
          LOOP
            EXECUTE format(
              'SELECT COUNT(*) FROM %I.%I e JOIN _unpa_ns_vids v ON e.start_id::text = v.id',
              graph_name, lname
            )
            INTO cnt;
            total := total + COALESCE(cnt, 0);
          END LOOP;

          RETURN total;
        END;
        $func$ LANGUAGE plpgsql;
      `);

      console.log('[PostgresAGEAdapter] count functions ensured (unpa_count_ns_nodes, unpa_count_ns_edges)');
    } catch (e) {
      console.warn('[PostgresAGEAdapter] count function creation failed:', e.message);
    } finally {
      client.release();
    }
  }

  /**
   * Create functional indexes on the namespace property for every vertex
   * label table. Idempotent (IF NOT EXISTS). Non-fatal on individual failures.
   */
  async ensureNamespaceIndexes() {
    const pool = this._initPool();
    // Clear cached probe so we pick the best available expression fresh at startup
    this._nsExprCache = null;
    const created = [];
    const skipped = [];
    const client = await pool.connect();
    try {
      const labelNames = await this._getVertexLabels(client);
      if (labelNames.length === 0) return;
      const expr = await this._probeNsExpr(client, labelNames[0]);
      // Disable statement_timeout for index creation — CONCURRENTLY on large tables
      // can take several seconds per table and must not be canceled mid-build.
      await client.query("SET statement_timeout = 0");
      let immutableFailed = false;
      for (const labelName of labelNames) {
        const safeName = labelName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40);
        const idxName = `idx_${this._graphName}_${safeName}_ns`.substring(0, 63);
        try {
          // Check if a valid index already exists — skip only if it's valid.
          // CREATE INDEX CONCURRENTLY canceled mid-build leaves an invalid index
          // that IF NOT EXISTS would silently skip, leaving it unusable.
          const validity = await client.query(
            `SELECT i.indisvalid FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE c.relname = $1
               AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`,
            [idxName, this._graphName]
          );
          if (validity.rows.length > 0 && validity.rows[0].indisvalid) {
            created.push(labelName); // already valid
            continue;
          }
          // Drop invalid or missing index, then create fresh
          if (validity.rows.length > 0) {
            await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${this._graphName}"."${idxName}"`);
          }
          await client.query(
            `CREATE INDEX CONCURRENTLY "${idxName}" ON "${this._graphName}"."${labelName}" (${expr})`
          );
          created.push(labelName);
        } catch (e) {
          const msg = e.message || '';
          if (!immutableFailed && msg.toLowerCase().includes('immutable')) {
            immutableFailed = true;
            console.error('[PostgresAGEAdapter] IMMUTABLE error — namespace expression cannot be indexed:', msg);
          }
          skipped.push(`${labelName}: ${msg.substring(0, 80)}`);
        }
      }
      console.log(`[PostgresAGEAdapter] namespace indexes: ${created.length} ensured, ${skipped.length} skipped`);
      if (skipped.length > 0) {
        console.warn('[PostgresAGEAdapter] index creation errors (first 3):');
        skipped.slice(0, 3).forEach(s => console.warn(' -', s));
      }
      if (immutableFailed) {
        console.error('[PostgresAGEAdapter] Functional indexes NOT created — agtype_out may not be IMMUTABLE on this build.');
        console.error('[PostgresAGEAdapter] countNodesByNamespace will rely on per-label timeout (7s deadline).');
      }
      // ANALYZE intentionally omitted — autovacuum handles statistics automatically.
      // Running ANALYZE on 150 tables at startup causes I/O contention that makes
      // index-scan COUNTs exceed the per-label timeout in countNodesByNamespace.
      // Verify via pg_indexes how many actually landed
      try {
        const checkClient = await pool.connect();
        const chk = await checkClient.query(
          `SELECT count(*) AS n FROM pg_indexes WHERE schemaname = $1 AND indexname LIKE 'idx\\_${this._graphName}\\_%\\_ns'`,
          [this._graphName]
        );
        checkClient.release();
        console.log(`[PostgresAGEAdapter] pg_indexes shows ${chk.rows[0].n} namespace indexes in schema '${this._graphName}'`);
      } catch (e) {
        console.warn('[PostgresAGEAdapter] pg_indexes check failed:', e.message);
      }
    } finally {
      client.release();
    }
    // Create server-side count functions after indexes are ensured
    await this.ensureCountFunctions().catch(e =>
      console.warn('[PostgresAGEAdapter] count function setup failed:', e.message)
    );
    // Pre-warm count caches in background so the first user request gets cached data.
    // setImmediate ensures this runs after the current event-loop tick (non-blocking).
    const defaultNs = process.env.DEFAULT_NAMESPACE || 'GXE';
    setImmediate(() => {
      Promise.all([
        this.countNodesByNamespace(defaultNs),
        this.countEdgesByNamespace(defaultNs),
      ]).then(([nc, ec]) => {
        console.log(`[PostgresAGEAdapter] count caches pre-warmed: nodes=${nc} edges=${ec} ns=${defaultNs}`);
      }).catch(e => {
        console.warn('[PostgresAGEAdapter] count cache pre-warm failed:', e.message);
      });
    });
  }

  /**
   * Probe which SQL expression can extract 'namespace' from agtype properties.
   * AGE v1.6 does not support agtype::jsonb. We try multiple approaches in
   * performance order: native field accessor → regex short-circuit → full JSON parse.
   * Cached after first successful probe.
   */
  async _probeNsExpr(client, testLabel) {
    if (this._nsExprCache) return this._nsExprCache;

    const candidates = [
      // PostgreSQL normalizes agtype_out(properties)::text to properties::text when
      // storing functional index expressions. Use this form so WHERE expressions match
      // the stored index expression tree and the planner actually uses the index.
      `(properties::text::jsonb->>'namespace')`,
      // agtype_out explicit call — works for querying but WON'T match functional indexes
      // because PostgreSQL stores the implicit cast form, not the explicit function call.
      `(ag_catalog.agtype_out(properties)::text::jsonb->>'namespace')`,
    ];

    for (const expr of candidates) {
      try {
        await client.query(
          `SELECT ${expr} FROM "${this._graphName}"."${testLabel}" LIMIT 0`
        );
        this._nsExprCache = expr;
        console.log(`[PostgresAGEAdapter] namespace expr: ${expr}`);
        return expr;
      } catch {
        // try next
      }
    }

    // agtype_out is always available — use full JSON parse as final fallback
    const fallback = `(ag_catalog.agtype_out(properties)::text::jsonb->>'namespace')`;
    this._nsExprCache = fallback;
    console.log(`[PostgresAGEAdapter] namespace expr (final fallback): ${fallback}`);
    return fallback;
  }

  /**
   * Count all vertices with a given namespace property.
   * Uses a server-side PL/pgSQL function (unpa_count_ns_nodes) that loops over
   * all vertex label tables internally — one network round-trip regardless of
   * label count. Falls back to UNION ALL if the function is not yet available.
   */
  async countNodesByNamespace(namespace) {
    const cacheKey = `nodes:${namespace}`;
    const cached = this._getCachedCount(cacheKey);
    if (cached !== null) return cached;

    const pool = this._initPool();
    const t0 = Date.now();
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = '10000'");
      try {
        const res = await client.query(
          `SELECT public.unpa_count_ns_nodes($1, $2) AS n`,
          [this._graphName, namespace]
        );
        const total = Number(res.rows[0]?.n) || 0;
        const ms = Date.now() - t0;
        console.log(`[countNS] ns=${namespace} count=${total} durationMs=${ms}`);
        this._setCachedCount(cacheKey, total);
        return total;
      } catch (funcErr) {
        // Function not yet created (first boot before ensureNamespaceIndexes runs).
        // Fall back to UNION ALL — correct but slow on large graphs.
        console.warn('[countNS] server function unavailable, using UNION ALL fallback:', funcErr.message);
        const labelsRes = await client.query(
          `SELECT l.name FROM ag_catalog.ag_label l
           WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
             AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%'`,
          [this._graphName]
        );
        if (labelsRes.rows.length === 0) return 0;
        const labelNames = labelsRes.rows.map(r => r.name);
        const expr = await this._probeNsExpr(client, labelNames[0]);
        await client.query("SET enable_seqscan = off");
        const parts = labelNames.map(l =>
          `SELECT COUNT(*)::int AS c FROM "${this._graphName}"."${l}" WHERE ${expr} = $1`
        ).join(' UNION ALL ');
        const res2 = await client.query(`SELECT COALESCE(SUM(c),0)::int FROM (${parts}) _t`, [namespace]);
        const total = Number(res2.rows[0]?.coalesce) || 0;
        this._setCachedCount(cacheKey, total);
        return total;
      }
    } finally {
      client.release();
    }
  }

  /**
   * Count all edges with a given namespace property.
   * Uses a server-side PL/pgSQL function (unpa_count_ns_edges).
   * Cached in-process for 5 minutes.
   */
  async countEdgesByNamespace(namespace) {
    const cacheKey = `edges:${namespace}`;
    const cached = this._getCachedCount(cacheKey);
    if (cached !== null) return cached;

    const pool = this._initPool();
    const t0 = Date.now();
    const client = await pool.connect();
    try {
      // Edge function can take up to ~15s on first cold call (150 vertex tables × index scan
      // + 37 edge tables × hash join). Pre-warm caches the result for 30 min so this only
      // fires once at startup. Use a 25s timeout to ensure the pre-warm succeeds.
      await client.query("SET statement_timeout = '25000'");
      const res = await client.query(
        `SELECT public.unpa_count_ns_edges($1, $2) AS n`,
        [this._graphName, namespace]
      );
      const total = Number(res.rows[0]?.n) || 0;
      const ms = Date.now() - t0;
      console.log(`[countEdges] ns=${namespace} count=${total} durationMs=${ms}`);
      this._setCachedCount(cacheKey, total, 30 * 60 * 1000); // 30 min TTL (edge topology changes rarely)
      return total;
    } catch (e) {
      console.warn('[countEdges] function unavailable:', e.message);
      return 0;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }
  }
}

module.exports = {
  PostgresAGEAdapter,
  // Exported for testing
  formatAGEValue,
  substituteCypherParams,
  parseReturnColumns,
  deserializeAgtype,
};
