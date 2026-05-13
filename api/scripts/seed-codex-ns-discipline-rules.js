/**
 * Seed Codex Rules — Namespace Discipline Rules (NS-series)
 *
 * Governs namespace architecture across the entire UNPA platform:
 * - Code placement (universal vs instance)
 * - Knowledge graph namespace properties
 * - Platform contract boundaries
 * - Cross-instance exchange discipline
 *
 * Reference: docs/architecture/NAMESPACE_DISCIPLINE.md
 *
 * Run: node api/scripts/seed-codex-ns-discipline-rules.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const NS_DISCIPLINE_RULES = [
  // ============================================================
  // KNOWLEDGE GRAPH — Namespace Properties
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-001',
    title: 'Namespace Property Required on All Graph Nodes',
    summary: 'Every node created in Memgraph MUST have a namespace property identifying its owner. Nodes without a namespace property MUST NOT be created. This is enforced at the service layer, not the DB layer.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'platform', 'memgraph'],
    rationale: 'The namespace property is the foundational mechanism for separating universal UNPA knowledge from instance-specific knowledge. Without it, queries cannot correctly filter by project context, and the global knowledge base becomes an undifferentiated blob that serves no project well.',
    examples: [
      'CREATE (n:KnowledgeQuantum {namespace: "FLOWDESK", title: "SLA escalation policy", ...})',
      'CREATE (r:CodexRule {namespace: "UNPA", codexId: "CODEX-RULE-NS-001", ...})',
      'MATCH (n) WHERE n.namespace = "FLOWDESK" RETURN n // correct filtered query'
    ],
    antiPatterns: [
      'CREATE (n:BusinessRule {title: "approval threshold"}) -- missing namespace',
      'Assuming namespace from node label alone',
      'Using a default namespace when the correct one is unknown — stop and determine the correct namespace first'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-002',
    title: 'Namespace Names Use UPPERCASE Convention',
    summary: 'All namespace values stored in Memgraph properties MUST be UPPERCASE (e.g., FLOWDESK, UNPA, GXE, WORKSPACE). Filesystem directory names use lowercase (e.g., /instances/flowdesk/). These are the same namespace, represented consistently in each context.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'convention'],
    rationale: 'Consistent casing prevents silent mismatches where queries for "flowdesk" fail to match nodes tagged "FlowDesk" or "FLOWDESK". UPPERCASE in Memgraph, lowercase in filesystem paths is an easy rule to remember and verify.',
    examples: [
      'namespace: "FLOWDESK" in Memgraph node properties',
      'namespace: "UNPA" in Codex rule properties',
      '/api/src/instances/flowdesk/ in filesystem paths',
      'MATCH (n {namespace: "FLOWDESK"}) RETURN n'
    ],
    antiPatterns: [
      'namespace: "FlowDesk" -- mixed case in Memgraph',
      'namespace: "flowdesk" -- lowercase in Memgraph',
      'Directory /api/src/instances/FLOWDESK/ -- uppercase in filesystem'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-003',
    title: 'Cross-Namespace Edges Must Be Explicit and Typed',
    summary: 'Edges between nodes in different namespaces MUST use a typed cross-namespace relationship label and MUST include the property crossNamespace: true. Generic relationship types (RELATES_TO, CONNECTED_TO) are FORBIDDEN for cross-namespace edges.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'memgraph', 'graph-integrity'],
    rationale: 'Implicit cross-namespace edges create invisible coupling between projects. Making them explicit and typed enables governance, auditing, and impact analysis. When a cross-namespace edge exists, it should be clear WHY from the edge type alone.',
    examples: [
      'CREATE (a)-[:USES_PLATFORM_CAPABILITY {crossNamespace: true}]->(b) WHERE a.namespace = "FLOWDESK" AND b.namespace = "UNPA"',
      'CREATE (a)-[:GOVERNED_BY {crossNamespace: true}]->(r) WHERE a.namespace = "FLOWDESK" AND r.namespace = "CODEX"',
      'Queries spanning namespaces must include a comment: // Intentional cross-namespace: reason'
    ],
    antiPatterns: [
      'CREATE (a)-[:RELATES_TO]->(b) -- generic label on cross-namespace edge',
      'Implicitly assuming a node is in the current namespace when it might not be',
      'Cross-namespace edges without crossNamespace: true property'
    ]
  },

  // ============================================================
  // CODE ORGANIZATION — File Placement
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-004',
    title: 'Instance Code Lives in /instances/{name}/ Directories',
    summary: 'All code that is specific to a project instance MUST live in /api/src/instances/{name}/ (backend) or /mcp/src/instances/{name}/ (frontend). Directory name MUST equal the namespace in lowercase. Code specific to FlowDesk belongs in /api/src/instances/flowdesk/, not in /api/src/core/ or /api/src/services/.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'code-organization'],
    rationale: 'Co-location of instance code in a dedicated directory makes it immediately visible what is universal vs project-specific. It also makes instance code portable — to move or export it, you copy one directory.',
    examples: [
      '/api/src/instances/flowdesk/executors/check-sla.executor.js -- FlowDesk SLA executor',
      '/api/src/instances/flowdesk/routes/flowdesk.route.js -- FlowDesk REST endpoints',
      '/api/src/instances/flowdesk/services/workflow-runner.js -- FlowDesk workflow service',
      '/mcp/src/instances/flowdesk/pages/FlowDeskPage.jsx -- FlowDesk UI page'
    ],
    antiPatterns: [
      '/api/src/core/aopeg/plugins/flowdesk/ -- FlowDesk executors in core plugin directory',
      '/api/src/services/flowdesk/ -- FlowDesk services mixed with platform services',
      '/api/src/routes/flowdesk.route.js -- FlowDesk route in universal routes directory',
      'mcp/src/pages/FlowDeskPage.jsx -- FlowDesk UI in universal pages directory'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-005',
    title: 'Universal Code Must Not Reference Instance Namespaces',
    summary: 'Files in /api/src/core/, /api/src/services/, /api/src/routes/, and /mcp/src/ (excluding /instances/) MUST NOT contain references to any project namespace by name (e.g., "flowdesk", "FlowDesk", "FLOWDESK"). Universal code must be namespace-agnostic.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'code-organization', 'bootstrap'],
    rationale: 'A universal file that references a specific project namespace is no longer universal — it has an invisible dependency on that project. This creates a situation where cloning clean UNPA for a new project secretly brings in another project\'s code.',
    examples: [
      'api/src/runtime/RuntimeEngine.js -- zero references to any project name, correctly universal',
      'api/src/services/workspace/workspace.service.js -- zero references to FlowDesk, correctly universal',
      'api/src/services/startup/StartupManager.js loaded via instance manifest discovery, not hardcoded'
    ],
    antiPatterns: [
      'api/src/services/startup/StartupManager.js references "flowdesk" plugin directly',
      'api/index.js imports flowdesk.route.js by name',
      'Any file in /api/src/core/ that imports from /api/src/instances/flowdesk/'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-006',
    title: 'Each Instance Must Declare a Plugin Manifest',
    summary: 'Every UNPA instance MUST have an index.js manifest file at /api/src/instances/{name}/index.js that exports: namespace (string), executors (array), routes (array), and an optional onRegister(platform) callback. The platform discovers and registers instances by scanning for these manifest files at startup.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'plugin-registration'],
    rationale: 'The plugin manifest is the contract between an instance and the platform. Without it, the platform cannot know what executors or routes the instance provides, and instance loading becomes ad-hoc and hardcoded in platform files (a violation of NS-005).',
    examples: [
      'module.exports = { namespace: "FLOWDESK", executors: require("./executors"), routes: require("./routes"), onRegister: async (platform) => { /* use platform contracts */ } }',
      'Platform scans /api/src/instances/*/index.js at startup and calls Plugin Registration API for each'
    ],
    antiPatterns: [
      'Hardcoding require("./instances/flowdesk") in api/index.js',
      'Instance manifest that imports from memgraph.service.js directly (must use platform contracts)',
      'Missing onRegister function when the instance needs to initialize namespace in Memgraph or Qdrant'
    ]
  },

  // ============================================================
  // PLATFORM CONTRACTS — Access Boundaries
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-007',
    title: 'Instance Code Must Use Only Public Platform Contracts',
    summary: 'Instance code MUST access UNPA capabilities exclusively through the public platform contracts defined in /api/src/platform-api/. Direct imports of internal UNPA services from instance code are FORBIDDEN. If a needed capability is missing from the contracts, a new contract must be added to platform-api, not bypassed.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'platform-contracts', 'security'],
    rationale: 'Platform contracts create a stable boundary that allows platform internals to evolve without breaking instances. They also enforce the security principle that instances cannot access data from other namespaces through raw DB access.',
    examples: [
      '// CORRECT: use platform contract',
      'const { executeGraph } = require("../../platform-api/graph-execution");',
      'await executeGraph("FLOWDESK", "approval-workflow", inputData)',
      '',
      '// CORRECT: use platform contract for entity query',
      'const { findUser } = require("../../platform-api/entity-query");'
    ],
    antiPatterns: [
      'require("../../services/memgraph.service") from instance code -- direct DB access',
      'require("../../runtime/RuntimeEngine") from instance code -- direct engine access',
      'require("../../core/aopeg") from instance code -- direct plugin registry access',
      'Creating own MongoDB/Qdrant connections in instance code'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-008',
    title: 'Direct Database Access from Instance Code Is Forbidden',
    summary: 'Instance code MUST NOT directly import or use memgraph.service.js, qdrant.service.js, redis.service.js, or any other database adapter. All data access from instance code MUST go through platform contracts. Connection pools belong to the platform, not to instances.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'platform-contracts', 'data-access'],
    rationale: 'Direct database access from instance code would allow an instance to read or write data in any namespace, bypassing all governance. It would also allow instances to create their own connection pools, leading to resource exhaustion. Centralized DB access in the platform layer is the only correct pattern.',
    examples: [
      '// CORRECT: read config via platform contract',
      'const { getConfig } = require("../../platform-api/config-store");',
      'const slaTimeout = await getConfig("FLOWDESK", "sla_timeout_hours");'
    ],
    antiPatterns: [
      'const mg = require("../../services/memgraph.service"); const result = await mg.runQuery(...) -- from instance code',
      'const qdrant = require("../../services/qdrant.service"); await qdrant.search(...) -- from instance code',
      'const redis = require("../../services/redis.service"); await redis.set(...) -- from instance code',
      'new Neo4jDriver(...) or new QdrantClient(...) created inside instance code'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-009',
    title: 'New Instance Capability Gaps Must Be Closed Via Platform Contracts',
    summary: 'When instance code requires a platform capability that does not yet exist in /api/src/platform-api/, the correct resolution is: create a new contract in platform-api, implement it in the platform, then use it from instance code. Never bypass the contract boundary as a shortcut.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'platform-contracts', 'evolution'],
    rationale: 'Every bypass of the contract boundary is technical debt that hides a real platform capability gap. By forcing the gap to be expressed as a new contract, we build the platform API surface systematically. Shortcuts today become architectural rot tomorrow.',
    examples: [
      'Instance needs to query entity relationships → add Contract 10: Entity Relationship API → implement in platform-api → use from instance',
      'Instance needs to trigger a notification → use existing Contract 4: Template API → never import notifications.service.js directly'
    ],
    antiPatterns: [
      'Commenting "// TODO: move to platform-api later" while using direct service import now',
      'Creating a thin wrapper in the instance that just re-exports a platform internal service',
      'Adding a platform contract that is trivially just a pass-through to a single internal service without any governance logic'
    ]
  },

  // ============================================================
  // QDRANT — Collection Naming
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-010',
    title: 'Qdrant Collections Must Follow {namespace}_{purpose} Naming',
    summary: 'Every Qdrant collection name MUST follow the pattern {namespace_lowercase}_{purpose} (e.g., flowdesk_kb, unpa_entities, workspace_abc123). Collections MUST NOT be created without a namespace prefix. Only the platform infrastructure layer may create or delete collections.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'qdrant', 'vector-db'],
    rationale: 'Namespace-prefixed collection names make it immediately visible which project owns which data. Without this, a proliferation of generically named collections makes it impossible to determine ownership, and accidental cross-namespace reads become likely.',
    examples: [
      'unpa_entities -- UNPA universal entity embeddings',
      'unpa_codex -- Codex rule embeddings for semantic search',
      'flowdesk_kb -- FlowDesk knowledge base article embeddings',
      'flowdesk_services -- FlowDesk service category embeddings',
      'workspace_abc123def -- per-workspace scratch collection (uuid suffix)'
    ],
    antiPatterns: [
      '"embeddings" -- no namespace prefix, ownership unclear',
      '"flowdesk" -- namespace only, missing purpose',
      '"kb_flowdesk" -- reversed order (namespace must come first)',
      'Creating Qdrant collections from instance code directly'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-011',
    title: 'embeddings_unified Is the Global KB — Only PromotionSaga Writes To It',
    summary: 'The embeddings_unified Qdrant collection is the Global Knowledge Base. Only the PromotionSagaService MUST write to it. All other code — including instance code — reads from it through the KM Query API. Instance code MUST NOT write directly to embeddings_unified.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'qdrant', 'knowledge-management'],
    rationale: 'The Global KB derives its quality from the controlled promotion process. PromotionSagaService validates, deduplicates, and links knowledge before promotion. Bypassing this process allows unreviewed or conflicting embeddings into the Global KB, degrading all search quality across all namespaces.',
    examples: [
      '// CORRECT: promote via workspace API',
      'const { promoteToGlobalKB } = require("../../platform-api/workspace-extraction");',
      'await promoteToGlobalKB(workspaceId, draftIds);'
    ],
    antiPatterns: [
      'qdrant.upsert("embeddings_unified", ...) from instance code',
      'Bypassing workspace workflow to write directly to Global KB',
      'Mixing instance-specific embeddings into the global collection to "simplify" search'
    ]
  },

  // ============================================================
  // DEPLOYMENT AND MIGRATION
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-012',
    title: 'New Instance Deployment Starts from Clean UNPA Repository',
    summary: 'When deploying UNPA for a new project, the process MUST start by cloning the clean UNPA repository (zero instance directories). The new project\'s instance directory is then created in that clone. An existing instance repository MUST NOT be used as the base for a different project.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'deployment', 'bootstrap'],
    rationale: 'Using an existing instance as the base for a new deployment would bring in the first instance\'s project-specific code, Codex rules, and knowledge — creating an immediate namespace contamination. Clean UNPA is the canonical base, not any specific instance.',
    examples: [
      'git clone https://github.com/un/unpa-clean.git unpa-fieldops',
      'cd unpa-fieldops && mkdir -p api/src/instances/fieldops/{executors,services,routes}',
      'npm run bootstrap -- imports only UNPA-namespace Codex rules'
    ],
    antiPatterns: [
      'git clone https://github.com/un/unpa-flowdesk.git unpa-fieldops -- cloning instance repo for new project',
      'Copying /api/src/instances/flowdesk/ into a new project without sanitization',
      'Deploying with the entire accumulated FlowDesk Codex rules under a different project name'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-013',
    title: 'Code Classification Must Be Documented Before Migration',
    summary: 'Before moving any file during namespace reorganization, EVERY file in the affected scope MUST be classified as UNIVERSAL, PROJECT-SPECIFIC, or HYBRID in a migration manifest. The migration manifest MUST be committed before any file moves begin. No "classify as you go" migrations are permitted.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'migration'],
    rationale: 'Unplanned migrations create partial states where some files have moved and imports are broken. A pre-committed manifest ensures the full scope is understood before any changes are made, and provides a checklist to verify completeness.',
    examples: [
      'migration-manifest.json: { "api/src/core/aopeg/plugins/flowdesk/": { classification: "PROJECT-SPECIFIC", targetPath: "api/src/instances/flowdesk/executors/", status: "PENDING" } }',
      'Manifest committed in dedicated "classification" commit before migration begins'
    ],
    antiPatterns: [
      'Moving files one by one without documenting the full scope first',
      'Big-bang migration that moves all files in a single commit without a manifest',
      'Classifying files during the migration (combining analysis and execution)'
    ]
  },
  {
    codexId: 'CODEX-RULE-NS-014',
    title: 'Namespace Migration Must Preserve System Operability at Every Step',
    summary: 'Each step in a namespace reorganization migration MUST leave the system in a working, testable state. No migration step may break existing tests or API contracts. Steps that risk breaking the system must be split into: (1) add new location, (2) update references, (3) verify tests pass, (4) remove old location.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'migration', 'quality'],
    rationale: 'A migration that causes a system outage is worse than not migrating at all. The four-step per-file pattern ensures each individual move is safe and reversible. The key insight: add before delete, verify before delete.',
    examples: [
      'Step 1: cp api/src/core/aopeg/plugins/flowdesk/executors/check-sla.executor.js api/src/instances/flowdesk/executors/',
      'Step 2: update all require() references to point to new location',
      'Step 3: run npm test -- verify all tests pass',
      'Step 4: rm api/src/core/aopeg/plugins/flowdesk/executors/check-sla.executor.js'
    ],
    antiPatterns: [
      'Moving a file and updating imports in a single commit without running tests',
      'Deleting the old location before verifying the new location works',
      'Moving multiple files simultaneously before verifying each one individually'
    ]
  },

  // ============================================================
  // CROSS-INSTANCE EXCHANGE
  // ============================================================
  {
    codexId: 'CODEX-RULE-NS-015',
    title: 'Exportable Knowledge Must Be Sanitized of Instance References',
    summary: 'Before exporting Codex rules, graph templates, or executors from one UNPA instance to another, the artifacts MUST be sanitized: all instance-specific namespace names replaced with {TARGET_NAMESPACE} placeholders, hardcoded entity IDs replaced with variables, and environment-specific configuration removed. Unsanitized exports are FORBIDDEN.',
    modality: 'MUST',
    scope: ['namespace', 'architecture', 'cross-instance', 'export'],
    rationale: 'An unsanitized export of FlowDesk Codex rules that references "FLOWDESK" namespace would, when imported into a FieldOps deployment, create invisible FLOWDESK namespace references in a system that has no FlowDesk project — corrupting its namespace integrity.',
    examples: [
      'Sanitized rule: "All graph nodes in {TARGET_NAMESPACE} namespace must have an approval step before COMPLETED status"',
      'Original: "All FLOWDESK graph nodes must have an approval step before COMPLETED"',
      'Export manifest includes: { sanitized: true, originalNamespace: "FLOWDESK", sanitizedAt: "2026-05-11" }'
    ],
    antiPatterns: [
      'Exporting raw Codex rules with "FLOWDESK" namespace hardcoded in rule text',
      'Importing rule files without checking for unsanitized namespace references',
      'Promoting an instance-specific Codex rule to UNPA namespace without sanitization'
    ]
  }
];

async function seedRules() {
  console.log('Seeding Namespace Discipline Codex Rules (NS-series)...\n');
  let created = 0, skipped = 0, errored = 0;

  // Ensure the 'Namespace Standards' section exists (or find its codexId)
  let namespaceSectionId = null;
  try {
    const sectionResult = await mg().runQuery(
      `MATCH (s:CodexSection {title: 'Namespace Standards'}) RETURN s.codexId AS codexId, s.id AS id LIMIT 1`,
      {}
    );
    if (sectionResult.length > 0) {
      namespaceSectionId = sectionResult[0].codexId || sectionResult[0].id;
      console.log(`  Found existing 'Namespace Standards' section: ${namespaceSectionId}\n`);
    } else {
      // Create the section if it doesn't exist
      const sectionId = uuidv4();
      const now = new Date().toISOString();
      await mg().runQuery(`
        CREATE (s:CodexSection {
          id: $id,
          codexId: $codexId,
          namespace: 'UNPA',
          nodeType: 'CodexSection',
          title: 'Namespace Standards',
          summary: 'Rules governing the namespace architecture across all UNPA instances. Covers code placement (universal vs instance), knowledge graph namespace properties, platform contract boundaries, Qdrant collection naming, and cross-instance exchange discipline.',
          rationale: 'Namespace isolation prevents data pollution, enables access control, and makes UNPA deployable as clean instances. Without namespace discipline, the boundary between the platform and any specific project deployment collapses.',
          tags: '["structure","namespace","architecture"]',
          createdAt: $now,
          updatedAt: $now
        })
        RETURN s.codexId AS codexId
      `, { id: sectionId, codexId: 'CODEX-SECTION-NS', now });
      namespaceSectionId = 'CODEX-SECTION-NS';
      console.log(`  Created 'Namespace Standards' section: ${namespaceSectionId}\n`);
    }
  } catch (err) {
    console.warn(`  WARN: Could not find/create Namespace Standards section: ${err.message}`);
  }

  for (const rule of NS_DISCIPLINE_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      // Idempotency check
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r',
        { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      // Create the rule node
      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id,
          codexId: $codexId,
          namespace: 'UNPA',
          nodeType: 'CodexRule',
          title: $title,
          summary: $summary,
          modality: $modality,
          scope: $scope,
          tier: 'M2',
          status: 'ACTIVE',
          rationale: $rationale,
          examples: $examples,
          antiPatterns: $antiPatterns,
          createdAt: $now,
          updatedAt: $now
        })
        RETURN r.codexId AS codexId
      `, {
        id,
        now,
        codexId: rule.codexId,
        title: rule.title,
        summary: rule.summary,
        modality: rule.modality,
        scope: JSON.stringify(rule.scope),
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples),
        antiPatterns: JSON.stringify(rule.antiPatterns)
      });

      // Link rule to the Namespace Standards section
      if (namespaceSectionId) {
        try {
          await mg().runQuery(`
            MATCH (r:CodexRule {codexId: $ruleCodexId})
            MATCH (s {codexId: $sectionCodexId})
            CREATE (r)-[:PART_OF]->(s)
          `, { ruleCodexId: rule.codexId, sectionCodexId: namespaceSectionId });
        } catch (linkErr) {
          console.warn(`  WARN: Could not link ${rule.codexId} to section: ${linkErr.message}`);
        }
      }

      console.log(`  OK   ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR  ${rule.codexId}: ${err.message}`);
      errored++;
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped, ${errored} errors`);
  console.log(`Total NS Discipline rules: ${NS_DISCIPLINE_RULES.length}`);
}

async function main() {
  await seedRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
