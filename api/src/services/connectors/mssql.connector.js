/**
 * MS SQL Server Connector
 * Provides READ-ONLY access to SQL Server database structure and data.
 * All connections use readOnlyIntent: true.
 *
 * Features:
 *   - Schema/table/column/constraint discovery
 *   - Stored procedure and trigger extraction
 *   - Data sampling with statistics and distinct value detection
 *   - Read-only query execution with DML/DDL blocking
 *   - Object dependency mapping
 *
 * @module services/connectors/mssql-connector
 */

const sql = require('mssql');
const {
  SYSTEM_SCHEMAS,
  SYSTEM_TABLE_PREFIXES,
  EXCLUDED_TABLES,
  BLOCKED_KEYWORDS,
  DEFAULTS
} = require('../../config/mssql.config');

// Lazy-load msnodesqlv8 variant (Windows-only, Named Pipes support)
let sqlNative = null;
function getSqlNative() {
  if (!sqlNative) {
    try {
      sqlNative = require('mssql/msnodesqlv8');
    } catch (err) {
      throw new Error(
        'msnodesqlv8 is required for Named Pipes connections. ' +
        'Install it with: npm install msnodesqlv8\n' +
        'Also requires ODBC Driver 17+ for SQL Server on this machine.'
      );
    }
  }
  return sqlNative;
}

class MSSQLConnector {
  constructor() {
    /** @type {sql.ConnectionPool|null} */
    this.pool = null;
    this.connectionName = null;
    this.serverInfo = null;
    /** @type {'tcp'|'named-pipes'} */
    this.protocol = 'tcp';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.connect
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Establish connection pool to MS SQL Server
   * @param {import('../../config/mssql.config').MSSQLConnectionParams} params
   * @returns {Promise<{success: boolean, serverName?: string, databaseName?: string, version?: string, error?: string}>}
   */
  async connect(params) {
    if (this.pool && this.pool.connected) {
      await this.disconnect();
    }

    // Flatten params.options to top-level (frontend sends encrypt/trustServerCertificate inside options)
    if (params.options) {
      const { encrypt, trustServerCertificate, ...rest } = params.options;
      if (encrypt !== undefined && params.encrypt === undefined) params.encrypt = encrypt;
      if (trustServerCertificate !== undefined && params.trustServerCertificate === undefined) params.trustServerCertificate = trustServerCertificate;
      Object.assign(params, rest);
    }

    this.protocol = params.protocol || 'tcp';

    // ── Named Pipes ──────────────────────────────────────────────────
    if (this.protocol === 'named-pipes') {
      return this._connectNamedPipes(params);
    }

    // ── TCP (default) ────────────────────────────────────────────────
    const resolvedPort = parseInt(params.port) || DEFAULTS.PORT;
    console.log(`[MSSQLConnector] Connecting to ${params.server}:${resolvedPort}/${params.database} as ${params.username || params.user}`);

    const config = {
      server: params.server,
      port: resolvedPort,
      database: params.database,
      user: params.username || params.user,
      password: params.password,
      domain: params.domain,
      options: {
        encrypt: params.encrypt ?? DEFAULTS.ENCRYPT,
        trustServerCertificate: params.trustServerCertificate ?? DEFAULTS.TRUST_SERVER_CERTIFICATE,
        enableArithAbort: true,
        // CRITICAL: Read-only intent for safety
        readOnlyIntent: true,
      },
      connectionTimeout: params.connectionTimeout || DEFAULTS.CONNECTION_TIMEOUT,
      requestTimeout: params.requestTimeout || DEFAULTS.REQUEST_TIMEOUT,
      pool: {
        max: DEFAULTS.POOL_MAX,
        min: DEFAULTS.POOL_MIN,
        idleTimeoutMillis: DEFAULTS.POOL_IDLE_TIMEOUT,
      },
    };

    // Windows Authentication
    if (params.authentication === 'windows' && params.domain) {
      config.authentication = {
        type: 'ntlm',
        options: {
          domain: params.domain,
          userName: params.username,
          password: params.password,
        },
      };
      delete config.user;
      delete config.password;
      delete config.domain;
    }

    try {
      this.pool = await new sql.ConnectionPool(config).connect();

      // Verify connection
      const result = await this.pool.request().query(`
        SELECT
          DB_NAME() as dbName,
          @@SERVERNAME as serverName,
          @@VERSION as version
      `);

      this.serverInfo = {
        serverName: result.recordset[0].serverName,
        databaseName: result.recordset[0].dbName,
        version: result.recordset[0].version.split('\n')[0],
      };

      this.connectionName = params.connectionName || `${params.server}/${params.database}`;

      console.log(`[MSSQLConnector] Connected to ${this.serverInfo.serverName}/${this.serverInfo.databaseName}`);

      return {
        success: true,
        serverName: this.serverInfo.serverName,
        databaseName: this.serverInfo.databaseName,
        version: this.serverInfo.version,
      };
    } catch (error) {
      console.error(`[MSSQLConnector] Connection FAILED → ${config.server}:${config.port}/${config.database} user=${config.user} encrypt=${config.options?.encrypt} trustCert=${config.options?.trustServerCertificate}`);
      console.error(`[MSSQLConnector] Error: ${error.message} (code: ${error.code || error.number || 'N/A'})`);
      if (error.stack) console.error(`[MSSQLConnector] Stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
      return {
        success: false,
        error: `${error.message} [server=${config.server}:${config.port}, db=${config.database}, user=${config.user}]`,
        code: error.code || error.number,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Named Pipes connection via msnodesqlv8
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Connect via Named Pipes using msnodesqlv8 ODBC driver
   * @param {Object} params
   * @param {string} params.server - Server name (hostname or instance)
   * @param {string} params.database - Database name
   * @param {string} [params.instanceName] - SQL instance name (e.g. "SQLEXPRESS")
   * @param {string} [params.pipeName] - Full pipe path override (e.g. "\\\\server\\pipe\\sql\\query")
   * @param {string} [params.username] - SQL login (omit for Windows Auth / Trusted)
   * @param {string} [params.password] - SQL password
   * @param {string} [params.driver] - ODBC driver name (default: "ODBC Driver 17 for SQL Server")
   * @param {boolean} [params.trustServerCertificate]
   * @returns {Promise<{success: boolean, serverName?: string, databaseName?: string, version?: string, error?: string}>}
   * @private
   */
  async _connectNamedPipes(params) {
    const sqlNP = getSqlNative();

    // Build the pipe server string
    // Format: np:ServerName\pipe\sql\query  OR  np:ServerName\pipe\MSSQL$INSTANCE\sql\query
    let pipeServer;
    if (params.pipeName) {
      // User provided a full pipe path
      pipeServer = params.pipeName;
    } else if (params.instanceName) {
      pipeServer = `np:${params.server}\\pipe\\MSSQL$${params.instanceName}\\sql\\query`;
    } else {
      pipeServer = `np:${params.server}\\pipe\\sql\\query`;
    }

    const driverName = params.driver || 'ODBC Driver 17 for SQL Server';
    const trustCert = (params.trustServerCertificate ?? DEFAULTS.TRUST_SERVER_CERTIFICATE)
      ? 'Yes' : 'No';

    // Build ODBC connection string
    let connStr = `Driver={${driverName}};Server=${pipeServer};Database=${params.database};TrustServerCertificate=${trustCert};`;

    if (params.username && params.password) {
      // SQL Authentication
      connStr += `UID=${params.username};PWD=${params.password};`;
    } else {
      // Windows Authentication (Trusted Connection)
      connStr += 'Trusted_Connection=Yes;';
    }

    try {
      this.pool = await new sqlNP.ConnectionPool(connStr).connect();

      // Verify connection
      const result = await this.pool.request().query(`
        SELECT
          DB_NAME() as dbName,
          @@SERVERNAME as serverName,
          @@VERSION as version
      `);

      this.serverInfo = {
        serverName: result.recordset[0].serverName,
        databaseName: result.recordset[0].dbName,
        version: result.recordset[0].version.split('\n')[0],
      };

      this.connectionName = params.connectionName || `${params.server}/${params.database} (named-pipes)`;

      console.log(`[MSSQLConnector] Connected via Named Pipes to ${this.serverInfo.serverName}/${this.serverInfo.databaseName}`);

      return {
        success: true,
        serverName: this.serverInfo.serverName,
        databaseName: this.serverInfo.databaseName,
        version: this.serverInfo.version,
        protocol: 'named-pipes',
      };
    } catch (error) {
      console.error(`[MSSQLConnector] Named Pipes connection failed:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code || error.number,
        protocol: 'named-pipes',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.disconnect
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Close connection pool
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.close();
      console.log(`[MSSQLConnector] Disconnected from ${this.connectionName}`);
      this.pool = null;
      this.connectionName = null;
      this.serverInfo = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_schemas
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get list of user schemas with object counts
   * @returns {Promise<Array<{schema_id: number, schema_name: string, schema_owner: string, table_count: number, view_count: number, procedure_count: number}>>}
   */
  async getSchemas() {
    this._ensureConnected();

    const result = await this.pool.request().query(`
      SELECT
        s.schema_id,
        s.name AS schema_name,
        p.name AS schema_owner,
        (SELECT COUNT(*) FROM sys.tables t WHERE t.schema_id = s.schema_id) AS table_count,
        (SELECT COUNT(*) FROM sys.views v WHERE v.schema_id = s.schema_id) AS view_count,
        (SELECT COUNT(*) FROM sys.procedures pr WHERE pr.schema_id = s.schema_id) AS procedure_count
      FROM sys.schemas s
      INNER JOIN sys.database_principals p ON s.principal_id = p.principal_id
      WHERE s.name NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})
        AND s.schema_id < 16384
      ORDER BY s.name
    `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_tables
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get tables and views
   * @param {Object} [options]
   * @param {string} [options.schema] - Filter by schema name
   * @param {boolean} [options.includeViews=true]
   * @param {boolean} [options.includeRowCounts=false]
   * @returns {Promise<Array<import('../../config/mssql.config').TableInfo>>}
   */
  async getTables(options = {}) {
    this._ensureConnected();

    const { schema, includeViews = true, includeRowCounts = false } = options;
    const request = this.pool.request();

    let schemaFilter = `AND s.name NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})`;
    if (schema) {
      request.input('schema', sql.NVarChar, schema);
      schemaFilter = 'AND s.name = @schema';
    }

    const rowCountSelect = includeRowCounts
      ? `(SELECT SUM(p.rows) FROM sys.partitions p
          WHERE p.object_id = t.object_id AND p.index_id < 2) AS row_count`
      : 'NULL AS row_count';

    let query = `
      SELECT
        t.object_id,
        s.name AS schema_name,
        t.name AS table_name,
        'TABLE' AS table_type,
        t.create_date,
        t.modify_date,
        (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS column_count,
        CAST(ep.value AS NVARCHAR(MAX)) AS description,
        ${rowCountSelect}
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.extended_properties ep
        ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
      WHERE t.is_ms_shipped = 0
        AND t.temporal_type <> 1
        ${schemaFilter}
        ${this._excludeTableNamesCondition('t')}
    `;

    if (includeViews) {
      query += `
        UNION ALL
        SELECT
          v.object_id,
          s.name AS schema_name,
          v.name AS table_name,
          'VIEW' AS table_type,
          v.create_date,
          v.modify_date,
          (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = v.object_id) AS column_count,
          CAST(ep.value AS NVARCHAR(MAX)) AS description,
          NULL AS row_count
        FROM sys.views v
        INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
        LEFT JOIN sys.extended_properties ep
          ON ep.major_id = v.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
        WHERE v.is_ms_shipped = 0
          ${schemaFilter}
      `;
    }

    query += ' ORDER BY schema_name, table_name';

    const result = await request.query(query);
    const tables = result.recordset;

    // Optionally bulk-fetch column names for all tables in a single query
    if (options.includeColumns) {
      const colsResult = await this.pool.request().query(`
        SELECT
          s.name AS schema_name,
          t.name AS table_name,
          c.name AS column_name,
          TYPE_NAME(c.user_type_id) AS data_type
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE t.is_ms_shipped = 0
          AND s.name NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})
        ORDER BY s.name, t.name, c.column_id
      `);

      const colsByTable = new Map();
      for (const c of colsResult.recordset) {
        const key = `${c.schema_name}.${c.table_name}`;
        if (!colsByTable.has(key)) colsByTable.set(key, []);
        colsByTable.get(key).push({ name: c.column_name, type: c.data_type });
      }
      for (const t of tables) {
        t.columns = colsByTable.get(`${t.schema_name}.${t.table_name}`) || [];
      }
    }

    return tables;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_columns
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get detailed column information for a table
   * @param {string} schemaName
   * @param {string} tableName
   * @returns {Promise<Array<import('../../config/mssql.config').ColumnInfo>>}
   */
  async getColumns(schemaName, tableName) {
    this._ensureConnected();

    const result = await this.pool.request()
      .input('schema', sql.NVarChar, schemaName)
      .input('table', sql.NVarChar, tableName)
      .query(`
        SELECT
          c.column_id,
          c.name AS column_name,
          TYPE_NAME(c.user_type_id) AS data_type,
          c.max_length,
          c.precision,
          c.scale,
          c.is_nullable,
          c.is_identity,
          c.is_computed,
          dc.definition AS default_value,
          cc.definition AS computed_definition,
          CAST(ep.value AS NVARCHAR(MAX)) AS description,
          CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
          fk.referenced_schema,
          fk.referenced_table,
          fk.referenced_column,
          fk.constraint_name AS fk_constraint_name
        FROM sys.columns c
        INNER JOIN sys.objects o ON c.object_id = o.object_id
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
        LEFT JOIN sys.computed_columns cc ON c.object_id = cc.object_id AND c.column_id = cc.column_id
        LEFT JOIN sys.extended_properties ep
          ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
        LEFT JOIN (
          SELECT ic.object_id, ic.column_id
          FROM sys.index_columns ic
          INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          WHERE i.is_primary_key = 1
        ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
        LEFT JOIN (
          SELECT
            fkc.parent_object_id,
            fkc.parent_column_id,
            rs.name AS referenced_schema,
            rt.name AS referenced_table,
            rc.name AS referenced_column,
            fk.name AS constraint_name
          FROM sys.foreign_key_columns fkc
          INNER JOIN sys.foreign_keys fk ON fkc.constraint_object_id = fk.object_id
          INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
          INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
          INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id
            AND fkc.referenced_column_id = rc.column_id
        ) fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
        WHERE s.name = @schema AND o.name = @table
        ORDER BY c.column_id
      `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_constraints
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all constraints for a table (PK, FK, UNIQUE, CHECK)
   * @param {string} schemaName
   * @param {string} tableName
   * @returns {Promise<Array<import('../../config/mssql.config').ConstraintInfo>>}
   */
  async getConstraints(schemaName, tableName) {
    this._ensureConnected();

    const result = await this.pool.request()
      .input('schema', sql.NVarChar, schemaName)
      .input('table', sql.NVarChar, tableName)
      .query(`
        -- Primary Keys
        SELECT
          i.name AS constraint_name,
          'PRIMARY KEY' AS constraint_type,
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns,
          NULL AS definition,
          NULL AS referenced_schema,
          NULL AS referenced_table,
          NULL AS referenced_columns,
          NULL AS delete_action,
          NULL AS update_action
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.is_primary_key = 1 AND s.name = @schema AND t.name = @table
        GROUP BY i.name

        UNION ALL

        -- Foreign Keys
        SELECT
          fk.name,
          'FOREIGN KEY',
          STRING_AGG(pc.name, ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id),
          NULL,
          rs.name,
          rt.name,
          STRING_AGG(rc.name, ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id),
          fk.delete_referential_action_desc,
          fk.update_referential_action_desc
        FROM sys.foreign_keys fk
        INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
        INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
        INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
        INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
        INNER JOIN sys.tables pt ON fk.parent_object_id = pt.object_id
        INNER JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
        WHERE ps.name = @schema AND pt.name = @table
        GROUP BY fk.name, rs.name, rt.name, fk.delete_referential_action_desc, fk.update_referential_action_desc

        UNION ALL

        -- Unique Constraints
        SELECT
          i.name,
          'UNIQUE',
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal),
          NULL, NULL, NULL, NULL, NULL, NULL
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.is_unique_constraint = 1 AND s.name = @schema AND t.name = @table
        GROUP BY i.name

        UNION ALL

        -- Check Constraints
        SELECT
          cc.name,
          'CHECK',
          NULL,
          cc.definition,
          NULL, NULL, NULL, NULL, NULL
        FROM sys.check_constraints cc
        INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table

        ORDER BY constraint_type, constraint_name
      `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_procedures
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get stored procedures and optionally triggers
   * @param {Object} [options]
   * @param {string} [options.schema] - Filter by schema
   * @param {boolean} [options.includeTriggers=true]
   * @param {boolean} [options.includeDefinition=true]
   * @returns {Promise<Array<import('../../config/mssql.config').ProcedureInfo>>}
   */
  async getProcedures(options = {}) {
    this._ensureConnected();

    const { schema, includeTriggers = true, includeDefinition = true } = options;
    const request = this.pool.request();

    let schemaFilter = `AND s.name NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})`;
    if (schema) {
      request.input('schema', sql.NVarChar, schema);
      schemaFilter = 'AND s.name = @schema';
    }

    const definitionSelect = includeDefinition
      ? 'OBJECT_DEFINITION(p.object_id) AS definition,'
      : 'NULL AS definition,';

    let query = `
      SELECT
        p.object_id,
        s.name AS schema_name,
        p.name AS object_name,
        'PROCEDURE' AS object_type,
        p.create_date,
        p.modify_date,
        ${definitionSelect}
        CAST(ep.value AS NVARCHAR(MAX)) AS description,
        (SELECT COUNT(*) FROM sys.parameters par WHERE par.object_id = p.object_id AND par.parameter_id > 0) AS param_count
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      LEFT JOIN sys.extended_properties ep
        ON ep.major_id = p.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
      WHERE p.is_ms_shipped = 0
        ${schemaFilter}
    `;

    if (includeTriggers) {
      const triggerDefinition = includeDefinition
        ? 'OBJECT_DEFINITION(tr.object_id) AS definition,'
        : 'NULL AS definition,';

      query += `
        UNION ALL

        SELECT
          tr.object_id,
          s.name AS schema_name,
          tr.name AS object_name,
          'TRIGGER' AS object_type,
          tr.create_date,
          tr.modify_date,
          ${triggerDefinition}
          CAST(ep.value AS NVARCHAR(MAX)) AS description,
          0 AS param_count
        FROM sys.triggers tr
        INNER JOIN sys.tables t ON tr.parent_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        LEFT JOIN sys.extended_properties ep
          ON ep.major_id = tr.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
        WHERE tr.is_ms_shipped = 0
          ${schemaFilter}
      `;
    }

    query += ' ORDER BY object_type, schema_name, object_name';

    const result = await request.query(query);
    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_dependencies
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get object dependencies
   * @param {string} [schemaName]
   * @returns {Promise<Array>}
   */
  async getDependencies(schemaName) {
    this._ensureConnected();

    const request = this.pool.request();
    let schemaFilter = '';

    if (schemaName) {
      request.input('schema', sql.NVarChar, schemaName);
      schemaFilter = `
        AND (
          OBJECT_SCHEMA_NAME(d.referencing_id) = @schema OR
          COALESCE(d.referenced_schema_name, OBJECT_SCHEMA_NAME(d.referenced_id)) = @schema
        )
      `;
    }

    const result = await request.query(`
      SELECT DISTINCT
        OBJECT_SCHEMA_NAME(d.referencing_id) AS referencing_schema,
        OBJECT_NAME(d.referencing_id) AS referencing_name,
        o1.type_desc AS referencing_type,
        COALESCE(d.referenced_schema_name, OBJECT_SCHEMA_NAME(d.referenced_id)) AS referenced_schema,
        d.referenced_entity_name AS referenced_name,
        COALESCE(o2.type_desc, 'UNKNOWN') AS referenced_type,
        d.is_caller_dependent,
        d.is_ambiguous
      FROM sys.sql_expression_dependencies d
      LEFT JOIN sys.objects o1 ON d.referencing_id = o1.object_id
      LEFT JOIN sys.objects o2 ON d.referenced_id = o2.object_id
      WHERE OBJECT_SCHEMA_NAME(d.referencing_id) NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})
        AND OBJECT_NAME(d.referencing_id) IS NOT NULL
        ${schemaFilter}
      ORDER BY referencing_schema, referencing_name, referenced_name
    `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.sample_data
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sample data from a table for analysis
   * @param {string} schemaName
   * @param {string} tableName
   * @param {Object} [options]
   * @param {number} [options.sampleSize=50]
   * @param {boolean} [options.includeDistinctValues=true]
   * @param {boolean} [options.includeStatistics=true]
   */
  async sampleData(schemaName, tableName, options = {}) {
    this._ensureConnected();

    const sampleSize = Math.min(options.sampleSize || 50, DEFAULTS.MAX_SAMPLE_SIZE);
    const fqn = `[${schemaName}].[${tableName}]`;

    // 1. Row count
    const countResult = await this.pool.request().query(
      `SELECT COUNT(*) as total FROM ${fqn}`
    );
    const totalRows = countResult.recordset[0].total;

    // 2. Top N rows
    const topResult = await this.pool.request().query(
      `SELECT TOP (${sampleSize}) * FROM ${fqn}`
    );
    const topRows = topResult.recordset;

    // 3. Random rows (if table is large enough)
    let randomRows = [];
    if (totalRows > sampleSize * 2) {
      const randomResult = await this.pool.request().query(
        `SELECT TOP (${sampleSize}) * FROM ${fqn} ORDER BY NEWID()`
      );
      randomRows = randomResult.recordset;
    }

    // 4. Column statistics
    let columnStatistics = [];
    if (options.includeStatistics !== false) {
      columnStatistics = await this._computeColumnStatistics(schemaName, tableName, totalRows);
    }

    // 5. Distinct values for enum candidates
    let distinctValues = {};
    if (options.includeDistinctValues !== false) {
      distinctValues = await this._getDistinctValuesForEnumCandidates(schemaName, tableName, totalRows);
    }

    return {
      tableName: `${schemaName}.${tableName}`,
      totalRows,
      sampleSize,
      topRows,
      randomRows,
      columnStatistics,
      distinctValues,
      sampledAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.execute_query (READ-ONLY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute arbitrary READ-ONLY query. DML/DDL operations are blocked.
   * @param {string} queryText
   * @param {number} [maxRows=1000]
   * @returns {Promise<{columns: string[], rows: Object[], rowCount: number, truncated: boolean}>}
   */
  async executeReadOnlyQuery(queryText, maxRows = DEFAULTS.MAX_QUERY_ROWS) {
    this._ensureConnected();

    // Validate: block DML/DDL
    const upperQuery = queryText.toUpperCase();
    for (const keyword of BLOCKED_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(upperQuery)) {
        throw new Error(`Blocked operation: ${keyword}. Only SELECT queries are allowed.`);
      }
    }

    // Add TOP if missing
    let finalQuery = queryText.trim();
    if (!/\bTOP\s*\(/i.test(finalQuery)) {
      finalQuery = finalQuery.replace(/^SELECT\s+/i, `SELECT TOP (${maxRows}) `);
    }

    const result = await this.pool.request().query(`
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      ${finalQuery}
    `);

    const rows = result.recordset || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated: rows.length >= maxRows,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_row_counts
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fast row counts for all tables via sys.partitions
   * @param {string} [schemaName]
   * @returns {Promise<Array<{schema_name: string, table_name: string, row_count: number, total_space_kb: number, used_space_kb: number}>>}
   */
  async getRowCounts(schemaName) {
    this._ensureConnected();

    const request = this.pool.request();
    let schemaFilter = `AND s.name NOT IN (${this._quotedList(SYSTEM_SCHEMAS)})`;

    if (schemaName) {
      request.input('schema', sql.NVarChar, schemaName);
      schemaFilter = 'AND s.name = @schema';
    }

    const result = await request.query(`
      SELECT
        s.name AS schema_name,
        t.name AS table_name,
        SUM(p.rows) AS row_count,
        SUM(a.total_pages) * 8 AS total_space_kb,
        SUM(a.used_pages) * 8 AS used_space_kb
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.indexes i ON t.object_id = i.object_id
      INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
      WHERE t.is_ms_shipped = 0
        AND i.index_id <= 1
        ${schemaFilter}
      GROUP BY s.name, t.name
      ORDER BY row_count DESC
    `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL: mssql.get_indexes
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get indexes for a table
   * @param {string} schemaName
   * @param {string} tableName
   */
  async getIndexes(schemaName, tableName) {
    this._ensureConnected();

    const result = await this.pool.request()
      .input('schema', sql.NVarChar, schemaName)
      .input('table', sql.NVarChar, tableName)
      .query(`
        SELECT
          i.name AS index_name,
          i.type_desc AS index_type,
          i.is_unique,
          i.is_primary_key,
          i.is_unique_constraint,
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns,
          STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ', ')
            WITHIN GROUP (ORDER BY ic.key_ordinal) AS included_columns
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table AND i.name IS NOT NULL
        GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key, i.is_unique_constraint
        ORDER BY i.is_primary_key DESC, i.name
      `);

    return result.recordset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _ensureConnected() {
    if (!this.pool || !this.pool.connected) {
      throw new Error('Not connected to MS SQL Server. Call connect() first.');
    }
  }

  _quotedList(arr) {
    return arr.map(s => `'${s}'`).join(',');
  }

  _excludeTableNamesCondition(alias) {
    // Escape SQL LIKE wildcards: _ → [_], % → [%]
    const prefixConditions = SYSTEM_TABLE_PREFIXES
      .map(p => `${alias}.name NOT LIKE '${p.replace(/%/g, '[%]').replace(/_/g, '[_]')}%'`)
      .join(' AND ');

    const nameConditions = EXCLUDED_TABLES.length > 0
      ? `AND ${alias}.name NOT IN (${this._quotedList(EXCLUDED_TABLES)})`
      : '';

    return `AND ${prefixConditions} ${nameConditions}`;
  }

  /**
   * Compute column statistics (nulls, min/max, avg lengths)
   * @private
   */
  async _computeColumnStatistics(schemaName, tableName, totalRows) {
    const columns = await this.getColumns(schemaName, tableName);
    const fqn = `[${schemaName}].[${tableName}]`;
    const stats = [];

    const batches = this._chunkArray(columns, 5);

    for (const batch of batches) {
      const selectParts = batch.map(col => {
        const name = `[${col.column_name}]`;
        const parts = [
          `SUM(CASE WHEN ${name} IS NULL THEN 1 ELSE 0 END) AS [${col.column_name}_nulls]`,
        ];

        // Numeric types
        if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
             'float', 'real', 'money', 'smallmoney'].includes(col.data_type)) {
          parts.push(
            `MIN(${name}) AS [${col.column_name}_min]`,
            `MAX(${name}) AS [${col.column_name}_max]`,
            `AVG(CAST(${name} AS FLOAT)) AS [${col.column_name}_avg]`
          );
        }

        // String types
        if (['varchar', 'nvarchar', 'char', 'nchar'].includes(col.data_type)) {
          parts.push(
            `AVG(LEN(${name})) AS [${col.column_name}_avg_len]`,
            `MAX(LEN(${name})) AS [${col.column_name}_max_len]`
          );
        }

        return parts.join(',\n');
      });

      try {
        const result = await this.pool.request().query(
          `SELECT ${selectParts.join(',\n')} FROM ${fqn}`
        );

        const row = result.recordset[0];
        for (const col of batch) {
          stats.push({
            columnName: col.column_name,
            dataType: col.data_type,
            nullCount: row[`${col.column_name}_nulls`] || 0,
            nullPercentage: totalRows > 0
              ? ((row[`${col.column_name}_nulls`] || 0) / totalRows * 100).toFixed(1)
              : '0',
            min: row[`${col.column_name}_min`],
            max: row[`${col.column_name}_max`],
            avg: row[`${col.column_name}_avg`],
            avgLength: row[`${col.column_name}_avg_len`],
            maxLength: row[`${col.column_name}_max_len`],
          });
        }
      } catch (err) {
        console.warn(`[MSSQLConnector] Stats error for batch:`, err.message);
      }
    }

    return stats;
  }

  /**
   * Get distinct values for potential enum fields (low cardinality columns)
   * @private
   */
  async _getDistinctValuesForEnumCandidates(schemaName, tableName, totalRows) {
    const columns = await this.getColumns(schemaName, tableName);
    const fqn = `[${schemaName}].[${tableName}]`;
    const result = {};
    const MAX_DISTINCT = DEFAULTS.MAX_DISTINCT_VALUES;

    // Skip very large tables for performance
    if (totalRows > 100000) {
      return result;
    }

    for (const col of columns) {
      // Skip unsuitable types
      if (['text', 'ntext', 'image', 'varbinary', 'xml', 'geography', 'geometry'].includes(col.data_type)) {
        continue;
      }

      // Skip large strings
      if (col.max_length > 500 && col.max_length !== -1) {
        continue;
      }

      try {
        const distinctResult = await this.pool.request().query(`
          SELECT TOP (${MAX_DISTINCT + 1})
            [${col.column_name}] as val,
            COUNT(*) as frequency
          FROM ${fqn}
          WHERE [${col.column_name}] IS NOT NULL
          GROUP BY [${col.column_name}]
          ORDER BY COUNT(*) DESC
        `);

        // If fewer than MAX_DISTINCT unique values — it's an enum candidate
        if (distinctResult.recordset.length <= MAX_DISTINCT) {
          result[col.column_name] = distinctResult.recordset;
        }
      } catch (err) {
        // Skip errors (computed columns etc.)
      }
    }

    return result;
  }

  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Check if connection is alive
   * @returns {Promise<boolean>}
   */
  async isConnected() {
    if (!this.pool) return false;
    try {
      await this.pool.request().query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get connection info for diagnostics
   */
  getConnectionInfo() {
    return {
      connected: this.pool?.connected || false,
      connectionName: this.connectionName,
      ...this.serverInfo,
    };
  }
}

module.exports = { MSSQLConnector };
