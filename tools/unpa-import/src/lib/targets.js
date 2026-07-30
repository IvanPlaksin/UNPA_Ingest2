'use strict';

/**
 * Target connection factories for the import commands (plan/apply).
 * neo4j-driver and @qdrant/js-client-rest are resolved the same way the UGP lib
 * resolves them (own node_modules when vendored, or the repo's api/node_modules).
 */

const ugp = require('./ugp-adapter'); // ensures the UGP lib (and its deps tree) is resolvable

function requireDep(name) {
    // Resolve from wherever the UGP lib resolved its own copy (repo or vendored).
    return require(name);
}

/**
 * Create a Memgraph (Bolt) driver from config.
 * @param {object} cfg - config.memgraph { uri, user, password }
 */
function createMemgraphDriver(cfg) {
    const neo4j = requireDep('neo4j-driver');
    const auth = cfg.user ? neo4j.auth.basic(cfg.user, cfg.password) : undefined;
    const driver = neo4j.driver(cfg.uri, auth, { disableLosslessIntegers: true });
    return { neo4j, driver };
}

/**
 * Create a Qdrant REST client from config.
 * @param {object} cfg - config.qdrant { url, apiKey }
 */
function createQdrantClient(cfg) {
    const { QdrantClient } = requireDep('@qdrant/js-client-rest');
    // checkCompatibility:false — the bundled client (1.18.x) is one minor ahead of
    // the dev server (1.16.x); the REST surface we use is stable, so skip the noisy warning.
    const base = { url: cfg.url, checkCompatibility: false };
    return new QdrantClient(cfg.apiKey ? { ...base, apiKey: cfg.apiKey } : base);
}

module.exports = { createMemgraphDriver, createQdrantClient, ugp };
