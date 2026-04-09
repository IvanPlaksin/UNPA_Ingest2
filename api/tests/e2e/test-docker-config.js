/**
 * Task 10.5 Docker Configuration Validation Tests
 *
 * Validates Docker deployment files without running Docker.
 * Run: node tests/e2e/test-docker-config.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log('\n' + '-'.repeat(60));
  console.log('  ' + name);
  console.log('-'.repeat(60));
}

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  [PASS] ' + message);
  } else {
    failed++;
    console.log('  [FAIL] ' + message + ' (in: ' + currentSection + ')');
  }
}

function assertIncludes(text, substring, message) {
  assert(text.includes(substring), message || 'Contains ' + substring);
}

function assertMatch(text, regex, message) {
  assert(regex.test(text), message || 'Matches ' + regex);
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const API_DIR = path.resolve(ROOT, 'api');

const files = {
  dockerfile: path.join(API_DIR, 'Dockerfile'),
  compose: path.join(ROOT, 'docker-compose.yml'),
  composeDev: path.join(ROOT, 'docker-compose.dev.yml'),
  composeProd: path.join(ROOT, 'docker-compose.prod.yml'),
  dockerignore: path.join(ROOT, '.dockerignore'),
  healthcheck: path.join(API_DIR, 'scripts', 'docker-healthcheck.js'),
  entrypoint: path.join(API_DIR, 'scripts', 'docker-entrypoint.sh'),
  makefile: path.join(ROOT, 'Makefile'),
};

section('1. Docker File Existence');
for (const [name, filePath] of Object.entries(files)) {
  assert(fs.existsSync(filePath), name + ' exists at ' + path.relative(ROOT, filePath));
}

const content = {};
for (const [name, filePath] of Object.entries(files)) {
  try { content[name] = fs.readFileSync(filePath, 'utf-8'); } catch { content[name] = ''; }
}

section('2. Dockerfile Structure');
const df = content.dockerfile;
assertIncludes(df, 'FROM node:20-alpine', 'Uses Alpine base image');
assertIncludes(df, 'AS deps', 'Has deps build stage');
assertIncludes(df, 'AS production', 'Has production stage');
assertIncludes(df, 'npm ci', 'Uses npm ci');
assertIncludes(df, '--only=production', 'Separates prod deps');
assertIncludes(df, 'WORKDIR /app', 'Sets WORKDIR');

section('3. Dockerfile Security');
assertIncludes(df, 'addgroup', 'Creates non-root group');
assertIncludes(df, 'adduser', 'Creates non-root user');
assertIncludes(df, 'USER appuser', 'Switches to non-root user');
assertIncludes(df, 'chown', 'Sets file ownership');
assertIncludes(df, 'NODE_ENV=production', 'Sets NODE_ENV');

section('4. Dockerfile Process Management');
assertIncludes(df, 'tini', 'Installs tini for PID 1');
assertIncludes(df, 'ENTRYPOINT', 'Has ENTRYPOINT');
assertIncludes(df, 'HEALTHCHECK', 'Has HEALTHCHECK');
assertIncludes(df, 'docker-healthcheck.js', 'References healthcheck script');
assertIncludes(df, 'EXPOSE 3000', 'Exposes port 3000');

section('5. Dockerfile Cleanup');
assertIncludes(df, 'rm -rf tests', 'Removes test files');
assertIncludes(df, 'rm -rf', 'Removes dev files');

section('6. Base Compose Services');
const dc = content.compose;
['api:', 'redis:', 'memgraph:', 'qdrant:'].forEach(function(svc) {
  assertIncludes(dc, svc, 'Has ' + svc.replace(':', '') + ' service');
});
assertIncludes(dc, 'ollama:', 'Has ollama service');
assertIncludes(dc, 'etl-worker:', 'Has etl-worker service');
assertIncludes(dc, 'frontend:', 'Has frontend service');

section('7. Base Compose Network and Volumes');
assertIncludes(dc, 'projectadvisor-network', 'Defines custom network');
assertIncludes(dc, 'driver: bridge', 'Uses bridge driver');
assertIncludes(dc, 'redis-data:', 'Has redis volume');
assertIncludes(dc, 'memgraph-data:', 'Has memgraph volume');
assertIncludes(dc, 'qdrant-data:', 'Has qdrant volume');

section('8. Base Compose Service Config');
assertIncludes(dc, 'REDIS_HOST=redis', 'API connects to redis');
assertIncludes(dc, 'bolt://memgraph:7687', 'API connects to memgraph');
assertIncludes(dc, 'http://qdrant:6333', 'API connects to qdrant');
assertIncludes(dc, 'condition: service_healthy', 'Health-based depends_on');
assertIncludes(dc, 'redis-cli', 'Redis healthcheck');

section('9. Base Compose Profiles');
assertIncludes(dc, 'profiles:', 'Uses Docker profiles');

section('10. Dev Override Hot Reload');
const dcDev = content.composeDev;
assertIncludes(dcDev, 'nodemon', 'Uses nodemon');
assertIncludes(dcDev, 'volumes:', 'Has volume mounts');
assertIncludes(dcDev, './api/src:/app/src', 'Mounts source directory');

section('11. Dev Override Config');
assertIncludes(dcDev, 'NODE_ENV=development', 'Development env');
assertIncludes(dcDev, 'LOG_LEVEL=debug', 'Debug logging');
assertIncludes(dcDev, 'LOG_FORMAT=pretty', 'Pretty log format');
assertIncludes(dcDev, 'RATE_LIMIT_ENABLED=false', 'Rate limiting disabled');
assertIncludes(dcDev, 'target: deps', 'Builds from deps stage');

section('12. Prod Override Resource Limits');
const dcProd = content.composeProd;
assertIncludes(dcProd, 'deploy:', 'Has deploy section');
assertIncludes(dcProd, 'resources:', 'Has resource limits');
assertIncludes(dcProd, 'limits:', 'Defines upper limits');
assertIncludes(dcProd, 'reservations:', 'Defines reservations');
assertMatch(dcProd, /memory:\s*2G/, 'API memory limit: 2G');

section('13. Prod Override Logging');
assertIncludes(dcProd, 'logging:', 'Has logging config');
assertIncludes(dcProd, 'json-file', 'Uses json-file log driver');
assertIncludes(dcProd, 'max-size:', 'Has log rotation max-size');
assertIncludes(dcProd, 'max-file:', 'Has log rotation max-file');

section('14. Prod Override Config');
assertIncludes(dcProd, 'NODE_ENV=production', 'Production environment');
assertIncludes(dcProd, 'LOG_FORMAT=json', 'JSON log format');
assertIncludes(dcProd, 'RATE_LIMIT_ENABLED=true', 'Rate limiting enabled');
assertIncludes(dcProd, 'ENABLE_SWAGGER=false', 'Swagger disabled');
assertIncludes(dcProd, 'env_file:', 'Uses env_file');
assertIncludes(dcProd, '.env.production', 'References .env.production');
assertIncludes(dcProd, 'restart: unless-stopped', 'Auto-restart');

section('15. Prod All Services Have Limits');
const deployCount = (dcProd.match(/deploy:/g) || []).length;
assert(deployCount >= 5, 'All services have deploy config (' + deployCount + ' found)');
const loggingCount = (dcProd.match(/logging:/g) || []).length;
assert(loggingCount >= 5, 'All services have logging config (' + loggingCount + ' found)');

section('16. dockerignore');
const di = content.dockerignore;
assertIncludes(di, 'node_modules', 'Ignores node_modules');
assertIncludes(di, '.git', 'Ignores .git');
assertIncludes(di, '.env', 'Ignores .env');
assertIncludes(di, '!.env.example', 'Keeps .env.example');
assertIncludes(di, 'tests/', 'Ignores tests');
assertIncludes(di, 'coverage', 'Ignores coverage');
assertIncludes(di, '*.log', 'Ignores log files');
assertIncludes(di, 'Dockerfile', 'Ignores Dockerfile');
assertIncludes(di, '.dockerignore', 'Ignores .dockerignore');

section('17. Health Check Script');
const hc = content.healthcheck;
assertIncludes(hc, 'http', 'Uses http module');
assertIncludes(hc, '/health', 'Checks /health endpoint');
assertIncludes(hc, 'process.exit(0)', 'Exits 0 on success');
assertIncludes(hc, 'process.exit(1)', 'Exits 1 on failure');
assertIncludes(hc, 'timeout', 'Has timeout handling');

section('18. Entrypoint Script');
const ep = content.entrypoint;
assertIncludes(ep, '#!/bin/sh', 'Has shebang');
assertIncludes(ep, 'set -e', 'Exits on error');
assertIncludes(ep, 'wait_for_service', 'Has wait function');
assertIncludes(ep, 'nc -z', 'Uses netcat');
assertIncludes(ep, 'REDIS_HOST', 'Waits for Redis');
assertIncludes(ep, 'NEO4J_URI', 'Waits for Memgraph');
assertIncludes(ep, 'QDRANT_URL', 'Waits for Qdrant');
assertIncludes(ep, 'MAX_RETRIES', 'Has retry logic');

section('19. Makefile Targets');
const mk = content.makefile;
['dev:', 'prod:', 'stop:', 'restart:', 'logs:', 'status:', 'build:', 'clean:', 'test:', 'help:'].forEach(function(target) {
  assertIncludes(mk, target, 'Has ' + target.replace(':', '') + ' target');
});

section('20. Makefile Docker Compose Refs');
assertIncludes(mk, 'docker-compose.dev.yml', 'References dev override');
assertIncludes(mk, 'docker-compose.prod.yml', 'References prod override');
assertIncludes(mk, '.PHONY', 'Declares PHONY targets');
assertIncludes(mk, 'DEFAULT_GOAL', 'Has default goal');
assertIncludes(mk, 'shell:', 'Has shell access target');
assertIncludes(mk, 'redis-cli:', 'Has redis-cli target');

section('21. Cross-File Consistency');
assertIncludes(df, 'PORT=3000', 'Dockerfile: port 3000');
assertIncludes(dc, ':3000', 'Compose: maps to 3000');
assertIncludes(hc, '3000', 'Healthcheck: port 3000');
assertIncludes(dc, 'projectadvisor-api', 'API container name');
assertIncludes(dc, 'projectadvisor-redis', 'Redis container name');
assertIncludes(dc, 'projectadvisor-memgraph', 'Memgraph container name');
assertIncludes(dc, 'projectadvisor-qdrant', 'Qdrant container name');
const networkRefs = (dc.match(/projectadvisor-network/g) || []).length;
assert(networkRefs >= 7, 'All services use shared network (' + networkRefs + ' refs)');

section('22. Env Variable Consistency');
assert(
  dcDev.includes('NODE_ENV=development') && dcProd.includes('NODE_ENV=production'),
  'Dev=development, Prod=production'
);
assert(
  dcDev.includes('RATE_LIMIT_ENABLED=false') && dcProd.includes('RATE_LIMIT_ENABLED=true'),
  'Rate limiting: dev=off, prod=on'
);
assert(
  dcDev.includes('LOG_LEVEL=debug') && dcProd.includes('LOG_LEVEL=info'),
  'Log level: dev=debug, prod=info'
);
assert(
  dcDev.includes('LOG_FORMAT=pretty') && dcProd.includes('LOG_FORMAT=json'),
  'Log format: dev=pretty, prod=json'
);

console.log('\n' + '='.repeat(60));
console.log('  Docker Configuration Tests: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(60) + '\n');

process.exit(failed > 0 ? 1 : 0);
