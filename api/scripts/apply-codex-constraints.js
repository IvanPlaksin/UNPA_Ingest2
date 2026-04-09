/**
 * Apply Cypher constraints for Codex namespace
 * Run once during setup
 */

const neo4j = require('neo4j-driver');

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';

const CONSTRAINTS = [
  // Existence constraints
  "CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexDefinition) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexConstraint) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexPattern) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexProposal) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexStakeholder) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexSection) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexVersion) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:CodexDecision) ASSERT EXISTS (n.codexId)",
  "CREATE CONSTRAINT ON (n:BlackCodexEntry) ASSERT EXISTS (n.codexId)",

  // Uniqueness constraints
  "CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexRule) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexDefinition) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexConstraint) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexPattern) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexProposal) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexStakeholder) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexSection) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexVersion) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:CodexDecision) ASSERT n.codexId IS UNIQUE",
  "CREATE CONSTRAINT ON (n:BlackCodexEntry) ASSERT n.codexId IS UNIQUE"
];

const INDEXES = [
  "CREATE INDEX ON :CodexPrinciple(codexId)",
  "CREATE INDEX ON :CodexRule(codexId)",
  "CREATE INDEX ON :CodexRule(status)",
  "CREATE INDEX ON :CodexRule(modality)",
  "CREATE INDEX ON :CodexRule(changeabilityTier)",
  "CREATE INDEX ON :CodexDefinition(codexId)",
  "CREATE INDEX ON :CodexConstraint(codexId)",
  "CREATE INDEX ON :CodexPattern(codexId)",
  "CREATE INDEX ON :CodexProposal(codexId)",
  "CREATE INDEX ON :CodexProposal(reviewStatus)",
  "CREATE INDEX ON :CodexSection(codexId)",
  "CREATE INDEX ON :CodexStakeholder(codexId)",
  "CREATE INDEX ON :BlackCodexEntry(codexId)",
  "CREATE INDEX ON :BlackCodexEntry(type)"
];

async function applyConstraints() {
  const driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD));
  const session = driver.session();

  console.log('Applying Codex constraints to Memgraph...\n');

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  // Apply constraints
  console.log('Constraints:');
  for (const constraint of CONSTRAINTS) {
    try {
      await session.run(constraint);
      console.log(`   + ${constraint.substring(0, 70)}...`);
      applied++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('Constraint already')) {
        console.log(`   ~ Already exists: ${constraint.substring(0, 55)}...`);
        skipped++;
      } else {
        console.error(`   x Failed: ${err.message}`);
        failed++;
      }
    }
  }

  // Apply indexes
  console.log('\nIndexes:');
  for (const index of INDEXES) {
    try {
      await session.run(index);
      console.log(`   + ${index}`);
      applied++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('Index already')) {
        console.log(`   ~ Already exists: ${index.substring(0, 55)}...`);
        skipped++;
      } else {
        console.error(`   x Failed: ${err.message}`);
        failed++;
      }
    }
  }

  await session.close();
  await driver.close();

  console.log('\n' + '='.repeat(50));
  console.log(`Complete: ${applied} applied, ${skipped} skipped, ${failed} failed`);
  console.log('='.repeat(50));
}

applyConstraints().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
