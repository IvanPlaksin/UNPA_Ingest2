/**
 * MS SQL Server Connector Configuration
 * Constants, types, and default settings for MSSQL integration
 *
 * @module config/mssql
 */

// ═══════════════════════════════════════════════════════════════════════
// JSDoc Type Definitions
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MSSQLConnectionParams
 * @property {string} server - SQL Server hostname or IP
 * @property {number} [port=1433] - SQL Server port
 * @property {string} database - Database name
 * @property {'sql'|'windows'|'azure-ad'} [authentication='sql'] - Authentication method
 * @property {'tcp'|'named-pipes'} [protocol='tcp'] - Connection protocol
 * @property {string} [instanceName] - SQL instance name (e.g. "SQLEXPRESS") for Named Pipes
 * @property {string} [pipeName] - Full named pipe path override (e.g. "\\\\server\\pipe\\sql\\query")
 * @property {string} [driver] - ODBC driver name for Named Pipes (default: "ODBC Driver 17 for SQL Server")
 * @property {string} [username] - SQL login username
 * @property {string} [password] - SQL login password
 * @property {string} [domain] - Windows domain (for windows auth)
 * @property {boolean} [encrypt=true] - Use encrypted connection
 * @property {boolean} [trustServerCertificate=false] - Trust self-signed certs
 * @property {number} [connectionTimeout=30000] - Connection timeout in ms
 * @property {number} [requestTimeout=30000] - Request timeout in ms
 */

/**
 * @typedef {Object} TableInfo
 * @property {string} schema - Schema name
 * @property {string} name - Table name
 * @property {string} type - 'BASE TABLE' or 'VIEW'
 * @property {number} [rowCount] - Approximate row count
 * @property {string} [description] - MS_Description extended property
 */

/**
 * @typedef {Object} ColumnInfo
 * @property {string} name - Column name
 * @property {string} dataType - SQL data type
 * @property {number|null} maxLength - Max character length
 * @property {boolean} isNullable - Whether column allows NULL
 * @property {boolean} isPrimaryKey - Whether column is part of PK
 * @property {boolean} isIdentity - Whether column is IDENTITY
 * @property {string|null} defaultValue - Default constraint value
 * @property {string|null} description - MS_Description extended property
 * @property {number} ordinalPosition - Column position in table
 */

/**
 * @typedef {Object} ConstraintInfo
 * @property {string} name - Constraint name
 * @property {'PRIMARY KEY'|'FOREIGN KEY'|'UNIQUE'|'CHECK'|'DEFAULT'} type
 * @property {string[]} columns - Columns involved
 * @property {string} [referencedSchema] - FK target schema
 * @property {string} [referencedTable] - FK target table
 * @property {string[]} [referencedColumns] - FK target columns
 * @property {string} [checkClause] - CHECK constraint expression
 */

/**
 * @typedef {Object} ProcedureInfo
 * @property {string} schema - Schema name
 * @property {string} name - Procedure/function name
 * @property {'PROCEDURE'|'FUNCTION'|'TRIGGER'} type
 * @property {string} definition - Full SQL definition
 * @property {string} [description] - MS_Description extended property
 * @property {string} createdAt - Creation date
 * @property {string} modifiedAt - Last modification date
 */

/**
 * @typedef {Object} TableAnalysis
 * @property {string} businessName - Human-readable entity name
 * @property {string} businessDescription - What this table represents
 * @property {string} entityCategory - 'master_data'|'transaction'|'reference'|'junction'|'audit'|'config'
 * @property {Object.<string, ColumnAnalysis>} columns - Column-level analysis
 * @property {string[]} suggestedLabels - Graph labels for this entity
 * @property {number} importanceScore - 1-10 importance rating
 */

/**
 * @typedef {Object} ColumnAnalysis
 * @property {string} businessName - Human-readable column name
 * @property {string} semanticType - 'identifier'|'name'|'date'|'amount'|'status'|'flag'|'description'|'code'|'foreign_key'
 * @property {string} businessMeaning - What this column represents
 * @property {boolean} isBusinessKey - Whether it's a natural/business key
 */

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

/** System schemas to exclude from discovery */
const SYSTEM_SCHEMAS = [
  'sys',
  'INFORMATION_SCHEMA',
  'guest',
  'db_owner',
  'db_accessadmin',
  'db_securityadmin',
  'db_ddladmin',
  'db_backupoperator',
  'db_datareader',
  'db_datawriter',
  'db_denydatareader',
  'db_denydatawriter',
];

/** System table prefixes to exclude */
const SYSTEM_TABLE_PREFIXES = [
  'sys',
  'dt_',
  '__',
  'MSreplication_',
  'spt_',
  'syncobj_',
  'queue_messages_',
];

/** Specific tables to always exclude */
const EXCLUDED_TABLES = [
  '__EFMigrationsHistory',
  '__MigrationHistory',
  'sysdiagrams',
  'database_firewall_rules',
];

/** DML/DDL keywords blocked in read-only queries */
const BLOCKED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'EXEC', 'EXECUTE', 'MERGE', 'GRANT', 'REVOKE',
  'DENY', 'BACKUP', 'RESTORE', 'DBCC', 'BULK',
  'OPENROWSET', 'OPENDATASOURCE', 'xp_',
];

/** Entity categories for semantic analysis */
const ENTITY_CATEGORIES = [
  'master_data',    // Core business entities (Person, Organization)
  'transaction',    // Business transactions (Order, Payment)
  'reference',      // Lookup/reference data (Status, Country)
  'junction',       // Many-to-many relationship tables
  'audit',          // Audit trail / history tables
  'config',         // Configuration / settings tables
  'staging',        // ETL staging tables
  'archive',        // Archived data tables
];

/** Graph node labels mapped from DB object types */
const DB_TO_GRAPH_LABELS = {
  database: 'Database',
  schema: 'Schema',
  table: 'Table',
  view: 'Table',          // Views treated as virtual tables
  column: 'Column',
  procedure: 'StoredProcedure',
  function: 'StoredProcedure',
  trigger: 'StoredProcedure',
  constraint_pk: 'Constraint',
  constraint_fk: 'Constraint',
  constraint_unique: 'Constraint',
  constraint_check: 'Constraint',
  business_rule: 'BusinessRule',
  business_process: 'BusinessProcess',
};

/** Graph edge types for database relationships */
const DB_EDGE_TYPES = {
  CONTAINS: 'CONTAINS',           // Database → Schema, Schema → Table, Table → Column
  REFERENCES: 'REFERENCES',       // FK relationships between tables
  DEPENDS_ON: 'DEPENDS_ON',       // SP/View dependencies
  MODIFIES: 'MODIFIES',           // SP/Trigger → Table modifications
  IMPLEMENTS: 'IMPLEMENTS',        // SP → BusinessRule
  DERIVED_FROM: 'DERIVED_FROM',   // View → source tables
};

// ═══════════════════════════════════════════════════════════════════════
// Default Settings
// ═══════════════════════════════════════════════════════════════════════

const DEFAULTS = {
  PORT: 1433,
  CONNECTION_TIMEOUT: 30000,
  REQUEST_TIMEOUT: 30000,
  POOL_MAX: 5,
  POOL_MIN: 0,
  POOL_IDLE_TIMEOUT: 30000,
  MAX_SAMPLE_SIZE: 100,
  MAX_QUERY_ROWS: 1000,
  MAX_DISTINCT_VALUES: 50,
  ENCRYPT: process.env.MSSQL_ENCRYPT !== 'false',
  TRUST_SERVER_CERTIFICATE: process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true',
};

module.exports = {
  SYSTEM_SCHEMAS,
  SYSTEM_TABLE_PREFIXES,
  EXCLUDED_TABLES,
  BLOCKED_KEYWORDS,
  ENTITY_CATEGORIES,
  DB_TO_GRAPH_LABELS,
  DB_EDGE_TYPES,
  DEFAULTS,
};
