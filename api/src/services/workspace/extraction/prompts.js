/**
 * Extraction Prompt Templates
 *
 * Prompts for LLM-based knowledge extraction.
 * Uses chain-of-thought and structured output.
 *
 * Principles (from research):
 * 1. Separate entity and relation extraction (iText2KG)
 * 2. Chain-of-thought before structured output
 * 3. Include document type context for better extraction
 */

'use strict';

const ENTITY_EXTRACTION_PROMPT = `You are a knowledge extraction expert. Extract all business entities from the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
</document_context>

<document>
{text}
</document>

<instructions>
1. Identify all nouns and noun phrases that represent real-world business objects, actors, systems, or concepts.
2. For each entity determine:
   - A clear canonical name
   - The type (BUSINESS_OBJECT, ACTOR, SYSTEM, DOCUMENT, LOCATION, EVENT, CONCEPT)
   - A brief description
   - Key attributes mentioned in the text
   - Any aliases or alternative names
   - The business domain
3. Focus on entities that are central to the business process, referenced multiple times, have relationships with others, or have specific attributes.
4. DO NOT extract generic words, pronouns, or temporary/hypothetical entities.
</instructions>

Think step by step, then provide your extraction as a JSON array of entities matching this schema:
[{ "name": "", "type": "", "description": "", "attributes": [{"name":"","dataType":"","required":false,"description":""}], "aliases": [], "domain": "" }]`;

const RELATION_EXTRACTION_PROMPT = `You are a knowledge extraction expert. Extract relationships between the following entities based on the document.

<document_context>
Document Type: {documentType}
Domain: {domain}
</document_context>

<entities>
{entitiesJson}
</entities>

<document>
{text}
</document>

<instructions>
1. For each pair of entities, determine if a relationship exists between them.
2. Use these relationship types:
   - Structural: HAS, BELONGS_TO, CONTAINS, PART_OF
   - Action: CREATES, MODIFIES, DELETES, READS
   - Dependency: DEPENDS_ON, REFERENCES, IMPLEMENTS
   - Authority: MANAGES, OWNS, APPROVES, REVIEWS
   - Temporal: TRIGGERS, CAUSES, PRECEDES, FOLLOWS
   - Semantic: SIMILAR_TO, OPPOSITE_OF, RELATED_TO
3. Determine cardinality: ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY
4. Only extract relationships explicitly stated or strongly implied.
</instructions>

Think step by step, then provide as JSON array:
[{ "sourceEntity": "", "targetEntity": "", "relationshipType": "", "cardinality": "", "description": "", "bidirectional": false }]`;

const BUSINESS_RULE_EXTRACTION_PROMPT = `You are a business analyst expert. Extract all business rules from the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
Known Entities: {entitiesJson}
</document_context>

<document>
{text}
</document>

<instructions>
1. Look for: validation rules, calculation rules, authorization rules, constraint rules, trigger rules.
2. For each rule extract: name, condition (WHEN/IF), action (THEN), exceptions (UNLESS), enforcement (MUST→MANDATORY, SHOULD→RECOMMENDED, MAY→OPTIONAL), scope.
3. Key phrases: "must", "shall", "required", "cannot", "if...then", "only if", "maximum", "minimum", "before", "after", "within X days".
4. Express conditions in structured format: Entity.field operator value.
</instructions>

Think step by step, then provide as JSON array:
[{ "name": "", "description": "", "ruleType": "", "condition": {"expression":"","entities":[],"fields":[]}, "action": {"type":"","description":"","target":""}, "exceptions": [], "enforcement": "", "scope": {"domain":"","systems":[],"roles":[]}, "priority": 1 }]`;

const WORKFLOW_EXTRACTION_PROMPT = `You are a process analyst expert. Extract workflows and processes from the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
Known Entities: {entitiesJson}
</document_context>

<document>
{text}
</document>

<instructions>
1. Identify process descriptions with multiple steps, state changes, multiple actors, decision points, or sequential/parallel activities.
2. For each workflow extract: name, trigger event, states, transitions, actors, SLA.
3. Key phrases: "process", "procedure", "workflow", "first...then...finally", "submitted for approval", "escalate to", "pending", "completed".
4. Mark states as: INITIAL, INTERMEDIATE, FINAL, ERROR.
</instructions>

Think step by step, then provide as JSON array:
[{ "name": "", "description": "", "triggerEvent": "", "states": [{"name":"","type":"","description":""}], "transitions": [{"from":"","to":"","trigger":"","guard":"","action":"","actor":""}], "actors": [], "sla": {"maxDuration":"","escalationAfter":""} }]`;

const CALCULATION_EXTRACTION_PROMPT = `You are a business analyst expert. Extract calculations and formulas from the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
Known Entities: {entitiesJson}
</document_context>

<document>
{text}
</document>

<instructions>
1. Look for: mathematical formulas, computed fields, aggregations, percentage calculations, date/time calculations.
2. For each extraction: name, formula expression, input variables with meaning, result variable with unit.
3. Use standard notation: +, -, *, /, ^, %. Functions: SUM(), AVG(), MAX(), MIN(), COUNT(), IF().
4. Key phrases: "calculated as", "equals", "sum of", "total", "percentage", "based on".
</instructions>

Think step by step, then provide as JSON array:
[{ "name": "", "description": "", "formula": "", "variables": [{"name":"","description":"","unit":"","dataType":"","source":""}], "result": {"name":"","unit":"","dataType":""}, "domain": "" }]`;

const CONCEPT_EXTRACTION_PROMPT = `You are a domain knowledge expert. Extract domain-specific concepts and terminology from the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
</document_context>

<document>
{text}
</document>

<instructions>
1. Identify domain-specific terms, acronyms, and concepts.
2. For each concept: term, clear definition, aliases/synonyms, parent concept, related concepts, examples.
3. Focus on terms that are: defined in the document, used repeatedly, domain-specific, or may be unfamiliar to outsiders.
</instructions>

Think step by step, then provide as JSON array:
[{ "term": "", "definition": "", "aliases": [], "domain": "", "parentConcept": "", "relatedConcepts": [], "examples": [] }]`;

const ANOMALY_DETECTION_PROMPT = `You are a quality analyst expert. Identify anomalies, inconsistencies, and issues in the following document.

<document_context>
Document Type: {documentType}
Domain: {domain}
Known Entities: {entitiesJson}
</document_context>

<document>
{text}
</document>

<instructions>
1. Look for: INCONSISTENCY (contradictions), MISSING_DATA (undefined references), CONTRADICTION (conflicting rules), AMBIGUITY (unclear), OUTDATED (deprecated references), UNDEFINED_TERM (domain terms without definition), ORPHAN_REFERENCE (non-existent items).
2. For each anomaly: title, type, description, severity (LOW/MEDIUM/HIGH/CRITICAL), location, affected entities, suggested resolution.
3. Be careful not to flag intentional variations, context-dependent statements, or out-of-scope items.
</instructions>

Think step by step, then provide as JSON array:
[{ "title": "", "anomalyType": "", "description": "", "severity": "", "location": "", "affectedEntities": [], "suggestedResolution": "" }]`;

// Registry
const EXTRACTION_PROMPTS = {
  entity: ENTITY_EXTRACTION_PROMPT,
  relationship: RELATION_EXTRACTION_PROMPT,
  business_rule: BUSINESS_RULE_EXTRACTION_PROMPT,
  workflow: WORKFLOW_EXTRACTION_PROMPT,
  calculation: CALCULATION_EXTRACTION_PROMPT,
  concept: CONCEPT_EXTRACTION_PROMPT,
  anomaly: ANOMALY_DETECTION_PROMPT
};

function getPrompt(type) {
  return EXTRACTION_PROMPTS[type] || null;
}

function fillPrompt(template, values) {
  let filled = template;
  for (const [key, value] of Object.entries(values)) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || '');
    filled = filled.split(`{${key}}`).join(stringValue);
  }
  return filled;
}

function getPromptTypes() {
  return Object.keys(EXTRACTION_PROMPTS);
}

module.exports = {
  ENTITY_EXTRACTION_PROMPT, RELATION_EXTRACTION_PROMPT,
  BUSINESS_RULE_EXTRACTION_PROMPT, WORKFLOW_EXTRACTION_PROMPT,
  CALCULATION_EXTRACTION_PROMPT, CONCEPT_EXTRACTION_PROMPT,
  ANOMALY_DETECTION_PROMPT,
  EXTRACTION_PROMPTS, getPrompt, fillPrompt, getPromptTypes
};
