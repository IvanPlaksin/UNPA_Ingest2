/**
 * @fileoverview LLM prompts for entity and relationship extraction
 * @module services/extraction/prompts/entity-extraction
 * @version 1.0.0
 *
 * Specialized prompts for UN ProjectAdvisor knowledge extraction.
 * Optimized for Ollama (llama3, mistral) and Gemini models.
 */

'use strict';

// Import ontology snippets for context-aware prompts
const {
    getRelevantSnippets,
    getRelevantRelationSnippets,
    formatSnippetsForPrompt,
    formatRelationSnippetsForPrompt
} = require('./ontology-snippets');

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for entity extraction
 * @constant {string}
 */
const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an expert entity extractor specialized in UN software systems and enterprise documentation.

Your task is to identify and extract named entities from text related to UN legacy systems, Azure DevOps work items, and technical documentation.

## Entity Types to Extract

### People & Organizations
- **PERSON**: Individual names (e.g., "John Smith", "Maria Garcia")
- **TEAM**: Teams, groups, units (e.g., "Finance Team", "OICT Support")
- **ORGANIZATION**: UN bodies, departments (e.g., "OICT", "DGACM", "UNDP", "UNICEF")

### Technical Entities
- **SYSTEM**: Software systems, applications (e.g., "IMIS", "Umoja", "Inspira", "SAP")
- **MODULE**: System modules, components (e.g., "Budget Module", "Leave Management", "PayrollService")
- **API**: APIs, endpoints, services (e.g., "REST API", "/api/v1/users", "GraphQL endpoint")
- **DATABASE**: Databases, data stores (e.g., "Oracle DB", "SQL Server", "MongoDB")
- **TABLE**: Database tables, collections (e.g., "Users table", "WorkItems collection")

### Business Concepts
- **PROCESS**: Business processes, workflows (e.g., "Travel Request", "Leave Approval", "Procurement")
- **BUSINESS_RULE**: Business rules, policies (e.g., "90-day approval rule", "budget threshold")
- **CONCEPT**: Domain concepts, terms (e.g., "entitlement", "allowance", "cost recovery")

### Artifacts
- **TECHNOLOGY**: Technologies, frameworks (e.g., "React", "Node.js", ".NET", "TypeScript")
- **DOCUMENT**: Documents, regulations (e.g., "ST/AI/2023/1", "Staff Rules", "IPSAS")
- **PROJECT**: Projects, initiatives (e.g., "Umoja Extension 2", "IMIS Replacement")

### References
- **WORK_ITEM_REF**: Work item references (e.g., "#12345", "WI-67890", "PBI-111")
- **FILE_PATH**: File paths (e.g., "$/Project/src/auth.ts", "/api/services/user.service.js")
- **VERSION**: Version numbers (e.g., "v2.1.0", "Release 2024.1")

## Output Format
Return ONLY valid JSON matching this exact schema:
{
  "entities": [
    {
      "name": "exact text as found",
      "type": "ENTITY_TYPE",
      "normalizedForm": "standardized_lowercase_form",
      "confidence": 0.95,
      "context": "...surrounding text snippet..."
    }
  ]
}

## Guidelines
1. Extract only EXPLICIT mentions, not implied entities
2. Normalize names consistently (e.g., "IMIS" not "imis" or "I.M.I.S.")
3. Confidence: 0.95+ for exact matches, 0.80-0.94 for likely matches, 0.60-0.79 for uncertain
4. Include 5-10 words of context around each entity
5. Do NOT extract common words, pronouns, or generic terms
6. Prioritize UN-specific entities (IMIS, Umoja, OICT, etc.)`;

/**
 * User prompt template for entity extraction
 * @constant {string}
 */
const ENTITY_EXTRACTION_USER_PROMPT = `Extract all named entities from the following text.

<text>
{content}
</text>

<source_context>
Source Type: {sourceType}
File Path: {filePath}
Language: {language}
</source_context>

Return JSON with extracted entities. Include confidence scores and context snippets.`;

/**
 * Prompt for code-specific entity extraction
 * @constant {string}
 */
const CODE_ENTITY_EXTRACTION_PROMPT = `You are analyzing source code to extract software entities.

## Code Entity Types
- **CLASS**: Class definitions
- **INTERFACE**: Interface definitions
- **FUNCTION**: Function/method definitions
- **MODULE**: Module/namespace definitions
- **CONSTANT**: Important constants, enums
- **API_ENDPOINT**: API route definitions
- **DATABASE_QUERY**: SQL queries, database operations
- **DEPENDENCY**: Import/require statements (external libraries)

## Relationships to Identify
- CALLS: function A calls function B
- IMPORTS: file imports module
- EXTENDS: class extends parent
- IMPLEMENTS: class implements interface
- USES: code uses library/service

Analyze this code:
<code language="{language}" file="{filePath}">
{content}
</code>

Return JSON:
{
  "entities": [...],
  "relationships": [
    {
      "source": "entity name",
      "target": "entity name",
      "type": "RELATIONSHIP_TYPE",
      "confidence": 0.9
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP EXTRACTION PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System prompt for relationship extraction
 * @constant {string}
 */
const RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT = `You are an expert at identifying relationships between entities in UN software documentation.

## Relationship Types

### Structural
- **PART_OF**: Component belongs to system (Module PART_OF System)
- **CONTAINS**: Container has element (Document CONTAINS Section)
- **BELONGS_TO**: Membership (Person BELONGS_TO Team)

### Technical Dependencies
- **DEPENDS_ON**: Technical dependency (ModuleA DEPENDS_ON ModuleB)
- **CALLS**: Function invocation (FunctionA CALLS FunctionB)
- **IMPORTS**: Import relationship (File IMPORTS Module)
- **USES**: Usage relationship (Service USES Database)
- **IMPLEMENTS**: Implementation (Class IMPLEMENTS Interface)
- **EXTENDS**: Inheritance (ChildClass EXTENDS ParentClass)

### Business Relationships
- **IMPLEMENTS_REQUIREMENT**: Code implements business requirement
- **ENFORCES**: Code enforces business rule
- **AUTOMATES**: System automates process

### Documentation
- **DESCRIBES**: Document describes entity
- **REFERENCES**: Entity references another entity
- **DOCUMENTED_IN**: Entity documented in source

### People
- **AUTHORED_BY**: Created by person
- **ASSIGNED_TO**: Assigned to person/team
- **OWNED_BY**: Owned by team/org
- **APPROVED_BY**: Approved by person

### Work Tracking
- **RESOLVES**: Commit resolves work item
- **RELATES_TO**: General relation between work items
- **BLOCKS**: Work item blocks another
- **PARENT_OF**: Hierarchy (Epic PARENT_OF Feature)

## Output Format
{
  "relationships": [
    {
      "source": "source entity name",
      "sourceType": "ENTITY_TYPE",
      "target": "target entity name",
      "targetType": "ENTITY_TYPE",
      "type": "RELATIONSHIP_TYPE",
      "confidence": 0.85,
      "evidence": "text that supports this relationship",
      "bidirectional": false
    }
  ]
}

## Guidelines
1. Only extract relationships with clear textual evidence
2. Confidence: 0.90+ for explicit statements, 0.70-0.89 for strong implications, 0.50-0.69 for weak implications
3. Include the evidence text snippet
4. Mark bidirectional=true only for symmetric relationships (RELATES_TO, SIMILAR_TO)`;

/**
 * User prompt template for relationship extraction
 * @constant {string}
 */
const RELATIONSHIP_EXTRACTION_USER_PROMPT = `Given these entities extracted from a document, identify relationships between them.

<entities>
{entitiesJson}
</entities>

<text>
{content}
</text>

Identify all relationships between the listed entities. Include evidence from the text.`;

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIALIZED PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prompt for Work Item analysis
 * @constant {string}
 */
const WORK_ITEM_ANALYSIS_PROMPT = `Analyze this Azure DevOps Work Item to extract business knowledge.

<work_item>
ID: {id}
Type: {type}
Title: {title}
State: {state}
Description:
{description}

Acceptance Criteria:
{acceptanceCriteria}
</work_item>

Extract:
1. **Business Rules**: Any rules, constraints, or conditions mentioned
2. **Processes**: Business processes or workflows referenced
3. **Systems**: Software systems or modules involved
4. **People/Teams**: Stakeholders, assignees, reviewers
5. **Dependencies**: Technical or business dependencies

Return JSON:
{
  "entities": [...],
  "businessRules": [
    {
      "rule": "description of rule",
      "condition": "when/if condition",
      "action": "then action",
      "confidence": 0.85
    }
  ],
  "processes": [
    {
      "name": "process name",
      "steps": ["step1", "step2"],
      "systems": ["involved systems"]
    }
  ]
}`;

/**
 * Prompt for document summary with entity focus
 * @constant {string}
 */
const DOCUMENT_SUMMARY_PROMPT = `Summarize this document focusing on UN systems and business processes.

<document>
Title: {title}
Type: {documentType}
Content:
{content}
</document>

Provide:
1. **Summary**: 2-3 sentence overview
2. **Key Entities**: Main systems, processes, people mentioned
3. **Business Context**: What business problem/process does this address?
4. **Technical Context**: What technical components are involved?

Return JSON:
{
  "summary": "...",
  "keyEntities": [...],
  "businessContext": "...",
  "technicalContext": "...",
  "keywords": ["keyword1", "keyword2"]
}`;

/**
 * Prompt for business rule extraction
 * @constant {string}
 */
const BUSINESS_RULE_EXTRACTION_PROMPT = `Extract business rules from this content.

A business rule is a constraint, condition, or policy that governs business behavior.

<content>
{content}
</content>

For each rule, identify:
- **Condition**: When does this rule apply? (IF/WHEN clause)
- **Action**: What should happen? (THEN clause)
- **Exception**: Any exceptions? (UNLESS clause)
- **Source**: Where is this rule defined? (regulation, policy, code)

Return JSON:
{
  "businessRules": [
    {
      "id": "BR-001",
      "name": "short name",
      "description": "full description",
      "condition": "when X",
      "action": "then Y",
      "exception": "unless Z",
      "source": "ST/AI/2023/1",
      "confidence": 0.85,
      "category": "VALIDATION|CALCULATION|AUTHORIZATION|WORKFLOW"
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build entity extraction prompt with context
 * Uses ontology snippets for improved extraction accuracy
 * @param {string} content - Content to analyze
 * @param {Object} context - Additional context
 * @returns {Object} Messages array for LLM
 */
function buildEntityExtractionPrompt(content, context = {}) {
  const {
    sourceType = 'unknown',
    filePath = '',
    language = 'en',
    isCode = false,
    useOntologyHints = true,
  } = context;

  // Get relevant entity snippets based on content analysis
  let ontologyContext = '';
  if (useOntologyHints && content) {
    const relevantSnippets = getRelevantSnippets(content, {
      maxSnippets: 5,
      context: isCode ? 'code' : (sourceType === 'workitem' ? 'workitem' : 'text')
    });

    if (relevantSnippets.length > 0) {
      ontologyContext = '\n\n## Focus on These Entity Types\n' +
        formatSnippetsForPrompt(relevantSnippets, {
          includeExamples: true,
          includeHints: true
        });
    }
  }

  // Build enhanced system prompt with ontology context
  const enhancedSystemPrompt = ENTITY_EXTRACTION_SYSTEM_PROMPT + ontologyContext;

  const userPrompt = ENTITY_EXTRACTION_USER_PROMPT
    .replace('{content}', truncateContent(content, 4000))
    .replace('{sourceType}', sourceType)
    .replace('{filePath}', filePath)
    .replace('{language}', language);

  return [
    { role: 'system', content: enhancedSystemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Build code entity extraction prompt
 * @param {string} code - Source code
 * @param {string} language - Programming language
 * @param {string} filePath - File path
 * @returns {Object} Messages array for LLM
 */
function buildCodeEntityPrompt(code, language, filePath) {
  const prompt = CODE_ENTITY_EXTRACTION_PROMPT
    .replace('{content}', truncateContent(code, 3000))
    .replace('{language}', language)
    .replace('{filePath}', filePath);

  return [
    { role: 'system', content: 'You are a code analysis expert. Extract entities and relationships from source code. Return only valid JSON.' },
    { role: 'user', content: prompt },
  ];
}

/**
 * Build relationship extraction prompt
 * Uses ontology snippets for context-aware relationship detection
 * @param {string} content - Original content
 * @param {Array} entities - Extracted entities
 * @param {Object} options - Options
 * @returns {Object} Messages array for LLM
 */
function buildRelationshipPrompt(content, entities, options = {}) {
  const { useOntologyHints = true } = options;

  const entitiesJson = JSON.stringify(
    entities.map(e => ({ name: e.name, type: e.type })),
    null,
    2
  );

  // Get entity types present and find relevant relation types
  let ontologyContext = '';
  if (useOntologyHints && entities.length >= 2) {
    const entityTypes = [...new Set(entities.map(e => e.type).filter(Boolean))];
    const relevantRelations = getRelevantRelationSnippets(entityTypes, {
      maxSnippets: 4
    });

    if (relevantRelations.length > 0) {
      ontologyContext = '\n\n## Focus on These Relationship Types\n' +
        formatRelationSnippetsForPrompt(relevantRelations, {
          includeExamples: true
        });
    }
  }

  // Build enhanced system prompt with ontology context
  const enhancedSystemPrompt = RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT + ontologyContext;

  const userPrompt = RELATIONSHIP_EXTRACTION_USER_PROMPT
    .replace('{entitiesJson}', entitiesJson)
    .replace('{content}', truncateContent(content, 3000));

  return [
    { role: 'system', content: enhancedSystemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Build Work Item analysis prompt
 * @param {Object} workItem - Work Item data
 * @returns {Object} Messages array for LLM
 */
function buildWorkItemPrompt(workItem) {
  const prompt = WORK_ITEM_ANALYSIS_PROMPT
    .replace('{id}', workItem.id || '')
    .replace('{type}', workItem.type || 'Unknown')
    .replace('{title}', workItem.title || '')
    .replace('{state}', workItem.state || '')
    .replace('{description}', truncateContent(workItem.description || '', 2000))
    .replace('{acceptanceCriteria}', truncateContent(workItem.acceptanceCriteria || '', 1000));

  return [
    { role: 'system', content: 'You are an Azure DevOps analyst specializing in UN systems. Extract structured knowledge from work items. Return only valid JSON.' },
    { role: 'user', content: prompt },
  ];
}

/**
 * Build business rule extraction prompt
 * @param {string} content - Content to analyze
 * @returns {Object} Messages array for LLM
 */
function buildBusinessRulePrompt(content) {
  const prompt = BUSINESS_RULE_EXTRACTION_PROMPT
    .replace('{content}', truncateContent(content, 4000));

  return [
    { role: 'system', content: 'You are a business analyst expert in UN regulations and policies. Extract formal business rules. Return only valid JSON.' },
    { role: 'user', content: prompt },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Truncate content to fit token limits
 * @param {string} content - Content to truncate
 * @param {number} maxChars - Maximum characters
 * @returns {string} Truncated content
 */
function truncateContent(content, maxChars = 4000) {
  if (!content || content.length <= maxChars) {
    return content || '';
  }

  // Try to break at sentence boundary
  const truncated = content.substring(0, maxChars);
  const lastSentence = truncated.lastIndexOf('. ');

  if (lastSentence > maxChars * 0.8) {
    return truncated.substring(0, lastSentence + 1) + '\n[...truncated]';
  }

  return truncated + '\n[...truncated]';
}

/**
 * Validate JSON response from LLM
 * @param {string} response - LLM response
 * @param {string} expectedKey - Expected top-level key
 * @returns {Object|null} Parsed object or null
 */
function parseJSONResponse(response, expectedKey = null) {
  if (!response) return null;

  let jsonStr = response.trim();

  // Remove markdown code blocks
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.replace(/```\n?/g, '');
  }

  // Try to find JSON object/array
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (expectedKey && !parsed[expectedKey]) {
      console.warn(`Expected key "${expectedKey}" not found in response`);
      return { [expectedKey]: [] };
    }

    return parsed;
  } catch (error) {
    console.error('JSON parse error:', error.message);
    console.debug('Raw response:', response.substring(0, 500));
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export ontology functions for convenience
const ontologySnippets = require('./ontology-snippets');

module.exports = {
  // System prompts
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT,

  // User prompt templates
  ENTITY_EXTRACTION_USER_PROMPT,
  RELATIONSHIP_EXTRACTION_USER_PROMPT,
  CODE_ENTITY_EXTRACTION_PROMPT,
  WORK_ITEM_ANALYSIS_PROMPT,
  DOCUMENT_SUMMARY_PROMPT,
  BUSINESS_RULE_EXTRACTION_PROMPT,

  // Prompt builders
  buildEntityExtractionPrompt,
  buildCodeEntityPrompt,
  buildRelationshipPrompt,
  buildWorkItemPrompt,
  buildBusinessRulePrompt,

  // Utilities
  truncateContent,
  parseJSONResponse,

  // Ontology snippets (re-exported)
  ...ontologySnippets
};
