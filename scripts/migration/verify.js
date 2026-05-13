#!/usr/bin/env node
'use strict';
/**
 * verify.js — Verify the current state of all databases and optionally compare
 *             against a baseline manifest produced by export.js.
 *
 * Usage:
 *   # Live status only
 *   node scripts/migration/verify.js
 *
 *   # Compare against an exported baseline
 *   node scripts/migration/verify.js --baseline ./backups/2026-05-13T10-00-00/manifest.json
 *
 * Environment variables (all have dev defaults):
 *   MEMGRAPH_CONTAINER   default: projectadvisor-memgraph
 *   MEMGRAPH_USER        default: memgraph
 *   MEMGRAPH_PASSWORD    default: secret_password_123
 *   QDRANT_URL           default: http://localhost:6333
 *   REDIS_CONTAINER      default: projectadvisor-redis
 *
 * Exit code 0 = all checks passed (or no baseline for comparison).
 * Exit code 1 = one or more checks failed or counts diverge from baseline.
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
    url: (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, ''),
  },
  redis: {
    container: process.env.REDIS_CONTAINER ?? 'projectadvisor-redis',
  },
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const getFlag    = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const baselineFile = getFlag('--baseline');

// ─── Utilities ────────────────────────────────────────────────────────────────

const PASS = '✓';
const FAIL = '✗';
const WARN = '⚠';

let exitCode = 0;

function row(status, label, value, note = '') {
  const sym = status === 'pass' ? PASS : status === 'fail' ? FAIL : WARN;
  if (status === 'fail') exitCode = 1;
  const noteStr = note ? `  ${note}` : '';
  console.log(`  ${sym}  ${label.padEnd(30)} ${String(value)}${noteStr}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 44 - title.length))}`);
}

async function fetchJSON(url, opts = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function dockerExec(containerArgs, stdinData = null) {
  const opts = { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 };
  if (stdinData !== null) opts.input = stdinData;
  return spawnSync('docker', containerArgs, opts);
}

// ─── Memgraph Check ───────────────────────────────────────────────────────────

function checkMemgraph() {
  section('Memgraph');
  const { container, user, password } = CFG.memgraph;

  // Check container is running
  const ps = spawnSync('docker', ['inspect', '--format', '{{.State.Status}}', container], { encoding: 'utf8' });
  const status = ps.stdout.trim();
  if (status !== 'running') {
    row('fail', 'container status', status, `(expected: running)`);
    return { reachable: false };
  }
  row('pass', 'container status', 'running');

  const mgArgs = [
    'exec', '-i', container,
    'mgconsole',
    '--host', '127.0.0.1', '--port', '7687',
    '--username', user, '--password', password,
    '--output-format', 'csv', '--no-history',
  ];

  const query = [
    'MATCH (n) RETURN count(n) AS c;',
    'MATCH ()-[r]->() RETURN count(r) AS c;',
    'MATCH (n) RETURN DISTINCT labels(n) AS l LIMIT 20;',
  ].join('\n') + '\n';

  const res = dockerExec(mgArgs, query);
  if (res.status !== 0) {
    row('fail', 'connection', 'failed', res.stderr.slice(0, 200));
    return { reachable: false };
  }

  row('pass', 'connection', 'ok (bolt://localhost:7687)');

  const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const nums  = lines.filter(l => /^\d+$/.test(l)).map(Number);
  const nodeCount = nums[0] ?? 0;
  const edgeCount = nums[1] ?? 0;

  // Extract label names (CSV lines that look like label arrays)
  const labelLines = lines.filter(l => l.startsWith('[') || l.includes(':'));

  row('pass', 'node count', nodeCount);
  row('pass', 'edge count', edgeCount);

  // Node distribution by label
  const labelQuery = `MATCH (n) WITH labels(n)[0] AS lbl, count(n) AS cnt WHERE lbl IS NOT NULL RETURN lbl, cnt ORDER BY cnt DESC LIMIT 15;\n`;
  const lRes = dockerExec(mgArgs, labelQuery);
  if (lRes.status === 0) {
    const lLines = lRes.stdout.split('\n').filter(l => l && !l.startsWith('lbl'));
    for (const l of lLines.slice(0, 10)) {
      const [label, count] = l.split(',');
      if (label && count) {
        console.log(`         ${'  node distribution'.padEnd(30)} ${label.trim()}: ${count.trim()}`);
      }
    }
  }

  return { reachable: true, nodeCount, edgeCount };
}

// ─── Qdrant Check ─────────────────────────────────────────────────────────────

async function checkQdrant() {
  section('Qdrant');
  const { url } = CFG.qdrant;

  // Health check
  const health = await fetchJSON(`${url}/healthz`);
  if (health === null) {
    // Try collections as fallback
    const collections = await fetchJSON(`${url}/collections`);
    if (collections === null) {
      row('fail', 'connection', 'unreachable', url);
      return { reachable: false };
    }
  }
  row('pass', 'connection', `ok (${url})`);

  const colData = await fetchJSON(`${url}/collections`);
  if (!colData) {
    row('fail', 'collections', 'could not list');
    return { reachable: true, collections: [] };
  }

  const collections = colData.result?.collections ?? [];
  row('pass', 'collection count', collections.length);

  const details = [];
  for (const { name } of collections) {
    const info = await fetchJSON(`${url}/collections/${name}`);
    const vectorsCount = info?.result?.vectors_count ?? 0;
    const status       = info?.result?.status ?? 'unknown';
    const statusMark   = status === 'green' ? 'pass' : 'warn';
    row(statusMark, `  ${name}`, `${vectorsCount} vectors`, `[${status}]`);
    details.push({ name, vectorsCount, status });
  }

  return { reachable: true, collections: details };
}

// ─── Redis Check ──────────────────────────────────────────────────────────────

function checkRedis() {
  section('Redis');
  const { container } = CFG.redis;

  const ps = spawnSync('docker', ['inspect', '--format', '{{.State.Status}}', container], { encoding: 'utf8' });
  const status = ps.stdout.trim();
  if (status !== 'running') {
    row('fail', 'container status', status);
    return { reachable: false };
  }
  row('pass', 'container status', 'running');

  const ping = dockerExec(['exec', container, 'redis-cli', 'PING']);
  if (ping.stdout.trim() !== 'PONG') {
    row('fail', 'connection', 'no PONG response');
    return { reachable: false };
  }
  row('pass', 'connection', 'ok (PONG)');

  const dbSize = dockerExec(['exec', container, 'redis-cli', 'DBSIZE']);
  const keyCount = parseInt(dbSize.stdout.trim()) || 0;
  row('pass', 'key count', keyCount);

  // Memory info
  const info = dockerExec(['exec', container, 'redis-cli', 'INFO', 'memory']);
  const usedMem = info.stdout.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim() ?? 'unknown';
  row('pass', 'used memory', usedMem);

  // Persistence info
  const persist = dockerExec(['exec', container, 'redis-cli', 'INFO', 'persistence']);
  const aofEnabled = persist.stdout.includes('aof_enabled:1') ? 'yes' : 'no';
  row('pass', 'AOF persistence', aofEnabled);

  return { reachable: true, dbSize: keyCount };
}

// ─── Baseline Comparison ──────────────────────────────────────────────────────

function compareWithBaseline(baseline, live) {
  section('Baseline Comparison');
  console.log(`  Baseline: ${baselineFile}`);
  console.log(`  Created : ${baseline.timestamp}`);
  console.log('');

  let allPassed = true;

  // Memgraph comparison
  if (baseline.memgraph && live.memgraph?.reachable) {
    const diff = (live.memgraph.nodeCount - baseline.memgraph.nodeCount);
    const diffStr = diff === 0 ? '(exact match)' : `(diff: ${diff > 0 ? '+' : ''}${diff})`;
    const nodeStatus = diff === 0 ? 'pass' : Math.abs(diff) <= 5 ? 'warn' : 'fail';
    row(nodeStatus, 'Memgraph nodes',
      `${live.memgraph.nodeCount} / expected ${baseline.memgraph.nodeCount}`, diffStr);
    if (nodeStatus === 'fail') allPassed = false;

    const edgeDiff = live.memgraph.edgeCount - baseline.memgraph.edgeCount;
    const edgeStatus = edgeDiff === 0 ? 'pass' : Math.abs(edgeDiff) <= 5 ? 'warn' : 'fail';
    row(edgeStatus, 'Memgraph edges',
      `${live.memgraph.edgeCount} / expected ${baseline.memgraph.edgeCount}`,
      edgeDiff === 0 ? '(exact match)' : `(diff: ${edgeDiff > 0 ? '+' : ''}${edgeDiff})`);
    if (edgeStatus === 'fail') allPassed = false;
  }

  // Qdrant comparison
  if (baseline.qdrant && live.qdrant?.reachable) {
    const baseCollections = baseline.qdrant.collections;
    const liveCollections = live.qdrant.collections;

    const liveMap = Object.fromEntries(liveCollections.map(c => [c.name, c]));

    for (const bCol of baseCollections) {
      const lCol = liveMap[bCol.name];
      if (!lCol) {
        row('fail', `  Qdrant: ${bCol.name}`, 'MISSING');
        allPassed = false;
      } else {
        const vDiff = lCol.vectorsCount - bCol.vectorsCount;
        const vStatus = vDiff === 0 ? 'pass' : Math.abs(vDiff) <= 10 ? 'warn' : 'fail';
        row(vStatus, `  Qdrant: ${bCol.name}`,
          `${lCol.vectorsCount} / expected ${bCol.vectorsCount}`,
          vDiff === 0 ? '(exact match)' : `(diff: ${vDiff > 0 ? '+' : ''}${vDiff})`);
        if (vStatus === 'fail') allPassed = false;
      }
    }

    // Check for extra collections not in baseline
    for (const lCol of liveCollections) {
      if (!baseCollections.find(b => b.name === lCol.name)) {
        row('warn', `  Qdrant: ${lCol.name}`, `${lCol.vectorsCount} vectors`, '(extra — not in baseline)');
      }
    }
  }

  // Redis comparison
  if (baseline.redis && live.redis?.reachable) {
    const diff = live.redis.dbSize - baseline.redis.dbSize;
    const status = diff === 0 ? 'pass' : Math.abs(diff) <= 5 ? 'warn' : 'fail';
    row(status, 'Redis keys',
      `${live.redis.dbSize} / expected ${baseline.redis.dbSize}`,
      diff === 0 ? '(exact match)' : `(diff: ${diff > 0 ? '+' : ''}${diff})`);
    if (status === 'fail') allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('  ✓  All counts match baseline — migration verified.');
  } else {
    console.log('  ✗  One or more counts diverge from baseline.');
    console.log('     Review the differences above before proceeding.');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  UNPA Migration — Verify');
  console.log('══════════════════════════════════════════════════');

  const live = {};

  live.memgraph = checkMemgraph();
  live.qdrant   = await checkQdrant();
  live.redis    = checkRedis();

  if (baselineFile) {
    if (!fs.existsSync(baselineFile)) {
      console.error(`\n[FATAL] Baseline file not found: ${baselineFile}`);
      process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    compareWithBaseline(baseline, live);
  }

  console.log('\n══════════════════════════════════════════════════\n');
  process.exit(exitCode);
}

main().catch((err) => { console.error('\n[FATAL]', err.message); process.exit(1); });
