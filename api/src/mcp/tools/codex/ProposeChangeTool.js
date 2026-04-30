const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class ProposeChangeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.propose_change',
      name: 'Propose Codex Change',
      version: '2.0.0',
      level: 3,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: `Propose a new Codex rule, pattern, anti-pattern, or a change to an existing one. Creates a CodexProposal for human review.

WRITING GUIDELINES — every proposal MUST follow these:
1. COMPLETENESS: Fill in ALL required fields. A rule without rationale, examples, or whyItExists is useless.
2. ABSTRACTION LEVEL: Write rules that are specific enough to be actionable in the described context, but abstract enough to apply to similar situations. Do NOT write rules tied to one-off incidents — extract the general principle. Do NOT write rules so abstract that they cannot guide a concrete decision.
3. RATIONALE: Explain WHY this rule exists — what goes wrong without it, what pattern it prevents. This is the most important field after title.
4. EXAMPLES: Provide at least 2 concrete examples showing correct application AND what violation looks like.
5. TRACEABILITY: Link to a Codex Principle (derivesFromPrinciple) when possible. This anchors the rule in the M3 foundation.
6. SCOPE: Always specify which parts of the system this rule applies to.`,
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 5,
            maxLength: 200,
            description: 'Short, descriptive rule title (3-200 chars). Example: "Mandatory Provenance Fields for KnowledgeQuantum"'
          },
          summary: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
            description: 'What this rule prescribes in 1-2 sentences. Must be self-contained — a reader should understand the rule from summary alone.'
          },
          rationale: {
            type: 'string',
            minLength: 30,
            description: 'WHY this rule exists. What problem does it prevent? What happens without it? This is the most critical field — it must convey the reasoning behind the rule, not just restate it.'
          },
          whyItExists: {
            type: 'string',
            minLength: 15,
            description: 'The specific event, incident, or observation that created the need for this rule. Example: "Early extraction produced orphan facts with no traceability, leading to untraceable knowledge in production."'
          },
          examples: {
            type: 'array',
            items: { type: 'string', minLength: 15 },
            minItems: 1,
            description: 'At least 1 concrete example (2+ recommended). Each example should show either correct application or what a violation looks like. Example: ["CORRECT: confidence: 0.85, inferredBy: sql-parser-v2", "VIOLATION: KnowledgeQuantum saved without extractionCycleId — breaks traceability chain"]'
          },
          change_type: {
            type: 'string',
            enum: ['NEW_RULE', 'MODIFY_RULE', 'DEPRECATE_RULE', 'NEW_PATTERN', 'NEW_ANTIPATTERN'],
            description: 'Type of change: NEW_RULE (create CodexRule), MODIFY_RULE (change existing), DEPRECATE_RULE (mark obsolete), NEW_PATTERN (recommended approach), NEW_ANTIPATTERN (BlackCodex entry)'
          },
          target_rule_id: {
            type: 'string',
            description: 'Target rule codexId for MODIFY_RULE or DEPRECATE_RULE (e.g., "CODEX-RULE-042"). Required for modifications.'
          },
          scope: {
            type: 'array',
            items: { type: 'string' },
            description: 'System areas this rule applies to. Examples: ["gxe", "graph"], ["flowdesk", "dialog"], ["extraction", "KnowledgeQuantum"]. Be specific but not overly narrow.'
          },
          modality: {
            type: 'string',
            enum: ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'],
            description: 'Deontic modality: MUST (mandatory), SHOULD (recommended), MAY (optional), MUST_NOT (prohibited), SHOULD_NOT (discouraged). Default: SHOULD.'
          },
          ruleKind: {
            type: 'string',
            enum: ['CONSTITUTIVE', 'PRESCRIPTIVE'],
            description: 'CONSTITUTIVE = defines a term/concept. PRESCRIPTIVE = mandates behavior. Default: PRESCRIPTIVE.'
          },
          derivesFromPrinciple: {
            type: 'string',
            description: 'Codex Principle ID (format: PRINCIPLE-0-N, e.g., PRINCIPLE-0-4). MUST call codex.get_principles first to get valid IDs — do not invent them. Missing/invalid reference creates dangling link.'
          },
          agentConfidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'How confident are you that this rule is correct and complete? 0.0 = uncertain, 1.0 = certain. Default: 0.7.'
          }
        },
        required: ['title', 'summary', 'rationale', 'whyItExists', 'examples', 'change_type']
      },
      outputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          status: { type: 'string' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_propose_change', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { ProposeChangeTool };
