/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA Cleanup Script
 * Removes all AINFRA nodes and re-initializes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage: node api/scripts/cleanup-ainfra.js
 */

require('dotenv').config();
const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';

const DEFAULT_PROVIDER_CONFIGS = {
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    enabled: true,
    rpmLimit: 60,
    dailyTokenLimit: 1000000,
    dailyBudgetUsd: 10,
    defaultModel: 'gemini-pro-latest',
    costPerInputToken: 0.00025,
    costPerOutputToken: 0.0005,
  },
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic Claude',
    enabled: true,
    rpmLimit: 50,
    dailyTokenLimit: 500000,
    dailyBudgetUsd: 20,
    defaultModel: 'claude-sonnet-4-5-20250929',
    costPerInputToken: 0.003,
    costPerOutputToken: 0.015,
  },
  ollama: {
    provider: 'ollama',
    displayName: 'Meta Llama (Local)',
    enabled: true,
    rpmLimit: 100,
    dailyTokenLimit: null,
    dailyBudgetUsd: null,
    defaultModel: 'llama3.3:70b',
    costPerInputToken: 0,
    costPerOutputToken: 0,
  },
};

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('AINFRA Cleanup and Reinitialize');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Connecting to: ${MEMGRAPH_URI}`);
console.log('');

async function runWithNewSession(driver, query, params = {}, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = driver.session();
    try {
      const result = await session.run(query, params);
      await session.close();
      return result;
    } catch (error) {
      await session.close();
      if (error.retriable && attempt < maxRetries) {
        console.log(`      ⏳ Retry ${attempt}/${maxRetries} after conflict...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      } else {
        throw error;
      }
    }
  }
}

async function cleanupAndInit() {
  const driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD));

  try {
    const now = new Date().toISOString();

    // 1. Delete all AINFRA-related nodes and relationships
    console.log('1. Cleaning up existing AINFRA structure...');

    // Delete nodes in separate transactions
    const deleteQueries = [
      { label: 'AIProviderConfig', query: 'MATCH (n:AIProviderConfig) DETACH DELETE n' },
      { label: 'AIConfigSet', query: 'MATCH (n:AIConfigSet) DETACH DELETE n' },
      { label: 'AIAlert', query: 'MATCH (n:AIAlert) DETACH DELETE n' },
      { label: 'AIUsageSnapshot', query: 'MATCH (n:AIUsageSnapshot) DETACH DELETE n' },
      { label: 'AINFRA', query: 'MATCH (n:AINFRA) DETACH DELETE n' },
    ];

    for (const { label, query } of deleteQueries) {
      try {
        await runWithNewSession(driver, query);
        console.log(`   ✅ Deleted ${label} nodes`);
      } catch (err) {
        if (err.message.includes('conflict')) {
          console.log(`   ⏳ Skipping ${label} (conflict), will retry...`);
        } else {
          console.log(`   ⚠️ ${label}: ${err.message}`);
        }
      }
    }

    console.log('');

    console.log('');

    // 2. Create fresh AINFRA root
    console.log('2. Creating AINFRA root node...');
    await runWithNewSession(driver, `
      CREATE (root:AINFRA {
        id: 'ainfra-root',
        name: 'AI Infrastructure',
        createdAt: $now,
        updatedAt: $now,
        version: '1.0'
      })
      RETURN root
    `, { now });
    console.log('   ✅ Created AINFRA root');

    console.log('');

    // 3. Create default config set with providers in one transaction
    console.log('3. Creating default configuration with providers...');
    const configId = `config-${uuidv4().substring(0, 8)}`;

    // Build provider creation queries
    const providerIds = {};
    for (const provider of Object.keys(DEFAULT_PROVIDER_CONFIGS)) {
      providerIds[provider] = `provider-${provider}-${uuidv4().substring(0, 8)}`;
    }

    await runWithNewSession(driver, `
      MATCH (root:AINFRA {id: 'ainfra-root'})
      CREATE (config:AIConfigSet {
        id: $configId,
        name: 'default',
        description: 'Default AI Configuration',
        createdAt: $now,
        updatedAt: $now
      })
      CREATE (root)-[:HAS_CONFIG]->(config)
      CREATE (root)-[:ACTIVE_CONFIG]->(config)

      // Gemini
      CREATE (gemini:AIProviderConfig {
        id: $geminiId,
        provider: 'gemini',
        displayName: 'Google Gemini',
        enabled: true,
        rpmLimit: 60,
        dailyTokenLimit: 1000000,
        dailyBudgetUsd: 10,
        defaultModel: 'gemini-pro-latest',
        costPerInputToken: 0.00025,
        costPerOutputToken: 0.0005,
        createdAt: $now,
        updatedAt: $now
      })
      CREATE (config)-[:USES_PROVIDER]->(gemini)

      // Anthropic
      CREATE (anthropic:AIProviderConfig {
        id: $anthropicId,
        provider: 'anthropic',
        displayName: 'Anthropic Claude',
        enabled: true,
        rpmLimit: 50,
        dailyTokenLimit: 500000,
        dailyBudgetUsd: 20,
        defaultModel: 'claude-sonnet-4-5-20250929',
        costPerInputToken: 0.003,
        costPerOutputToken: 0.015,
        createdAt: $now,
        updatedAt: $now
      })
      CREATE (config)-[:USES_PROVIDER]->(anthropic)

      // Ollama
      CREATE (ollama:AIProviderConfig {
        id: $ollamaId,
        provider: 'ollama',
        displayName: 'Meta Llama (Local)',
        enabled: true,
        rpmLimit: 100,
        dailyTokenLimit: null,
        dailyBudgetUsd: null,
        defaultModel: 'llama3.3:70b',
        costPerInputToken: 0,
        costPerOutputToken: 0,
        createdAt: $now,
        updatedAt: $now
      })
      CREATE (config)-[:USES_PROVIDER]->(ollama)

      RETURN config
    `, {
      configId,
      now,
      geminiId: providerIds.gemini,
      anthropicId: providerIds.anthropic,
      ollamaId: providerIds.ollama,
    });

    console.log(`   ✅ Created config set: ${configId}`);
    console.log('   ✅ Created all provider configurations');

    console.log('');

    // 4. Verify structure
    console.log('4. Verifying structure...');
    const verifyResult = await runWithNewSession(driver, `
      MATCH (root:AINFRA {id: 'ainfra-root'})
      OPTIONAL MATCH (root)-[:HAS_CONFIG]->(config:AIConfigSet)
      OPTIONAL MATCH (config)-[:USES_PROVIDER]->(provider:AIProviderConfig)
      OPTIONAL MATCH (root)-[:ACTIVE_CONFIG]->(activeConfig:AIConfigSet)
      RETURN
        count(DISTINCT config) as configCount,
        count(DISTINCT provider) as providerCount,
        activeConfig.name as activeConfigName
    `);

    const record = verifyResult.records[0];
    const configCount = record.get('configCount')?.toNumber?.() || record.get('configCount') || 0;
    const providerCount = record.get('providerCount')?.toNumber?.() || record.get('providerCount') || 0;
    const activeConfigName = record.get('activeConfigName');

    console.log(`   📊 Config sets: ${configCount}`);
    console.log(`   📊 Provider configs: ${providerCount}`);
    console.log(`   📊 Active config: ${activeConfigName}`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    throw error;
  } finally {
    await driver.close();
  }
}

console.log('');
cleanupAndInit()
  .then(() => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('Cleanup and initialization complete!');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
