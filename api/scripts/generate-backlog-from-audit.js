/**
 * Generate BackLog items from FlowDesk Compliance Audit results.
 * Creates 25 BACKLOG items for MUST violations with SourceReferences.
 */

const backlogService = require('../src/services/backlog/backlog.service');
const sourceRefService = require('../src/services/backlog/source-reference.service');

const VIOLATIONS = [
  // ────────────────────────────────────────────────────────────
  // FD-007: Notification Templates as Knowledge Nodes (15)
  // ────────────────────────────────────────────────────────────
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded email template string in send-notification executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/send-notification.executor.js',
    criteria: ['All template strings moved to NotificationTemplate nodes in Memgraph', 'Executor fetches template by templateId', 'Templates support {{variable}} interpolation']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline approval request message in request-approval executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/request-approval.executor.js',
    criteria: ['Approval request message loaded from Memgraph template', 'Template includes approver name, request details, action buttons']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded assignment notification in assign-handler executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/assign-handler.executor.js',
    criteria: ['Assignment notification template in Memgraph', 'Template supports previous/new assignee variables']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline confirmation text in confirm-request executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/confirm-request.executor.js',
    criteria: ['Confirmation message loaded from template', 'Supports localization variables']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded spawn process notification in spawn-process executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/spawn-process.executor.js',
    criteria: ['Process spawn notification loaded from template', 'Template includes process type and reference number']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline search location prompt in search-location executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/search-location.executor.js',
    criteria: ['Location search prompt loaded from template', 'Template supports context-dependent phrasing']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded beneficiary ask prompt in ask-beneficiary executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/ask-beneficiary.executor.js',
    criteria: ['Beneficiary prompt loaded from template', 'Template adapts based on request type']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline classify intent system prompt in classify-intent executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/classify-intent.executor.js',
    criteria: ['Intent classification prompt loaded from template', 'Category list configurable via template']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded dialog welcome message in runtime-chat',
    targetPath: 'api/src/services/flowdesk/runtime-chat.js',
    criteria: ['Welcome message loaded from NotificationTemplate', 'Supports session-context variables']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline error message in dialog session handler',
    targetPath: 'api/src/services/flowdesk/dialog-session.js',
    criteria: ['Error messages loaded from template', 'Different templates for different error types']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded find-user prompt in find-user executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/find-user.executor.js',
    criteria: ['User search prompt loaded from template', 'Template handles multiple search strategies']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline service request confirmation in create-service-request executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/create-service-request.executor.js',
    criteria: ['Confirmation summary loaded from template', 'Template renders all collected fields']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded work order message in create-work-order executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/create-work-order.executor.js',
    criteria: ['Work order creation message loaded from template', 'Template includes order reference and status']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Inline location check message in check-location executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/check-location.executor.js',
    criteria: ['Location check feedback loaded from template', 'Template adapts for found/not-found scenarios']
  },
  {
    ruleId: 'CODEX-RULE-FD-007', priority: 'P2_MEDIUM', taskType: 'REFACTOR', effort: 'S',
    violation: 'Hardcoded dialog clarify-intent prompt',
    targetPath: 'api/src/services/flowdesk/executors/dialog/clarify-intent.js',
    criteria: ['Clarification prompt loaded from template', 'Template includes detected ambiguity context']
  },

  // ────────────────────────────────────────────────────────────
  // FD-004: Assignment Must Preserve Audit Trail (7)
  // ────────────────────────────────────────────────────────────
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'IMPLEMENT', effort: 'M',
    violation: 'No audit log on assignment change in assign-handler executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/assign-handler.executor.js',
    criteria: ['preExecute() emits AuditRecord to audit log', 'AuditRecord includes previousAssignee, newAssignee, reason, actorId, timestamp', 'Audit records queryable via Memgraph']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'IMPLEMENT', effort: 'M',
    violation: 'No audit trail on service request reassignment',
    targetPath: 'api/src/services/flowdesk/executors/assign-handler.js',
    criteria: ['Reassignment creates AuditRecord', 'Previous and new assignee recorded', 'Reason field is mandatory']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'IMPLEMENT', effort: 'M',
    violation: 'Missing actor tracking on auto-assignment in get-user-context',
    targetPath: 'api/src/services/flowdesk/executors/get-user-context.js',
    criteria: ['Auto-assignment records actorId as SYSTEM', 'Assignment reason captured as AUTO_ROUTING', 'Timestamp precision to millisecond']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'FIX', effort: 'S',
    violation: 'Missing timestamp on ownership change in create-service-request',
    targetPath: 'api/src/services/flowdesk/executors/create-service-request.js',
    criteria: ['Initial assignment includes ISO timestamp', 'Ownership field tracks full history']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'IMPLEMENT', effort: 'S',
    violation: 'No reason capture on handler unassignment',
    targetPath: 'api/src/services/flowdesk/executors/assign-handler.js',
    criteria: ['Unassignment requires reason parameter', 'Reason stored in audit record', 'Default reason MANUAL_UNASSIGN if not provided']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'FIX', effort: 'S',
    violation: 'Missing previous assignee in work order assignment log',
    targetPath: 'api/src/services/flowdesk/executors/create-work-order.js',
    criteria: ['Assignment log includes previousAssignee (null for first assignment)', 'Full change history preserved']
  },
  {
    ruleId: 'CODEX-RULE-FD-004', priority: 'P1_HIGH', taskType: 'IMPLEMENT', effort: 'M',
    violation: 'No audit on request-approval assignment change',
    targetPath: 'api/src/services/flowdesk/executors/request-approval.js',
    criteria: ['Approval assignment creates audit trail', 'Approver selection reason logged', 'Escalation changes tracked']
  },

  // ────────────────────────────────────────────────────────────
  // FD-001: Approval Chain Must Be Explicit (2)
  // ────────────────────────────────────────────────────────────
  {
    ruleId: 'CODEX-RULE-FD-001', priority: 'P1_HIGH', taskType: 'REFACTOR', effort: 'L',
    violation: 'Hardcoded approver resolution logic in request-approval executor',
    targetPath: 'api/src/core/aopeg/plugins/flowdesk/executors/request-approval.executor.js',
    criteria: ['Approver resolution extracted to separate ApproverResolverExecutor', 'Resolution logic is graph-executable (not hardcoded)', 'Supports role-based, manager-based, and custom approval chains']
  },
  {
    ruleId: 'CODEX-RULE-FD-001', priority: 'P1_HIGH', taskType: 'REFACTOR', effort: 'M',
    violation: 'Embedded approval logic with direct manager lookup',
    targetPath: 'api/src/services/flowdesk/executors/request-approval.js',
    criteria: ['Manager lookup delegated to KnowledgeGraph query', 'Approval chain defined as graph parameter', 'Fallback to admin if chain empty']
  },

  // ────────────────────────────────────────────────────────────
  // FD-002: Escalation Timeout Must Be Graph Parameter (1)
  // ────────────────────────────────────────────────────────────
  {
    ruleId: 'CODEX-RULE-FD-002', priority: 'P1_HIGH', taskType: 'REFACTOR', effort: 'M',
    violation: 'Hardcoded SLA timeout (48h) in check-sla logic',
    targetPath: 'api/src/services/flowdesk/executors/update-sr-status.js',
    criteria: ['SLA timeout read from ctx.graphParams.escalationTimeoutHours', 'Default timeout configurable per service category', 'No hardcoded time values in executor code']
  }
];

async function generateBacklog() {
  console.log('Generating BackLog from FlowDesk Compliance Audit...\n');
  console.log(`Total violations: ${VIOLATIONS.length}`);
  console.log(`  FD-007 (templates): ${VIOLATIONS.filter(v => v.ruleId.includes('FD-007')).length}`);
  console.log(`  FD-004 (audit trail): ${VIOLATIONS.filter(v => v.ruleId.includes('FD-004')).length}`);
  console.log(`  FD-001 (approval chain): ${VIOLATIONS.filter(v => v.ruleId.includes('FD-001')).length}`);
  console.log(`  FD-002 (SLA params): ${VIOLATIONS.filter(v => v.ruleId.includes('FD-002')).length}`);
  console.log();

  let created = 0, failed = 0;

  for (const v of VIOLATIONS) {
    try {
      // Create BackLog item
      const item = await backlogService.create({
        title: `[${v.ruleId.split('-').pop()}] ${v.violation}`,
        description: `Compliance violation detected by FlowDesk audit.\n\nRule: ${v.ruleId}\nViolation: ${v.violation}\nTarget: ${v.targetPath}\n\nThis task was auto-generated from compliance audit results. The executor/service at the target path violates the MUST requirement of ${v.ruleId}.`,
        taskType: v.taskType,
        targetType: 'EXECUTOR',
        targetPath: v.targetPath,
        priority: v.priority,
        effort: v.effort,
        acceptanceCriteria: v.criteria,
        relatedCodexRules: [v.ruleId],
        tags: ['flowdesk', 'compliance-audit', 'auto-generated', v.ruleId.split('-').pop().toLowerCase()],
        sourceContext: 'Auto-generated from FlowDesk Compliance Audit (F3-A)'
      }, { createdBy: 'agent:compliance-audit' });

      // Add source reference: AUDIT_FINDING
      try {
        await sourceRefService.addSource(item.backlogId, {
          sourceType: 'AUDIT_FINDING',
          sourceId: `AUDIT-FD-${String(created + 1).padStart(3, '0')}`,
          sourceTitle: `FlowDesk Audit Finding: ${v.violation}`,
          relevance: `MUST violation of ${v.ruleId} found during compliance scan of ${v.targetPath}`
        }, { addedBy: 'agent:compliance-audit', sourceContext: 'task_creation' });
      } catch {}

      // Add source reference: CODEX_RULE
      try {
        await sourceRefService.addCodexSource(
          item.backlogId, v.ruleId,
          `Task addresses violation of ${v.ruleId}`,
          { addedBy: 'agent:compliance-audit' }
        );
      } catch {}

      console.log(`  OK ${item.backlogId}: ${item.title.substring(0, 70)}`);
      created++;
    } catch (err) {
      console.error(`  ERR: ${v.violation.substring(0, 50)} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${created} created, ${failed} failed`);
  console.log(`BackLog now has ${created + 6} total items (6 existing + ${created} new)`);
  console.log(`${'='.repeat(60)}`);
}

if (require.main === module) {
  generateBacklog()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { generateBacklog, VIOLATIONS };
