/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA Graph Inspection Script
 * Queries the Memgraph database to inspect AINFRA structure
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage: node api/scripts/inspect-ainfra.js
 */

require('dotenv').config();
const neo4j = require('neo4j-driver');

// Default credentials from docker-compose (projectadvisor-memgraph)
const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('AINFRA Graph Inspection');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Connecting to: ${MEMGRAPH_URI}`);
console.log('');

async function inspectAINFRA() {
  const driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD));
  const session = driver.session();

  try {
    // 1. Check if AINFRA root node exists
    console.log('1. Checking AINFRA root node...');
    const rootResult = await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})
      RETURN root
    `);

    if (rootResult.records.length > 0) {
      const root = rootResult.records[0].get('root').properties;
      console.log('   ✅ AINFRA root node found:');
      console.log(`      - Name: ${root.name}`);
      console.log(`      - Version: ${root.version}`);
      console.log(`      - Created: ${root.createdAt}`);
    } else {
      console.log('   ❌ AINFRA root node NOT found');
    }
    console.log('');

    // 2. Check configuration sets
    console.log('2. Checking configuration sets...');
    const configResult = await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})-[:HAS_CONFIG]->(config:AIConfigSet)
      OPTIONAL MATCH (root)-[:ACTIVE_CONFIG]->(activeConfig:AIConfigSet)
      RETURN config, config.id = activeConfig.id AS isActive
    `);

    if (configResult.records.length > 0) {
      console.log(`   ✅ Found ${configResult.records.length} configuration set(s):`);
      for (const record of configResult.records) {
        const config = record.get('config').properties;
        const isActive = record.get('isActive');
        console.log(`      - ${config.name} (${config.id}) ${isActive ? '[ACTIVE]' : ''}`);
        console.log(`        Description: ${config.description || 'N/A'}`);
      }
    } else {
      console.log('   ❌ No configuration sets found');
    }
    console.log('');

    // 3. Check provider configurations
    console.log('3. Checking provider configurations...');
    const providerResult = await session.run(`
      MATCH (config:AIConfigSet)-[:USES_PROVIDER]->(provider:AIProviderConfig)
      RETURN config.name AS configName, provider
      ORDER BY config.name, provider.provider
    `);

    if (providerResult.records.length > 0) {
      console.log(`   ✅ Found ${providerResult.records.length} provider configuration(s):`);
      let currentConfig = '';
      for (const record of providerResult.records) {
        const configName = record.get('configName');
        const provider = record.get('provider').properties;

        if (configName !== currentConfig) {
          currentConfig = configName;
          console.log(`      Config: ${configName}`);
        }

        console.log(`        - ${provider.displayName} (${provider.provider})`);
        console.log(`          Enabled: ${provider.enabled}, RPM: ${provider.rpmLimit}, ` +
                   `Token Limit: ${provider.dailyTokenLimit || 'unlimited'}, ` +
                   `Budget: $${provider.dailyBudgetUsd || 0}/day`);
      }
    } else {
      console.log('   ❌ No provider configurations found');
    }
    console.log('');

    // 4. Check recent alerts
    console.log('4. Checking recent alerts...');
    const alertResult = await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})-[:HAS_ALERT]->(alert:AIAlert)
      RETURN alert
      ORDER BY alert.timestamp DESC
      LIMIT 5
    `);

    if (alertResult.records.length > 0) {
      console.log(`   ⚠️ Found ${alertResult.records.length} recent alert(s):`);
      for (const record of alertResult.records) {
        const alert = record.get('alert').properties;
        console.log(`      - [${alert.level}] ${alert.provider}: ${alert.message}`);
        console.log(`        Time: ${alert.timestamp}, Acknowledged: ${alert.acknowledged}`);
      }
    } else {
      console.log('   ✅ No alerts found');
    }
    console.log('');

    // 5. Check usage snapshots
    console.log('5. Checking usage snapshots...');
    const snapshotResult = await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})-[:HAS_SNAPSHOT]->(snapshot:AIUsageSnapshot)
      RETURN count(snapshot) AS count
    `);

    const snapshotCount = snapshotResult.records[0]?.get('count')?.toNumber?.() ||
                          snapshotResult.records[0]?.get('count') || 0;
    console.log(`   📊 Total usage snapshots: ${snapshotCount}`);
    console.log('');

    // 6. Show full graph structure
    console.log('6. Full AINFRA graph structure:');
    const fullResult = await session.run(`
      MATCH path = (root:AINFRA {id: 'ainfra-root'})-[r*1..2]->(n)
      RETURN labels(n) AS labels, type(r[0]) AS relType, count(n) AS count
      ORDER BY relType, labels
    `);

    if (fullResult.records.length > 0) {
      console.log('   Graph relationships:');
      for (const record of fullResult.records) {
        const labels = record.get('labels');
        const relType = record.get('relType');
        const count = record.get('count')?.toNumber?.() || record.get('count');
        console.log(`      AINFRA -[${relType}]-> ${labels.join(':')} (${count} nodes)`);
      }
    }

  } catch (error) {
    console.error('Error inspecting AINFRA:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

console.log('');
inspectAINFRA()
  .then(() => {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('Inspection complete');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
