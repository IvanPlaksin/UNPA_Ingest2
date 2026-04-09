#!/usr/bin/env node
/**
 * Seed 15 Codex rules for the Graph Type System.
 * Categories: 5 MUST, 5 SHOULD, 5 MUST_NOT
 *
 * Usage:
 *   node api/scripts/seed-codex-graph-type-rules.js [--dry-run]
 */

const memgraph = require('../src/services/memgraph.service');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const RULES = [
  // ── MUST ──────────────────────────────────────────────────────────────
  {
    codexId: 'GTS-001', modality: 'MUST',
    title: 'Graph Must Have graphType',
    summary: 'Every GraphDefinition node MUST have a non-null graphType property from the valid enum: EXECUTABLE, TEMPLATE, COMPOSITE, PROCESS, STRUCTURAL, STORABLE, PROJECTION, CONSTRAINT, VALIDATION, EVENT.',
    rationale: 'Type system enables RuntimeEngine routing, compile-time validation, and semantic clarity.',
    scope: '["GraphDefinition"]',
    tags: '["graph-type-system","mandatory","migration"]',
    examples: '["graphType: EXECUTABLE, graphSubType: dialog","GraphCatalogService.createGraph() validates graphType before creation"]',
  },
  {
    codexId: 'GTS-002', modality: 'MUST',
    title: 'EXECUTABLE Requires Valid SubType',
    summary: 'EXECUTABLE graphs with non-default behavior MUST have graphSubType: dialog (checkpoint), business (SAGA), or extraction (spiral).',
    rationale: 'SubType determines RuntimeEngine configuration — checkpoint, SAGA, spiral execution patterns.',
    scope: '["GraphDefinition","EXECUTABLE"]',
    tags: '["graph-type-system","executable","subtype"]',
    examples: '["dialog: checkpoint + re-execution per turn","business: SAGA + compensate on failure","extraction: spiral convergence monitoring"]',
  },
  {
    codexId: 'GTS-003', modality: 'MUST',
    title: 'CONSTRAINT Must Link to STRUCTURAL',
    summary: 'Every CONSTRAINT graph MUST have a CONSTRAINS relationship to exactly one STRUCTURAL graph. Orphan CONSTRAINTs are forbidden.',
    rationale: 'CONSTRAINT rules are meaningless without the schema they validate.',
    scope: '["GraphDefinition","CONSTRAINT","STRUCTURAL"]',
    tags: '["graph-type-system","constraint","structural","relationship"]',
    examples: '["(c:GD {graphType:CONSTRAINT})-[:CONSTRAINS]->(s:GD {graphType:STRUCTURAL})","structuralGraphId property + CONSTRAINS edge required"]',
  },
  {
    codexId: 'GTS-004', modality: 'MUST',
    title: 'STORABLE Must Conform to STRUCTURAL',
    summary: 'Every STORABLE graph MUST have a CONFORMS_TO relationship to exactly one STRUCTURAL graph. Data must validate against the STRUCTURAL JSON Schema.',
    rationale: 'STORABLE is an instance of a schema; without schema reference, data is untyped.',
    scope: '["GraphDefinition","STORABLE","STRUCTURAL"]',
    tags: '["graph-type-system","storable","conformance"]',
    examples: '["(storable:GD)-[:CONFORMS_TO]->(structural:GD)","Validate data against compiled JSON Schema before persisting"]',
  },
  {
    codexId: 'GTS-005', modality: 'MUST',
    title: 'RuntimeEngine Must Enforce Type Gates',
    summary: 'RuntimeEngine.execute() MUST check graphType and reject non-executable types. Executable: EXECUTABLE, COMPOSITE, VALIDATION. TEMPLATE requires instantiation. PROCESS requires compilation.',
    rationale: 'Prevents architectural confusion — schema graphs and audit graphs have no execution semantics.',
    scope: '["RuntimeEngine","GraphDefinition"]',
    tags: '["graph-type-system","runtime","type-gate","security"]',
    examples: '["STRUCTURAL → GraphTypeError: Cannot execute","TEMPLATE → GraphTypeError: requires instantiation","EXECUTABLE → passes gate, proceeds to scheduler"]',
  },

  // ── SHOULD ────────────────────────────────────────────────────────────
  {
    codexId: 'GTS-006', modality: 'SHOULD',
    title: 'Complex Forms Should Use STRUCTURAL',
    summary: 'Forms with 5+ fields, conditional visibility, cross-field validation, or i18n requirements SHOULD use STRUCTURAL+CONSTRAINT instead of legacy parameterSchema.',
    rationale: 'STRUCTURAL provides reusability, i18n, conditional visibility, and dual-target compilation (backend+frontend).',
    scope: '["WAIT_FOR_INPUT","FormBuilder","FLOWDESK"]',
    tags: '["graph-type-system","structural","forms","best-practice"]',
    examples: '["SR_HardwareRequest: 17 fields → STRUCTURAL","Simple yes/no confirm: 1 field → legacy parameterSchema"]',
  },
  {
    codexId: 'GTS-007', modality: 'SHOULD',
    title: 'STRUCTURAL Should Have CONSTRAINT',
    summary: 'Every STRUCTURAL graph SHOULD have at least one linked CONSTRAINT graph defining validation rules. Minimum: required() on primary field.',
    rationale: 'Forms without validation provide poor UX. Even minimal rules improve data quality.',
    scope: '["STRUCTURAL","CONSTRAINT"]',
    tags: '["graph-type-system","validation","quality"]',
    examples: '["Minimum: .required(primaryField)","Full: required + minLength + visibility + computed"]',
  },
  {
    codexId: 'GTS-008', modality: 'SHOULD',
    title: 'Dialog Workflows Should Set SubType',
    summary: 'Workflows with 2+ WAIT_FOR_INPUT nodes SHOULD set graphSubType=dialog. Enables checkpoint-based re-execution pattern.',
    rationale: 'Dialog subType enables checkpoint for multi-turn conversations required for FlowDesk workflows.',
    scope: '["EXECUTABLE","FLOWDESK"]',
    tags: '["graph-type-system","dialog","checkpoint","flowdesk"]',
    examples: '["EX SOP5: 10 WAIT nodes → graphSubType=dialog","Single WAIT node: subType optional"]',
  },
  {
    codexId: 'GTS-009', modality: 'SHOULD',
    title: 'COMPOSITE Should Define Isolation Policy',
    summary: 'COMPOSITE graphs SHOULD explicitly define isolationPolicy: fail-fast, continue-on-error, or compensate.',
    rationale: 'Without explicit isolation semantics, sub-graph error handling is ambiguous.',
    scope: '["COMPOSITE"]',
    tags: '["graph-type-system","composite","isolation","error-handling"]',
    examples: '["fail-fast: first sub-graph failure fails entire COMPOSITE","compensate: SAGA-style rollback"]',
  },
  {
    codexId: 'GTS-010', modality: 'SHOULD',
    title: 'STRUCTURAL Fields Should Have i18n Labels',
    summary: 'STRUCTURAL field labels SHOULD include English (en) and at least one additional UN official language (fr, es, ar, zh, ru).',
    rationale: 'UN system operates in 6 official languages. Forms must support multilingual users.',
    scope: '["STRUCTURAL","FLOWDESK"]',
    tags: '["graph-type-system","i18n","un-languages","accessibility"]',
    examples: '["label: { en: Requestor Name, fr: Nom du demandeur, ru: Имя заявителя }"]',
  },

  // ── MUST_NOT ──────────────────────────────────────────────────────────
  {
    codexId: 'GTS-011', modality: 'MUST_NOT',
    title: 'Never Execute Non-Executable Types',
    summary: 'Code MUST NOT call execute() on STRUCTURAL, STORABLE, PROJECTION, CONSTRAINT, or EVENT graphs.',
    rationale: 'These types have no execution semantics. Use compile() or validate() instead.',
    scope: '["RuntimeEngine","GraphDefinition"]',
    tags: '["graph-type-system","anti-pattern","runtime"]',
    examples: '["WRONG: runtimeEngine.execute(structuralGraph)","RIGHT: structuralToJsonSchema.compile(structuralGraph)"]',
  },
  {
    codexId: 'GTS-012', modality: 'MUST_NOT',
    title: 'Never Create Orphan CONSTRAINT',
    summary: 'Code MUST NOT create CONSTRAINT graphs without CONSTRAINS relationship to a STRUCTURAL graph.',
    rationale: 'Orphan CONSTRAINTs cannot be compiled or applied — they are dead code.',
    scope: '["CONSTRAINT","STRUCTURAL"]',
    tags: '["graph-type-system","anti-pattern","orphan"]',
    examples: '["WRONG: CREATE CONSTRAINT without CONSTRAINS edge","RIGHT: CREATE CONSTRAINT + MERGE CONSTRAINS edge in same transaction"]',
  },
  {
    codexId: 'GTS-013', modality: 'MUST_NOT',
    title: 'Never Flatten COMPOSITE Without Analysis',
    summary: 'Code MUST NOT automatically flatten COMPOSITE graphs to EXECUTABLE without analyzing isolation requirements (shared state, error boundaries, reuse).',
    rationale: 'COMPOSITE exists for isolation. Flattening loses scope boundaries and error propagation policies.',
    scope: '["COMPOSITE","EXECUTABLE"]',
    tags: '["graph-type-system","anti-pattern","composite"]',
    examples: '["Check before flattening: Do sub-graphs share state? Need independent error handling? Reused elsewhere?"]',
  },
  {
    codexId: 'GTS-014', modality: 'MUST_NOT',
    title: 'Never Store Validation Logic in Executors',
    summary: 'Validation rules MUST NOT be hardcoded in executor implementations. Use CONSTRAINT graphs instead.',
    rationale: 'Executor-level validation is not reusable, not i18n-capable, and not visible to form builder.',
    scope: '["CONSTRAINT","BaseExecutor"]',
    tags: '["graph-type-system","anti-pattern","separation-of-concerns"]',
    examples: '["WRONG: if (input.name.length < 2) throw in executor","RIGHT: constraintBuilder.minLength(name, 2)"]',
  },
  {
    codexId: 'GTS-015', modality: 'MUST_NOT',
    title: 'Never Skip Type Migration',
    summary: 'Code MUST NOT create or leave graphs without graphType. All 116 existing graphs have been migrated. New graphs must include graphType.',
    rationale: 'Type-less graphs bypass type gates, produce incorrect routing, and break form pipeline.',
    scope: '["GraphDefinition","GraphCatalogService"]',
    tags: '["graph-type-system","anti-pattern","migration"]',
    examples: '["WRONG: createGraph({ name, nodes }) without graphType","RIGHT: createGraph({ name, graphType: EXECUTABLE, nodes })"]',
  },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n=== Codex Graph Type System Rules ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  for (const rule of RULES) {
    const contentHash = crypto.createHash('sha256').update(rule.summary).digest('hex');

    console.log(`  [${rule.modality}] ${rule.codexId}: ${rule.title}`);

    if (!dryRun) {
      await memgraph.runQuery(
        'MERGE (r:CodexRule {codexId: $codexId}) ' +
        'SET r.title = $title, r.summary = $summary, r.rationale = $rationale, ' +
        'r.modality = $modality, r.scope = $scope, r.tags = $tags, r.examples = $examples, ' +
        'r.ruleKind = "PRESCRIPTIVE", r.status = "ACTIVE", r.deonticState = "ACTIVE", ' +
        'r.namespace = "Codex", r.nodeType = "CodexRule", r.version = "1.0.0", ' +
        'r.contentHash = $contentHash, r.domain = "GRAPH_TYPE_SYSTEM", ' +
        'r.createdBy = "seed-script", r.createdAt = $now, ' +
        'r.changeabilityTier = "ADMIN_ONLY" ' +
        'RETURN r.codexId',
        {
          ...rule,
          contentHash,
          now: new Date().toISOString(),
        }
      );
    }
  }

  console.log(`\n${dryRun ? 'Would seed' : 'Seeded'} ${RULES.length} Codex rules.`);
  if (!dryRun) {
    console.log('Verification: MATCH (r:CodexRule) WHERE r.domain = "GRAPH_TYPE_SYSTEM" RETURN count(r)');
  }
  process.exit(0);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
