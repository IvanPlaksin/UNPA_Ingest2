#!/usr/bin/env node
/**
 * Seed Approval Workflow Schema + Test Data
 *
 * Creates entities, relationships, and approval rules in Memgraph
 * for the Approval Workflow PoC.
 *
 * Usage:
 *   node api/scripts/seed-approval-schema.js
 *   node api/scripts/seed-approval-schema.js --clear
 *   node api/scripts/seed-approval-schema.js --dry-run
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

// ====================================================================
// SCHEMA + SEED DATA
// ====================================================================

const DEPARTMENTS = [
  { id: 'dept-eng', name: 'Engineering', budget: 50000 },
  { id: 'dept-sales', name: 'Sales', budget: 30000 },
  { id: 'dept-hr', name: 'Human Resources', budget: 20000 },
];

const EMPLOYEES = [
  {
    id: 'emp-ceo-001',
    name: 'Maria Torres',
    email: 'maria.torres@company.com',
    role: 'CEO',
    department: 'dept-eng',
    leaveBalance: 30,
    expenseLimit: 10000,
    managerId: null,
  },
  {
    id: 'emp-dir-001',
    name: 'James Chen',
    email: 'james.chen@company.com',
    role: 'Director of Engineering',
    department: 'dept-eng',
    leaveBalance: 25,
    expenseLimit: 5000,
    managerId: 'emp-ceo-001',
  },
  {
    id: 'emp-mgr-001',
    name: 'Sarah Kumar',
    email: 'sarah.kumar@company.com',
    role: 'Engineering Manager',
    department: 'dept-eng',
    leaveBalance: 20,
    expenseLimit: 1000,
    managerId: 'emp-dir-001',
  },
  {
    id: 'emp-staff-001',
    name: 'Alex Johnson',
    email: 'alex.johnson@company.com',
    role: 'Software Engineer',
    department: 'dept-eng',
    leaveBalance: 20,
    expenseLimit: 100,
    managerId: 'emp-mgr-001',
  },
  {
    id: 'emp-staff-002',
    name: 'Priya Patel',
    email: 'priya.patel@company.com',
    role: 'Senior Engineer',
    department: 'dept-eng',
    leaveBalance: 15,
    expenseLimit: 200,
    managerId: 'emp-mgr-001',
  },
];

const APPROVAL_RULES = [
  {
    id: 'rule-expense-auto',
    type: 'expense',
    condition: 'amount < employee.expenseLimit',
    action: 'auto_approve',
    priority: 1,
    description: 'Auto-approve expenses below employee limit',
  },
  {
    id: 'rule-expense-manager',
    type: 'expense',
    condition: 'amount >= employee.expenseLimit',
    action: 'require_manager',
    priority: 2,
    description: 'Manager approval for expenses above limit',
  },
  {
    id: 'rule-leave-balance',
    type: 'leave',
    condition: 'days <= employee.leaveBalance',
    action: 'require_manager',
    priority: 1,
    description: 'Check leave balance then require manager approval',
  },
  {
    id: 'rule-purchase-tier1',
    type: 'purchase',
    condition: 'amount < 1000',
    action: 'require_manager',
    priority: 1,
    description: 'Manager only for purchases under $1000',
  },
  {
    id: 'rule-purchase-tier2',
    type: 'purchase',
    condition: 'amount >= 1000 && amount < 5000',
    action: 'require_manager_director',
    priority: 2,
    description: 'Manager + Director for $1000-$5000',
  },
  {
    id: 'rule-purchase-tier3',
    type: 'purchase',
    condition: 'amount >= 5000',
    action: 'require_full_chain',
    priority: 3,
    description: 'Full chain for purchases over $5000',
  },
];

// ====================================================================
// CYPHER GENERATION
// ====================================================================

function generateCypherStatements() {
  const statements = [];

  // Constraints
  statements.push('CREATE CONSTRAINT ON (e:Employee) ASSERT e.id IS UNIQUE;');
  statements.push('CREATE CONSTRAINT ON (d:Department) ASSERT d.id IS UNIQUE;');
  statements.push('CREATE CONSTRAINT ON (r:ApprovalRequest) ASSERT r.id IS UNIQUE;');
  statements.push('CREATE CONSTRAINT ON (d:Decision) ASSERT d.id IS UNIQUE;');
  statements.push('CREATE CONSTRAINT ON (r:ApprovalRule) ASSERT r.id IS UNIQUE;');

  // Indexes
  statements.push('CREATE INDEX ON :ApprovalRequest(status);');
  statements.push('CREATE INDEX ON :ApprovalRequest(type);');
  statements.push('CREATE INDEX ON :ApprovalRule(type);');
  statements.push('CREATE INDEX ON :Employee(email);');

  // Departments
  for (const dept of DEPARTMENTS) {
    statements.push(
      `MERGE (d:Department {id: '${dept.id}'})
       SET d.name = '${dept.name}', d.budget = ${dept.budget}, d.namespace = 'PROJECT';`
    );
  }

  // Employees
  for (const emp of EMPLOYEES) {
    statements.push(
      `MERGE (e:Employee {id: '${emp.id}'})
       SET e.name = '${emp.name}',
           e.email = '${emp.email}',
           e.role = '${emp.role}',
           e.leaveBalance = ${emp.leaveBalance},
           e.expenseLimit = ${emp.expenseLimit},
           e.namespace = 'PROJECT';`
    );
  }

  // Employee → Department
  for (const emp of EMPLOYEES) {
    statements.push(
      `MATCH (e:Employee {id: '${emp.id}'}), (d:Department {id: '${emp.department}'})
       MERGE (e)-[:WORKS_IN]->(d);`
    );
  }

  // Employee → Manager (REPORTS_TO)
  for (const emp of EMPLOYEES) {
    if (emp.managerId) {
      statements.push(
        `MATCH (e:Employee {id: '${emp.id}'}), (m:Employee {id: '${emp.managerId}'})
         MERGE (e)-[:REPORTS_TO]->(m);`
      );
    }
  }

  // Approval Rules
  for (const rule of APPROVAL_RULES) {
    statements.push(
      `MERGE (r:ApprovalRule {id: '${rule.id}'})
       SET r.type = '${rule.type}',
           r.condition = '${rule.condition}',
           r.action = '${rule.action}',
           r.priority = ${rule.priority},
           r.description = '${rule.description}',
           r.namespace = 'CORE';`
    );
  }

  return statements;
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clearFirst = args.includes('--clear');

  console.log('=== Approval Workflow Schema Seeder ===\n');

  const statements = generateCypherStatements();

  if (dryRun) {
    console.log('[DRY RUN] Would execute the following Cypher statements:\n');
    statements.forEach((s, i) => console.log(`  [${i + 1}] ${s.trim()}\n`));
    console.log(`\nTotal: ${statements.length} statements`);
    console.log(`  Departments: ${DEPARTMENTS.length}`);
    console.log(`  Employees: ${EMPLOYEES.length}`);
    console.log(`  Approval Rules: ${APPROVAL_RULES.length}`);
    console.log(`  Relationships: ${EMPLOYEES.filter(e => e.managerId).length} REPORTS_TO + ${EMPLOYEES.length} WORKS_IN`);
    process.exit(0);
  }

  let memgraph;
  try {
    memgraph = require('../src/services/memgraph.service');
  } catch (err) {
    console.error('Cannot load memgraph.service:', err.message);
    console.log('Make sure you are running from the project root.');
    process.exit(1);
  }

  if (clearFirst) {
    console.log('[1/3] Clearing existing approval data...');
    try {
      await memgraph.runCypher("MATCH (n) WHERE n:Employee OR n:Department OR n:ApprovalRequest OR n:Decision OR n:ApprovalRule DETACH DELETE n;");
      console.log('  Cleared.');
    } catch (err) {
      console.error(`  Warning: ${err.message}`);
    }
  }

  console.log(`[${clearFirst ? '2/3' : '1/2'}] Executing ${statements.length} Cypher statements...`);
  let success = 0;
  let errors = 0;

  for (const stmt of statements) {
    try {
      await memgraph.runCypher(stmt);
      success++;
    } catch (err) {
      // Constraints may already exist
      if (err.message.includes('already exists') || err.message.includes('Constraint')) {
        success++;
      } else {
        errors++;
        console.error(`  FAIL: ${err.message}`);
        console.error(`  Statement: ${stmt.trim().slice(0, 80)}...`);
      }
    }
  }

  console.log(`  OK: ${success} succeeded, ${errors} failed`);

  // Verify
  console.log(`\n[${clearFirst ? '3/3' : '2/2'}] Verifying...`);
  try {
    const counts = await memgraph.runCypher(`
      MATCH (e:Employee) WITH count(e) AS employees
      MATCH (d:Department) WITH employees, count(d) AS departments
      MATCH (r:ApprovalRule) WITH employees, departments, count(r) AS rules
      RETURN employees, departments, rules
    `);
    const row = counts.records?.[0] || counts[0];
    if (row) {
      console.log(`  Employees: ${row.employees || row.get?.('employees')}`);
      console.log(`  Departments: ${row.departments || row.get?.('departments')}`);
      console.log(`  Approval Rules: ${row.rules || row.get?.('rules')}`);
    }
  } catch (err) {
    console.error(`  Verify failed: ${err.message}`);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
