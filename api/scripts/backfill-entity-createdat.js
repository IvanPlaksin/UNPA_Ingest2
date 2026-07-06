'use strict';
/**
 * Backfills createdAt for ESEntity nodes that lack it.
 * Sets createdAt = updatedAt where updatedAt exists, otherwise sets current time.
 * Safe to run multiple times (idempotent).
 *
 * Usage: node api/scripts/backfill-entity-createdat.js
 */

const neo4j = require('neo4j-driver');

const BOLT_URL  = process.env.MEMGRAPH_URL      || 'bolt://localhost:7687';
const USER      = process.env.MEMGRAPH_USER     || 'memgraph';
const PASSWORD  = process.env.MEMGRAPH_PASSWORD || 'secret_password_123';

async function run() {
    const driver = neo4j.driver(BOLT_URL, neo4j.auth.basic(USER, PASSWORD));
    const session = driver.session();
    const now = new Date().toISOString();

    try {
        // 1. Count entities missing createdAt
        const countRes = await session.run(
            'MATCH (e:ESEntity) WHERE e.createdAt IS NULL RETURN count(e) AS cnt'
        );
        const missing = countRes.records[0]?.get('cnt')?.low ?? countRes.records[0]?.get('cnt') ?? 0;
        console.log(`Entities missing createdAt: ${missing}`);

        if (missing === 0) {
            console.log('Nothing to do.');
            return;
        }

        // 2. Set createdAt = updatedAt where updatedAt is available
        const r1 = await session.run(
            `MATCH (e:ESEntity)
             WHERE e.createdAt IS NULL AND e.updatedAt IS NOT NULL
             SET e.createdAt = e.updatedAt
             RETURN count(e) AS fixed`
        );
        const fixedFromUpdated = r1.records[0]?.get('fixed')?.low ?? r1.records[0]?.get('fixed') ?? 0;
        console.log(`  Set createdAt = updatedAt for ${fixedFromUpdated} entities`);

        // 3. For remaining (both null) — set current time
        const r2 = await session.run(
            `MATCH (e:ESEntity)
             WHERE e.createdAt IS NULL
             SET e.createdAt = $now, e.updatedAt = $now
             RETURN count(e) AS fixed`,
            { now }
        );
        const fixedFromNow = r2.records[0]?.get('fixed')?.low ?? r2.records[0]?.get('fixed') ?? 0;
        console.log(`  Set createdAt = now() for ${fixedFromNow} entities (both fields were null)`);

        console.log(`Done. Total fixed: ${fixedFromUpdated + fixedFromNow}`);
    } finally {
        await session.close();
        await driver.close();
    }
}

run().catch(err => { console.error(err); process.exit(1); });
