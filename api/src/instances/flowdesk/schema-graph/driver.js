'use strict';

/**
 * Shared Memgraph driver for the FlowDesk schema-graph (C1).
 * Thin wrapper over neo4j-driver using the instance MEMGRAPH_CONFIG.
 *
 * @module instances/flowdesk/schema-graph/driver
 */

const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('../services/import-config.js');

let _driver;

function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(
      MEMGRAPH_CONFIG.uri,
      neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
      { disableLosslessIntegers: true, maxConnectionPoolSize: 5 }
    );
  }
  return _driver;
}

/**
 * Run one statement inside a MANAGED transaction (BACKLOG-0054).
 *
 * Memgraph uses optimistic concurrency: two transactions that touch overlapping
 * state at once fail one of them with
 *   `Memgraph.TransientError...: Cannot resolve conflicting transactions`
 * — flagged `retriable: true` by the driver. This is exactly what happened when
 * several FlowDesk suites (schema-graph, draft-sr, resolve-search) ran in
 * parallel, and — crucially — also when the live API on :3010 wrote to Memgraph
 * during a test run. The conflict is transient: the losing transaction is rolled
 * back whole, and simply re-running it after the winner commits succeeds.
 *
 * `session.executeWrite/Read` is the driver's built-in retry loop for precisely
 * these transient errors (exponential backoff + jitter, up to
 * maxTransactionRetryTime). Serializing the suites would only cover suite-vs-suite;
 * it cannot touch suite-vs-API. Retry covers both, which is why it is the fix.
 *
 * The work callback must be idempotent because it may run more than once — every
 * statement here is deterministic in its params, and a rolled-back transaction
 * leaves nothing behind, so CREATE cannot double-apply.
 */
async function run(cypher, params = {}, accessMode = neo4j.session.WRITE) {
  const session = getDriver().session({ defaultAccessMode: accessMode });
  try {
    const work = (tx) => tx.run(cypher, params);
    const res = accessMode === neo4j.session.READ
      ? await session.executeRead(work)
      : await session.executeWrite(work);
    return res.records;
  } finally {
    await session.close();
  }
}

/** Transient errors worth retrying by hand (see runAutocommit). */
function isTransient(err) {
  if (!err) return false;
  if (err.retriable === true) return true;
  const msg = err.message || '';
  // Building an index needs exclusive storage access, which fails under
  // concurrent queries with this message; it clears once they drain.
  return /read only access to the storage|conflicting transaction/i.test(msg);
}

/**
 * Run a statement in an AUTO-COMMIT (implicit) transaction, with a hand-rolled
 * retry for transient failures.
 *
 * Memgraph forbids DDL such as `CREATE INDEX` inside a managed/explicit
 * transaction ("Index manipulation is not allowed in multicommand transactions"),
 * which is exactly what `run()` now uses — so index creation cannot go through the
 * driver's built-in retry loop and needs its own. Index DDL takes an exclusive
 * storage lock and, under concurrent queries (parallel test suites, the live API),
 * fails with "Cannot get read only access to the storage"; the operation is
 * idempotent, so retrying after the contention drains is safe (BACKLOG-0054).
 */
async function runAutocommit(cypher, params = {}, { retries = 5 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      const res = await session.run(cypher, params);
      return res.records;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt)); // 50,100,200,400,800ms
    } finally {
      await session.close();
    }
  }
  throw lastErr;
}

const read = (cypher, params) => run(cypher, params, neo4j.session.READ);
const write = (cypher, params) => run(cypher, params, neo4j.session.WRITE);

async function close() {
  if (_driver) { await _driver.close(); _driver = null; }
}

module.exports = { getDriver, run, read, write, runAutocommit, close, neo4j };
