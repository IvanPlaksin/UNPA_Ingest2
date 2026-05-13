#!/usr/bin/env node
'use strict';
/**
 * import.js — Restore all UNPA project databases from a snapshot directory.
 *
 * Restores:
 *   Memgraph → replays .cypherl Cypher file via mgconsole inside Docker
 *   Qdrant   → uploads .snapshot files per collection via Snapshot REST API
 *   Redis    → copies .rdb file into container and restarts Redis
 *
 * Usage:
 *   node scripts/migration/import.js --dir ./backups/2026-05-13T10-00-00
 *   node scripts/migration/import.js --dir ./backups/latest --wipe
 *   node scripts/migration/import.js --dir ./backups/latest --skip-redis
 *   node scripts/migration/import.js --dir ./backups/latest --skip-memgraph
 *   node scripts/migration/import.js --dir ./backups/latest --skip-qdrant
 *
 * Flags:
 *   --dir <path>       Path to the snapshot directory (required)
 *   --wipe             DESTRUCTIVE: wipe Memgraph before restoring (recommended for fresh import)
 *   --skip-memgraph    Skip Memgraph restore
 *   --skip-qdrant      Skip Qdrant restore
 *   --skip-redis       Skip Redis restore
 *
 * Environment variables (all have dev defaults):
 *   MEMGRAPH_CONTAINER   default: projectadvisor-memgraph
 *   MEMGRAPH_USER        default: memgraph
 *   MEMGRAPH_PASSWORD    default: secret_password_123
 *   QDRANT_URL           default: http://localhost:6333
 *   QDRANT_CONTAINER     default: projectadvisor-qdrant
 *   REDIS_CONTAINER      default: projectadvisor-redis
 *
 * Requirements: Node.js 20+, Docker with target containers running.
 * No npm install needed — uses only Node.js built-in modules.
 */

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const CFG = {
  memgraph: {
    container: process.env.MEMGRAPH_CONTAINER ?? 'projectadvisor-memgraph',
    user:      process.env.MEMGRAPH_USER       ?? 'memgraph',
    password:  process.env.MEMGRAPH_PASSWORD   ?? 'secret_password_123',
  },
  qdrant: {
    url:       (process.env.QDRANT_URL         ?? 'http://localhost:6333').replace(/\/$/, ''),
    container: process.env.QDRANT_CONTAINER    ?? 'projectadvisor-qdrant',
  },
  redis: {
    container: process.env.REDIS_CONTAINER ?? 'projectadvisor-redis',
  },
};

// ─── CLI Arguments ────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getFlag = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (name) => args.includes(name);

const srcDir  = getFlag('--dir');
const wipe    = hasFlag('--wipe');

const SKIP = {
  memgraph: hasFlag('--skip-memgraph'),
  qdrant:   hasFlag('--skip-qdrant'),
  redis:    hasFlag('--skip-redis'),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const log  = (tag, msg) => console.log(`[${tag.padEnd(8)}] ${msg}`);
const warn = (tag, msg) => console.warn(`[${tag.padEnd(8)}] WARNING: ${msg}`);
const die  = (msg) => { console.error(`\n[FATAL] ${msg}`); process.exit(1); };

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function dockerExec(containerArgs, stdinData = null, opts = {}) {
  const options = { encoding: 'buffer', maxBuffer: 700 * 1024 * 1024, ...opts };
  if (stdinData !== null) options.input = stdinData;
  return spawnSync('docker', containerArgs, options);
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}\n${await res.text()}`);
  return res.json();
}

// ─── Manifest Loading ─────────────────────────────────────────────────────────

function loadManifest(dir) {
  const f = path.join(dir, 'manifest.json');
  if (!fs.existsSync(f)) {
    warn('manifest', `manifest.json not found in ${dir} — will auto-detect files`);
    return null;
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// ─── Memgraph Import ──────────────────────────────────────────────────────────

function importMemgraph(dir) {
  const { container, user, password } = CFG.memgraph;

  // Locate .cypherl file
  const cypherl = fs.readdirSync(dir).find(f => f.endsWith('.cypherl'));
  if (!cypherl) die(`No .cypherl file found in ${dir}`);
  const cypherFile = path.join(dir, cypherl);

  log('memgraph', `Source file: ${cypherl}`);
  log('memgraph', `Target container: ${container}`);

  const mgBase = [
    'exec', '-i', container,
    'mgconsole',
    '--host', '127.0.0.1', '--port', '7687',
    '--username', user, '--password', password,
    '--no-history',
  ];

  // Wipe existing data if requested
  if (wipe) {
    log('memgraph', 'Wiping existing data (--wipe flag)...');
    const wipeRes = dockerExec(mgBase, Buffer.from('MATCH (n) DETACH DELETE n;\n'));
    if (wipeRes.status !== 0) die(`Wipe failed:\n${wipeRes.stderr.toString()}`);
    log('memgraph', 'Wipe complete.');
  } else {
    warn('memgraph', 'No --wipe flag. Restoring on top of existing data (may create duplicates).');
  }

  // Read and replay the dump
  log('memgraph', 'Replaying Cypher dump...');
  const cypherData = fs.readFileSync(cypherFile);
  const replayRes = dockerExec(mgBase, cypherData);

  if (replayRes.status !== 0) {
    const stderr = replayRes.stderr.toString();
    // mgconsole exits non-zero on constraint violations that are non-fatal — log but continue
    if (stderr.includes('already exists') || stderr.includes('constraint')) {
      warn('memgraph', `Some statements skipped (constraint violations):\n${stderr.slice(0, 400)}`);
    } else {
      die(`Memgraph replay failed:\n${stderr}`);
    }
  }

  // Verify counts
  const countRes = dockerExec(
    [...mgBase.slice(0, -1), '--output-format', 'csv', '--no-history'],
    Buffer.from('MATCH (n) RETURN count(n) AS c;\nMATCH ()-[r]->() RETURN count(r) AS c;\n')
  );
  let nodeCount = 0, edgeCount = 0;
  if (countRes.status === 0) {
    const nums = countRes.stdout.toString().split('\n')
      .map(l => l.trim()).filter(l => /^\d+$/.test(l)).map(Number);
    nodeCount = nums[0] ?? 0;
    edgeCount = nums[1] ?? 0;
  }

  log('memgraph', `Restore complete: ${nodeCount} nodes, ${edgeCount} edges`);
  return { nodeCount, edgeCount };
}

// ─── Qdrant Import ────────────────────────────────────────────────────────────

async function importQdrant(dir) {
  const { url, container } = CFG.qdrant;

  // Find all .snapshot files
  const snapshotFiles = fs.readdirSync(dir)
    .filter(f => f.endsWith('.snapshot'))
    .map(f => ({ name: f.replace(/\.snapshot$/, ''), file: path.join(dir, f) }));

  if (!snapshotFiles.length) {
    warn('qdrant', `No .snapshot files found in ${dir}`);
    return { collections: [] };
  }

  log('qdrant', `Found ${snapshotFiles.length} snapshot(s) to restore`);
  log('qdrant', `Target: ${url}  Container: ${container}`);

  const results = [];

  for (const { name, file } of snapshotFiles) {
    log('qdrant', `  Restoring '${name}'...`);

    const snapFileName = `${name}.snapshot`;
    const containerSnapDir  = `/qdrant/snapshots/${name}`;
    const containerSnapPath = `${containerSnapDir}/${snapFileName}`;

    // Ensure snapshot directory exists inside the container
    const mkdirRes = dockerExec(['exec', container, 'mkdir', '-p', containerSnapDir]);
    if (mkdirRes.status !== 0) {
      throw new Error(`mkdir in Qdrant container failed for '${name}':\n${mkdirRes.stderr.toString()}`);
    }

    // Copy snapshot file into the Qdrant container (avoids HTTP upload size limits)
    const cpRes = spawnSync('docker', ['cp', file, `${container}:${containerSnapPath}`], { encoding: 'utf8' });
    if (cpRes.status !== 0) throw new Error(`docker cp failed for '${name}':\n${cpRes.stderr}`);

    // Recover collection from the in-container snapshot
    const recoverBody = JSON.stringify({
      location: `file://${containerSnapPath}`,
      priority: 'snapshot',
    });

    const recoverRes = await fetch(`${url}/collections/${name}/snapshots/recover`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    recoverBody,
    });

    if (!recoverRes.ok) {
      throw new Error(`Recover failed for '${name}': ${recoverRes.status}\n${await recoverRes.text()}`);
    }

    // Wait for recovery to finish (status becomes green)
    let vectorsCount = 0;
    for (let i = 0; i < 60; i++) {
      try {
        const info = await fetchJSON(`${url}/collections/${name}`);
        const status = info.result?.status;
        if (status === 'green') {
          vectorsCount = info.result?.vectors_count ?? 0;
          break;
        }
      } catch { /* still loading */ }
      if (i === 59) warn('qdrant', `Collection '${name}' did not reach 'green' status in 60 seconds`);
      sleepSync(1000);
    }

    log('qdrant', `    → '${name}' restored (${vectorsCount} vectors)`);

    // Cleanup in-container snapshot file
    dockerExec(['exec', container, 'rm', '-f', containerSnapPath]);

    results.push({ name, vectorsCount });
  }

  log('qdrant', `Restore complete: ${results.length} collections`);
  return { collections: results };
}

// ─── Redis Import ─────────────────────────────────────────────────────────────

function importRedis(dir) {
  const { container } = CFG.redis;

  const rdbFile = path.join(dir, 'redis_dump.rdb');
  if (!fs.existsSync(rdbFile)) die(`Redis dump not found: ${rdbFile}`);

  log('redis', `Source: redis_dump.rdb`);
  log('redis', `Target container: ${container}`);

  // Stop Redis gracefully before replacing the dump file
  log('redis', 'Stopping Redis container...');
  const stopRes = spawnSync('docker', ['stop', container], { encoding: 'utf8' });
  if (stopRes.status !== 0) die(`docker stop failed:\n${stopRes.stderr}`);

  // Copy the RDB file into the container's data volume
  const cpRes = spawnSync('docker', ['cp', rdbFile, `${container}:/data/dump.rdb`], { encoding: 'utf8' });
  if (cpRes.status !== 0) die(`docker cp failed:\n${cpRes.stderr}`);

  // Restart Redis (it loads dump.rdb on startup)
  log('redis', 'Starting Redis container...');
  const startRes = spawnSync('docker', ['start', container], { encoding: 'utf8' });
  if (startRes.status !== 0) die(`docker start failed:\n${startRes.stderr}`);

  // Wait for Redis to be ready
  log('redis', 'Waiting for Redis to be ready...');
  for (let i = 0; i < 20; i++) {
    sleepSync(500);
    const ping = dockerExec(['exec', container, 'redis-cli', 'PING']);
    if (ping.stdout.toString().trim() === 'PONG') break;
    if (i === 19) die('Redis did not respond after restart');
  }

  const dbSizeRes = dockerExec(['exec', container, 'redis-cli', 'DBSIZE']);
  const dbSize = parseInt(dbSizeRes.stdout.toString().trim()) || 0;

  log('redis', `Restore complete: ${dbSize} keys loaded`);
  return { dbSize };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!srcDir) {
    console.error('Usage: node scripts/migration/import.js --dir <snapshot-dir> [--wipe]');
    process.exit(1);
  }

  if (!fs.existsSync(srcDir)) die(`Snapshot directory not found: ${srcDir}`);

  console.log('\n══════════════════════════════════════════════════');
  console.log('  UNPA Migration — Import');
  console.log(`  Source: ${path.resolve(srcDir)}`);
  if (wipe) console.log('  Mode  : WIPE + restore');
  else      console.log('  Mode  : Additive (use --wipe for a clean restore)');
  console.log('══════════════════════════════════════════════════\n');

  const manifest = loadManifest(srcDir);

  // Print manifest summary if available
  if (manifest) {
    console.log('  Snapshot info:');
    console.log(`    Created  : ${manifest.timestamp}`);
    if (manifest.memgraph) console.log(`    Memgraph : ${manifest.memgraph.nodeCount} nodes, ${manifest.memgraph.edgeCount} edges`);
    if (manifest.qdrant)   console.log(`    Qdrant   : ${manifest.qdrant.collections.length} collections`);
    if (manifest.redis)    console.log(`    Redis    : ${manifest.redis.dbSize} keys`);
    console.log('');
  }

  const results = {};

  if (!SKIP.memgraph) {
    const mgDir = path.join(srcDir, 'memgraph');
    if (fs.existsSync(mgDir)) {
      results.memgraph = importMemgraph(mgDir);
    } else {
      warn('memgraph', `Directory not found: ${mgDir} — skipping`);
    }
  } else {
    log('memgraph', 'Skipped (--skip-memgraph)');
  }

  if (!SKIP.qdrant) {
    const qDir = path.join(srcDir, 'qdrant');
    if (fs.existsSync(qDir)) {
      results.qdrant = await importQdrant(qDir);
    } else {
      warn('qdrant', `Directory not found: ${qDir} — skipping`);
    }
  } else {
    log('qdrant', 'Skipped (--skip-qdrant)');
  }

  if (!SKIP.redis) {
    const rDir = path.join(srcDir, 'redis');
    if (fs.existsSync(rDir)) {
      results.redis = importRedis(rDir);
    } else {
      warn('redis', `Directory not found: ${rDir} — skipping`);
    }
  } else {
    log('redis', 'Skipped (--skip-redis)');
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  Import complete!');
  if (results.memgraph) console.log(`  Memgraph : ${results.memgraph.nodeCount} nodes, ${results.memgraph.edgeCount} edges`);
  if (results.qdrant)   console.log(`  Qdrant   : ${results.qdrant.collections.length} collections restored`);
  if (results.redis)    console.log(`  Redis    : ${results.redis.dbSize} keys`);
  console.log('\n  Run verify.js to confirm data integrity:');
  console.log(`  node scripts/migration/verify.js --baseline ${srcDir}/manifest.json`);
  console.log('══════════════════════════════════════════════════\n');
}

main().catch((err) => { console.error('\n[FATAL]', err.message); process.exit(1); });
