/**
 * Seed FlowDesk Chat V2 Codex Rules (derived from recon R0/R1/R2)
 *
 * These rules ratify the architecture decisions for the FlowDesk interactive
 * AI chat (iNeed successor): unified LLM provider, typed retrieval, DraftSR as
 * the sole session-state carrier, tref-only conditionality, and schema-bounded
 * question planning.
 *
 * Run: node api/scripts/seed-codex-flowdesk-chat-v2-rules.js
 */

const codexService = require('../src/services/codex/codex.service');

const FLOWDESK_CHAT_V2_RULES = [
  // ─── R0: PROVIDER BOUNDARIES ───────────────────────────────
  {
    title: 'LLM Access Only Through Unified LLMProvider',
    summary: 'All chat/interpreter LLM calls MUST go through the unified LLMProvider interface. Direct child_process spawn of the Claude Code CLI, or direct Anthropic SDK/API calls, from chat/interpreter code is FORBIDDEN.',
    rationale: 'Recon R0 found two disjoint layers (spawn wrapper + StructuredOutputService) and a third (LLMProviderService) plus findClaudeBinary() duplicated in 4+ places. A single interface enables model switching, structured-output guarantees, access-control gating, and cost tracking in one place.',
    whyItExists: 'FlowDesk chat must switch model/backend by config (ClaudeCodeProvider spawn | ClaudeSDKProvider | AnthropicAPIProvider) without touching call sites.',
    examples: [
      'interpreter node → llmProvider.structuredOutput(prompt, schema, opts)',
      'Never: spawn(findClaudeBinary(), [...]) inside a dialog executor'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'llm', 'provider'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'chat-v2', 'llm-provider']
  },

  // ─── R2: TYPED RETRIEVAL ───────────────────────────────────
  {
    title: 'resolve.search Returns a Typed Union',
    summary: 'The single retrieval entry point resolve.search MUST return a typed union of {type, payload, score} where type ∈ {SERVICE, ARTICLE, SR_STATUS}. Callers MUST branch on type; untyped result rows are FORBIDDEN.',
    rationale: 'Recon R2: SERVICE (Qdrant flowdesk_services) is mature, ARTICLE (platform knowledge) is unconnected, SR_STATUS (tickets+requests) is fragmented. A typed union lets one fan-out serve intent resolution, KB deflection, and status lookup without three ad-hoc call paths.',
    whyItExists: 'Contract 3 unifies three backends behind one search so the interpreter graph has a single retrieval node.',
    examples: [
      'resolve.search("laptop") → [{type:SERVICE,payload:{service_code},score}, {type:ARTICLE,...}]',
      'Cross-type ranking: exact SR ref (SR_STATUS) > SERVICE > ARTICLE'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'retrieval', 'catalog', 'kb'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'chat-v2', 'resolve-search']
  },

  // ─── R1: SESSION STATE ─────────────────────────────────────
  {
    title: 'DraftSR Is the Sole Session-State Carrier',
    summary: 'Filled slots, intent history, and flow position MUST live in a durable DraftSR (SessionEnvelope), read at turn start and written at turn end. In-memory Map session state and ad-hoc per-field accumulation in the runtime are FORBIDDEN.',
    rationale: 'Recon R1: runtime-chat.js keeps state only in an in-memory Map (lost on restart) and accumulates ~20 slots via hand-written if-branches. Re-execution per turn requires externalized state; a single DraftSR removes the "kitchen sink" and survives restarts.',
    whyItExists: 'GXE re-executes the graph each turn (no resume), so state must be externalized and schema-driven, not manually copied node-by-node.',
    examples: [
      'turn start: draft = draftStore.load(sessionId); graph runs against draft',
      'turn end: draftStore.save(sessionId, patchedDraft) — never sessions.set(id, {...20 fields})'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'session', 'state'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'chat-v2', 'draft-sr', 'session-envelope']
  },

  // ─── GXE: CONDITIONALITY ───────────────────────────────────
  {
    title: 'Conditional Slots via tref-Filtering, Never Branch-Merge Topology',
    summary: 'Conditional/optional questions in a dialog flow MUST be realized by tref-* filtering (a node is skipped when its slot is irrelevant), NEVER by branch-then-merge graph topology. Merge nodes in dialog graphs are FORBIDDEN.',
    rationale: 'Dialog graphs are strict linear DAGs; merge nodes cause skip-cascades and formal dead transitions (WF-net). The "first-pass happy path" implementer anti-pattern tends to straighten logic or build merges — this rule blocks both.',
    whyItExists: 'Preserves soundness of the flow-as-data interpreter graph and keeps Petri/Woflan verification (L3) valid.',
    examples: [
      'ask-justification node carries tref filter: skip when service.approval_required=false',
      'Never: condition node with two edges that reconverge on a shared downstream node'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'gxe', 'dialog', 'topology'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'chat-v2', 'tref', 'linear-dag']
  },

  // ─── INTERPRETER: QUESTION PLANNER ─────────────────────────
  {
    title: 'Question Planner Bounded to Active Schema Fields',
    summary: 'The interpreter QUESTION_PLANNER node MUST only ask for slots declared in the active flow schema (SchemaSnapshot). Asking for fields outside the active schema, or free-form questions unbound to a slot, is FORBIDDEN.',
    rationale: 'Guardrail: the graph, not the prompt, defines the space of possible questions. Bounding the planner to schema fields keeps the agent inside the business context and makes each turn reproducible and auditable.',
    whyItExists: 'Prevents topic drift and prompt-driven improvisation; the flow schema is the contract for what may be asked.',
    examples: [
      'planner input = unfilled required slots ∩ SchemaSnapshot.fields',
      'Never: planner emits "what is your favorite color?" (not a schema slot)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['flowdesk', 'interpreter', 'question-planner'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['flowdesk', 'chat-v2', 'guardrail', 'schema-bounded']
  }
];

async function seedFlowDeskChatV2Rules() {
  console.log('Seeding FlowDesk Chat V2 Codex Rules...\n');

  const context = { isAdmin: true, createdBy: 'seed-flowdesk-chat-v2' };
  const created = [];

  for (const ruleData of FLOWDESK_CHAT_V2_RULES) {
    const { derivesFromPrinciple, ...nodeData } = ruleData;

    const rule = await codexService.createNode('CodexRule', {
      ...nodeData,
      deonticState: 'ACTIVE'
    }, context);

    const ruleCodexId = rule.codexId || rule.properties?.codexId;
    console.log(`+ ${ruleCodexId}: ${nodeData.title}`);
    created.push({ id: ruleCodexId, title: nodeData.title });

    if (derivesFromPrinciple && ruleCodexId) {
      try {
        await codexService.linkRuleToPrinciple(ruleCodexId, derivesFromPrinciple, 1.0);
        console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`);
      } catch (err) {
        console.warn(`  Warning: ${err.message}`);
      }
    }
  }

  console.log(`\nFlowDesk Chat V2 rules seeded: ${created.length}`);
  console.log(JSON.stringify(created, null, 2));
  return created;
}

if (require.main === module) {
  seedFlowDeskChatV2Rules()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seedFlowDeskChatV2Rules, FLOWDESK_CHAT_V2_RULES };
