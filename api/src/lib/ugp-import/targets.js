'use strict';

/**
 * Target connection factories for the server-side import engine (Phase 0).
 *
 * Mirrors tools/unpa-import/src/lib/targets.js, but resolves the shared UGP
 * library and its runtime deps directly from the api package (this code runs
 * INSIDE the api process/container, which already carries neo4j-driver and
 * @qdrant/js-client-rest). Keeping this thin factory here lets planner.js and
 * import-engine.js be copied verbatim from the CLI (single source of behaviour).
 */

const ugp = require('../ugp');

function createMemgraphDriver(cfg) {
    const neo4j = require('neo4j-driver');
    const auth = cfg.user ? neo4j.auth.basic(cfg.user, cfg.password) : undefined;
    const driver = neo4j.driver(cfg.uri, auth, { disableLosslessIntegers: true });
    return { neo4j, driver };
}

function createQdrantClient(cfg) {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const base = { url: cfg.url, checkCompatibility: false };
    return new QdrantClient(cfg.apiKey ? { ...base, apiKey: cfg.apiKey } : base);
}

module.exports = { createMemgraphDriver, createQdrantClient, ugp };
