#!/usr/bin/env node
/**
 * Quick test: run MssqlAgent directly and log key events.
 * Usage: node api/scripts/test-agent-direct.js
 */
require('dotenv').config();

const { MSSQLConnector } = require('../src/services/connectors/mssql.connector');
const { MssqlAgent } = require('../src/services/connectors/mssql.agent');

const connector = new MSSQLConnector();
const agent = new MssqlAgent({
  connector,
  llmService: {
    chat: async () => ({ content: JSON.stringify({ summary: 'test', recommendations: [] }) }),
  },
  emit: (type, data) => {
    const dominated = [
      'schemas_discovered', 'tables_discovered', 'tables_classified',
      'phase_start', 'phase_complete', 'phase_error',
      'agent_error', 'agent_start', 'connected',
      'entity_discovered', 'extracting_table', 'table_extracted',
    ];
    if (dominated.includes(type)) {
      console.log(`[${type}]`, JSON.stringify(data).substring(0, 200));
    }
    if (type === 'log' && data.level !== 'debug') {
      console.log(`[log:${data.level}] ${(data.message || '').substring(0, 150)}`);
    }
  },
});

agent.run({
  server: 'localhost',
  port: 1435,
  database: 'FlowDesc',
  username: 'sa',
  password: 'SqlExpress2022#Dev',
  encryption: true,
  trustServerCertificate: true,
}, { skipMetaConsultation: true }).then(result => {
  console.log('\n=== RESULT ===');
  const map = result.context?.databaseMap;
  console.log('Tables found:', map?.totalTables);
  console.log('Classifications:', Object.keys(map?.classifications || {}).length);
  if (map) {
    console.log('  reference:', map.reference?.length);
    console.log('  master:', map.master?.length);
    console.log('  transaction:', map.transaction?.length);
    console.log('  log:', map.log?.length);
    console.log('  junction:', map.junction?.length);
    console.log('  unknown:', map.unknown?.length);
  }
  process.exit(0);
}).catch(e => {
  console.error('AGENT ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});
