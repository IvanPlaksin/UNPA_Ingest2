/**
 * Task 10.5: Docker Deployment Tests
 *
 * Tests:
 *   1. Dockerfile Structure (8) — multi-stage, non-root, tini, healthcheck
 *   2. Docker Compose Main (12) — services, networks, volumes, health checks
 *   3. Docker Compose Dev (6) — dev overrides, volumes, hot reload
 *   4. Docker Compose Prod (6) — resource limits, restart, logging
 *   5. Dockerignore (6) — excluded files and directories
 *   6. Health Check Script (5) — script structure, HTTP check
 *   7. Entrypoint Script (5) — wait-for-services, signal handling
 *   8. Environment Variables (8) — all required vars present
 *   9. Service Dependencies (5) — dependency chain correctness
 *  10. Makefile Commands (5) — make targets present
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${testName}`);
  } else {
    failed++;
    console.log(`  \u2717 FAIL: ${testName}`);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

function readFile(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════
// 1. Dockerfile Structure
// ═══════════════════════════════════════════════════════════════════
section('1. Dockerfile Structure');

const dockerfile = readFile('api/Dockerfile');
assert(dockerfile != null, 'api/Dockerfile exists');

if (dockerfile) {
  assert(dockerfile.includes('FROM node:20-alpine AS deps'), 'Multi-stage: deps stage present');
  assert(dockerfile.includes('FROM node:20-alpine AS production'), 'Multi-stage: production stage present');
  assert(dockerfile.includes('tini'), 'Uses tini for signal handling');
  assert(dockerfile.includes('adduser') || dockerfile.includes('USER'), 'Non-root user configured');
  assert(dockerfile.includes('HEALTHCHECK'), 'HEALTHCHECK instruction present');
  assert(dockerfile.includes('docker-healthcheck.js'), 'Health check uses custom script');
  assert(dockerfile.includes('EXPOSE 3000'), 'Exposes port 3000');
}

// ═══════════════════════════════════════════════════════════════════
// 2. Docker Compose Main
// ═══════════════════════════════════════════════════════════════════
section('2. Docker Compose Main');

const compose = readFile('docker-compose.yml');
assert(compose != null, 'docker-compose.yml exists');

if (compose) {
  // Services
  assert(compose.includes('api:'), 'API service defined');
  assert(compose.includes('redis:'), 'Redis service defined');
  assert(compose.includes('memgraph:'), 'Memgraph service defined');
  assert(compose.includes('qdrant:'), 'Qdrant service defined');
  assert(compose.includes('ollama:'), 'Ollama service defined');
  assert(compose.includes('etl-worker:'), 'ETL worker service defined');

  // Infrastructure
  assert(compose.includes('projectadvisor-network'), 'Network defined');
  assert(compose.includes('redis-data:'), 'Redis volume defined');
  assert(compose.includes('memgraph-data:'), 'Memgraph volume defined');
  assert(compose.includes('qdrant-data:'), 'Qdrant volume defined');

  // Health checks
  assert(compose.includes('redis-cli') && compose.includes('ping'), 'Redis health check');
  assert(compose.includes('healthz') || compose.includes('health'), 'Qdrant health check');
}

// ═══════════════════════════════════════════════════════════════════
// 3. Docker Compose Dev
// ═══════════════════════════════════════════════════════════════════
section('3. Docker Compose Dev');

const composeDev = readFile('docker-compose.dev.yml');
assert(composeDev != null, 'docker-compose.dev.yml exists');

if (composeDev) {
  assert(composeDev.includes('NODE_ENV=development'), 'Dev sets NODE_ENV=development');
  assert(composeDev.includes('LOG_LEVEL=debug'), 'Dev sets debug logging');
  assert(composeDev.includes('nodemon'), 'Dev uses nodemon for hot reload');
  assert(composeDev.includes('./api/src:/app/src'), 'Dev mounts source volume');
  assert(composeDev.includes('9229'), 'Dev exposes debug port');
  assert(composeDev.includes('RATE_LIMIT_ENABLED=false'), 'Dev disables rate limiting');
}

// ═══════════════════════════════════════════════════════════════════
// 4. Docker Compose Prod
// ═══════════════════════════════════════════════════════════════════
section('4. Docker Compose Prod');

const composeProd = readFile('docker-compose.prod.yml');
assert(composeProd != null, 'docker-compose.prod.yml exists');

if (composeProd) {
  assert(composeProd.includes('NODE_ENV=production'), 'Prod sets NODE_ENV=production');
  assert(composeProd.includes('LOG_FORMAT=json'), 'Prod uses JSON logging');
  assert(composeProd.includes('memory:') && composeProd.includes('1024M'), 'Prod sets memory limits');
  assert(composeProd.includes('restart: always'), 'Prod sets restart always');
  assert(composeProd.includes('max-size'), 'Prod configures log rotation');
  assert(composeProd.includes('HELMET_ENABLED=true'), 'Prod enables security headers');
}

// ═══════════════════════════════════════════════════════════════════
// 5. Dockerignore
// ═══════════════════════════════════════════════════════════════════
section('5. Dockerignore');

const dockerignore = readFile('.dockerignore');
assert(dockerignore != null, '.dockerignore exists');

if (dockerignore) {
  assert(dockerignore.includes('node_modules'), 'Excludes node_modules');
  assert(dockerignore.includes('.git'), 'Excludes .git');
  assert(dockerignore.includes('.env'), 'Excludes .env');
  assert(dockerignore.includes('*.log'), 'Excludes log files');
  assert(dockerignore.includes('tests'), 'Excludes tests');
}

// ═══════════════════════════════════════════════════════════════════
// 6. Health Check Script
// ═══════════════════════════════════════════════════════════════════
section('6. Health Check Script');

const healthCheck = readFile('api/scripts/docker-healthcheck.js');
assert(healthCheck != null, 'docker-healthcheck.js exists');

if (healthCheck) {
  assert(healthCheck.includes("require('http')"), 'Uses http module');
  assert(healthCheck.includes('/health'), 'Checks /health endpoint');
  assert(healthCheck.includes('process.exit(0)'), 'Exits 0 on success');
  assert(healthCheck.includes('process.exit(1)'), 'Exits 1 on failure');
  assert(healthCheck.includes('timeout'), 'Has timeout handling');
}

// ═══════════════════════════════════════════════════════════════════
// 7. Entrypoint Script
// ═══════════════════════════════════════════════════════════════════
section('7. Entrypoint Script');

const entrypoint = readFile('api/scripts/docker-entrypoint.sh');
assert(entrypoint != null, 'docker-entrypoint.sh exists');

if (entrypoint) {
  assert(entrypoint.includes('#!/bin/sh'), 'Has shebang');
  assert(entrypoint.includes('set -e'), 'Uses set -e for error handling');
  assert(entrypoint.includes('wait_for_service'), 'Has wait_for_service function');
  assert(entrypoint.includes('REDIS_HOST'), 'Waits for Redis');
  assert(entrypoint.includes('exec "$@"'), 'Execs the main command');
}

// ═══════════════════════════════════════════════════════════════════
// 8. Environment Variables
// ═══════════════════════════════════════════════════════════════════
section('8. Environment Variables');

if (compose) {
  assert(compose.includes('REDIS_HOST=redis'), 'API connects to redis service');
  assert(compose.includes('bolt://memgraph:7687'), 'API connects to memgraph service');
  assert(compose.includes('http://qdrant:6333'), 'API connects to qdrant service');
  assert(compose.includes('http://ollama:11434'), 'API connects to ollama service');
  assert(compose.includes('GEMINI_API_KEY'), 'Gemini API key configurable');
  assert(compose.includes('LOG_LEVEL'), 'Log level configurable');
  assert(compose.includes('RATE_LIMIT_ENABLED'), 'Rate limiting configurable');
  assert(compose.includes('ENABLE_WEBSOCKET'), 'WebSocket configurable');
}

// ═══════════════════════════════════════════════════════════════════
// 9. Service Dependencies
// ═══════════════════════════════════════════════════════════════════
section('9. Service Dependencies');

if (compose) {
  assert(compose.includes('depends_on:') && compose.includes('redis:'), 'API depends on Redis');
  assert(compose.includes('condition: service_healthy'), 'Uses health check conditions');
  assert(compose.includes('condition: service_started'), 'Uses service_started for Memgraph');

  // Profiles for optional services
  assert(compose.includes('profiles:') && compose.includes('- llm'), 'Ollama in llm profile');
  assert(compose.includes('- etl'), 'ETL worker in etl profile');
}

// ═══════════════════════════════════════════════════════════════════
// 10. Makefile Commands
// ═══════════════════════════════════════════════════════════════════
section('10. Makefile Commands');

const makefile = readFile('Makefile');
assert(makefile != null, 'Makefile exists');

if (makefile) {
  assert(makefile.includes('up:'), 'Make target: up');
  assert(makefile.includes('down:'), 'Make target: down');
  assert(makefile.includes('dev:'), 'Make target: dev');
  assert(makefile.includes('prod:'), 'Make target: prod');
}

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`Docker Deployment Tests: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.log('\nSome tests failed!');
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
}
