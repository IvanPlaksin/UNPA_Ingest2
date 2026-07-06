/**
 * Seed Codex Rules — Investigation Module
 *
 * Formalizes architectural invariants for:
 *   - INV-001..022: Investigation primitives, artifact lifecycle, agent processing, UI/UX
 *   - PROV-001..005: Provenance and supersession
 *   - IMP-001..003:  Impact analysis
 *
 * Run: node api/scripts/seed-codex-investigation-rules.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const INVESTIGATION_RULES = [
  // ============================================================
  // ARTIFACT LIFECYCLE (INV-001 — INV-007)
  // ============================================================
  {
    codexId: 'CODEX-RULE-INV-001',
    title: 'Artifact Birth Status is PROPOSED',
    summary: 'Every artifact MUST be created with status PROPOSED. Status COMMITTED is set only after explicit user commit action via ArtifactPreviewDialog.',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'lifecycle'],
    rationale: 'Prevents premature inclusion in AI context; enables review-before-commit workflow that avoids polluting the session with unvetted outputs.',
    examples: ['saveProposed() always sets status: PROPOSED', 'commit() transitions to COMMITTED and cuts evidentiary version'],
    antiPatterns: ['Creating artifact with status COMMITTED directly', 'Skipping the preview dialog on first commit']
  },
  {
    codexId: 'CODEX-RULE-INV-002',
    title: 'cutEvidentiary Runs at Commit Time',
    summary: 'The cutEvidentiary() call MUST happen at commit() time, not at primitive execution time.',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'versioning'],
    rationale: 'Ensures the evidentiary version reflects the curated, user-approved state rather than raw tool output.',
    examples: ['primitive.execute() returns evidencedBy[] but never calls VersionService', 'investigation-session.service.js commit() calls cutEvidentiary internally'],
    antiPatterns: ['Calling cutEvidentiary inside execute()', 'Cutting a version before user confirms the result']
  },
  {
    codexId: 'CODEX-RULE-INV-003',
    title: 'TEXT and SYNTHESIZE Produce Logical Versions Only',
    summary: 'Primitives TEXT and SYNTHESIZE do NOT trigger evidentiary version cuts. They produce logical (structural) versions only.',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'versioning'],
    rationale: 'Evidence versioning requires KB entity references. Text notes and synthesis narratives are interpretive outputs, not KB evidence.',
    examples: ['triggersEvidentiaryVersion = false in text.primitive.js and synthesize.primitive.js'],
    antiPatterns: ['Setting triggersEvidentiaryVersion = true on TEXT', 'Trying to reference KB entities from a freeform text note']
  },
  {
    codexId: 'CODEX-RULE-INV-004',
    title: 'AI Agent Sees Only COMMITTED Artifacts',
    summary: 'When building AI context for the investigation agent, MUST include only COMMITTED artifacts. PROPOSED artifacts are excluded.',
    modality: 'MUST',
    scope: ['investigation', 'agent', 'context'],
    rationale: 'Unreviewed artifacts may contain errors. Including them in AI context would propagate incorrect interpretations into further reasoning.',
    examples: ['listBySession() filters status = COMMITTED for AI context building', 'PROPOSED artifacts visible in UI panel but not in agent messages'],
    antiPatterns: ['Passing all artifacts regardless of status to the AI', 'Including PROPOSED artifacts in evidencedBy computation']
  },
  {
    codexId: 'CODEX-RULE-INV-005',
    title: 'Subsession Returns Subgraph and Provenance Closure',
    summary: 'A subsession artifact MUST include: full subgraph nodes + edges for the query, plus provenance closure (all KB nodes referenced).',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'subsession'],
    rationale: 'Downstream analysis needs the complete evidence base to be self-contained. Provenance closure prevents broken references when artifacts are shared.',
    examples: ['getSubsession() returns { subgraph, evidencedBy, sourceDocuments }'],
    antiPatterns: ['Returning only the graph without sourcing information', 'Lazy-loading KB references that may not be available later']
  },
  {
    codexId: 'CODEX-RULE-INV-006',
    title: 'Drift Detection on Session Open',
    summary: 'Entity drift (KB changes since last session access) MUST be detected on session open, not as a background job.',
    modality: 'MUST',
    scope: ['investigation', 'session', 'drift'],
    rationale: 'Background drift detection creates race conditions where the user starts working on stale data. Open-time detection ensures coherent session state.',
    examples: ['checkDrift() called in getSession() response', 'DriftWarning banner shown when drift detected'],
    antiPatterns: ['Running drift detection in a cron job without notifying the session', 'Silently updating artifact state without user confirmation']
  },
  {
    codexId: 'CODEX-RULE-INV-007',
    title: 'KB Nodes Loaded via OPTIONAL MATCH in listBySession',
    summary: 'When loading session artifacts for AI context, KB entity details MUST be fetched via OPTIONAL MATCH to avoid excluding artifacts with missing references.',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'query'],
    rationale: 'Some artifacts reference KB nodes that were deleted or tombstoned. OPTIONAL MATCH ensures the artifact is still returned with null entity details rather than being silently dropped.',
    examples: ['OPTIONAL MATCH (kbn:ESEntity) WHERE kbn.id IN artifact.evidenceEntityIds'],
    antiPatterns: ['Using MATCH (mandatory) for KB node loading', 'Filtering out artifacts with null KB references']
  },

  // ============================================================
  // AGENT PROCESSING (INV-008 — INV-012)
  // ============================================================
  {
    codexId: 'CODEX-RULE-INV-008',
    title: 'Three-Phase Agent Processing: Classify → Resolve → Execute',
    summary: 'The investigation agent MUST follow a strict three-phase message processing pipeline: (1) Classify intent to a primitive type, (2) Resolve entities to KB IDs, (3) Execute the primitive.',
    modality: 'MUST',
    scope: ['investigation', 'agent', 'processing'],
    rationale: 'Separating classification from resolution from execution enables independent testing, cleaner error handling, and reuse of resolved entities across multiple primitives.',
    examples: ['processMessage() calls _classifyIntent(), then _resolveEntities(), then _executePrimitive()', 'A CLARIFICATION response exits after phase 2 without reaching phase 3'],
    antiPatterns: ['Merging classification and execution into a single LLM call', 'Executing a primitive before all required entities are resolved']
  },
  {
    codexId: 'CODEX-RULE-INV-009',
    title: 'Entity Resolution Chain Order',
    summary: 'Entity resolution MUST follow this precedence: (1) context cache from prior messages, (2) single-result search, (3) exact name match, (4) confidence > 0.85 auto-select, (5) CLARIFICATION with options.',
    modality: 'MUST',
    scope: ['investigation', 'agent', 'entity-resolution'],
    rationale: 'Consistent resolution precedence prevents ambiguous behavior and ensures users are only asked for clarification when genuinely needed.',
    examples: ['if (searchResults.length === 1) auto-select', 'if (bestScore > 0.85) auto-select with reasoning note'],
    antiPatterns: ['Always sending CLARIFICATION on multiple results', 'Ignoring context cache and re-resolving known entities']
  },
  {
    codexId: 'CODEX-RULE-INV-010',
    title: 'Ambiguous Intent Produces CLARIFICATION, Not Fallback',
    summary: 'When the agent cannot determine which primitive to run or which entities to use, it MUST return a structured CLARIFICATION response with explicit options. Silent fallback to LOCATE or generic expansion is forbidden.',
    modality: 'MUST',
    scope: ['investigation', 'agent', 'clarification'],
    rationale: 'Silent fallbacks mask intent failures and teach users incorrect mental models of the system.',
    examples: ['{ type: "CLARIFICATION", clarificationIssues: [...], clarificationOptions: [...] }', 'ClarificationBubble renders options in the chat'],
    antiPatterns: ['Defaulting to LOCATE when primitive is ambiguous', 'Running EXPAND when the user asked for something else "just to show something"']
  },
  {
    codexId: 'CODEX-RULE-INV-011',
    title: 'EntityAutocomplete Required for Entity Params in Tool Forms',
    summary: 'Every ToolDialog form field that accepts an entityId MUST use EntityAutocomplete component, not a plain text input.',
    modality: 'MUST',
    scope: ['investigation', 'ui', 'forms'],
    rationale: 'Free-text entity inputs produce unresolvable IDs. EntityAutocomplete guarantees the entity exists in the KB before the tool runs.',
    examples: ['ImpactForm uses EntityAutocomplete for entityId', 'ConnectForm uses two EntityAutocomplete instances'],
    antiPatterns: ['<TextField> for entityId input', 'Accepting entity names without resolving to KB IDs']
  },
  {
    codexId: 'CODEX-RULE-INV-012',
    title: 'ClarificationBubble for Inline Entity Resolution in Chat',
    summary: 'When the chat agent identifies ambiguous entities during message processing, MUST render a ClarificationBubble inline in the chat for the user to resolve.',
    modality: 'MUST',
    scope: ['investigation', 'ui', 'clarification'],
    rationale: 'Inline resolution keeps context intact. Redirecting users to a separate panel or dialog breaks the conversational flow.',
    examples: ['ChatBubble renders ClarificationBubble when msg.clarificationIssues.length > 0'],
    antiPatterns: ['Popping a modal dialog for entity resolution', 'Blocking the chat input until clarification is handled']
  },

  // ============================================================
  // UI/UX (INV-013 — INV-015)
  // ============================================================
  {
    codexId: 'CODEX-RULE-INV-013',
    title: 'ArtifactPreviewDialog Required for Commit Confirmation',
    summary: 'Before committing any PROPOSED artifact to COMMITTED status, MUST present the user with ArtifactPreviewDialog showing full rendered content.',
    modality: 'MUST',
    scope: ['investigation', 'ui', 'artifact'],
    rationale: 'One-click commit without review would allow unvetted data to contaminate the session knowledge base. The preview step is the last human checkpoint.',
    examples: ['ToolDialog shows preview tab before enabling Commit button', '"View Result" in ToolCallCard opens ArtifactPreviewDialog'],
    antiPatterns: ['Auto-committing immediately after execution', 'Committing without showing the full rendered artifact']
  },
  {
    codexId: 'CODEX-RULE-INV-014',
    title: 'AI Summary Cached in artifact.content.aiSummary',
    summary: 'AI-generated summaries of investigation results MUST be cached in artifact.content.aiSummary at commit time and MUST NOT trigger additional LLM calls on re-render.',
    modality: 'MUST',
    scope: ['investigation', 'artifact', 'performance'],
    rationale: 'Summary regeneration on every render is expensive and non-deterministic. Caching ensures consistent, cost-free re-display.',
    examples: ['commit() generates AI summary once, stores in content.aiSummary', 'AIInterpretation component reads from content.aiSummary without API call'],
    antiPatterns: ['Calling Claude API each time the summary tab is opened', 'Regenerating summaries after artifact edits without user confirmation']
  },
  {
    codexId: 'CODEX-RULE-INV-015',
    title: 'Graph Primitives Use Four-Tab Layout',
    summary: 'Investigation primitives that produce graph output (CONNECT, EXPAND) MUST use the four-tab layout: Report → Graph → AI Summary → Raw.',
    modality: 'MUST',
    scope: ['investigation', 'ui', 'layout'],
    rationale: 'Consistent tab ordering reduces cognitive load. Users know where to find raw data versus interpreted results without re-learning layouts.',
    examples: ['ConnectRenderer tabs: Report | Graph | AI Summary | Raw', 'ExpandRenderer tabs: Report | Graph | AI Summary | Raw'],
    antiPatterns: ['Different tab ordering between primitives', 'Omitting the Raw tab (breaks debugging)']
  },

  // ============================================================
  // AI INTERPRETATION (INV-016 — INV-017)
  // ============================================================
  {
    codexId: 'CODEX-RULE-INV-016',
    title: 'AI Interpretation Uses Dynamic Section Headers',
    summary: 'The AI Interpretation component MUST use Claude-generated section headers, not fixed template strings. Headers are extracted from markdown H2/H3 in the response.',
    modality: 'MUST',
    scope: ['investigation', 'ai', 'interpretation'],
    rationale: 'Fixed headers create misleading sections when the AI response does not cover that topic. Dynamic headers ensure UI structure matches actual content.',
    examples: ['AIInterpretation parses ## headers from Claude response into collapsible sections'],
    antiPatterns: ['Hardcoded section names like "Key Findings" that may not appear in response', 'Treating the entire response as a single unstructured blob']
  },
  {
    codexId: 'CODEX-RULE-INV-017',
    title: 'Path Interpreter Receives entities[] and bundles{}',
    summary: 'CONNECT path interpretation MUST receive both: entities[] (node details) and bundles{} (relationship groupings) for full rich context.',
    modality: 'MUST',
    scope: ['investigation', 'ai', 'connect'],
    rationale: 'Path interpretation without entity context produces generic summaries. Bundle data reveals the dominant relationship types which are the most analytically valuable part of the output.',
    examples: ['interpretPaths(paths, entities, bundles) — all three params required', 'Prompt includes entity names, types, and top bundle rel-types'],
    antiPatterns: ['Sending only path IDs to the interpreter', 'Omitting relationship types from the interpretation prompt']
  },

  // ============================================================
  // PRIMITIVES (INV-018 — INV-022)
  // ============================================================
  {
    codexId: 'CODEX-RULE-INV-018',
    title: 'PROFILE Categorizes Relationships into 5 Semantic Groups',
    summary: 'PROFILE primitive MUST categorize entity relationships into exactly 5 groups: governance, dependencies, associations, authorship, hierarchy.',
    modality: 'MUST',
    scope: ['investigation', 'primitive', 'profile'],
    rationale: 'Flat lists of relationships are unnavigable at scale. The 5-group taxonomy maps to the main institutional relationship types in the UN knowledge domain.',
    examples: ['GOVERNED_BY → governance', 'DEPENDS_ON / IMPLEMENTS → dependencies', 'AUTHORED_BY → authorship'],
    antiPatterns: ['Returning a flat array of all relationships', 'Creating custom categories per entity type']
  },
  {
    codexId: 'CODEX-RULE-INV-019',
    title: 'CONNECT Uses Two-Phase Bundle Model',
    summary: 'CONNECT primitive MUST use a two-phase approach: (1) skeleton paths via Yen\'s K-Shortest-Paths, (2) enrichment via getAllEdgesBetween for bundle details.',
    modality: 'MUST',
    scope: ['investigation', 'primitive', 'connect'],
    rationale: 'Single-pass enrichment misses multi-hop relationship context. The skeleton provides topological structure; enrichment provides semantic richness.',
    examples: ['Phase 1: GET /:from/paths/:to?k=5 using Yen KSP', 'Phase 2: getAllEdgesBetween for each hop in the path'],
    antiPatterns: ['Running a single all-edges query for path finding', 'Returning raw Cypher paths without bundle grouping']
  },
  {
    codexId: 'CODEX-RULE-INV-020',
    title: 'IMPACT Risk Level Uses Weighted Scoring',
    summary: 'IMPACT primitive MUST calculate risk level from a weighted score combining: direct dependent count, transitive dependent count, articulation point status, and critical path count.',
    modality: 'MUST',
    scope: ['investigation', 'primitive', 'impact'],
    rationale: 'Single-metric risk assessment (e.g. just count) is misleading. An entity with 2 direct dependents that are articulation points is higher risk than one with 20 transitive leaf dependents.',
    examples: ['score = directCount/10 + transitiveCount/25 + (isArticulation ? 2 : 0) + criticalPaths/5', 'critical ≥ 6, high ≥ 4, medium ≥ 2, low < 2'],
    antiPatterns: ['Using only directCount for risk classification', 'Ignoring articulation point status in risk calculation']
  },
  {
    codexId: 'CODEX-RULE-INV-021',
    title: 'KB-Touching Primitives Set triggersEvidentiaryVersion = true',
    summary: 'Any primitive that reads from the Knowledge Base MUST set triggersEvidentiaryVersion = true in its definition.',
    modality: 'MUST',
    scope: ['investigation', 'primitive', 'versioning'],
    rationale: 'KB-derived outputs need evidentiary versioning to support reproducibility and audit. If triggersEvidentiaryVersion is false, the KB state at execution time is not preserved.',
    examples: ['LOCATE, CONNECT, EXPAND, PROFILE, IMPACT, MATRIX, STRUCTURE, TIMELINE, RESOLVE all set triggersEvidentiaryVersion = true', 'TEXT and SYNTHESIZE set it to false'],
    antiPatterns: ['Leaving triggersEvidentiaryVersion = false on a KB-reading primitive', 'Inconsistent versioning behavior across primitive types']
  },
  {
    codexId: 'CODEX-RULE-INV-022',
    title: 'Primitive Output Shape: content + evidencedBy',
    summary: 'Every primitive execute() MUST return { content: {...}, evidencedBy: [id, ...] }. Content is the artifact payload; evidencedBy is the array of KB entity IDs touched.',
    modality: 'MUST',
    scope: ['investigation', 'primitive', 'interface'],
    rationale: 'Consistent output shape allows the session service to generically handle versioning, storage, and AI context without primitive-specific code paths.',
    examples: ['return { content: { entity, relationships }, evidencedBy: [entityId, ...relatedIds] }'],
    antiPatterns: ['Returning content directly without the wrapper', 'Omitting evidencedBy on KB-touching primitives']
  },

  // ============================================================
  // PROVENANCE (PROV-001 — PROV-005)
  // ============================================================
  {
    codexId: 'CODEX-RULE-PROV-001',
    title: 'Relationship Evidence Uses Standalone Nodes, Not Edge Properties',
    summary: 'Each document source for an ES_RELATED_TO relationship MUST be stored as a RelationshipEvidence node keyed by src|tgt|relType|docId. Edge properties MUST NOT be used as the sole provenance store.',
    modality: 'MUST',
    scope: ['investigation', 'provenance', 'knowledge'],
    rationale: 'Memgraph edge properties use last-write-wins on MERGE, silently overwriting prior sources. Standalone nodes accumulate all sources without collision.',
    examples: ['RelationshipEvidence {id: "entityA|entityB|DEPENDS_ON|docX", documentId, context, confidence}', 'Multiple documents for the same relationship create separate evidence nodes'],
    antiPatterns: ['Storing documentId directly on ES_RELATED_TO edge', 'Using MERGE with SET on edge properties for multi-source evidence']
  },
  {
    codexId: 'CODEX-RULE-PROV-002',
    title: 'SUPERSEDES is a First-Class Relationship Type',
    summary: 'Document supersession MUST be modeled as a SUPERSEDES relationship between ESEntity nodes, not as a metadata flag or tag.',
    modality: 'MUST',
    scope: ['investigation', 'provenance', 'supersession'],
    rationale: 'A first-class relationship type enables graph traversal, chain queries, and is visible in all relationship-aware tooling. A flag is opaque to graph algorithms.',
    examples: ['(newer:ESEntity)-[:SUPERSEDES]->(older:ESEntity)', 'MATCH chain query traverses SUPERSEDES edges'],
    antiPatterns: ['Setting supersededBy: documentId on node properties', 'Using a generic HAS_METADATA edge with type="supersedes"']
  },
  {
    codexId: 'CODEX-RULE-PROV-003',
    title: 'isInForce Computed From SUPERSEDES Graph, Not Stored',
    summary: 'Whether a document is in force MUST be computed by checking for absence of incoming SUPERSEDES edges. The isInForce boolean MUST NOT be stored as a static property.',
    modality: 'MUST',
    scope: ['investigation', 'provenance', 'supersession'],
    rationale: 'Stored booleans require update cascades when new supersession edges are added. Graph-computed values are always consistent with the actual relationship structure.',
    examples: ['isInForce = NOT EXISTS { MATCH (:ESEntity)-[:SUPERSEDES]->(this) }', 'supersessionService.isInForce() runs this query each time'],
    antiPatterns: ['Setting isInForce: false on older documents when a supersession is created', 'Caching isInForce without invalidating on SUPERSEDES mutations']
  },
  {
    codexId: 'CODEX-RULE-PROV-004',
    title: 'Normative Documents Carry Structured Metadata',
    summary: 'Document-type ESEntity nodes (Policy, Resolution, Regulation, Guideline) MUST carry: documentSymbol, effectiveDate, expirationDate, issuingAuthority. These fields MUST be stored on the node, not in free-text description.',
    modality: 'MUST',
    scope: ['investigation', 'provenance', 'document'],
    rationale: 'Structured metadata enables filtering, date-range queries, and issuance authority analysis. Free-text is not queryable at graph level.',
    examples: ['ESEntity {type: "Policy", documentSymbol: "ST/AI/2023/4", effectiveDate: "2023-01-01", issuingAuthority: "OHRM"}'],
    antiPatterns: ['Storing document symbol only in entity name', 'Putting dates in a generic JSON "attributes" blob']
  },
  {
    codexId: 'CODEX-RULE-PROV-005',
    title: 'EvidencePanel and SupersessionChain Are Lazy-Loaded in UI',
    summary: 'EvidencePanel (relationship evidence) and SupersessionChain (document lineage) MUST lazy-load on user interaction, not on initial render.',
    modality: 'MUST',
    scope: ['investigation', 'provenance', 'ui', 'performance'],
    rationale: 'Evidence and supersession data may require multiple graph queries. Loading them upfront on every artifact view would significantly impact list rendering performance.',
    examples: ['EvidencePanel collapses by default; fetches on expand click', 'SupersessionChain shows skeleton loader on first visibility'],
    antiPatterns: ['Fetching evidence on ConnectRenderer mount', 'Preloading supersession chain in the session list endpoint']
  },

  // ============================================================
  // IMPACT ANALYSIS (IMP-001 — IMP-003)
  // ============================================================
  {
    codexId: 'CODEX-RULE-IMP-001',
    title: 'Impact Weights Defined Per Relationship Type',
    summary: 'IMPACT primitive MUST apply semantic weights to relationships: DEPENDS_ON=1.0, IMPLEMENTS/REQUIRES=0.9, EXTENDS/GOVERNED_BY=0.8, USES=0.7, PART_OF=0.6, REFERENCES=0.5, MENTIONS=0.3, RELATED_TO=0.2.',
    modality: 'MUST',
    scope: ['investigation', 'impact', 'primitive'],
    rationale: 'Uniform weight treats "mentions" the same as "depends on", producing misleading risk scores. Semantic weights reflect actual dependency severity.',
    examples: ['A system DEPENDING_ON a changed entity is higher risk than one that MENTIONS it'],
    antiPatterns: ['Treating all relationship types with equal weight', 'Using edge confidence as the sole impact weight']
  },
  {
    codexId: 'CODEX-RULE-IMP-002',
    title: 'Articulation Point Detection Uses Pure Cypher, Not MAGE',
    summary: 'Impact structural analysis MUST NOT use MAGE graph_analyzer.articulation_points(). Instead use degree-count + shortestPath() alt-path check as a Cypher approximation.',
    modality: 'MUST',
    scope: ['investigation', 'impact', 'memgraph'],
    rationale: 'MAGE is not available in this project deployment. Pure Cypher approximation: if an entity has degree > threshold AND no alternate shortest path exists between its neighbors without traversing it, it is flagged as a likely articulation point.',
    examples: ['MATCH (n)-[r:ES_RELATED_TO]->() WHERE n.id = $id RETURN count(r) AS degree', 'shortestPath() with NONE(n IN nodes(path) WHERE n.id = $targetId) for alt-path check'],
    antiPatterns: ['Calling CALL graph_analyzer.articulation_points()', 'Importing MAGE procedures in any query']
  },
  {
    codexId: 'CODEX-RULE-IMP-003',
    title: 'Impact Recommendations Generated From Category and Risk Factors',
    summary: 'IMPACT primitive MUST generate actionable recommendations based on the combination of impactByCategory (what types are affected) and riskFactors (why the risk is high).',
    modality: 'MUST',
    scope: ['investigation', 'impact', 'primitive'],
    rationale: 'Risk scores without guidance are incomplete. Category-based recommendations (e.g., "notify policy owners" for policy-heavy impact) are more actionable than generic alerts.',
    examples: ['policies affected + high risk → recommendation type: notify, priority: high', 'systems affected + articulation point → recommendation type: defer, priority: critical'],
    antiPatterns: ['Returning riskLevel without any recommendations', 'Generating identical recommendations regardless of impact category']
  }
];

async function seedRules() {
  console.log('Seeding Investigation Module Codex Rules...\n');
  let created = 0, skipped = 0, failed = 0;

  for (const rule of INVESTIGATION_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'Codex', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality, scope: $scope,
          tier: 'M2', status: 'ACTIVE', rationale: $rationale,
          examples: $examples, antiPatterns: $antiPatterns,
          createdAt: $now, updatedAt: $now
        })
        RETURN r.codexId
      `, {
        id, now,
        codexId: rule.codexId,
        title: rule.title,
        summary: rule.summary,
        modality: rule.modality,
        scope: JSON.stringify(rule.scope),
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples),
        antiPatterns: JSON.stringify(rule.antiPatterns),
      });

      console.log(`  OK  ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log(`Total Investigation rules: ${INVESTIGATION_RULES.length}`);
}

async function main() {
  await seedRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
