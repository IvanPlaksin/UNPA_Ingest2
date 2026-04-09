/**
 * Seed BlackCodex with known anti-patterns and failures
 *
 * Source: Lessons learned from UN ProjectAdvisor development
 *
 * Run: node api/scripts/seed-blackcodex.js
 */

const blackCodexService = require('../src/services/codex/blackcodex.service');

const ANTI_PATTERNS = [
  {
    type: 'AntiPattern',
    title: 'Direct String Interpolation in Cypher',
    summary: 'Using template literals to build Cypher queries with user input',
    failureContext: 'Early memgraph.service.js implementation used string interpolation for query building',
    symptom: 'Security audit flagged potential Cypher injection vulnerability',
    rootCause: 'Developer convenience prioritized over security; lack of parameterized query enforcement',
    refactoringPlan: '1. Replace all interpolated queries with parameterized versions. 2. Add linting rule to detect interpolation in .cypher strings. 3. Update CODEX-CRUD to explicitly forbid this pattern.',
    alternativeTo: 'CODEX-RULE-021',
    confidenceInDiagnosis: 0.95,
    tags: ['security', 'cypher', 'injection']
  },
  {
    type: 'AntiPattern',
    title: 'Premature Contradiction Resolution',
    summary: 'Automatically choosing one fact when two contradict instead of preserving both',
    failureContext: 'Initial knowledge extraction pipeline discarded "duplicate" business rules',
    symptom: 'Users reported missing edge cases and exceptions that were critical to business logic',
    rootCause: 'Clean data mindset from traditional ETL; failure to recognize contradiction as information',
    refactoringPlan: '1. Implement CONTRADICTS edge type. 2. Add contradiction classifier (TEMPORAL/CONTEXTUAL/SOURCE_CONFLICT/DIRECT). 3. Train agents to preserve contradictions until human resolution.',
    alternativeTo: 'CODEX-RULE-005',
    confidenceInDiagnosis: 0.90,
    tags: ['contradiction', 'data-quality', 'knowledge-loss']
  },
  {
    type: 'FailedApproach',
    title: 'Monolithic Codex Markdown Document',
    summary: 'Storing all Codex rules in a single 8000-line markdown file',
    failureContext: 'CODEX_UN_PROJECTADVISOR_v0_1_0.md was the entire Codex as one document',
    symptom: 'Agents could not selectively load relevant rules; context window overflow; no machine-readable structure',
    rootCause: 'Documentation-first approach; treating Codex as human document rather than executable knowledge',
    refactoringPlan: '1. Migrate Codex to graph namespace. 2. Each rule becomes a node with Information Contract. 3. Agents load via graph traversal, not document parsing. 4. generateDocumentation() proves reversibility.',
    alternativeTo: 'CODEX-RULE-016',
    confidenceInDiagnosis: 0.95,
    tags: ['architecture', 'documentation', 'graph-first']
  },
  {
    type: 'AntiPattern',
    title: 'Silent Validation Failures',
    summary: 'Validation errors logged but not surfaced to callers',
    failureContext: 'Early schema-registry.js logged validation failures but returned success',
    symptom: 'Invalid nodes appeared in database; downstream queries failed with cryptic errors',
    rootCause: 'Defensive coding pattern that swallowed errors; missing strict mode toggle',
    refactoringPlan: '1. Add CODEX_STRICT_VALIDATION env toggle. 2. Throw typed errors (ValidationError, SchemaError). 3. Return validation result objects with errors array. 4. Document error codes in appendix.',
    alternativeTo: '',
    confidenceInDiagnosis: 0.85,
    tags: ['validation', 'error-handling', 'debugging']
  },
  {
    type: 'FailedApproach',
    title: 'GNN Training Without ACTIVE_CONFIG Filtering',
    summary: 'Including all edges in GNN training data without filtering infrastructure noise',
    failureContext: 'First GNN training run on live Memgraph data',
    symptom: 'GNN predictions were dominated by ACTIVE_CONFIG relationships; semantic relationships drowned out',
    rootCause: 'ACTIVE_CONFIG edges comprised ~90% of all edges but carried no semantic meaning',
    refactoringPlan: '1. Add edge type whitelist for GNN training. 2. Filter out ACTIVE_CONFIG and other infrastructure edges. 3. Document edge classification in CODEX-CATALOG.',
    alternativeTo: '',
    confidenceInDiagnosis: 0.90,
    tags: ['gnn', 'data-quality', 'training']
  },
  {
    type: 'ResolvedContradiction',
    title: 'ExecutionRecord Namespace Conflict',
    summary: 'ExecutionRecord nodes were created in PROJECT namespace but belonged in META',
    failureContext: 'runtime-adapter.ts had PATTERN_NAMESPACE = "PROJECT" hardcoded',
    symptom: 'ExecutionRecords polluted project knowledge graphs; namespace isolation violated',
    rootCause: 'Copy-paste from example code; lack of namespace routing tests',
    refactoringPlan: '1. Migration script to move ExecutionRecords to META. 2. Update runtime-adapter.ts to use META. 3. Add namespace validation in create path.',
    alternativeTo: 'CODEX-RULE-019',
    confidenceInDiagnosis: 1.0,
    tags: ['namespace', 'migration', 'codex-ns']
  },
  {
    type: 'AntiPattern',
    title: 'Confidence Without Calibration',
    summary: 'Assigning confidence scores without empirical calibration or disclosure',
    failureContext: 'Early extraction assigned confidence=0.8 to all LLM-extracted facts',
    symptom: 'Users treated all extractions as equally reliable; actual accuracy was 0.6-0.9 depending on source',
    rootCause: 'No feedback loop to calibrate confidence; one-size-fits-all scoring',
    refactoringPlan: '1. Implement confidence by source type (AST=1.0, Regex=0.9, LLM=0.7). 2. Add qualityTier assignment rule. 3. Require uncertainty disclosure for confidence < 0.7.',
    alternativeTo: 'CODEX-RULE-003',
    confidenceInDiagnosis: 0.85,
    tags: ['confidence', 'calibration', 'trust']
  }
];

async function seedBlackCodex() {
  console.log('Starting BlackCodex seed...\n');

  const context = { createdBy: 'seed-script' };
  const created = [];

  try {
    for (const entry of ANTI_PATTERNS) {
      const result = await blackCodexService.createEntry(entry.type, entry, context);
      created.push(result);
      console.log(`+ ${result.codexId}: ${result.title}`);

      // Link to correct approach if specified
      if (entry.alternativeTo) {
        try {
          await blackCodexService.linkToCorrectApproach(result.codexId, entry.alternativeTo);
          console.log(`  -> REJECTED_IN_FAVOR_OF ${entry.alternativeTo}`);
        } catch (err) {
          console.warn(`  Warning: Could not link to ${entry.alternativeTo}: ${err.message}`);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('BlackCodex seed complete!');
    console.log('='.repeat(50));
    console.log(`   Entries created: ${created.length}`);
    console.log(`   AntiPatterns: ${ANTI_PATTERNS.filter(e => e.type === 'AntiPattern').length}`);
    console.log(`   FailedApproaches: ${ANTI_PATTERNS.filter(e => e.type === 'FailedApproach').length}`);
    console.log(`   ResolvedContradictions: ${ANTI_PATTERNS.filter(e => e.type === 'ResolvedContradiction').length}`);

    return created;

  } catch (error) {
    console.error('Seed failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  seedBlackCodex()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { seedBlackCodex, ANTI_PATTERNS };
