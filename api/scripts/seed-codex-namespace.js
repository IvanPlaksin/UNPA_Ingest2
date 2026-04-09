/**
 * Seed Codex Namespace with M3 Principles
 *
 * Source: docs/codex/manifesto/AI_MANIFESTO.md
 *
 * Run: node api/scripts/seed-codex-namespace.js
 */

const codexService = require('../src/services/codex/codex.service');

// ============================================================
// M3 PRINCIPLES - Immutable philosophical foundations
// ============================================================

const PRINCIPLES = [
  {
    title: 'Context Over Data',
    summary: 'A fact without context is noise. Every piece of knowledge must carry its provenance, relationships, and semantic context.',
    rationale: 'Legacy systems contain millions of data points, but their meaning is often lost without understanding the business context in which they were created. The system must preserve not just facts, but the web of relationships that give them meaning.',
    whyItExists: 'UN legacy systems (IMIS, iNeed, TFS) contain decades of institutional knowledge that risks being lost during modernization. Without context preservation, data becomes meaningless.',
    examples: [
      'A stored procedure name "SP_CALC_LEAVE_2003" is meaningless without knowing it implements a specific HR policy from 2003 that was superseded in 2015 but still applies to pre-2015 employees',
      'A database column "STATUS_CD" requires context about valid values, business rules, and how it changed over system versions'
    ],
    philosophicalBasis: 'Contextual semantics in knowledge representation; Wittgenstein language games - meaning derives from use in context',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'epistemology', 'provenance'],
    applicableLabels: ['KnowledgeQuantum', 'BusinessRule', 'Pattern']
  },
  {
    title: 'Uncertainty Over False Confidence',
    summary: 'When confidence is below 0.5, it is better to say "I don\'t know" than to assert uncertain knowledge as fact.',
    rationale: 'AI systems that express false confidence erode trust and can lead to incorrect decisions. Epistemic humility is a feature, not a weakness. The system must model and communicate its own uncertainty.',
    whyItExists: 'Early AI extraction attempts produced plausible-looking but incorrect knowledge. Users lost trust when "confident" assertions proved wrong. The cost of false positives exceeds the cost of acknowledged uncertainty.',
    examples: [
      'Extracting a business rule with 0.4 confidence: report as "possible rule, requires human verification" rather than asserting it as fact',
      'When two sources conflict, preserve both with explicit uncertainty rather than arbitrarily choosing one'
    ],
    philosophicalBasis: 'Bayesian epistemology; calibrated uncertainty; intellectual honesty as epistemic virtue',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'epistemology', 'confidence'],
    applicableLabels: ['KnowledgeQuantum', 'ExtractionCycle']
  },
  {
    title: 'Contradiction as Signal',
    summary: 'Two conflicting facts are not an error to be resolved, but a signal revealing the true complexity of the domain.',
    rationale: 'Real enterprise systems evolve over decades with policy changes, exceptions, and edge cases. Contradictions often reflect genuine historical complexity. The system must model contradictions explicitly rather than forcing premature resolution.',
    whyItExists: 'Initial attempts to build a "clean" knowledge base failed because they discarded contradictory information. Later analysis showed the contradictions contained critical business logic about temporal validity and contextual exceptions.',
    examples: [
      'Rule A says "maximum leave is 30 days" while Rule B says "maximum leave is 45 days" — both are correct for different employee categories',
      'CONTRADICTS edge with type CONTEXTUAL preserves both facts and documents the resolution path'
    ],
    philosophicalBasis: 'Paraconsistent logic; dialectical reasoning; contradiction as driver of understanding (Hegel)',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'epistemology', 'contradiction'],
    applicableLabels: ['BusinessRule', 'Pattern', 'KnowledgeQuantum']
  },
  {
    title: 'Versioning as Respect for History',
    summary: 'Nothing is deleted — only superseded. Every version of knowledge is preserved with its full temporal context.',
    rationale: 'Institutional memory includes not just current state, but how we got here. Understanding why a rule changed is often as important as knowing the current rule. Immutable history enables audit, learning, and rollback.',
    whyItExists: 'UN systems require complete audit trails for compliance. Additionally, understanding historical decisions prevents repeating mistakes and preserves institutional learning.',
    examples: [
      'When a business rule is updated, the old version receives status SUPERSEDED and a SUPERSEDES edge links to the new version',
      'Tombstones enable soft delete with 90-day restoration window; physical deletion requires explicit human approval'
    ],
    philosophicalBasis: 'Temporal logic; event sourcing; institutional memory as organizational asset',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'immutability', 'versioning'],
    applicableLabels: ['NodeVersion', 'GraphVersion', 'Tombstone']
  },
  {
    title: 'Spiral Growth Model',
    summary: 'Knowledge extraction follows an ascending spiral: DISCOVER → EXTRACT → VALIDATE → STORE → CONNECT → DISCOVER. Each cycle adds depth.',
    rationale: 'Knowledge cannot be extracted in a single pass. Each iteration reveals new patterns, resolves contradictions, and deepens understanding. The system must support continuous refinement rather than one-shot extraction.',
    whyItExists: 'First extraction passes achieved ~40% coverage. Subsequent cycles with feedback loops reached 85%+. The spiral model formalizes this iterative improvement.',
    examples: [
      'First pass extracts table schemas; second pass discovers relationships; third pass infers business rules; fourth pass validates against actual usage patterns',
      'Each ExtractionCycle node links to previous cycles, tracking improvement in confidence and coverage metrics'
    ],
    philosophicalBasis: 'Hermeneutic circle; iterative refinement; continuous improvement (Kaizen)',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'methodology', 'extraction'],
    applicableLabels: ['ExtractionCycle', 'Pipeline']
  },
  {
    title: 'Graph as Program',
    summary: 'All knowledge and processes are executable graphs. The distinction between data and code dissolves — the graph IS the program.',
    rationale: 'Traditional systems separate documentation, business logic, and data. This separation leads to drift and inconsistency. By representing everything as executable graphs, the system becomes self-describing and self-executing.',
    whyItExists: 'GXE (Graph Execution Engine) emerged from the need to make extracted business logic not just documented but runnable. FlowDesk workflows are being migrated from hardcoded logic to executable graphs.',
    examples: [
      'A business approval workflow exists as a GXE graph that can be visualized, versioned, and executed',
      'AOPEG model: nodes are executors with parameterSchema, edges define control flow with conditions'
    ],
    philosophicalBasis: 'Homoiconicity (Lisp); declarative programming; graphs as universal computation model',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'gxe', 'execution'],
    applicableLabels: ['Graph', 'Executor', 'CatalogEntry']
  },
  {
    title: 'Machine-Readable Human-Documentable',
    summary: 'Every structure in the knowledge base must satisfy two criteria: machines can execute it, humans can understand it through generated documentation.',
    rationale: 'Knowledge that only machines can read becomes opaque institutional debt. Knowledge that only humans can read cannot be automated. The system must bridge both worlds with structures that are simultaneously executable and documentable.',
    whyItExists: 'This principle emerged from the research requirement that "an AI agent reading any graph structure can generate complete human-readable documentation without loss." It is the validation criterion for all Codex structures.',
    examples: [
      'Every Codex node has Information Contract fields: title, summary, rationale, whyItExists, examples — enabling automatic documentation generation',
      'The generateDocumentation() method proves this principle by producing readable markdown from graph traversal'
    ],
    philosophicalBasis: 'Literate programming (Knuth); documentation as first-class artifact; dual-interface design',
    changeabilityTier: 'FROZEN',
    tags: ['core', 'documentation', 'information-contract'],
    applicableLabels: ['CodexPrinciple', 'CodexRule', 'CodexPattern']
  }
];

// ============================================================
// SEED SECTIONS
// ============================================================

const SECTIONS = [
  {
    title: 'Core Principles',
    summary: 'M3-level immutable philosophical foundations that govern all system behavior',
    rationale: 'Top of the normative hierarchy. These principles cannot be changed without fundamental system redesign.',
    whyItExists: 'Research identified the need for an M3 meta-level that constrains all M2 rules',
    examples: ['Contains the 7 foundational principles'],
    tags: ['structure', 'm3']
  },
  {
    title: 'CRUD Standards',
    summary: 'Rules governing create, read, update, delete operations on knowledge nodes',
    rationale: 'Consistent data operations are essential for maintaining graph integrity',
    whyItExists: 'Derived from CODEX-CRUD standard document',
    examples: ['Merge patterns', 'Idempotency requirements', 'Transaction handling'],
    tags: ['structure', 'operations']
  },
  {
    title: 'Namespace Standards',
    summary: 'Rules governing the namespace architecture: CORE, PROJECT, META, COMMON, plus Codex',
    rationale: 'Namespace isolation prevents data pollution and enables access control',
    whyItExists: 'Derived from CODEX-NS standard and four-namespace ADR',
    examples: ['Routing rules', 'Cross-namespace queries', 'Namespace-specific cache TTLs'],
    tags: ['structure', 'namespace']
  }
];

// ============================================================
// ADMIN STAKEHOLDER
// ============================================================

const ADMIN_STAKEHOLDER = {
  title: 'System Administrator',
  summary: 'Human administrator with full Codex write privileges',
  rationale: 'Codex modifications require human oversight until agent trust is established',
  whyItExists: 'Graduated autonomy model requires explicit admin role at L1 level',
  examples: ['Can create/modify any Codex node', 'Reviews and approves CodexProposals'],
  stakeholderType: 'ADMIN',
  autonomyLevel: 'L5',
  permittedScopes: ['*'],
  tags: ['governance', 'admin']
};

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seedCodexNamespace() {
  console.log('Starting Codex namespace seed...\n');

  const context = { isAdmin: true, createdBy: 'seed-script' };
  const created = { principles: [], sections: [], stakeholders: [], relationships: [] };

  try {
    // 1. Create Sections
    console.log('Creating sections...');
    for (const sectionData of SECTIONS) {
      const section = await codexService.createNode('CodexSection', sectionData, context);
      created.sections.push(section);
      console.log(`   + ${section.codexId || section.codexId}: ${sectionData.title}`);
    }

    // 2. Create Principles
    console.log('\nCreating M3 principles...');
    for (const principleData of PRINCIPLES) {
      const principle = await codexService.createNode('CodexPrinciple', principleData, context);
      created.principles.push(principle);
      console.log(`   + ${principle.codexId || principle.codexId}: ${principleData.title}`);
    }

    // 3. Create Admin Stakeholder
    console.log('\nCreating admin stakeholder...');
    const admin = await codexService.createNode('CodexStakeholder', ADMIN_STAKEHOLDER, context);
    created.stakeholders.push(admin);
    console.log(`   + ${admin.codexId || admin.codexId}: ${ADMIN_STAKEHOLDER.title}`);

    // 4. Link principles to Core Principles section
    console.log('\nCreating relationships...');
    const coreSection = created.sections[0]; // Core Principles is first
    for (const principle of created.principles) {
      const pCodexId = principle.codexId || principle.properties?.codexId;
      const sCodexId = coreSection.codexId || coreSection.properties?.codexId;
      const rel = await codexService.createRelationship(
        pCodexId,
        sCodexId,
        'PART_OF',
        {}
      );
      created.relationships.push(rel);
      console.log(`   + ${pCodexId} -[:PART_OF]-> ${sCodexId}`);
    }

    // 5. Summary
    console.log('\n' + '='.repeat(50));
    console.log('Codex namespace seed complete!');
    console.log('='.repeat(50));
    console.log(`   Principles:    ${created.principles.length}`);
    console.log(`   Sections:      ${created.sections.length}`);
    console.log(`   Stakeholders:  ${created.stakeholders.length}`);
    console.log(`   Relationships: ${created.relationships.length}`);
    console.log('');

    // 6. Test documentation generation
    console.log('Testing documentation generation...');
    const doc = await codexService.generateDocumentation();
    console.log(`   Generated ${doc.length} characters of documentation`);
    console.log('   First 500 chars:\n');
    console.log(doc.substring(0, 500));
    console.log('...\n');

    return created;

  } catch (error) {
    console.error('Seed failed:', error.message);
    throw error;
  }
}

// ============================================================
// RUN
// ============================================================

if (require.main === module) {
  seedCodexNamespace()
    .then(() => {
      console.log('Done. Exiting...');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedCodexNamespace, PRINCIPLES, SECTIONS };
