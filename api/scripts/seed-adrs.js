/**
 * CC-032: Seed ADRs into Memgraph
 *
 * Creates ADR nodes in META namespace with RELATED_TO edges between them.
 *
 * Usage: node api/scripts/seed-adrs.js
 */

'use strict';

const neo4j = require('neo4j-driver');

const BOLT_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USERNAME || 'memgraph';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'secret_password_123';

const ADRs = [
  {
    id: 'adr-001',
    adrId: 'ADR-001',
    title: 'Memgraph as Knowledge Graph Store',
    status: 'ACCEPTED',
    date: '2025-01-15',
    author: 'Architecture Team',
    context: 'Need graph database for knowledge storage with complex relationships',
    decision: 'Use Memgraph for primary knowledge graph store',
    file: 'docs/codex/adr/ADR-001-memgraph-knowledge-graph.md',
    relatedTo: ['ADR-005', 'ADR-003']
  },
  {
    id: 'adr-002',
    adrId: 'ADR-002',
    title: 'GXE AOPEG Execution Model',
    status: 'ACCEPTED',
    date: '2025-02-01',
    author: 'Architecture Team',
    context: 'Need execution engine for extracted business logic graphs',
    decision: 'Implement AOPEG model with RuntimeEngine',
    file: 'docs/codex/adr/ADR-002-gxe-aopeg-execution.md',
    relatedTo: ['ADR-001', 'ADR-005']
  },
  {
    id: 'adr-003',
    adrId: 'ADR-003',
    title: 'Four-Namespace Architecture',
    status: 'ACCEPTED',
    date: '2025-02-15',
    author: 'Architecture Team',
    context: 'Need clear separation between system meta and project data',
    decision: 'Organize all nodes into CORE, PROJECT, META, GXE namespaces',
    file: 'docs/codex/adr/ADR-003-four-namespace-architecture.md',
    relatedTo: ['ADR-001', 'ADR-006']
  },
  {
    id: 'adr-004',
    adrId: 'ADR-004',
    title: 'Bi-temporal Versioning with Hash Chain',
    status: 'ACCEPTED',
    date: '2025-02-20',
    author: 'Architecture Team',
    context: 'Need audit trail and temporal queries for knowledge changes',
    decision: 'Implement bi-temporal model with cryptographic hash chain',
    file: 'docs/codex/adr/ADR-004-bitemporal-versioning.md',
    relatedTo: ['ADR-001', 'ADR-006']
  },
  {
    id: 'adr-005',
    adrId: 'ADR-005',
    title: 'Polystore Architecture',
    status: 'ACCEPTED',
    date: '2025-02-25',
    author: 'Architecture Team',
    context: 'Different data patterns need different storage technologies',
    decision: 'Use Memgraph + Qdrant + Redis polystore',
    file: 'docs/codex/adr/ADR-005-polystore-architecture.md',
    relatedTo: ['ADR-001', 'ADR-003']
  },
  {
    id: 'adr-006',
    adrId: 'ADR-006',
    title: 'Information Types Classification',
    status: 'ACCEPTED',
    date: '2025-03-12',
    author: 'Architecture Team',
    context: 'Need systematic categorization of all information in knowledge base',
    decision: 'Classify into 17 Information Types across two levels',
    file: 'docs/codex/adr/ADR-006-information-types.md',
    relatedTo: ['ADR-003', 'ADR-004']
  }
];

async function main() {
  console.log('=== CC-032: Seeding ADRs ===\n');

  const driver = neo4j.driver(BOLT_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session();

  try {
    // Create ADR nodes
    for (const adr of ADRs) {
      await session.run(`
        MERGE (a:ADR {id: $id})
        SET a.adrId = $adrId,
            a.title = $title,
            a.status = $status,
            a.date = $date,
            a.author = $author,
            a.context = $context,
            a.decision = $decision,
            a.file = $file,
            a.namespace = 'META',
            a.createdAt = $now
      `, {
        id: adr.id,
        adrId: adr.adrId,
        title: adr.title,
        status: adr.status,
        date: adr.date,
        author: adr.author,
        context: adr.context,
        decision: adr.decision,
        file: adr.file,
        now: new Date().toISOString()
      });
      console.log(`  + ${adr.adrId}: ${adr.title}`);
    }

    // Create RELATED_TO edges
    console.log('\nCreating relationships...');
    for (const adr of ADRs) {
      for (const relatedAdrId of adr.relatedTo) {
        const relatedAdr = ADRs.find(a => a.adrId === relatedAdrId);
        if (relatedAdr) {
          await session.run(`
            MATCH (a:ADR {id: $fromId}), (b:ADR {id: $toId})
            MERGE (a)-[:RELATED_TO]->(b)
          `, { fromId: adr.id, toId: relatedAdr.id });
        }
      }
    }

    // Verify
    const countResult = await session.run('MATCH (a:ADR) RETURN count(a) as c');
    const count = countResult.records[0].get('c');
    console.log(`\nADR nodes: ${count}`);

    const edgeResult = await session.run('MATCH (:ADR)-[r:RELATED_TO]->(:ADR) RETURN count(r) as c');
    const edges = edgeResult.records[0].get('c');
    console.log(`RELATED_TO edges: ${edges}`);

    // List all
    console.log('\n=== ADR Index ===');
    const allResult = await session.run('MATCH (a:ADR) RETURN a.adrId as id, a.title as title, a.status as status ORDER BY a.adrId');
    allResult.records.forEach(r => {
      console.log(`  ${r.get('id')}: ${r.get('title')} [${r.get('status')}]`);
    });

    console.log('\n=== CC-032 Seed Complete ===');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
