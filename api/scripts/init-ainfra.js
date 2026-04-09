/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA Initialization Script
 * Manually initializes the AINFRA graph structure
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage: node api/scripts/init-ainfra.js
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
console.log('AINFRA Initialization');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Connecting to: ${MEMGRAPH_URI}`);
console.log('');

async function initAINFRA() {
  const driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD));
  const session = driver.session();

  try {
    const now = new Date().toISOString();

    // 1. Check if default config exists
    console.log('1. Checking existing configuration...');
    const existingResult = await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})
      -[:HAS_CONFIG]->(config:AIConfigSet {name: 'default'})
      RETURN config
    `);

    if (existingResult.records.length > 0) {
      console.log('   ✅ Default configuration already exists');
      return;
    }

    console.log('   ℹ️ Default configuration not found, creating...');
    console.log('');

    // 2. Create default config set
    console.log('2. Creating default configuration set...');
    const configId = `config-${uuidv4().substring(0, 8)}`;

    await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})
      CREATE (config:AIConfigSet {
        id: $configId,
        name: 'default',
        description: 'Default AI Configuration',
        createdAt: $now,
        updatedAt: $now
      })
      CREATE (root)-[:HAS_CONFIG]->(config)
      RETURN config
    `, { configId, now });

    console.log(`   ✅ Created config set: ${configId}`);
    console.log('');

    // 3. Create provider configurations
    console.log('3. Creating provider configurations...');

    for (const [provider, config] of Object.entries(DEFAULT_PROVIDER_CONFIGS)) {
      const providerId = `provider-${provider}-${uuidv4().substring(0, 8)}`;

      await session.run(`
        MATCH (configSet:AIConfigSet {id: $configSetId})
        CREATE (p:AIProviderConfig {
          id: $providerId,
          provider: $provider,
          displayName: $displayName,
          enabled: $enabled,
          rpmLimit: $rpmLimit,
          dailyTokenLimit: $dailyTokenLimit,
          dailyBudgetUsd: $dailyBudgetUsd,
          defaultModel: $defaultModel,
          costPerInputToken: $costPerInputToken,
          costPerOutputToken: $costPerOutputToken,
          createdAt: $now,
          updatedAt: $now
        })
        CREATE (configSet)-[:USES_PROVIDER]->(p)
        RETURN p
      `, {
        configSetId: configId,
        providerId,
        provider: config.provider,
        displayName: config.displayName,
        enabled: config.enabled,
        rpmLimit: config.rpmLimit,
        dailyTokenLimit: config.dailyTokenLimit,
        dailyBudgetUsd: config.dailyBudgetUsd,
        defaultModel: config.defaultModel,
        costPerInputToken: config.costPerInputToken,
        costPerOutputToken: config.costPerOutputToken,
        now,
      });

      console.log(`   ✅ Created provider: ${config.displayName}`);
    }

    console.log('');

    // 4. Set as active
    console.log('4. Setting as active configuration...');
    await session.run(`
      MATCH (root:AINFRA {id: 'ainfra-root'})
      OPTIONAL MATCH (root)-[oldRel:ACTIVE_CONFIG]->()
      DELETE oldRel
      WITH root
      MATCH (root)-[:HAS_CONFIG]->(config:AIConfigSet {name: 'default'})
      CREATE (root)-[:ACTIVE_CONFIG]->(config)
      RETURN config
    `);

    console.log('   ✅ Default configuration is now active');

  } catch (error) {
    console.error('Error initializing AINFRA:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

console.log('');
initAINFRA()
  .then(() => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('Initialization complete!');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
