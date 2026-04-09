/**
 * Seed FlowDesk-specific Codex Rules
 *
 * These rules govern:
 * - Business process migration from iNeed
 * - AOPEG executor patterns for ITSM workflows
 * - FlowDesk graph structure requirements
 *
 * Run: node api/scripts/seed-codex-flowdesk-rules.js
 */

const codexService = require('../src/services/codex/codex.service');

const FLOWDESK_RULES = [
  // ─── APPROVAL & ESCALATION ─────────────────────────────────
  {
    title: 'Approval Chain Must Be Explicit',
    summary: 'Every approval workflow MUST define explicit approver resolution logic as a separate executor node, never hardcoded in the approval executor itself.',
    rationale: 'iNeed had approver logic scattered across 47 stored procedures. Centralizing approver resolution enables audit trail and rule changes without code deployment.',
    whyItExists: 'FlowDesk request-approval.executor.js should delegate approver lookup to a separate node for flexibility.',
    examples: [
      'assign-handler → request-approval → send-notification (correct)',
      'Never: request-approval with embedded manager lookup'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'approval', 'gxe'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'approval', 'architecture']
  },
  {
    title: 'Escalation Timeout Must Be Graph Parameter',
    summary: 'SLA escalation timeouts MUST be graph-level parameters, not executor constants. Enables runtime configuration without redeployment.',
    rationale: 'iNeed escalation rules were hardcoded in PL/SQL. Moving to graph parameters allows business users to adjust SLAs.',
    whyItExists: 'FlowDesk needs configurable SLA without code changes for different service categories.',
    examples: [
      'graph.parameters.escalationTimeoutHours = 24',
      'SLA check reads from ctx.graphParams.escalationTimeoutHours'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'escalation', 'sla'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'sla', 'configuration']
  },

  // ─── ROUTING & ASSIGNMENT ──────────────────────────────────
  {
    title: 'Routing Rules as Separate Sub-Graph',
    summary: 'Complex routing logic SHOULD be extracted into a reusable sub-graph, not embedded in a single assign-handler executor.',
    rationale: 'Enables routing rule reuse across different workflow types (Incident, Service Request, Change).',
    whyItExists: 'assign-handler.executor.js currently handles routing inline; extracting enables reuse.',
    examples: [
      'routing-by-category sub-graph reused by incident and service-request graphs',
      'assign-handler calls sub-graph via spawn-process edge'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['flowdesk', 'routing', 'gxe'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'REVIEWED',
    tags: ['flowdesk', 'routing', 'reuse']
  },
  {
    title: 'Assignment Must Preserve Audit Trail',
    summary: 'Every assignment change MUST emit an AssignmentRecord to the audit log before executing the assignment.',
    rationale: 'UN compliance requires full audit trail of ticket ownership changes.',
    whyItExists: 'assign-handler executor needs audit logging for compliance.',
    examples: [
      'assign-handler preExecute → auditService.logAssignment()',
      'AssignmentRecord: previousAssignee, newAssignee, reason, timestamp, actorId'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'assignment', 'audit'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'audit', 'compliance']
  },

  // ─── STATUS & STATE MACHINE ────────────────────────────────
  {
    title: 'Status Transitions as State Machine Graph',
    summary: 'Valid status transitions MUST be defined as a declarative state machine graph, not imperative if/else chains.',
    rationale: 'iNeed status transitions were 2000+ lines of PL/SQL. Graph-based state machine is self-documenting and auditable.',
    whyItExists: 'FlowDesk needs auditable, visual state transitions for service requests.',
    examples: [
      'NEW → IN_PROGRESS → PENDING → RESOLVED → CLOSED',
      'Invalid transitions throw ValidationError with allowed transitions list'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'status', 'state-machine'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'status', 'state-machine']
  },
  {
    title: 'Status Change Requires Reason Code',
    summary: 'Every status transition SHOULD capture a reason code from a controlled vocabulary, except for automated system transitions.',
    rationale: 'Enables analytics on why tickets stall, reopen, or escalate.',
    whyItExists: 'Data-driven service improvement requires understanding status change reasons.',
    examples: [
      'reasonCode: USER_REQUEST | AUTO_TIMEOUT | ESCALATION | RESOLUTION',
      'Automated transitions use reasonCode: SYSTEM_AUTO'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['flowdesk', 'status', 'analytics'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'REVIEWED',
    tags: ['flowdesk', 'analytics', 'reason-codes']
  },

  // ─── NOTIFICATION ──────────────────────────────────────────
  {
    title: 'Notification Templates as Knowledge Nodes',
    summary: 'Email/notification templates MUST be stored as KnowledgeNodes in PROJECT namespace, not hardcoded strings in executors.',
    rationale: 'Enables template updates without code deployment; supports UN multilingual requirements.',
    whyItExists: 'send-notification executor needs externalized, multilingual templates.',
    examples: [
      'send-notification fetches template by templateId from Memgraph',
      'Templates support {{variable}} interpolation and locale selection'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'notification', 'i18n'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'notification', 'templates']
  },

  // ─── DIALOG & INTENT ──────────────────────────────────────
  {
    title: 'Intent Classification Confidence Threshold',
    summary: 'classify-intent executor MUST use confidence threshold >= 0.6 before routing. Below threshold, ask for clarification.',
    rationale: 'Prevents misrouting service requests based on ambiguous user input.',
    whyItExists: 'Early FlowDesk routing had false positives from low-confidence classifications.',
    examples: [
      'confidence >= 0.6 → route to matched category',
      'confidence < 0.6 → ask-beneficiary for clarification'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'intent', 'classification'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'dialog', 'confidence']
  },

  // ─── MIGRATION PATTERNS ────────────────────────────────────
  {
    title: 'KEEP/TRANSFORM/ELIMINATE Classification Required',
    summary: 'Every iNeed business rule being migrated MUST be classified as KEEP (as-is), TRANSFORM (adapt), or ELIMINATE (obsolete).',
    rationale: 'Prevents accidental migration of obsolete or redundant iNeed logic.',
    whyItExists: 'FlowDesk migration from iNeed requires systematic triage of business rules.',
    examples: [
      'iNeed "auto-close after 30 days" → TRANSFORM (make configurable)',
      'iNeed "fax notification" → ELIMINATE (obsolete)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'migration', 'classification'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-005',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'migration', 'ineed']
  },
  {
    title: 'Legacy Procedure Provenance Required',
    summary: 'Every FlowDesk executor derived from iNeed MUST include provenance metadata linking to the original stored procedure or workflow.',
    rationale: 'Enables traceability for audit and debugging; supports knowledge preservation mission.',
    whyItExists: 'UN requires traceability from new system to legacy system artifacts.',
    examples: [
      'executor.metadata.legacySource = "INEED.PKG_APPROVAL.PROCESS_APPROVAL"',
      'Provenance stored as DERIVED_FROM relationship to LegacyProcedure node'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'migration', 'provenance'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'provenance', 'legacy']
  }
];

async function seedFlowDeskRules() {
  console.log('Seeding FlowDesk Codex Rules...\n');

  const context = { isAdmin: true, createdBy: 'seed-script' };
  let created = 0;

  for (const ruleData of FLOWDESK_RULES) {
    const { derivesFromPrinciple, ...nodeData } = ruleData;

    const rule = await codexService.createNode('CodexRule', {
      ...nodeData,
      deonticState: 'ACTIVE'
    }, context);

    const ruleCodexId = rule.codexId || rule.properties?.codexId;
    console.log(`+ ${ruleCodexId}: ${nodeData.title}`);

    if (derivesFromPrinciple && ruleCodexId) {
      try {
        await codexService.linkRuleToPrinciple(ruleCodexId, derivesFromPrinciple, 1.0);
        console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`);
      } catch (err) {
        console.warn(`  Warning: ${err.message}`);
      }
    }
    created++;
  }

  console.log(`\nFlowDesk rules seeded: ${created}`);
}

if (require.main === module) {
  seedFlowDeskRules()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seedFlowDeskRules, FLOWDESK_RULES };
