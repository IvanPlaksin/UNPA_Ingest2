/**
 * Seed Codex Rule: Missing Tool → BackLog Task
 * Run: node api/scripts/seed-codex-missing-tool-rule.js
 */

const codexService = require('../src/services/codex/codex.service');

const RULES = [
  {
    title: 'Missing Tool Must Be Logged to BackLog',
    summary: 'When an AI agent discovers that a required executor/tool is missing from the catalog, the agent MUST create a detailed BackLog task using the backlog.create_task MCP tool, describing the missing tool, its expected inputs/outputs, and the context where it was needed.',
    rationale: 'The system grows through self-identification of gaps. Agents working with GXE graphs and AOPEG executors are best positioned to discover which tools are needed but do not yet exist. Without this rule, missing tool gaps are silently ignored or worked around with suboptimal solutions.',
    whyItExists: 'During FlowDesk migration and GXE graph construction, agents frequently encounter situations where the ideal executor does not exist. These discoveries must be captured as actionable tasks rather than lost.',
    examples: [
      'Agent building an approval workflow discovers no AuditLogExecutor exists → calls backlog.create_task with taskType=IMPLEMENT, targetType=EXECUTOR, title="Implement AuditLogExecutor for assignment audit trail", acceptanceCriteria=["Executor accepts assignment data", "Emits AuditRecord to Memgraph", "Passes integration test"], relatedCodexRules=["CODEX-RULE-025"]',
      'Agent building a notification flow discovers templates are hardcoded → calls backlog.create_task with taskType=REFACTOR, targetType=SERVICE, title="Create NotificationTemplateService to externalize templates", sourceContext="Discovered during FlowDesk notification graph generation"',
      'Agent cannot find a ConfidenceCalibrationExecutor for quality scoring → creates BackLog task with detailed parameterSchema describing expected inputs (rawScore, sourceType) and outputs (calibratedScore, qualityTier)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['gxe', 'assistant', 'graph', 'execution', 'flowdesk', 'extraction', 'agent'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-005',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['backlog', 'missing-tool', 'self-improvement', 'agent-behavior', 'gap-detection']
  },
  {
    title: 'Missing Tool BackLog Task Must Include Specification',
    summary: 'A BackLog task for a missing tool SHOULD include: expected executorId, parameterSchema (input fields with types), outputSchema, the business context where it is needed, and at least one usage example showing how it would fit into a GXE graph.',
    rationale: 'A vague "need tool X" task is not actionable. The agent who discovered the gap has the most context about what the tool should do, so capturing this context at discovery time produces higher quality specifications.',
    whyItExists: 'Early missing-tool reports lacked detail, making implementation guesswork. Requiring structured specification enables another agent or human to implement the tool correctly.',
    examples: [
      'Good BackLog task description: "Implement flowdesk.audit_log executor. Input: { assignmentData: { previousAssignee, newAssignee, reason, actorId }, auditType: enum[ASSIGNMENT, STATUS_CHANGE, APPROVAL] }. Output: { auditRecordId, timestamp, persisted: boolean }. Context: needed in Laptop Request Workflow between assign-handler and send-notification nodes."',
      'Good acceptance criteria: ["Executor registered in AOPEG plugin registry under flowdesk domain", "parameterSchema validates input before execution", "AuditRecord persisted to Memgraph with namespace=META", "Unit test with mock data passes"]'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['gxe', 'assistant', 'graph', 'execution', 'flowdesk', 'agent'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'REVIEWED',
    tags: ['backlog', 'missing-tool', 'specification', 'agent-behavior']
  }
];

async function seed() {
  console.log('Seeding Missing Tool → BackLog Codex Rules...\n');
  const context = { isAdmin: true, createdBy: 'seed-script' };

  for (const ruleData of RULES) {
    const { derivesFromPrinciple, ...nodeData } = ruleData;
    const rule = await codexService.createNode('CodexRule', { ...nodeData, deonticState: 'ACTIVE' }, context);
    const id = rule.codexId || rule.properties?.codexId;
    console.log(`+ ${id}: ${nodeData.title}`);
    if (derivesFromPrinciple && id) {
      await codexService.linkRuleToPrinciple(id, derivesFromPrinciple, 1.0).catch(e => console.warn(`  warn: ${e.message}`));
      console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`);
    }
  }
  console.log('\nDone.');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { RULES };
