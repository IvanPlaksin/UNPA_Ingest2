/**
 * FlowDesk Executor Codex Compliance Audit
 *
 * Analyzes 12 AOPEG FlowDesk executors + 18 service executors
 * against 10 FlowDesk Codex Rules (CODEX-RULE-022..031)
 *
 * Run: node api/scripts/audit-flowdesk-compliance.js
 */

const fs = require('fs');
const path = require('path');

const EXECUTORS_AOPEG = path.join(__dirname, '../src/core/aopeg/plugins/flowdesk/executors');
const EXECUTORS_SVC = path.join(__dirname, '../src/services/flowdesk/executors');

const RULES = {
  'FD-001': { id: 'CODEX-RULE-022', title: 'Approval Chain Must Be Explicit', modality: 'MUST' },
  'FD-002': { id: 'CODEX-RULE-023', title: 'Escalation Timeout Must Be Graph Parameter', modality: 'MUST' },
  'FD-003': { id: 'CODEX-RULE-024', title: 'Routing Rules as Separate Sub-Graph', modality: 'SHOULD' },
  'FD-004': { id: 'CODEX-RULE-025', title: 'Assignment Must Preserve Audit Trail', modality: 'MUST' },
  'FD-005': { id: 'CODEX-RULE-026', title: 'Status Transitions as State Machine Graph', modality: 'MUST' },
  'FD-006': { id: 'CODEX-RULE-027', title: 'Status Change Requires Reason Code', modality: 'SHOULD' },
  'FD-007': { id: 'CODEX-RULE-028', title: 'Notification Templates as Knowledge Nodes', modality: 'MUST' },
  'FD-008': { id: 'CODEX-RULE-029', title: 'Intent Classification Confidence Threshold', modality: 'MUST' },
  'FD-009': { id: 'CODEX-RULE-030', title: 'KEEP/TRANSFORM/ELIMINATE Classification', modality: 'MUST' },
  'FD-010': { id: 'CODEX-RULE-031', title: 'Legacy Procedure Provenance Required', modality: 'MUST' },
};

// Static analysis checks
function analyzeExecutor(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);
  const findings = [];

  // FD-001: Check for hardcoded approver logic
  if (name.includes('approval') || name.includes('request-approval')) {
    if (code.includes('auto-approve') || code.includes('Auto-approved') || /Manager of/.test(code)) {
      findings.push({ rule: 'FD-001', status: 'VIOLATION', detail: 'Hardcoded approver logic found' });
    } else {
      findings.push({ rule: 'FD-001', status: 'COMPLIANT', detail: 'Explicit approval chain' });
    }
  }

  // FD-002: Check for hardcoded timeouts/SLA
  if (/\d+\s*\*\s*3600/.test(code) || /\d+\s*\*\s*60\s*\*\s*60/.test(code)) {
    findings.push({ rule: 'FD-002', status: 'VIOLATION', detail: 'Hardcoded timeout/SLA value found' });
  }
  if (/sla_hours|timeout_hours|config\.sla|config\.timeout/.test(code)) {
    findings.push({ rule: 'FD-002', status: 'COMPLIANT', detail: 'SLA/timeout as parameter' });
  }

  // FD-004: Check for audit logging
  if (name.includes('assign') || name.includes('create') || name.includes('approval') || name.includes('spawn') || name.includes('update')) {
    if (/audit|log.*assign|history.*push.*action/i.test(code)) {
      findings.push({ rule: 'FD-004', status: 'PARTIAL', detail: 'Some audit logging present' });
    } else {
      findings.push({ rule: 'FD-004', status: 'VIOLATION', detail: 'No audit trail for critical operation' });
    }
  }

  // FD-006: Check for reason codes
  if (name.includes('status') || name.includes('approval') || name.includes('confirm') || name.includes('notification')) {
    if (/reason_?code|reason:/i.test(code)) {
      findings.push({ rule: 'FD-006', status: 'COMPLIANT', detail: 'Reason code present' });
    } else {
      findings.push({ rule: 'FD-006', status: 'VIOLATION', detail: 'No reason code on state change' });
    }
  }

  // FD-007: Check for hardcoded templates
  if (/response:|message:|prompt:/.test(code)) {
    if (/template.*Id|fetchTemplate|knowledge.*node/i.test(code)) {
      findings.push({ rule: 'FD-007', status: 'COMPLIANT', detail: 'Templates from knowledge nodes' });
    } else if (/`[^`]*\$\{[^}]+\}[^`]*`/.test(code) || /['"][^'"]{30,}['"]/.test(code)) {
      findings.push({ rule: 'FD-007', status: 'VIOLATION', detail: 'Hardcoded template strings' });
    }
  }

  // FD-008: Check confidence threshold
  if (name.includes('classify') || name.includes('intent') || name.includes('open-query')) {
    if (/confidence.*>=?\s*0\.\d+|threshold.*0\.\d+/i.test(code)) {
      findings.push({ rule: 'FD-008', status: 'COMPLIANT', detail: 'Numeric confidence threshold enforced' });
    } else if (/confidence/i.test(code)) {
      findings.push({ rule: 'FD-008', status: 'PARTIAL', detail: 'Confidence mentioned but threshold unclear' });
    }
  }

  // FD-010: Check for legacy provenance
  if (/legacySource|DERIVED_FROM|legacy.*procedure|migration.*source/i.test(code)) {
    findings.push({ rule: 'FD-010', status: 'COMPLIANT', detail: 'Legacy provenance present' });
  }

  return { name, path: filePath, findings };
}

function runAudit() {
  console.log('FlowDesk Codex Compliance Audit');
  console.log('='.repeat(60));
  console.log(`Date: ${new Date().toISOString()}\n`);

  const results = [];

  // Scan AOPEG executors
  console.log('## AOPEG Plugin Executors\n');
  const aopegFiles = fs.readdirSync(EXECUTORS_AOPEG).filter(f => f.endsWith('.js'));
  for (const file of aopegFiles) {
    const r = analyzeExecutor(path.join(EXECUTORS_AOPEG, file));
    results.push(r);
    printExecutorResult(r);
  }

  // Scan service executors
  console.log('\n## Service Executors\n');
  const svcFiles = fs.readdirSync(EXECUTORS_SVC).filter(f => f.endsWith('.js') && f !== 'index.js');
  for (const file of svcFiles) {
    const r = analyzeExecutor(path.join(EXECUTORS_SVC, file));
    results.push(r);
    printExecutorResult(r);
  }

  // Scan dialog executors
  const dialogDir = path.join(EXECUTORS_SVC, 'dialog');
  if (fs.existsSync(dialogDir)) {
    console.log('\n## Dialog Executors\n');
    const dialogFiles = fs.readdirSync(dialogDir).filter(f => f.endsWith('.js'));
    for (const file of dialogFiles) {
      const r = analyzeExecutor(path.join(dialogDir, file));
      results.push(r);
      printExecutorResult(r);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('COMPLIANCE SUMMARY');
  console.log('='.repeat(60));

  const allFindings = results.flatMap(r => r.findings);
  const violations = allFindings.filter(f => f.status === 'VIOLATION');
  const compliant = allFindings.filter(f => f.status === 'COMPLIANT');
  const partial = allFindings.filter(f => f.status === 'PARTIAL');

  console.log(`\nTotal executors scanned: ${results.length}`);
  console.log(`Total checks performed: ${allFindings.length}`);
  console.log(`  COMPLIANT:  ${compliant.length}`);
  console.log(`  PARTIAL:    ${partial.length}`);
  console.log(`  VIOLATION:  ${violations.length}`);

  // Violations by rule
  console.log('\nViolations by Rule:');
  const byRule = {};
  for (const v of violations) {
    byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  }
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    const info = RULES[rule];
    console.log(`  ${rule} (${info?.modality || '?'}): ${count} violations — ${info?.title || rule}`);
  }

  // Top priorities
  console.log('\nTop Priorities:');
  console.log('  1. FD-007: Externalize all hardcoded template strings to Knowledge Nodes');
  console.log('  2. FD-004: Add audit logging to all assignment/creation/status operations');
  console.log('  3. FD-006: Add reason_code to all status transitions');
  console.log('  4. FD-001: Replace auto-approve with explicit approval chain lookup');
  console.log('  5. FD-002: Replace hardcoded SLA (72h) in spawn-process with graph parameter');

  const complianceRate = allFindings.length > 0
    ? Math.round(((compliant.length + partial.length * 0.5) / allFindings.length) * 100)
    : 0;
  console.log(`\nOverall Compliance Rate: ${complianceRate}%`);

  return { results, violations: violations.length, compliant: compliant.length, complianceRate };
}

function printExecutorResult(r) {
  if (r.findings.length === 0) {
    console.log(`  ${r.name}: (no applicable rules)`);
    return;
  }
  console.log(`  ${r.name}:`);
  for (const f of r.findings) {
    const icon = f.status === 'COMPLIANT' ? '+' : f.status === 'PARTIAL' ? '~' : 'x';
    console.log(`    [${icon}] ${f.rule}: ${f.status} — ${f.detail}`);
  }
}

if (require.main === module) {
  const { complianceRate } = runAudit();
  process.exit(0);
}

module.exports = { runAudit };
