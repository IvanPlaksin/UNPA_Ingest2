'use strict';
/**
 * Seed Codex Rules — CGE (Canonical Graph Envelope) + MTH (Investigation Methodology)
 *
 * CGE-001..004: Платформенный контракт выходных данных investigation primitives
 * MTH-001..003: Архитектура методологий расследования
 *
 * Usage: node api/scripts/seed-codex-cge-mth-rules.js
 */

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const RULES = [
  // ── CGE (Canonical Graph Envelope) ──────────────────────────────────────────

  {
    codexId: 'CODEX-RULE-CGE-001',
    title: 'Entity Edge Vocabulary Is Fixed at 18 Typed Labels',
    summary: 'All edges between EntityNode instances MUST use one of the 18 canonical typed labels defined in canonical-graph.constants.js. The generic ES_RELATED_TO label is permanently prohibited. Adding new edge types requires a Codex amendment.',
    modality: 'MUST',
    scope: ['cge', 'entity-store', 'graph', 'extraction', 'investigation'],
    rationale: 'ES_RELATED_TO made graph queries ambiguous — every relationship had to be reified by reading edge properties. Typed labels enable direct Cypher pattern matching (MATCH (a)-[:MANDATES]->(b)) and allow graph algorithms to distinguish relationship semantics at traversal time, not query time.',
    examples: [
      'MATCH (a:EntityNode)-[:MANDATES]->(b:EntityNode) — legal mandate relationship',
      'MATCH (a:EntityNode)-[:GOVERNS]->(b:EntityNode) — governance relationship',
      'MATCH (a:EntityNode)-[:SUPERSEDES]->(b:EntityNode) — document supersession',
      'All 18 types: HAS_MEMBER, MANDATES, GOVERNS, IMPLEMENTS, ADVISES, REPORTS_TO, FUNDS, COORDINATES, PARTNERS_WITH, OVERSEES, SERVES, LOCATED_IN, PART_OF, SPECIALIZES, REFERENCES, SUPERSEDES, CORRECTS, IS_SUBJECT_OF',
    ],
    antiPatterns: [
      'CREATE (a)-[:ES_RELATED_TO {type: "mandate"}]->(b) — forbidden, use [:MANDATES]',
      'Using unlisted label types without Codex amendment',
      'Using [:RELATED_TO] as a generic fallback — no such type exists in canonical vocabulary',
    ],
  },

  {
    codexId: 'CODEX-RULE-CGE-002',
    title: 'Investigation Primitives Must Return CGE Envelope',
    summary: 'Every investigation primitive MUST return a Canonical Graph Envelope (CGE) as the `content` field of its output. The envelope shape is: { nodes[], edges[], roots[], projection: { kind, hints }, provenance: { producedBy, toolId, timestamp }, summary? }. Primitives that return plain objects or non-envelope shapes violate the platform contract.',
    modality: 'MUST',
    scope: ['cge', 'investigation', 'primitives', 'platform'],
    rationale: 'A single output contract lets renderers, the investigation agent, methodology executor, and MCP tools all consume primitive output without per-primitive deserialization logic. It also makes primitive output composable: the output of EXPAND can be piped directly into PROFILE or SYNTHESIZE.',
    examples: [
      'LOCATE returns: { nodes: [{id,label,type}], edges: [], roots: ["entity-id"], projection: { kind: "graph", hints: {} }, provenance: { producedBy: "TOOL", toolId: "investigation.locate" } }',
      'TEXT returns: { nodes: [], edges: [], roots: [], projection: { kind: "text" }, summary: { title, body, wordCount } }',
      'MATRIX returns: { nodes: [], edges: [], roots: [], projection: { kind: "matrix", hints: { rows, cols, cells, rowLabels, colLabels } } }',
      'createEnvelope() from canonical-graph.constants.js creates a valid empty envelope',
    ],
    antiPatterns: [
      'Returning { entities: [...], relationships: [...] } without wrapping in envelope',
      'Returning plain string or number as primitive output',
      'Adding content directly to envelope root (use projection.hints or summary instead)',
      'Omitting provenance.toolId — breaks audit trail',
    ],
  },

  {
    codexId: 'CODEX-RULE-CGE-003',
    title: 'Renderers Must Use fromEnvelope() for Content Extraction',
    summary: 'All investigation renderers (ConnectRenderer, ExpandRenderer, etc.) MUST extract primitive content via fromEnvelope(content, TYPE) from envelope-compat.js. Direct property access on the content object is forbidden. fromEnvelope() handles both CGE envelopes and legacy pre-CGE artifacts — this is the only backward-compatibility layer.',
    modality: 'MUST',
    scope: ['cge', 'investigation', 'renderers', 'frontend'],
    rationale: 'Artifact store contains pre-CGE investigation results. A renderer that reads content.nodes directly breaks on old artifacts. fromEnvelope() detects the format (CGE via Array.isArray(content?.nodes)) and normalizes to the legacy renderer shape, making all renderers forward- and backward-compatible with zero additional logic.',
    examples: [
      'import { fromEnvelope } from "./envelope-compat"; const c = fromEnvelope(content, "GRAPH"); // safe',
      'fromEnvelope(cgeEnvelope, "MATRIX") → { rows, cols, cells, rowLabels, colLabels }',
      'fromEnvelope(legacyObject, "GRAPH") → { nodes, edges, roots } (unchanged)',
      'For TEXT type: c.title, c.body, c.wordCount — all normalized from either format',
    ],
    antiPatterns: [
      'const nodes = content.nodes ?? [] — breaks on legacy artifacts',
      'if (content.projection) { ... } else { ... } — duplicates fromEnvelope() logic, fragile',
      'Creating per-renderer format detection — use fromEnvelope() instead',
    ],
  },

  {
    codexId: 'CODEX-RULE-CGE-004',
    title: 'projection.kind Determines Renderer Strategy',
    summary: 'The projection.kind field in the CGE envelope is the authoritative signal for how a primitive\'s output should be visualized. Renderers and the investigation agent MUST use projection.kind to select visualization strategy. Renderer-specific parameters are passed in projection.hints, not at the envelope root.',
    modality: 'MUST',
    scope: ['cge', 'investigation', 'renderers', 'primitives'],
    rationale: 'Decoupling visualization intent (kind) from content (nodes/edges/summary) allows a single primitive to declare its preferred presentation without hard-coding renderer selection. For example, SYNTHESIZE and TEXT both use kind="text" — a future "prose renderer" can handle both without knowing which primitive produced the output.',
    examples: [
      'projection: { kind: "graph" } → force-directed node-link diagram (LOCATE, EXPAND, CONNECT)',
      'projection: { kind: "text" } → text renderer (TEXT, SYNTHESIZE)',
      'projection: { kind: "matrix" } → grid renderer (MATRIX)',
      'projection: { kind: "timeline" } → timeline renderer (TIMELINE)',
      'projection: { kind: "graph", hints: { layout: "radial", center: "entity-id" } } → radial layout',
      'PROJECTION_KIND enum in canonical-graph.constants.js: TEXT, GRAPH, PATHS, MATRIX, TIMELINE, DOSSIER, LIST, TREE',
    ],
    antiPatterns: [
      'Renderer hard-coding which primitive called it (switch(primitiveType)) — use kind instead',
      'Putting visualization parameters at envelope root (e.g., envelope.layout = "radial") — use hints',
      'Using kind values outside the PROJECTION_KIND enum without Codex amendment',
    ],
  },

  // ── MTH (Investigation Methodology) ─────────────────────────────────────────

  {
    codexId: 'CODEX-RULE-MTH-001',
    title: 'Methodology Is a Parameterized GXE Graph with Quality Rubric',
    summary: 'An InvestigationMethodology consists of: (1) a GXE graph in namespace META whose nodes are investigation.* executors, (2) a parameterSchema defining workflow inputs, and (3) a qualityRubric defining minimum quality thresholds (minEntityCount, minProvenanceRatio, minSourceCoverage). A methodology without a quality rubric is invalid.',
    modality: 'MUST',
    scope: ['methodology', 'investigation', 'gxe', 'platform'],
    rationale: 'Investigation methodologies are executable programs, not documentation. Storing them as GXE graphs means they can be edited in the Visual Graph Editor, versioned via GraphVersion, and executed by RuntimeEngine without any special-case code. The quality rubric ensures that methodology results are evaluated against objective criteria before being accepted.',
    examples: [
      'Graph namespace: META, graphKey: MTH-<NAME>-V1',
      'Node types allowed: workflow.start, workflow.end, investigation.* (any of 11 primitives)',
      'qualityRubric: { minEntityCount: 10, minProvenanceRatio: 0.5, minSourceCoverage: 0.7 }',
      'parameterSchema fields become inputs to workflow.start node',
      'Reference: "Research UN Service" methodology (MTH-RESEARCH-UN-SERVICE-V1)',
    ],
    antiPatterns: [
      'Methodology graph containing non-investigation.* executor nodes (e.g., flowdesk.* or rag.*)',
      'Methodology without qualityRubric — evaluateResult() will reject with missing fields',
      'Storing methodology as plain text description instead of executable GXE graph',
      'Using namespace FLOWDESK or default for methodology graphs — must be META',
    ],
  },

  {
    codexId: 'CODEX-RULE-MTH-002',
    title: 'Investigation Primitives Are Exposed as investigation.* AOPEG Executors',
    summary: 'All 11 investigation primitives MUST be accessible as AOPEG executor types prefixed investigation.* (e.g., investigation.locate, investigation.synthesize). This makes them usable as GXE graph nodes, callable by RuntimeEngine, and composable with other AOPEG plugins. Do not call primitive execute() functions directly from graph nodes — always go through the executor.',
    modality: 'MUST',
    scope: ['methodology', 'investigation', 'aopeg', 'gxe', 'platform'],
    rationale: 'Exposing primitives as AOPEG executors unifies the execution model: methodology graphs run through the same RuntimeEngine pipeline as any other GXE graph. This means all RuntimeEngine features (parameter templates, port data flattening, execution context, back-edge detection) apply to methodology execution without additional code.',
    examples: [
      'Node type "investigation.locate" → wraps locate.primitive.js via InvestigationPlugin',
      'investigation.synthesize passes context.variables (accumulated state) to primitive as corpus',
      'parameterSchema for each executor is auto-generated from primitive\'s inputSchema',
      'All 11 types: locate, expand, connect, profile, structure, impact, resolve, matrix, timeline, text, synthesize',
    ],
    antiPatterns: [
      'Calling require("../primitives/locate.primitive").execute() directly from a graph node',
      'Creating custom executor wrappers per primitive instead of using InvestigationPlugin factory',
      'Using generic executor type "investigation" (without subtype) — must be fully qualified',
    ],
  },

  {
    codexId: 'CODEX-RULE-MTH-003',
    title: 'Methodology Execution Produces PROPOSED Artifact Requiring Validation',
    summary: 'InvestigationMethodologyService.execute() produces a result with status PROPOSED. The result is not applied to the knowledge graph until a human validator calls evaluateResult() and explicitly approves it. Automated pipelines MUST NOT skip validation. The evaluateResult() check verifies qualityRubric thresholds before marking result as ACCEPTED.',
    modality: 'MUST',
    scope: ['methodology', 'investigation', 'platform', 'quality'],
    rationale: 'Investigation outputs directly affect the knowledge graph used for decision support. Automated acceptance without human review risks polluting the graph with low-quality or hallucinated entities. The PROPOSED → ACCEPTED lifecycle mirrors the document extraction flow and ensures that AI-generated investigation results are held to the same quality standards as other ingested knowledge.',
    examples: [
      'POST /api/v1/methodology/investigation/:id/execute → returns { status: "PROPOSED", result: {...} }',
      'POST /api/v1/methodology/investigation/:id/evaluate → checks rubric, returns { accepted: true/false, gaps: [...] }',
      'Rubric failure example: { accepted: false, gaps: ["entityCount 3 < min 10", "provenanceRatio 0.3 < min 0.5"] }',
      'Only after accepted=true should results be merged into EntityStore or KnowledgeGraph',
    ],
    antiPatterns: [
      'Auto-accepting methodology results without calling evaluateResult()',
      'Merging PROPOSED results into knowledge graph before validation',
      'Skipping qualityRubric check because "it\'s just a test run"',
      'Treating evaluateResult() as optional — it is the only quality gate for methodology output',
    ],
  },
];

async function seed() {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
  console.log('=== Seeding Codex Rules: CGE + MTH ===\n');
  let created = 0, skipped = 0, errors = 0;

  for (const rule of RULES) {
    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r.codexId AS id',
        { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id,
          codexId: $codexId,
          namespace: 'Codex',
          nodeType: 'CodexRule',
          title: $title,
          summary: $summary,
          modality: $modality,
          scope: $scope,
          tier: 'M2',
          status: 'ACTIVE',
          ruleKind: 'PRESCRIPTIVE',
          rationale: $rationale,
          examples: $examples,
          antiPatterns: $antiPatterns,
          createdAt: $now,
          updatedAt: $now,
          createdBy: 'seed-cge-mth'
        })
        RETURN r.codexId AS id
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
      errors++;
    }
  }

  console.log(`\n=== Results: ${created} created, ${skipped} skipped, ${errors} errors ===`);
}

seed().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
