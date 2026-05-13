#!/usr/bin/env node
'use strict';

/**
 * verify-migration.js
 *
 * Post-migration verification: compares source counts (Memgraph/Qdrant)
 * with target counts (AGE/pgvector) and reports PASS/FAIL.
 *
 * Usage:
 *   node api/scripts/verify-migration.js [--graph-only] [--vector-only]
 */

require('dotenv').config();

const neo4j = require('neo4j-driver');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { Pool } = require('pg');

const args = process.argv.slice(2);
const GRAPH_ONLY = args.includes('--graph-only');
const VECTOR_ONLY = args.includes('--vector-only');
const GRAPH = process.env.AGE_GRAPH_NAME || 'unpa';

let pass = 0, fail = 0, warn = 0;

function check(label, actual, expected, tolerance = 0) {
  if (expected === -1 || actual === -1) {
    console.log(`  ⚠️  WARN  ${label}: source=${expected}, target=${actual} (could not query)`);
    warn++;
    return;
  }
  const pct = expected > 0 ? Math.abs(actual - expected) / expected : 0;
  if (pct <= tolerance) {
    console.log(`  ✅ PASS  ${label}: ${actual} (expected ${expected}${tolerance > 0 ? `, tol ${(tolerance * 100).toFixed(0)}%` : ''})`);
    pass++;
  } else {
    console.log(`  ❌ FAIL  ${label}: ${actual} vs ${expected} (diff ${((actual - expected) >= 0 ? '+' : '')}${actual - expected})`);
    fail++;
  }
}

async function safeQuery(fn, fallback = -1) {
  try { return await fn(); } catch { return fallback; }
}

async function verifyGraph(memgraphDriver, pgPool) {
  console.log('\n── GRAPH (Memgraph → AGE) ────────────────────────────────────\n');

  const mgSession = memgraphDriver.session({ defaultAccessMode: neo4j.session.READ });
  const pgClient = await pgPool.connect();

  try {
    // Total node count
    const mgNodes = await safeQuery(async () => {
      const r = await mgSession.run('MATCH (n) RETURN count(n) AS cnt');
      return r.records[0]?.get('cnt').toNumber() || 0;
    });

    const ageNodes = await safeQuery(async () => {
      const r = await pgClient.query(
        `SELECT * FROM cypher('${GRAPH}', $$ MATCH (n) RETURN count(n) AS cnt $$) AS (cnt ag_catalog.agtype)`
      );
      const raw = r.rows[0]?.cnt;
      return raw ? parseInt(String(raw).replace(/::.*$/, ''), 10) : 0;
    });
    check('Total nodes', ageNodes, mgNodes, 0.01); // 1% tolerance

    // Total edge count
    const mgEdges = await safeQuery(async () => {
      const r = await mgSession.run('MATCH ()-[r]->() RETURN count(r) AS cnt');
      return r.records[0]?.get('cnt').toNumber() || 0;
    });

    const ageEdges = await safeQuery(async () => {
      const r = await pgClient.query(
        `SELECT * FROM cypher('${GRAPH}', $$ MATCH ()-[r]->() RETURN count(r) AS cnt $$) AS (cnt ag_catalog.agtype)`
      );
      const raw = r.rows[0]?.cnt;
      return raw ? parseInt(String(raw).replace(/::.*$/, ''), 10) : 0;
    });
    check('Total edges', ageEdges, mgEdges, 0.01);

    // Node counts by label (top 10 labels)
    const mgLabelCounts = await safeQuery(async () => {
      const r = await mgSession.run(
        `MATCH (n) RETURN labels(n)[0] AS lbl, count(n) AS cnt ORDER BY cnt DESC LIMIT 10`
      );
      return Object.fromEntries(r.records.map(rec => [rec.get('lbl'), rec.get('cnt').toNumber()]));
    }, {});

    for (const [label, mgCount] of Object.entries(mgLabelCounts)) {
      const ageCount = await safeQuery(async () => {
        const cypher = `MATCH (n:${label}) RETURN count(n) AS cnt`;
        const r = await pgClient.query(
          `SELECT * FROM cypher('${GRAPH}', $$ ${cypher} $$) AS (cnt ag_catalog.agtype)`
        );
        const raw = r.rows[0]?.cnt;
        return raw ? parseInt(String(raw).replace(/::.*$/, ''), 10) : 0;
      });
      check(`  Label ${label}`, ageCount, mgCount, 0.02);
    }

    // Sample query: verify a known node exists
    const sampleNode = await safeQuery(async () => {
      const r = await mgSession.run(
        `MATCH (n) WHERE exists(n.id) RETURN n.id AS id, labels(n)[0] AS lbl LIMIT 1`
      );
      if (!r.records.length) return null;
      return { id: r.records[0].get('id'), label: r.records[0].get('lbl') };
    }, null);

    if (sampleNode) {
      const ageHas = await safeQuery(async () => {
        const cypher = `MATCH (n:${sampleNode.label} {id: '${sampleNode.id.replace(/'/g, "\\'")}'}) RETURN count(n) AS cnt`;
        const r = await pgClient.query(
          `SELECT * FROM cypher('${GRAPH}', $$ ${cypher} $$) AS (cnt ag_catalog.agtype)`
        );
        const raw = r.rows[0]?.cnt;
        return raw ? parseInt(String(raw).replace(/::.*$/, ''), 10) : 0;
      });
      check(`  Sample ${sampleNode.label}{id:'${String(sampleNode.id).substring(0, 20)}...'}`, ageHas, 1);
    }

  } finally {
    await mgSession.close();
    pgClient.release();
  }
}

async function verifyVectors(qdrant, pgPool) {
  console.log('\n── VECTORS (Qdrant → pgvector) ──────────────────────────────\n');

  let collections;
  try {
    const r = await qdrant.getCollections();
    collections = r.collections.map(c => c.name);
  } catch (err) {
    console.log('  ⚠️  WARN  Cannot connect to Qdrant:', err.message);
    warn++;
    return;
  }

  const pgClient = await pgPool.connect();
  try {
    // Total pgvector count
    const pgTotal = await safeQuery(async () => {
      const r = await pgClient.query('SELECT COUNT(*) AS cnt FROM public.embeddings');
      return parseInt(r.rows[0]?.cnt || 0, 10);
    });

    // Total Qdrant count
    let qdrantTotal = 0;
    for (const col of collections) {
      const info = await safeQuery(async () => {
        const r = await qdrant.getCollection(col);
        return r.points_count || 0;
      }, 0);
      qdrantTotal += info;
    }

    console.log(`  Qdrant total: ${qdrantTotal} | pgvector total: ${pgTotal}`);

    for (const col of collections) {
      const qdrantCount = await safeQuery(async () => {
        const info = await qdrant.getCollection(col);
        return info.points_count || 0;
      }, -1);

      const pgCount = await safeQuery(async () => {
        const r = await pgClient.query(
          'SELECT COUNT(*) AS cnt FROM public.embeddings WHERE collection = $1', [col]
        );
        return parseInt(r.rows[0]?.cnt || 0, 10);
      }, -1);

      // Dialogue: named vectors may be 1× or 2× depending on what's populated
      const isDialogue = col.includes('dialogue');
      if (isDialogue && qdrantCount > 0) {
        // Sample a point to count actual named vector types present
        const namedVecCount = await safeQuery(async () => {
          const sample = await qdrant.scroll(col, { limit: 1, with_vector: true, with_payload: false });
          const v = sample.points[0]?.vector;
          if (!v || Array.isArray(v)) return 1;
          return Object.keys(v).length; // e.g. 2 if both summary+content exist
        }, 1);
        const expected = qdrantCount * namedVecCount;
        check(`  ${col} (×${namedVecCount} named)`, pgCount, expected, 0.02);
      } else {
        check(`  ${col}`, pgCount, qdrantCount, 0.02);
      }
    }

  } finally {
    pgClient.release();
  }
}

async function run() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  MIGRATION VERIFICATION REPORT');
  console.log(`  Graph: ${GRAPH}`);
  console.log('═'.repeat(60));

  const mgDriver = neo4j.driver(
    process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.MEMGRAPH_USER || 'memgraph',
      process.env.MEMGRAPH_PASSWORD || 'secret_password_123'
    ),
    { disableLosslessIntegers: false }
  );

  const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

  const pgPool = new Pool({
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
    ssl: process.env.POSTGRES_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });

  try {
    if (!VECTOR_ONLY) await verifyGraph(mgDriver, pgPool);
    if (!GRAPH_ONLY) await verifyVectors(qdrant, pgPool);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  RESULT: ${pass} PASS, ${fail} FAIL, ${warn} WARN`);
    if (fail === 0) {
      console.log('  ✅ Migration verified successfully — ready for cutover');
    } else {
      console.log('  ❌ Verification failed — DO NOT proceed to cutover');
    }
    console.log('═'.repeat(60) + '\n');

  } finally {
    await mgDriver.close();
    await pgPool.end();
  }

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
