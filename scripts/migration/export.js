#!/usr/bin/env node
'use strict';
/**
 * export.js — Export all UNPA project databases to a local snapshot directory.
 *
 * Exports:
 *   Memgraph → Cypher statements (.cypherl) via mgconsole inside Docker
 *   Qdrant   → Binary snapshots (.snapshot) per collection via Snapshot REST API
 *   Redis    → RDB binary dump (.rdb) via BGSAVE + docker cp
 *
 * Usage:
 *   node scripts/migration/export.js
 *   node scripts/migration/export.js --dir ./backups/my-snapshot
 *   node scripts/migration/export.js --skip-redis
 *   node scripts/migration/export.js --skip-qdrant
 *   node scripts/migration/export.js --skip-memgraph
 *
 * Environment variables (all have dev defaults):
 *   MEMGRAPH_CONTAINER   default: projectadvisor-memgraph
 *   MEMGRAPH_USER        default: memgraph
 *   MEMGRAPH_PASSWORD    default: secret_password_123
 *   QDRANT_URL           default: http://localhost:6333
 *   REDIS_CONTAINER      default: projectadvisor-redis
 *
 * Requirements: Node.js 20+, Docker with containers running.
 * No npm install needed — uses only Node.js built-in modules.
 */

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

// ─── Configuration ────────────────────────────────────────────────────────────

const CFG = {
  memgraph: {
    container: process.env.MEMGRAPH_CONTAINER ?? 'projectadvisor-memgraph',
    user:      process.env.MEMGRAPH_USER       ?? 'memgraph',
    password:  process.env.MEMGRAPH_PASSWORD   ?? 'secret_password_123',
  },
  qdrant: {
    url: (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, ''),
  },
  redis: {
    container: process.env.REDIS_CONTAINER ?? 'projectadvisor-redis',
  },
};

// ─── CLI Arguments ────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getFlag = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name) => args.includes(name);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outRoot   = getFlag('--dir') ?? path.join('backups', timestamp);

const SKIP = {
  memgraph: hasFlag('--skip-memgraph'),
  qdrant:   hasFlag('--skip-qdrant'),
  redis:    hasFlag('--skip-redis'),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const log  = (tag, msg) => console.log(`[${tag.padEnd(8)}] ${msg}`);
const die  = (msg) => { console.error(`\n[FATAL] ${msg}`); process.exit(1); };

function sleepSync(ms) {
  // Synchronous sleep acceptable in a migration script context
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dockerExec(containerArgs, stdinData = null) {
  const opts = { encoding: 'buffer', maxBuffer: 700 * 1024 * 1024 };
  if (stdinData !== null) opts.input = stdinData;
  return spawnSync('docker', containerArgs, opts);
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}\n${await res.text()}`);
  return res.json();
}

// ─── Memgraph Export ──────────────────────────────────────────────────────────

function exportMemgraph(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, 'memgraph_dump.cypherl');
  const { container, user, password } = CFG.memgraph;

  log('memgraph', `Dumping from container '${container}'...`);

  const mgArgs = [
    'exec', '-i', container,
    'mgconsole',
    '--host', '127.0.0.1', '--port', '7687',
    '--username', user, '--password', password,
    '--output-format', 'cypherl',
    '--no-history',
  ];

  const dump = dockerExec(mgArgs, Buffer.from('DUMP DATABASE;\n'));
  if (dump.status !== 0) die(`Memgraph dump failed:\n${dump.stderr.toString()}`);

  fs.writeFileSync(outFile, dump.stdout);
  const lineCount = dump.stdout.toString().split('\n').filter(Boolean).length;
  log('memgraph', `Dump: ${lineCount} Cypher statements written`);

  // Collect node/edge counts for manifest
  const countQuery = 'MATCH (n) RETURN count(n) AS c;\nMATCH ()-[r]->() RETURN count(r) AS c;\n';
  const cArgs = [...mgArgs.slice(0, -2), '--output-format', 'csv', '--no-history'];
  const cRes  = dockerExec(cArgs, Buffer.from(countQuery));

  let nodeCount = 0, edgeCount = 0;
  if (cRes.status === 0) {
    const nums = cRes.stdout.toString().split('\n')
      .map(l => l.trim()).filter(l => /^\d+$/.test(l)).map(Number);
    nodeCount = nums[0] ?? 0;
    edgeCount = nums[1] ?? 0;
  }

  log('memgraph', `Stats: ${nodeCount} nodes, ${edgeCount} edges`);
  return { file: 'memgraph_dump.cypherl', nodeCount, edgeCount };
}

// ─── Qdrant Export ────────────────────────────────────────────────────────────

async function exportQdrant(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { url } = CFG.qdrant;

  log('qdrant', `Connecting to ${url}...`);

  const { result } = await fetchJSON(`${url}/collections`);
  const collections = (result?.collections ?? []);

  if (!collections.length) {
    log('qdrant', 'No collections found.');
    return { collections: [] };
  }

  log('qdrant', `Found ${collections.length} collection(s): ${collections.map(c => c.name).join(', ')}`);

  const manifest = [];

  for (const { name } of collections) {
    log('qdrant', `  Snapshotting '${name}'...`);

    // Create snapshot on the server
    const snapResp = await fetchJSON(`${url}/collections/${name}/snapshots`, { method: 'POST' });
    const snapName = snapResp.result?.name;
    if (!snapName) throw new Error(`No snapshot name for collection '${name}'`);

    // Stream-download to avoid loading entire snapshot into memory
    const downloadUrl = `${url}/collections/${name}/snapshots/${encodeURIComponent(snapName)}`;
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) throw new Error(`Download failed for '${name}': ${fileRes.statusText}`);

    const outFile = path.join(dir, `${name}.snapshot`);
    await pipeline(Readable.fromWeb(fileRes.body), fs.createWriteStream(outFile));

    const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);

    // Get vector count for manifest
    let vectorsCount = 0;
    try {
      const info = await fetchJSON(`${url}/collections/${name}`);
      vectorsCount = info.result?.vectors_count ?? 0;
    } catch { /* non-critical */ }

    log('qdrant', `    → ${name}.snapshot  (${sizeMB} MB, ${vectorsCount} vectors)`);

    // Cleanup: delete snapshot from server
    await fetch(`${url}/collections/${name}/snapshots/${encodeURIComponent(snapName)}`, { method: 'DELETE' });

    manifest.push({ name, vectorsCount, file: `${name}.snapshot` });
  }

  const totalVectors = manifest.reduce((s, c) => s + c.vectorsCount, 0);
  log('qdrant', `Export done: ${manifest.length} collections, ${totalVectors} total vectors`);
  return { collections: manifest };
}

// ─── Redis Export ─────────────────────────────────────────────────────────────

function exportRedis(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { container } = CFG.redis;
  const outFile = path.join(dir, 'redis_dump.rdb');

  log('redis', `Triggering BGSAVE in '${container}'...`);

  const bgsave = dockerExec(['exec', container, 'redis-cli', 'BGSAVE']);
  if (bgsave.status !== 0) die(`BGSAVE failed:\n${bgsave.stderr.toString()}`);

  // Poll until BGSAVE finishes (max 30 seconds)
  for (let i = 0; i < 60; i++) {
    const info = dockerExec(['exec', container, 'redis-cli', 'INFO', 'persistence']);
    if (!info.stdout.toString().includes('rdb_bgsave_in_progress:1')) break;
    if (i === 59) die('Redis BGSAVE timed out after 30 seconds');
    sleepSync(500);
  }

  // Capture DB size before copy
  const dbSizeResult = dockerExec(['exec', container, 'redis-cli', 'DBSIZE']);
  const dbSize = parseInt(dbSizeResult.stdout.toString().trim()) || 0;

  // Copy RDB from container
  const cp = spawnSync('docker', ['cp', `${container}:/data/dump.rdb`, outFile], { encoding: 'utf8' });
  if (cp.status !== 0) die(`docker cp failed:\n${cp.stderr}`);

  const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  log('redis', `Saved redis_dump.rdb (${sizeMB} MB, ${dbSize} keys)`);

  return { file: 'redis_dump.rdb', dbSize };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const absOut = path.resolve(outRoot);
  console.log('\n══════════════════════════════════════════════════');
  console.log('  UNPA Migration — Export');
  console.log(`  Output: ${absOut}`);
  console.log('══════════════════════════════════════════════════\n');

  fs.mkdirSync(outRoot, { recursive: true });

  const manifest = {
    version:     '1',
    timestamp:   new Date().toISOString(),
    environment: { nodeVersion: process.version, platform: process.platform },
    memgraph:    null,
    qdrant:      null,
    redis:       null,
  };

  if (!SKIP.memgraph) {
    manifest.memgraph = exportMemgraph(path.join(outRoot, 'memgraph'));
  } else {
    log('memgraph', 'Skipped (--skip-memgraph)');
  }

  if (!SKIP.qdrant) {
    manifest.qdrant = await exportQdrant(path.join(outRoot, 'qdrant'));
  } else {
    log('qdrant', 'Skipped (--skip-qdrant)');
  }

  if (!SKIP.redis) {
    manifest.redis = exportRedis(path.join(outRoot, 'redis'));
  } else {
    log('redis', 'Skipped (--skip-redis)');
  }

  fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Summary
  const m = manifest;
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Export complete!');
  if (m.memgraph) console.log(`  Memgraph : ${m.memgraph.nodeCount} nodes, ${m.memgraph.edgeCount} edges`);
  if (m.qdrant)   console.log(`  Qdrant   : ${m.qdrant.collections.length} collections, ${m.qdrant.collections.reduce((s, c) => s + c.vectorsCount, 0)} vectors`);
  if (m.redis)    console.log(`  Redis    : ${m.redis.dbSize} keys`);
  console.log(`\n  Snapshot saved to: ${absOut}`);
  console.log('  Share this directory with the target developer.');
  console.log('══════════════════════════════════════════════════\n');
}

main().catch((err) => { console.error('\n[FATAL]', err.message); process.exit(1); });
