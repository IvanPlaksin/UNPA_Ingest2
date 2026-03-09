#!/usr/bin/env node
/**
 * Apply Multi-Domain Schema to Memgraph (Memgraph-compatible syntax)
 * Uses session-per-statement to avoid connection issues.
 */
require('dotenv').config();
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

const SCHEMA_FILE = path.join(__dirname, '../src/db/schemas/multi-domain-schema.cypher');

function translateToMemgraph(stmt) {
  // Constraint: neo4j 4.x → Memgraph
  const cm = stmt.match(
    /CREATE\s+CONSTRAINT\s+\w+\s+IF\s+NOT\s+EXISTS\s+FOR\s+\((\w+):(\w+)\)\s+REQUIRE\s+\1\.(\w+)\s+IS\s+UNIQUE/i
  );
  if (cm) {
    return `CREATE CONSTRAINT ON (${cm[1]}:${cm[2]}) ASSERT ${cm[1]}.${cm[3]} IS UNIQUE`;
  }

  // Node index: neo4j 4.x → Memgraph
  const nim = stmt.match(
    /CREATE\s+INDEX\s+\w+\s+IF\s+NOT\s+EXISTS\s+FOR\s+\(\w+:(\w+)\)\s+ON\s+\(\w+\.(\w+)\)/i
  );
  if (nim) {
    return `CREATE INDEX ON :${nim[1]}(${nim[2]})`;
  }

  // Edge index: neo4j 4.x → Memgraph
  const eim = stmt.match(
    /CREATE\s+INDEX\s+\w+\s+IF\s+NOT\s+EXISTS\s+FOR\s+\(\)-\[\w+:(\w+)\]-\(\)\s+ON\s+\(\w+\.(\w+)\)/i
  );
  if (eim) {
    return `CREATE INDEX ON :${eim[1]}(${eim[2]})`;
  }

  return stmt;
}

async function main() {
  const raw = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  const stmts = raw.split(';')
    .map(s => s.replace(/\/\/.*$/gm, '').trim())
    .filter(s => s.length > 0 && s.startsWith('CREATE'));

  const translated = stmts.map(s => translateToMemgraph(s));

  console.log(`Applying ${translated.length} statements to Memgraph...`);

  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('memgraph', 'secret_password_123')
  );

  let ok = 0, skip = 0, fail = 0;
  const errors = [];

  for (const stmt of translated) {
    const session = driver.session();
    try {
      await session.run(stmt);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('Already exists')) {
        skip++;
        process.stdout.write('s');
      } else {
        fail++;
        errors.push({ stmt: stmt.substring(0, 70), err: e.message });
        process.stdout.write('x');
      }
    } finally {
      await session.close();
    }
  }

  console.log('\n');
  console.log(`Applied: ${ok} | Skipped: ${skip} | Errors: ${fail}`);
  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  ${e.stmt}  -->  ${e.err}`));
  }

  // Verify
  const vs = driver.session();
  try {
    const ci = await vs.run('SHOW CONSTRAINT INFO');
    console.log(`\nTotal constraints in DB: ${ci.records.length}`);
  } catch (_) {
    console.log('\n(SHOW CONSTRAINT INFO not supported)');
  }
  try {
    const ii = await vs.run('SHOW INDEX INFO');
    console.log(`Total indexes in DB: ${ii.records.length}`);
  } catch (_) {
    console.log('(SHOW INDEX INFO not supported)');
  }
  await vs.close();
  await driver.close();
  console.log('\nDone.');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
