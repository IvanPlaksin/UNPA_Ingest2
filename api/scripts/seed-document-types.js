/**
 * Seed Document Type Registry + SOP Extraction Prompts
 *
 * Creates: DocumentTypeRegistry, 5 DocumentType nodes, ClassifierRules,
 * 4 SOP ExtractionPrompt nodes, Codex rule DOC-001
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

// ============================================================
// DOCUMENT TYPES
// ============================================================

const DOCUMENT_TYPES = [
  {
    id: 'sop',
    name: 'Standard Operating Procedure',
    description: 'Procedural documents defining step-by-step organizational processes with roles, responsibilities, and compliance requirements.',
    structural_markers: ['numbered paragraphs', 'lettered sections (A. B. C.)', 'Annexures', 'cross-references to paragraphs'],
    required_sections: ['PURPOSE', 'SCOPE', 'ROLES AND RESPONSIBILITIES', 'PROCEDURES', 'REFERENCES'],
    entity_types: ['Actor', 'Action', 'Condition', 'SLA', 'SystemReference', 'DocumentReference'],
    keywords: ['standard operating procedure', 'SOP', 'shall apply', 'roles and responsibilities', 'scope', 'compliance is mandatory', 'supersedes', 'review date', 'annexure']
  },
  {
    id: 'policy',
    name: 'Policy Document',
    description: 'High-level governance documents establishing organizational policies, mandates, and frameworks.',
    structural_markers: ['numbered articles', 'sections with roman numerals', 'definitions section'],
    required_sections: ['PURPOSE', 'SCOPE', 'DEFINITIONS', 'POLICY STATEMENT', 'APPLICABILITY'],
    entity_types: ['PolicyStatement', 'Mandate', 'Exception', 'EffectiveDate'],
    keywords: ['policy', 'mandate', 'hereby establishes', 'effective date', 'applicable to all', 'in accordance with', 'General Assembly resolution']
  },
  {
    id: 'technical',
    name: 'Technical Specification',
    description: 'Technical documentation including API specs, architecture docs, system design documents.',
    structural_markers: ['code blocks', 'diagrams', 'version numbers', 'API endpoints'],
    required_sections: ['OVERVIEW', 'ARCHITECTURE', 'API', 'DEPENDENCIES'],
    entity_types: ['Component', 'Interface', 'Endpoint', 'DataModel', 'Dependency'],
    keywords: ['API', 'endpoint', 'schema', 'architecture', 'component', 'interface', 'deployment', 'configuration']
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Analytical reports, audit findings, status reports, and assessments.',
    structural_markers: ['executive summary', 'findings section', 'recommendations', 'appendices'],
    required_sections: ['EXECUTIVE SUMMARY', 'FINDINGS', 'RECOMMENDATIONS', 'CONCLUSION'],
    entity_types: ['Finding', 'Recommendation', 'Metric', 'Risk', 'Timeline'],
    keywords: ['findings', 'recommendations', 'executive summary', 'assessment', 'audit', 'compliance rate', 'risk level']
  },
  {
    id: 'contract',
    name: 'Contract / Agreement',
    description: 'Legal agreements, memoranda of understanding, service level agreements.',
    structural_markers: ['articles', 'clauses', 'parties section', 'signatures'],
    required_sections: ['PARTIES', 'TERMS', 'OBLIGATIONS', 'DURATION', 'SIGNATURES'],
    entity_types: ['Party', 'Obligation', 'Term', 'Penalty', 'Duration', 'SLA'],
    keywords: ['agreement', 'parties', 'hereby agree', 'obligations', 'term of agreement', 'memorandum of understanding', 'service level']
  }
];

// ============================================================
// CLASSIFIER RULES
// ============================================================

const CLASSIFIER_RULES = {
  sop: {
    threshold: 0.6,
    rules: [
      { signal: 'keyword_match', keywords: ['SOP', 'Standard Operating Procedure', 'shall apply', 'roles and responsibilities', 'annexure'], weight: 0.35 },
      { signal: 'section_match', sections: ['PURPOSE', 'SCOPE', 'ROLES AND RESPONSIBILITIES', 'PROCEDURES'], weight: 0.25 },
      { signal: 'structure_match', pattern: 'numbered_paragraphs', weight: 0.15 },
      { signal: 'structure_match', pattern: 'lettered_sections', weight: 0.15 },
      { signal: 'header_match', pattern: 'UNITED NATIONS|SECRETARIAT|UN DEPARTMENT', weight: 0.1 }
    ]
  },
  policy: {
    threshold: 0.6,
    rules: [
      { signal: 'keyword_match', keywords: ['policy', 'mandate', 'hereby establishes', 'General Assembly', 'applicable to all'], weight: 0.4 },
      { signal: 'section_match', sections: ['PURPOSE', 'SCOPE', 'DEFINITIONS', 'POLICY STATEMENT'], weight: 0.3 },
      { signal: 'header_match', pattern: 'ST/SGB|ST/AI|A/RES', weight: 0.2 },
      { signal: 'title_match', keywords: ['policy', 'directive', 'bulletin'], weight: 0.1 }
    ]
  },
  technical: {
    threshold: 0.6,
    rules: [
      { signal: 'keyword_match', keywords: ['API', 'endpoint', 'schema', 'architecture', 'component', 'interface', 'deployment'], weight: 0.4 },
      { signal: 'section_match', sections: ['OVERVIEW', 'ARCHITECTURE', 'API', 'INSTALLATION'], weight: 0.3 },
      { signal: 'structure_match', pattern: 'numbered_paragraphs', weight: 0.1 },
      { signal: 'keyword_match', keywords: ['function', 'class', 'import', 'module', 'npm', 'docker'], weight: 0.2 }
    ]
  },
  report: {
    threshold: 0.6,
    rules: [
      { signal: 'keyword_match', keywords: ['findings', 'recommendations', 'executive summary', 'assessment', 'audit'], weight: 0.4 },
      { signal: 'section_match', sections: ['EXECUTIVE SUMMARY', 'FINDINGS', 'RECOMMENDATIONS', 'CONCLUSION'], weight: 0.35 },
      { signal: 'keyword_match', keywords: ['compliance rate', 'risk level', 'metric', 'target', 'actual'], weight: 0.25 }
    ]
  },
  contract: {
    threshold: 0.6,
    rules: [
      { signal: 'keyword_match', keywords: ['agreement', 'parties', 'hereby agree', 'obligations', 'memorandum'], weight: 0.4 },
      { signal: 'section_match', sections: ['PARTIES', 'TERMS', 'OBLIGATIONS', 'SIGNATURES'], weight: 0.3 },
      { signal: 'keyword_match', keywords: ['effective date', 'duration', 'termination', 'indemnity', 'liability'], weight: 0.3 }
    ]
  }
};

// ============================================================
// SOP EXTRACTION PROMPTS
// ============================================================

const SOP_PROMPTS = [
  {
    id: 'sop-structure-v1',
    prompt_type: 'structure',
    version: '1.0.0',
    system_prompt: 'You are a UN institutional knowledge extraction specialist. Your task is to extract structured information from UN Standard Operating Procedure (SOP) documents. A UN SOP has the following canonical structure: Lettered sections (A. PURPOSE, B. SCOPE, C. RATIONALE, D. ROLES, E. PROCEDURES), Numbered paragraphs within sections, Cross-references between paragraphs (see paragraph N), Annexures for reference tables.',
    extraction_prompt: 'Extract the complete section/paragraph hierarchy of this SOP. For each paragraph identify: paragraph_id (number as written), section (letter and name), text (full paragraph text), cross_references (list of paragraph numbers referenced), contains_obligation (true if contains shall/must/is responsible). Output strictly as JSON with keys: document_id, title, edition, date, issuing_entity, reference_code, supersedes, sections (array of {letter, title, paragraphs: [{paragraph_id, text, cross_references, contains_obligation}]}), annexures.',
    output_format: '{"document_id":"string","title":"string","edition":"string","date":"string","issuing_entity":"string","sections":[{"letter":"string","title":"string","paragraphs":[{"paragraph_id":"string","text":"string","cross_references":[],"contains_obligation":false}]}],"annexures":[]}',
    validation_rules: '["sections array must not be empty","every paragraph must have paragraph_id","cross_references must be valid paragraph ids"]'
  },
  {
    id: 'sop-roles-v1',
    prompt_type: 'roles',
    version: '1.0.0',
    system_prompt: 'You are a UN institutional knowledge extraction specialist analyzing Roles and Responsibilities sections of UN SOPs. Extract every defined role and its obligations with precision.',
    extraction_prompt: 'From the provided SOP text, extract every defined role and its obligations. For each role identify: role_id (short identifier), role_name (exact name as written), organizational_unit (associated UN entity), obligations (list of duties starting with action verbs), permissions (things this role may do), prohibitions (things this role must NOT do), reports_to (supervisory relationship). Also extract a responsibility_matrix mapping process steps to roles (primary, supporting, accountable). Output strictly as JSON.',
    output_format: '{"roles":[{"role_id":"string","role_name":"string","organizational_unit":"string","obligations":[],"permissions":[],"prohibitions":[],"reports_to":null}],"responsibility_matrix":[{"process_step":"string","primary_role":"string","supporting_roles":[],"accountable_role":"string"}]}',
    validation_rules: '["at least one role must be extracted","obligations array must not be empty for any role","role_name must match text in document"]'
  },
  {
    id: 'sop-procedures-v1',
    prompt_type: 'procedures',
    version: '1.0.0',
    system_prompt: 'You are a UN institutional knowledge extraction specialist. Your task is to extract executable business logic from UN SOP procedure sections. UN SOP procedures use: Sequential numbered steps, Conditional logic (if X then Y), Action verbs indicating obligation level: SHALL (mandatory), MUST (mandatory), MAY (permitted), SHOULD (recommended), IS RESPONSIBLE FOR (accountability), SLA indicators (within N days/hours), Escalation triggers (following which, in the event that).',
    extraction_prompt: 'Extract every business rule, decision point, and SLA obligation from this SOP. For each procedure step identify: step_id, action, actor, obligation_level (SHALL/MUST/MAY/SHOULD), conditions, outcomes with branching logic, sla if time-bound. Also extract decision_trees (trigger + branches), sla_obligations (paragraph_id, actor, action, timeframe, unit), and escalation_rules (trigger, target, response_sla). Output strictly as JSON.',
    output_format: '{"procedures":[{"procedure_id":"string","title":"string","steps":[{"step_id":"string","action":"string","actor":"string","obligation_level":"string","conditions":[],"outcomes":[],"sla":null}]}],"decision_trees":[],"sla_obligations":[],"escalation_rules":[]}',
    validation_rules: '["every step must have an actor","obligation_level must be one of SHALL/MUST/MAY/SHOULD","sla_obligations must have timeframe and unit"]'
  },
  {
    id: 'sop-gxe-generation-v1',
    prompt_type: 'gxe_generation',
    version: '1.0.0',
    system_prompt: 'You are a GXE graph architect for the UN ProjectAdvisor system. Your task is to convert extracted SOP business logic into executable GXE graph node/edge specifications. GXE graph rules (mandatory): Every graph MUST start with workflow.start and end with workflow.end. Linear DAG only — no merge nodes. Each decision point becomes a condition executor node. Each human action becomes a WAIT_FOR_INPUT node. Each automated action becomes an executor node. parameterSchema must NOT contain required fields. tref-* nodes are for visualization only.',
    extraction_prompt: 'Given extracted SOP procedure steps (JSON), generate a GXE graph specification. Create nodes for each step: workflow.start, workflow.end, workflow.condition (for decisions), workflow.wait_input (for human actions), executor nodes (for automated actions). Create edges connecting nodes in execution order. Include metadata linking back to source paragraphs. Output strictly as JSON with keys: graph_id, namespace, category, name, description, nodes (array), edges (array), metadata.',
    output_format: '{"graph_id":"string","namespace":"CORE","category":"process","name":"string","nodes":[{"id":"string","type":"executor","executor_id":"string","label":"string","config":{},"parameterSchema":{}}],"edges":[{"from":"string","to":"string","label":null}],"metadata":{"source_document":"string","source_paragraphs":[]}}',
    validation_rules: '["must have exactly one workflow.start","must have at least one workflow.end","all condition nodes must have true and false branches","edges must form valid DAG"]'
  }
];

// ============================================================
// SEED FUNCTION
// ============================================================

async function seed() {
  console.log('Seeding Document Type Registry...\n');

  // 1. Create DocumentTypeRegistry
  await mg().runQuery(`
    MERGE (r:DocumentTypeRegistry {id: 'core.doc-type-registry'})
    ON CREATE SET r.namespace = 'CORE', r.name = 'Document Type Registry', r.created_at = $now
    RETURN r
  `, { now: new Date().toISOString() });
  console.log('  OK DocumentTypeRegistry');

  // 2. Create DocumentTypes + ClassifierRules
  for (const dt of DOCUMENT_TYPES) {
    await mg().runQuery(`
      MATCH (r:DocumentTypeRegistry {id: 'core.doc-type-registry'})
      MERGE (dt:DocumentType {id: $id})
      ON CREATE SET dt.name = $name, dt.namespace = 'CORE', dt.description = $desc,
        dt.structural_markers = $markers, dt.required_sections = $sections,
        dt.entity_types = $entities, dt.keywords = $keywords,
        dt.version = '1.0.0', dt.created_at = $now
      MERGE (r)-[:HAS_TYPE]->(dt)
      RETURN dt
    `, {
      id: dt.id, name: dt.name, desc: dt.description,
      markers: JSON.stringify(dt.structural_markers), sections: JSON.stringify(dt.required_sections),
      entities: JSON.stringify(dt.entity_types), keywords: JSON.stringify(dt.keywords),
      now: new Date().toISOString()
    });
    console.log(`  OK DocumentType: ${dt.id} (${dt.name})`);

    // ClassifierRule
    const cr = CLASSIFIER_RULES[dt.id];
    if (cr) {
      await mg().runQuery(`
        MATCH (dt:DocumentType {id: $dtId})
        MERGE (cr:ClassifierRule {id: $crId})
        ON CREATE SET cr.document_type_id = $dtId, cr.version = '1.0.0',
          cr.rules = $rules, cr.threshold = $threshold, cr.is_active = true,
          cr.created_at = $now
        MERGE (dt)-[:HAS_CLASSIFIER]->(cr)
      `, {
        dtId: dt.id, crId: `${dt.id}-classifier-v1`,
        rules: JSON.stringify(cr.rules), threshold: cr.threshold,
        now: new Date().toISOString()
      });
      console.log(`  OK ClassifierRule: ${dt.id}-classifier-v1`);
    }
  }

  // 3. Create SOP ExtractionPrompts
  console.log('\nSeeding SOP Extraction Prompts...\n');
  for (const p of SOP_PROMPTS) {
    await mg().runQuery(`
      MATCH (dt:DocumentType {id: 'sop'})
      MERGE (p:ExtractionPrompt {id: $id})
      ON CREATE SET p.document_type_id = 'sop', p.prompt_type = $pt,
        p.version = $ver, p.is_active = true, p.language = 'en',
        p.system_prompt = $sys, p.extraction_prompt = $ext,
        p.output_format = $fmt, p.validation_rules = $val,
        p.change_log = 'Initial version', p.created_at = $now, p.created_by = 'seed-script'
      MERGE (dt)-[:HAS_PROMPT]->(p)
    `, {
      id: p.id, pt: p.prompt_type, ver: p.version,
      sys: p.system_prompt, ext: p.extraction_prompt,
      fmt: p.output_format, val: p.validation_rules,
      now: new Date().toISOString()
    });
    console.log(`  OK ExtractionPrompt: ${p.id} (${p.prompt_type})`);
  }

  // 4. Codex rule DOC-001
  console.log('\nSeeding Codex rule DOC-001...\n');
  const docRuleId = uuidv4();
  await mg().runQuery(`
    MERGE (r:CodexRule {codexId: 'CODEX-RULE-DOC-001'})
    ON CREATE SET r.id = $id, r.namespace = 'CODEX', r.nodeType = 'CodexRule',
      r.title = 'Document Classification Before BackLog Task Creation',
      r.summary = 'AI agents MUST classify document type using classify_document tool BEFORE creating backlog tasks for document processing. If confidence >= 0.85 proceed automatically. If 0.6-0.84 confirm with user. If < 0.6 ask user to specify type. BackLog task must include document_type_id and prompt_ids in metadata.',
      r.modality = 'MUST',
      r.scope = $scope,
      r.tier = 'M2', r.status = 'ACTIVE',
      r.rationale = 'Different document types require specialized extraction prompts. Using wrong prompt produces poor extraction results. Classification ensures correct prompt selection.',
      r.examples = $examples,
      r.antiPatterns = $anti,
      r.createdAt = $now, r.updatedAt = $now
    RETURN r.codexId
  `, {
    id: docRuleId, now: new Date().toISOString(),
    scope: JSON.stringify(['backlog', 'agents', 'document-processing', 'bootstrap']),
    examples: JSON.stringify(['classify_document(text) → sop (0.92) → get_extraction_prompt("sop","structure") → create backlog task with prompt_ids']),
    anti: JSON.stringify(['Creating document processing task without classification', 'Using generic prompt for SOP document'])
  });
  console.log('  OK CODEX-RULE-DOC-001');

  // Verify
  console.log('\n=== Verification ===');
  const types = await mg().runQuery('MATCH (r:DocumentTypeRegistry)-[:HAS_TYPE]->(dt:DocumentType) RETURN dt.id as id, dt.name as name');
  console.log(`Document Types: ${types.length}`);
  types.forEach(t => console.log(`  - ${t.id}: ${t.name}`));

  const prompts = await mg().runQuery('MATCH (dt:DocumentType {id:"sop"})-[:HAS_PROMPT]->(p:ExtractionPrompt) RETURN p.id as id, p.prompt_type as pt');
  console.log(`SOP Prompts: ${prompts.length}`);
  prompts.forEach(p => console.log(`  - ${p.id} (${p.pt})`));

  console.log('\nDone.');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
