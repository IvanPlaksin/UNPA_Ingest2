'use strict';
/**
 * Seed Codex Rules — UN Extraction Methodology
 *
 * KM-010: Document Classification Required Before Knowledge Extraction
 * KM-011: Epistemic Layer Determines Normative Weight in Knowledge Triangle
 * KM-012: Layer Precedence Governs Conflict Resolution in Knowledge Triangle
 * KM-013: Knowledge Triangle Completeness Required for Critical Processes
 * KM-014: Gap Nodes Cannot Be Deleted, Only Closed
 * KM-015: REVEALS_GAP_IN Does Not Overwrite Normative Content
 * KM-016: KQS Must Be Calculated for All Extracted Knowledge
 * KM-017: KQS Below Threshold Requires Review
 * KM-018: Critical Processes Require Full Knowledge Triangle (Completeness >= 0.8)
 * KM-019: Stale Gaps Must Be Escalated (90 Days → Escalate, 180 Days → Management Review)
 * KM-020: Triangle Completeness Must Be Tracked Per Namespace (Avg Completeness >= 0.7)
 *
 * Run: node api/scripts/seed-codex-un-extraction-rules.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  {
    codexId: 'CODEX-RULE-KM-012',
    title: 'Layer Precedence Governs Conflict Resolution in Knowledge Triangle',
    summary: 'When two knowledge claims conflict, the claim from the higher-authority layer MUST take precedence: L0 > L1 > L2 > L3 > L5. L4 (empirical) NEVER overrides normative claims — instead it creates a REVEALS_GAP_IN edge pointing to the contradicted L1/L2 claim. Strategic documents (L5) inform but do not mandate. Use EpistemicLayerService.resolveConflict(layer1, layer2) for programmatic resolution.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Without layer precedence, an OIOS audit finding (L4, empirical) could overwrite an ST/SGB policy clause (L1, normative). This produces incorrect knowledge — empirical evidence describes reality, not law. The Knowledge Triangle is only coherent when normative authority flows downward (L0→L1→L2→L3) and empirical evidence creates gap edges rather than overwriting policy.',
    examples: [
      'L0 GA Resolution mandates X + L4 OIOS finding shows X is not done → REVEALS_GAP_IN edge, not contradiction of GA Resolution',
      'L1 ST/SGB policy and L2 ST/AI instruction both cover topic → L1 wins on normative weight; L2 IMPLEMENTS L1',
      'L5 SG report proposes changing a procedure + L2 ST/AI currently governs → L2 governs; L5 INFORMS future change',
      'Code: getLayerPrecedence("L0", "L4") → -4 (L0 wins); resolveConflict("L4", "L1") → "L1"'
    ],
    antiPatterns: [
      'Treating L4 audit findings as normative — they are EMPIRICAL, create REVEALS_GAP_IN, not GOVERNS',
      'L5 strategy document overriding L1 SGB policy — strategy proposes, policy mandates',
      'Merging conflicting claims without checking layer precedence',
      'Creating GOVERNS edge from L4 document — L4 has normativeWeight=0 by definition'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-010',
    title: 'Document Classification Required Before Knowledge Extraction',
    summary: 'Before extracting knowledge from any UN document, the agent MUST call document.classify to determine the document type and epistemic layer (L0-L5). The classification result (document_type_id, epistemicLayer, normativeWeight) MUST be stored on the Document node in the knowledge graph. Extraction without classification produces knowledge nodes without provenance context, making Knowledge Triangle analysis impossible.',
    modality: 'MUST',
    scope: ['km', 'extraction', 'agents', 'ingestion', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Knowledge Triangle analysis (OPERATIONALIZES, REVEALS_GAP_IN) requires knowing the epistemic layer of each source document. Without classification, OIOS audit findings (L4) cannot be distinguished from policy documents (L1/L2), and gap analysis produces incorrect results. Normative weight (0.0 for L4, 0.85 for L1) is used in KQS scoring.',
    examples: [
      'CORRECT: agent calls document.classify → {document_type_id: "ST_SGB", epistemicLayer: "L1", normativeWeight: 0.85} → stores on Document node → extracts knowledge with L1 provenance',
      'CORRECT: OIOS report → classify → {epistemicLayer: "L4", normativeWeight: 0.0} → extracted findings tagged as empirical evidence',
      'WRONG: extract knowledge from document without calling document.classify — produces knowledge nodes with no epistemicLayer tag',
      'WRONG: assume epistemicLayer from filename alone — use document.classify which applies multi-signal scoring'
    ],
    antiPatterns: [
      'Calling ingestion executors without prior document.classify call',
      'Hardcoding epistemicLayer from filename pattern instead of using classifier',
      'Ignoring requires_llm_classification=true flag — escalate to LLM classification for unrecognized documents',
      'Extracting knowledge from L4 documents without flagging as empirical (normativeWeight=0)'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-011',
    title: 'Epistemic Layer Determines Normative Weight in Knowledge Triangle',
    summary: 'Every extracted knowledge node MUST carry the normativeWeight of its source document (inherited from DocumentType). Normative weight determines the authority of a knowledge claim in Knowledge Triangle analysis: L0 (1.0) overrides L5 (0.25); L4 claims (0.0) are evidence of reality, not prescriptions. OPERATIONALIZES edges link L3 process knowledge to L1/L2 policy. REVEALS_GAP_IN edges link L4 findings to L1/L2 gaps they expose.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'The Knowledge Triangle (L1/L2 policy → L3 process → L4 empirical) is the core epistemic model for UN ProjectAdvisor. Without normative weight, gap analysis cannot distinguish between a policy requirement that is not implemented (critical gap) versus an operational practice with no policy backing (shadow process). The L0-L5 hierarchy is the foundation of all KQS scoring.',
    examples: [
      'L0 GA Resolution (weight 0.95) + L4 OIOS finding (weight 0.0): REVEALS_GAP_IN edge with high gap severity',
      'L1 ST/SGB policy (weight 0.85) + L3 SOP (weight 0.40): OPERATIONALIZES edge shows implementation exists',
      'L4 BOA audit finding (weight 0.0): KnowledgeNode.normativeWeight=0.0, empiricalCertainty contributed to KQS',
      'Conflict: L0 and L5 claim opposite → L0 wins (weight 1.0 > 0.25)',
      'Cypher: MATCH (p:KnowledgeNode)-[:GOVERNS]->(proc:KnowledgeNode) WHERE p.normativeWeight > 0.7 AND NOT (proc)<-[:OPERATIONALIZES]-() RETURN proc — finds unimplemented L1/L2 policies'
    ],
    antiPatterns: [
      'Treating all knowledge nodes as equal regardless of source layer',
      'Creating GOVERNS edges from L4 empirical documents to L3 processes — L4 reveals gaps, does not govern',
      'Assigning normativeWeight manually without referencing DocumentType.normativeWeight',
      'Using L5 Strategic documents (weight 0.25) as authoritative policy sources — they are proposals, not mandates',
      'Missing REVEALS_GAP_IN edges for OIOS/JIU findings — these are the primary gap detection signals'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-013',
    title: 'Knowledge Triangle Completeness Required for Critical Processes',
    summary: 'Any process or activity marked as "critical" MUST have all three Knowledge Triangle vertices: at least one GOVERNS edge from a normative source (L0-L2), at least one OPERATIONALIZES edge from an operational source (L3), and at least one REVEALS_GAP_IN edge (L4 empirical finding) or explicit documentation that no findings exist. Incomplete triangles generate a gap warning during extraction. Use KnowledgeTriangleService.getTriangleCompleteness() to check.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'A critical process with no normative coverage means no policy governs it — potential compliance void. A process with no operational document means the policy is aspirational only. A process never assessed by audit may have hidden risks. The Knowledge Triangle is only analytically useful when all three vertices are present for critical items.',
    examples: [
      'CORRECT: procurement process has ST/SGB GOVERNS + SOP OPERATIONALIZES + OIOS finding REVEALS_GAP_IN → complete triangle, score 1.0',
      'WARNING: IT governance process has ST/AI GOVERNS + no SOP → incomplete triangle, score 0.33, generates gap warning',
      'CORRECT: process with no known audit findings → create explicit "no findings documented" L4 node to close the triangle',
      'Code: KnowledgeTriangleService.getTriangleCompleteness(processId) → {score: 0.67, hasNormative: true, hasOperational: true, hasEmpirical: false}'
    ],
    antiPatterns: [
      'Marking a process as critical without checking triangle completeness',
      'Treating triangle score 0.67 (2 of 3 vertices) as acceptable for critical processes',
      'Skipping L4 empirical vertex because "no audit has been done yet" — document the absence explicitly'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-014',
    title: 'Gap Nodes Cannot Be Deleted, Only Closed',
    summary: 'Gap nodes created by REVEALS_GAP_IN edges are permanent audit trail records. They MUST NOT be deleted from the knowledge graph. When a gap is resolved, use KnowledgeTriangleService.updateGapStatus(gapId, "CLOSED", resolution) to transition through the lifecycle: OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED. Resolution text MUST be recorded. Closed gaps remain queryable for historical analysis.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Gap nodes represent findings from OIOS, JIU, and BOA audit reports — officially mandated oversight instruments. Deleting a gap node would erase the audit trail, which is a compliance violation. The lifecycle (OPEN→CLOSED) preserves institutional memory about what was wrong and how it was fixed, enabling trend analysis across audit cycles.',
    examples: [
      'CORRECT: gap resolved → updateGapStatus(id, "CLOSED", "Vendor justification form added to SOP v2.3")',
      'CORRECT: OIOS follows up → gap transitions OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED with each management response',
      'WRONG: DELETE (gap:Gap) — even if the underlying issue is resolved, the historical record must remain',
      'WRONG: overwriting gap.status directly in Cypher without going through lifecycle — bypasses validation'
    ],
    antiPatterns: [
      'Running DELETE or DETACH DELETE on Gap nodes',
      'Merging gap data into the source document node and removing the Gap node',
      'Skipping the ACKNOWLEDGED state when a management response exists — it documents formal recognition',
      'Setting gap.status to a value outside [OPEN, ACKNOWLEDGED, ADDRESSED, CLOSED]'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-015',
    title: 'REVEALS_GAP_IN Does Not Overwrite Normative Content',
    summary: 'L4 empirical findings (OIOS, JIU, BOA) that contradict normative claims (L0-L2) MUST create a Gap node via REVEALS_GAP_IN, not modify the normative KnowledgeNode content. The normative source retains its original content and normativeWeight. The Gap node captures the empirical contradiction: what the policy says versus what reality shows. Agents MUST NOT update L0-L2 node content based on L4 findings.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'This rule preserves normative integrity. An OIOS finding that "procurement rules are not followed" does not change the ST/SGB policy that mandates procurement rules — it creates evidence that a gap exists between policy and practice. Modifying L1/L2 node content based on L4 findings would corrupt the normative layer and invalidate KQS scoring, which relies on normativeWeight being a stable property of the policy document type.',
    examples: [
      'CORRECT: OIOS finds "vendor justification missing in 30% of contracts" → Gap{gapType:COMPLIANCE, severity:HIGH} → REVEALS_GAP_IN → ST/SGB clause unchanged',
      'CORRECT: BOA finding contradicts ST/AI instruction → createRevealsGapEdge() creates gap, ST/AI content preserved',
      'WRONG: UPDATE normativeNode SET content = empiricalFinding — replaces policy with audit observation',
      'WRONG: reducing normativeNode.normativeWeight because of L4 finding — weight is a property of the document type, not mutable by findings'
    ],
    antiPatterns: [
      'Updating KnowledgeNode.content of an L0-L2 node based on L4 findings',
      'Reducing normativeWeight of a KnowledgeNode because an audit found non-compliance',
      'Creating GOVERNS edge from L4 node to any target — L4 has zero normativeWeight by definition',
      'Treating REVEALS_GAP_IN as a correction mechanism rather than a gap-detection mechanism'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-016',
    title: 'KQS Must Be Calculated for All Extracted Knowledge',
    summary: 'Every KnowledgeNode created during extraction MUST have a Knowledge Quality Score (KQS) calculated and stored as kqs_score property. KQS = 0.35×NormativeWeight + 0.30×EmpiricalCertainty + 0.20×TemporalCurrency + 0.15×SourceAuthority. Use KQSService.calculateKQSById(nodeId) at extraction time. The kqs_score enables ranking, quality gates, and RAG retrieval weighting.',
    modality: 'MUST',
    scope: ['km', 'kqs', 'extraction', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Without KQS, all knowledge nodes are treated as equal quality — an OIOS audit finding (L4, normativeWeight=0, fast temporal decay) would rank the same as an ST/SGB policy (L1, normativeWeight=0.85, slow decay). KQS enables quality-weighted retrieval and prevents low-quality empirical evidence from dominating answers to policy questions.',
    examples: [
      'CORRECT: node created → calculateKQSById(nodeId) → kqs_score stored on node → queryable',
      'CORRECT: L0 constitutional node (weight 1.0, fresh, A1 authority) → KQS ≈ 0.70',
      'CORRECT: L1 policy node with complete triangle → KQS > 0.75',
      'WRONG: extract 1000 nodes without calculating KQS → all nodes have kqs_score=null → ranking impossible',
      'API: GET /api/v1/kqs/node/:nodeId | GET /api/v1/kqs/rankings | POST /api/v1/kqs/batch'
    ],
    antiPatterns: [
      'Skipping KQS calculation to save time during bulk ingestion — use batch (up to 100 per call)',
      'Hardcoding kqs_score without calling KQSService — manual scores bypass component calculation',
      'Using kqs_score alone for retrieval without considering layer-specific thresholds',
      'Comparing KQS across different entity types — KQS is calibrated for KnowledgeNode entities'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-017',
    title: 'KQS Below Threshold Requires Human Review',
    summary: 'KnowledgeNodes with kqs_score < 0.30 MUST be flagged for human review before being promoted to the active knowledge base or used in RAG responses. Low KQS indicates low normative authority (L4 nodes), stale information (temporal decay), or absent empirical validation. Use GET /api/v1/kqs/low to find flagged nodes. The 0.30 threshold is configurable per namespace.',
    modality: 'MUST',
    scope: ['km', 'kqs', 'extraction', 'agents', 'quality-gates'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'A KQS of 0.30 corresponds to an L4 empirical node that is 6+ months old with no empirical validation of the process it describes. Including such nodes without review risks surfacing outdated audit findings as if they were current policy. Human review allows analysts to reinforce the node or mark it as superseded.',
    examples: [
      'CORRECT: findLowKQSNodes({threshold: 0.30}) returns stale L4 audit nodes → analyst review queue',
      'CORRECT: L3 SOP 2 years old → temporalCurrency decayed → KQS < 0.30 → review → update SOP',
      'CORRECT: after review → analyst adds new empirical evidence → recalculate KQS → node promoted',
      'WRONG: using node with kqs_score 0.15 in RAG response without review'
    ],
    antiPatterns: [
      'Ignoring kqs_score threshold in retrieval — surfacing very low quality nodes in user responses',
      'Setting threshold to 0.0 to allow all nodes — defeats the quality gate purpose',
      'Deleting low-KQS nodes instead of reviewing them — historical record must be preserved',
      'Never recalculating KQS after analyst adds new data — stale score may prevent valid node from threshold'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-018',
    title: 'Critical Processes Require Full Knowledge Triangle (Completeness >= 0.8)',
    summary: 'Any Process node classified as critical (e.g., financial oversight, procurement, human resources, security) MUST achieve triangle completeness >= 0.8 before it can be used in authoritative RAG responses. Triangle completeness = max(0, score - gapPenalty) where score = (normative + operational + empirical) / 3 and gapPenalty = 0.15×HIGH + 0.10×MEDIUM + 0.05×LOW open gaps. Use GET /api/v1/triangle/process/:id/completeness. Processes below threshold must show a remediation plan.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'completeness', 'quality-gates', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'A process with completeness < 0.8 has either missing vertices (no normative, operational, or empirical coverage) or open high-severity gaps that reduce confidence. Surfacing guidance from such a process risks giving users advice that is normatively unsupported, operationally undocumented, or empirically contradicted. The 0.8 threshold ensures at least two vertices are present and no HIGH gaps are open.',
    examples: [
      'CORRECT: procurement process has all 3 vertices + no open HIGH gaps → completeness 1.0 → approved for RAG',
      'CORRECT: HR policy has normative + operational (no empirical) + no gaps → score 0.667, completeness 0.667 → flagged for L4 coverage',
      'CORRECT: security process has HIGH gap open → completeness 1.0 - 0.15 = 0.85 → still passes, but gap must be in remediation',
      'WRONG: routing a critical process question through RAG when triangle completeness = 0.33 (normative only)',
      'API: GET /api/v1/triangle/incomplete → lists all processes below threshold'
    ],
    antiPatterns: [
      'Using triangle completeness = 0.0 as threshold — any normative coverage would pass',
      'Checking only score (without gap penalty) — a fully-covered process with multiple HIGH gaps could score 1.0 but completeness 0.55',
      'Requiring completeness = 1.0 — no real-world process has perfect coverage; 0.8 balances rigor and practicality',
      'Ignoring findIncompleteTriangles() results in operational reviews'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-019',
    title: 'Stale Gaps Must Be Escalated (90 Days OPEN → Escalate, 180 Days → Management Review)',
    summary: 'Gap nodes with status OPEN or ACKNOWLEDGED for more than 90 days MUST be escalated (severity elevated or assigned to a responsible officer). After 180 days, the gap MUST be surfaced for management review. Use GapDetectionService.findStaleGaps({daysOld: 90}) and findGapsRequiringReview({daysOld: 180}) or GET /api/v1/triangle/gaps/stale. Gap lifecycle: OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED. Never skip ACKNOWLEDGED for HIGH gaps.',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'gap-management', 'compliance', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Stale gaps represent unresolved contradictions between normative policy and empirical reality. A HIGH gap that has been open for 6 months indicates either that remediation is blocked (escalation needed) or that the gap was discovered and forgotten (audit failure). The 90/180 day thresholds align with UN internal audit response cycle requirements. STALE_GAP_DAYS_DEFAULT=90, REVIEW_GAP_DAYS_DEFAULT=180 are the service constants.',
    examples: [
      'CORRECT: findStaleGaps({daysOld: 90}) returns gap created 95 days ago → assign to responsible officer',
      'CORRECT: gap open 185 days → appears in findGapsRequiringReview() → surface to D/USG in next report',
      'CORRECT: runGapDetection({persist: true}) → saves GapDetectionReport node → queryable for trend analysis',
      'WRONG: manually checking gaps without automated detection — human error causes gaps to be missed',
      'WRONG: closing gaps without ADDRESSED intermediate step for HIGH severity gaps'
    ],
    antiPatterns: [
      'Deleting Gap nodes after 90 days instead of escalating — historical gap record must be preserved',
      'Auto-closing stale gaps without resolution — CLOSED status requires resolution text via updateGapStatus()',
      'Setting daysOld threshold to 365 to reduce noise — misses the UN audit cycle requirement',
      'Running gap detection without persist:true in production — no historical trend data'
    ]
  },
  {
    codexId: 'CODEX-RULE-KM-020',
    title: 'Triangle Completeness Must Be Tracked Per Namespace (Avg Completeness >= 0.7)',
    summary: 'Each knowledge namespace (e.g., KM, HR, FINANCE, PROCUREMENT) MUST maintain average triangle completeness >= 0.7 across all its processes. Use GapDetectionService.getNamespaceCompleteness({namespace}) or GET /api/v1/triangle/namespace/completeness. Namespaces below 0.7 must have a gap closure plan. The distribution object (full/partial/minimal/none) guides prioritization: fix "none" first, then "minimal", then improve "partial" to "full".',
    modality: 'MUST',
    scope: ['km', 'knowledge-triangle', 'completeness', 'namespace', 'governance', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Individual process completeness can be misleading if a namespace has 90% of processes with completeness=0.0 and 10% with completeness=1.0. Namespace-level tracking reveals systemic coverage gaps. The 0.7 threshold ensures that on average, each process has at least two triangle vertices covered. This threshold aligns with the ICSC knowledge quality framework requirement for institutional knowledge systems.',
    examples: [
      'CORRECT: PROCUREMENT namespace: 12 processes, avgCompleteness 0.82, distribution {full:8, partial:3, minimal:1, none:0} → compliant',
      'CORRECT: HR namespace: avgCompleteness 0.52 → initiate L3 SOP coverage for 6 processes missing operational vertex',
      'CORRECT: monthly runGapDetection() → namespace completeness tracked over time → trend analysis in GapDetectionReport',
      'WRONG: checking completeness per-process but never aggregating to namespace level',
      'API: GET /api/v1/triangle/namespace/completeness?namespace=PROCUREMENT&sampleLimit=100'
    ],
    antiPatterns: [
      'Using sampleLimit=10 for namespace assessment — too small a sample distorts the average',
      'Focusing only on distribution.full without improving distribution.none — zero-coverage processes drag down average',
      'Treating namespace completeness as static — it must be recalculated after each extraction batch',
      'Using different thresholds per namespace without governance approval — thresholds must be documented in namespace configuration'
    ]
  }
];

async function seed() {
  console.log('Seeding UN Extraction Methodology Codex rules...\n');
  let created = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId }
      );
      if (existing.length > 0) {
        console.log('  SKIP (exists):', rule.codexId);
        continue;
      }

      await mg().runQuery(
        `CREATE (r:CodexRule $props)
         WITH r
         MATCH (p:CodexPrinciple {codexId: $d})
         CREATE (r)-[:DERIVES_FROM]->(p)
         RETURN r.codexId`,
        {
          props: {
            id, codexId: rule.codexId,
            namespace: 'Codex', nodeType: 'CodexRule',
            title: rule.title, summary: rule.summary,
            modality: rule.modality,
            scope: JSON.stringify(rule.scope),
            tier: 'M2', status: 'ACTIVE',
            rationale: rule.rationale,
            examples: JSON.stringify(rule.examples),
            antiPatterns: JSON.stringify(rule.antiPatterns),
            createdAt: now, updatedAt: now
          },
          d: rule.derivesFrom
        }
      );
      console.log('  OK:', rule.codexId, '—', rule.title.slice(0, 65));
      created++;
    } catch (e) {
      console.error('  ERR', rule.codexId, ':', e.message);
    }
  }

  console.log(`\nDone. Created: ${created} / ${RULES.length}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
