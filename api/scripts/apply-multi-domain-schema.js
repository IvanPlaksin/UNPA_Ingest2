#!/usr/bin/env node
/**
 * Apply Multi-Domain Schema to Memgraph
 *
 * Usage:
 *   node api/scripts/apply-multi-domain-schema.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run  Show what would be executed without applying
 *   --force    Skip confirmation prompt
 */
require('dotenv').config();
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const MEMGRAPH_PASS = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || '';
const SCHEMA_FILE = path.join(__dirname, '../src/db/schemas/multi-domain-schema.cypher');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     UN ProjectAdvisor — Multi-Domain Schema Application      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Read schema file
  console.log('Reading schema file...');
  const schemaContent = fs.readFileSync(SCHEMA_FILE, 'utf-8');

  // Parse into individual statements (split by semicolon, filter comments/empty)
  const statements = schemaContent
    .split(';')
    .map(s => s.replace(/\/\/.*$/gm, '').trim())
    .filter(s => s.length > 0 && !s.startsWith('//'));

  console.log(`   Found ${statements.length} statements to execute`);
  console.log();

  // 2. Categorize statements
  const constraints = statements.filter(s => s.includes('CREATE CONSTRAINT'));
  const indexes = statements.filter(s => s.includes('CREATE INDEX'));
  const other = statements.filter(s => !s.includes('CREATE CONSTRAINT') && !s.includes('CREATE INDEX'));

  console.log('Statement breakdown:');
  console.log(`   Constraints: ${constraints.length}`);
  console.log(`   Indexes:     ${indexes.length}`);
  if (other.length > 0) console.log(`   Other:       ${other.length}`);
  console.log();

  if (dryRun) {
    console.log('[DRY RUN] Statements that would be executed:');
    console.log('-'.repeat(60));
    statements.forEach((stmt, i) => {
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim();
      console.log(`${String(i + 1).padStart(3)}. ${preview}${stmt.length > 80 ? '...' : ''}`);
    });
    console.log('-'.repeat(60));
    console.log('\nDry run complete. No changes made.');
    process.exit(0);
  }

  // 3. Confirm if not forced
  if (!force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question('This will modify the Memgraph schema. Continue? [y/N] ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // 4. Connect to Memgraph
  console.log('\nConnecting to Memgraph...');
  const driver = neo4j.driver(MEMGRAPH_URI, neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS));
  const session = driver.session();

  try {
    // 5. Verify connection
    await session.run('RETURN 1');
    console.log(`   Connected to ${MEMGRAPH_URI}`);

    // 6. Apply schema
    console.log('\nApplying schema...');
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const stmt of statements) {
      try {
        await session.run(stmt);
        successCount++;
        process.stdout.write('.');
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('Already exists')) {
          skipCount++;
          process.stdout.write('s');
        } else {
          errorCount++;
          errors.push({ stmt: stmt.substring(0, 60).replace(/\n/g, ' '), error: err.message });
          process.stdout.write('x');
        }
      }
    }
    console.log('\n');

    // 7. Report
    console.log('Results:');
    console.log(`   Applied:  ${successCount}`);
    console.log(`   Skipped:  ${skipCount} (already exist)`);
    console.log(`   Errors:   ${errorCount}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`   ${e.stmt}... -> ${e.error}`));
    }

    // 8. Verify
    console.log('\nVerification:');
    try {
      const cResult = await session.run('SHOW CONSTRAINT INFO');
      console.log(`   Total constraints: ${cResult.records.length}`);
    } catch (_) {
      // Memgraph may not support SHOW CONSTRAINT INFO
      console.log('   (Constraint count unavailable)');
    }
    try {
      const iResult = await session.run('SHOW INDEX INFO');
      console.log(`   Total indexes: ${iResult.records.length}`);
    } catch (_) {
      console.log('   (Index count unavailable)');
    }

    console.log('\nSchema application complete!');

  } finally {
    await session.close();
    await driver.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
