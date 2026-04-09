#!/usr/bin/env node
/**
 * Approval Workflow — E2E Test Script
 *
 * Tests the full approval flow via REST API:
 *   Scenario A: Auto-approve (expense < limit)
 *   Scenario B: Manager approval (expense >= limit)
 *   Scenario C: Rejection
 *   Scenario D: Leave request
 *   Scenario E: List/filter
 *
 * Prerequisites:
 *   1. API server running on localhost:3001
 *   2. Memgraph seeded: node api/scripts/seed-approval-schema.js
 *
 * Usage:
 *   node api/scripts/test-approval-flow.js
 *   node api/scripts/test-approval-flow.js --scenario=A
 */

const http = require('http');

const API_BASE = process.env.API_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

// ====================================================================
// HTTP HELPERS
// ====================================================================

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function check(label, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ====================================================================
// SCENARIOS
// ====================================================================

async function scenarioA() {
  section('Scenario A: Auto-Approve (expense < limit)');

  // emp-staff-001 has expenseLimit = 100, so $50 should auto-approve
  const submit = await request('POST', '/api/v1/approval/submit', {
    requesterId: 'emp-staff-001',
    type: 'expense',
    payload: { amount: 50, reason: 'Office supplies' },
  });

  check('Submit returns 201', submit.status === 201);
  check('Has requestId', !!submit.body.requestId);
  check('Status is submitted', submit.body.status === 'submitted');

  const requestId = submit.body.requestId;

  // Check status
  const status = await request('GET', `/api/v1/approval/status/${requestId}`);
  check('Status returns 200', status.status === 200);
  check('Request exists', !!status.body.request);
  check('Request type is expense', status.body.request?.type === 'expense');

  return requestId;
}

async function scenarioB() {
  section('Scenario B: Manager Approval (expense >= limit)');

  // emp-staff-001 has expenseLimit = 100, so $500 needs manager
  const submit = await request('POST', '/api/v1/approval/submit', {
    requesterId: 'emp-staff-001',
    type: 'expense',
    payload: { amount: 500, reason: 'Conference registration' },
  });

  check('Submit returns 201', submit.status === 201);
  const requestId = submit.body.requestId;

  // Manager approves
  const decide = await request('POST', `/api/v1/approval/decide/${requestId}`, {
    deciderId: 'emp-mgr-001',
    decision: 'approved',
    comment: 'Approved for Q1 budget',
  });

  check('Decide returns 200', decide.status === 200);
  check('Decision is approved', decide.body.decision === 'approved');
  check('Has decisionId', !!decide.body.decisionId);

  // Verify status updated
  const status = await request('GET', `/api/v1/approval/status/${requestId}`);
  check('Status is approved', status.body.request?.status === 'approved');
  check('Has 1 decision', status.body.decisionCount === 1);

  return requestId;
}

async function scenarioC() {
  section('Scenario C: Rejection');

  const submit = await request('POST', '/api/v1/approval/submit', {
    requesterId: 'emp-staff-002',
    type: 'expense',
    payload: { amount: 300, reason: 'Team dinner' },
  });

  check('Submit returns 201', submit.status === 201);
  const requestId = submit.body.requestId;

  // Manager rejects
  const decide = await request('POST', `/api/v1/approval/decide/${requestId}`, {
    deciderId: 'emp-mgr-001',
    decision: 'rejected',
    comment: 'Over budget for current quarter',
  });

  check('Decide returns 200', decide.status === 200);
  check('Decision is rejected', decide.body.decision === 'rejected');

  // Verify
  const status = await request('GET', `/api/v1/approval/status/${requestId}`);
  check('Status is rejected', status.body.request?.status === 'rejected');

  return requestId;
}

async function scenarioD() {
  section('Scenario D: Leave Request');

  const submit = await request('POST', '/api/v1/approval/submit', {
    requesterId: 'emp-staff-001',
    type: 'leave',
    payload: { days: 5, reason: 'Family vacation' },
  });

  check('Submit returns 201', submit.status === 201);
  check('Type is leave', submit.body.type === 'leave');

  return submit.body.requestId;
}

async function scenarioE() {
  section('Scenario E: List & Filter');

  // List all
  const all = await request('GET', '/api/v1/approval/list');
  check('List returns 200', all.status === 200);
  check('Has requests array', Array.isArray(all.body.requests));
  check('Has count', typeof all.body.count === 'number');

  // Filter by type
  const expenses = await request('GET', '/api/v1/approval/list?type=expense');
  check('Filter by type works', expenses.status === 200);

  // Filter by status
  const approved = await request('GET', '/api/v1/approval/list?status=approved');
  check('Filter by status works', approved.status === 200);

  // List employees
  const emps = await request('GET', '/api/v1/approval/employees');
  check('Employees returns 200', emps.status === 200);
  check('Has employees', emps.body.count >= 1);
}

async function scenarioEdgeCases() {
  section('Scenario F: Edge Cases');

  // Missing requesterId
  const noRequester = await request('POST', '/api/v1/approval/submit', {
    payload: { reason: 'test' },
  });
  check('Missing requesterId returns 400', noRequester.status === 400);

  // Non-existent employee
  const badEmployee = await request('POST', '/api/v1/approval/submit', {
    requesterId: 'emp-nonexistent',
    payload: { reason: 'test' },
  });
  check('Bad employee returns 404', badEmployee.status === 404);

  // Invalid decision
  const invalidDecision = await request('POST', '/api/v1/approval/decide/fake-id', {
    deciderId: 'emp-mgr-001',
    decision: 'maybe',
  });
  check('Invalid decision returns 400', invalidDecision.status === 400);

  // Non-existent request
  const badRequest = await request('GET', '/api/v1/approval/status/nonexistent');
  check('Non-existent request returns 404', badRequest.status === 404);
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  const args = process.argv.slice(2);
  const scenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1]?.toUpperCase();

  console.log('=== Approval Workflow E2E Tests ===');
  console.log(`API: ${API_BASE}\n`);

  try {
    if (!scenario || scenario === 'A') await scenarioA();
    if (!scenario || scenario === 'B') await scenarioB();
    if (!scenario || scenario === 'C') await scenarioC();
    if (!scenario || scenario === 'D') await scenarioD();
    if (!scenario || scenario === 'E') await scenarioE();
    if (!scenario || scenario === 'F') await scenarioEdgeCases();
  } catch (err) {
    console.error(`\n⚠️ Test error: ${err.message}`);
    if (err.code === 'ECONNREFUSED') {
      console.error('Is the API server running? Start with: npm start');
    }
    failed++;
  }

  console.log(`\n════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`════════════════════════════════`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
