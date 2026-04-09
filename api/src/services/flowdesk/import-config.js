'use strict';

/**
 * FlowDesk SQL → Memgraph import configuration
 */

const MSSQL_CONFIG = {
  server: process.env.FLOWDESK_MSSQL_HOST || 'localhost',
  port: parseInt(process.env.FLOWDESK_MSSQL_PORT || '1435', 10),
  database: process.env.FLOWDESK_MSSQL_DB || 'FlowDesc',
  user: process.env.FLOWDESK_MSSQL_USER || 'sa',
  password: process.env.FLOWDESK_MSSQL_PASSWORD || 'SqlExpress2022#Dev',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const MEMGRAPH_CONFIG = {
  uri: process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687',
  user: process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph',
  password: process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123',
};

const IMPORT_CONFIG = {
  batchSize: 500,
  logEvery: 1000,
  activeOnly: true, // import only active records
};

// Edge direction convention:
// PARENT_OF: parent → child (ServiceCatalogItem, OrganizationUnit)
// PART_OF:   child → parent (Location geography hierarchy)
// LOCATED_AT: OrgUnit → Location(DutyStation)
// BELONGS_TO: User → OrgUnit
// HAS_ROLE:  User → Role
// GRANTS:    Role → Permission
// MANAGED_BY: OrgUnit → User

module.exports = { MSSQL_CONFIG, MEMGRAPH_CONFIG, IMPORT_CONFIG };
