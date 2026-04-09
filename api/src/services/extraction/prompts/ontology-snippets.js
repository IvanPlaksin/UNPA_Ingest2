/**
 * Ontology Snippets for Entity Extraction
 *
 * Provides structured entity and relationship type definitions
 * for ontology-guided LLM prompts. Based on EMNLP 2024 EDC pattern.
 *
 * @module services/extraction/prompts/ontology-snippets
 * @version 1.0.0
 */

'use strict';

const {
    ENTITY_CATEGORIES,
    RELATIONSHIP_TYPES
} = require('../../../config/un-entities.config');

const {
    NODE_TYPES,
    getNodeType,
    getLayerForNodeType
} = require('../../graph/ontology.schema');

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY SNIPPETS - Detailed type definitions for LLM guidance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity type snippets with examples, properties, and extraction hints
 * @constant {Object}
 */
const ENTITY_SNIPPETS = {
    // ─────────────────────────────────────────────────────────────────────────
    // STRATEGIC LAYER ENTITIES
    // ─────────────────────────────────────────────────────────────────────────

    Epic: {
        layer: 'Strategic',
        description: 'Large body of work that spans multiple features and sprints. Represents major initiatives or projects.',
        properties: ['name', 'description', 'status', 'priority', 'businessValue'],
        examples: [
            'Umoja Extension 2 Implementation',
            'IMIS Decommissioning Program',
            'Travel Management Modernization'
        ],
        extractionHints: [
            'Look for high-level project names',
            'Often mentioned with "initiative", "program", "project"',
            'Usually spans multiple teams or departments'
        ],
        keywords: ['initiative', 'program', 'epic', 'major project', 'strategic goal']
    },

    Feature: {
        layer: 'Strategic',
        description: 'Product feature or capability that delivers value to users. Child of Epic.',
        properties: ['name', 'description', 'status', 'priority', 'effort'],
        examples: [
            'SSO Integration for Unite ID',
            'Budget Approval Workflow',
            'Leave Balance Dashboard'
        ],
        extractionHints: [
            'Functional capabilities mentioned in requirements',
            'Often starts with "ability to" or "support for"',
            'Delivers specific user value'
        ],
        keywords: ['feature', 'capability', 'functionality', 'requirement', 'user story']
    },

    BusinessRule: {
        layer: 'Strategic',
        description: 'Business logic rule, constraint, or policy that governs behavior.',
        properties: ['name', 'rule', 'category', 'source', 'confidence'],
        examples: [
            '90-day advance travel booking requirement',
            'Budget approval threshold of $10,000',
            'Leave accrual calculation per ST/AI/2023/1'
        ],
        extractionHints: [
            'Look for IF-THEN-ELSE conditions',
            'Constraints with "must", "shall", "requires"',
            'References to ST/AI, ST/SGB documents'
        ],
        keywords: ['rule', 'policy', 'constraint', 'requirement', 'validation', 'threshold']
    },

    Concept: {
        layer: 'Strategic',
        description: 'Domain concept, term, or definition specific to UN operations.',
        properties: ['name', 'definition', 'domain', 'synonyms'],
        examples: [
            'Special Post Allowance (SPA)',
            'DSA (Daily Subsistence Allowance)',
            'IPSAS accrual accounting'
        ],
        extractionHints: [
            'Terms defined with parenthetical abbreviations',
            'Domain-specific vocabulary',
            'Concepts explained for stakeholders'
        ],
        keywords: ['concept', 'term', 'definition', 'allowance', 'entitlement', 'acronym']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // BUSINESS LAYER ENTITIES
    // ─────────────────────────────────────────────────────────────────────────

    WorkItem: {
        layer: 'Business',
        description: 'Azure DevOps Work Item representing a task, bug, user story, or other trackable work unit.',
        properties: ['adoId', 'title', 'type', 'state', 'areaPath', 'assignedTo'],
        examples: [
            'Work Item #12345',
            'Bug #67890: Login fails with SSO',
            'PBI-111: Implement leave calculator'
        ],
        extractionHints: [
            'References starting with # followed by numbers',
            'Patterns like WI-XXXXX, Bug #XXXXX, Task #XXXXX',
            'Azure DevOps URLs with workitems/edit/'
        ],
        keywords: ['work item', 'bug', 'task', 'story', 'PBI', 'feature']
    },

    Person: {
        layer: 'Business',
        description: 'Individual person, staff member, or user.',
        properties: ['name', 'email', 'displayName', 'role', 'department'],
        examples: [
            'John Smith (OICT)',
            'maria.garcia@un.org',
            'Dr. Ahmed Hassan, Director'
        ],
        extractionHints: [
            'Names with titles (Mr., Ms., Dr., Prof.)',
            'Email addresses ending in @un.org',
            'Names followed by department/role in parentheses'
        ],
        keywords: ['staff', 'user', 'assigned to', 'authored by', 'contact']
    },

    Team: {
        layer: 'Business',
        description: 'Team, group, or organizational unit that performs work.',
        properties: ['name', 'description', 'areaPath'],
        examples: [
            'OICT Web Services Team',
            'Finance Support Unit',
            'Travel Processing Team'
        ],
        extractionHints: [
            'Group names ending with "Team", "Unit", "Group"',
            'Names in Azure DevOps Area Paths',
            'Mentioned in assignment context'
        ],
        keywords: ['team', 'unit', 'group', 'section', 'branch']
    },

    Organization: {
        layer: 'Business',
        description: 'UN organization, department, agency, or external entity.',
        properties: ['name', 'abbreviation', 'type', 'parent'],
        examples: [
            'OICT (Office of Information and Communications Technology)',
            'DGACM',
            'UNDP Headquarters'
        ],
        extractionHints: [
            'UN department abbreviations (OICT, DOS, DPPA)',
            'UN agencies (UNDP, UNICEF, WFP)',
            'Full names with abbreviations'
        ],
        keywords: ['department', 'office', 'agency', 'organization', 'division']
    },

    Document: {
        layer: 'Business',
        description: 'Document, regulation, circular, or official artifact.',
        properties: ['title', 'type', 'path', 'mimeType', 'hash'],
        examples: [
            'ST/AI/2023/1 - Administrative Instruction on Leave',
            'ST/SGB/2019/2 - Flexible Working Arrangements',
            'OICT-SOP-001 - Incident Management'
        ],
        extractionHints: [
            'Document symbols: ST/AI/, ST/SGB/, ST/IC/',
            'A/RES/ for General Assembly resolutions',
            'Internal document codes with version numbers'
        ],
        keywords: ['document', 'instruction', 'bulletin', 'circular', 'policy', 'SOP']
    },

    Process: {
        layer: 'Business',
        description: 'Business process, workflow, or procedure.',
        properties: ['name', 'description', 'steps', 'owner'],
        examples: [
            'Travel Request Approval Process',
            'Leave Application Workflow',
            'Budget Certification Procedure'
        ],
        extractionHints: [
            'Names ending with "Process", "Workflow", "Procedure"',
            'Descriptions of step-by-step activities',
            'Mentions of approvals, submissions, reviews'
        ],
        keywords: ['process', 'workflow', 'procedure', 'approval', 'submission']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CODE LAYER ENTITIES
    // ─────────────────────────────────────────────────────────────────────────

    System: {
        layer: 'Code',
        description: 'Software system, application, or platform.',
        properties: ['name', 'description', 'category', 'version', 'vendor'],
        examples: [
            'Umoja (UN ERP)',
            'IMIS (Integrated Management Information System)',
            'Inspira (Talent Management)'
        ],
        extractionHints: [
            'Known UN systems: Umoja, IMIS, Inspira, Unite Travel',
            'External systems: SAP, Oracle, ServiceNow',
            'System names followed by description in parentheses'
        ],
        keywords: ['system', 'application', 'platform', 'ERP', 'software']
    },

    Module: {
        layer: 'Code',
        description: 'Code module, package, or component within a system.',
        properties: ['name', 'path', 'exports'],
        examples: [
            'PayrollService',
            'authentication module',
            '@nestjs/common'
        ],
        extractionHints: [
            'CamelCase class/module names',
            'Import/require statement targets',
            'Package names with @scope'
        ],
        keywords: ['module', 'service', 'component', 'package', 'library']
    },

    API: {
        layer: 'Code',
        description: 'API endpoint, service interface, or integration point.',
        properties: ['name', 'endpoint', 'method', 'version'],
        examples: [
            '/api/v1/users',
            'GraphQL endpoint',
            'REST API for travel requests'
        ],
        extractionHints: [
            'URL paths starting with /api/',
            'HTTP methods: GET, POST, PUT, DELETE',
            'Protocol mentions: REST, GraphQL, gRPC'
        ],
        keywords: ['API', 'endpoint', 'service', 'REST', 'GraphQL', 'integration']
    },

    Database: {
        layer: 'Code',
        description: 'Database instance, data store, or persistence layer.',
        properties: ['name', 'type', 'connectionString'],
        examples: [
            'Oracle Umoja DB',
            'Qdrant vector store',
            'Memgraph knowledge graph'
        ],
        extractionHints: [
            'Database technology names: Oracle, SQL Server, MongoDB',
            'Modern databases: Qdrant, Neo4j, Redis',
            'Connection string patterns'
        ],
        keywords: ['database', 'DB', 'data store', 'vector store', 'graph database']
    },

    Technology: {
        layer: 'Code',
        description: 'Technology, framework, library, or tool.',
        properties: ['name', 'version', 'category'],
        examples: [
            'React 18.2',
            'Node.js',
            'TypeScript'
        ],
        extractionHints: [
            'Framework names: React, Vue, Angular, Express',
            'Language names: TypeScript, JavaScript, Python',
            'Version patterns: v1.2.3, 2024.1'
        ],
        keywords: ['framework', 'library', 'technology', 'stack', 'tooling']
    },

    File: {
        layer: 'Code',
        description: 'Source code file or document file.',
        properties: ['path', 'name', 'extension', 'language', 'lineCount'],
        examples: [
            'src/services/auth.service.ts',
            '$/Project/Backend/API/Controllers/UserController.cs',
            'config/settings.json'
        ],
        extractionHints: [
            'File paths with extensions (.ts, .js, .cs, .py)',
            'TFS paths starting with $/',
            'Unix-style paths /src/...'
        ],
        keywords: ['file', 'source', 'script', 'configuration']
    },

    Commit: {
        layer: 'Code',
        description: 'Git commit or TFS changeset.',
        properties: ['hash', 'message', 'author', 'date', 'filesChanged'],
        examples: [
            'commit abc123f: Fix login bug',
            'Changeset 45678',
            'PR #123 merged'
        ],
        extractionHints: [
            'Git hash patterns: 7+ hex characters',
            'Commit messages after "commit" keyword',
            'Changeset numbers for TFS'
        ],
        keywords: ['commit', 'changeset', 'PR', 'merge', 'push']
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RELATION SNIPPETS - Relationship type definitions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Relationship type snippets with valid entity pairs and examples
 * @constant {Object}
 */
const RELATION_SNIPPETS = {
    // ─────────────────────────────────────────────────────────────────────────
    // STRUCTURAL RELATIONSHIPS
    // ─────────────────────────────────────────────────────────────────────────

    CONTAINS: {
        category: 'Structural',
        description: 'Parent entity contains child entity. Hierarchical containment.',
        validPairs: [
            { source: 'System', target: 'Module' },
            { source: 'Module', target: 'Function' },
            { source: 'Document', target: 'BusinessRule' },
            { source: 'Epic', target: 'Feature' },
            { source: 'Organization', target: 'Team' }
        ],
        examples: [
            'Umoja CONTAINS Budget Module',
            'Travel Document CONTAINS expense policy',
            'OICT CONTAINS Web Services Team'
        ],
        extractionPatterns: [
            'X contains Y',
            'X includes Y',
            'Y is part of X',
            'Y within X'
        ]
    },

    DEPENDS_ON: {
        category: 'Dependencies',
        description: 'Source entity requires or depends on target entity.',
        validPairs: [
            { source: 'Module', target: 'Module' },
            { source: 'System', target: 'System' },
            { source: 'API', target: 'Database' },
            { source: 'Feature', target: 'Feature' },
            { source: 'WorkItem', target: 'WorkItem' }
        ],
        examples: [
            'Leave Module DEPENDS_ON HR Master Data',
            'Travel API DEPENDS_ON Umoja Integration',
            'Task #123 DEPENDS_ON Task #122'
        ],
        extractionPatterns: [
            'X depends on Y',
            'X requires Y',
            'X needs Y',
            'X is blocked by Y',
            'X cannot work without Y'
        ]
    },

    IMPLEMENTS: {
        category: 'Tracking',
        description: 'Code or system implements a requirement, rule, or interface.',
        validPairs: [
            { source: 'Module', target: 'BusinessRule' },
            { source: 'System', target: 'Feature' },
            { source: 'API', target: 'Process' },
            { source: 'Commit', target: 'WorkItem' }
        ],
        examples: [
            'LeaveCalculator IMPLEMENTS 90-day rule',
            'TravelService IMPLEMENTS approval workflow',
            'Commit abc123 IMPLEMENTS Bug #456'
        ],
        extractionPatterns: [
            'X implements Y',
            'X enforces Y',
            'X realizes Y',
            'X addresses Y'
        ]
    },

    USES: {
        category: 'Dependencies',
        description: 'Source entity uses or consumes target entity.',
        validPairs: [
            { source: 'System', target: 'Technology' },
            { source: 'Module', target: 'API' },
            { source: 'API', target: 'Database' },
            { source: 'Process', target: 'System' }
        ],
        examples: [
            'Umoja USES SAP HANA',
            'AuthService USES OAuth2 API',
            'Travel Process USES Unite Travel system'
        ],
        extractionPatterns: [
            'X uses Y',
            'X utilizes Y',
            'X leverages Y',
            'X is built with Y',
            'X runs on Y'
        ]
    },

    REFERENCES: {
        category: 'Semantic',
        description: 'Source entity references or mentions target entity.',
        validPairs: [
            { source: 'Document', target: 'Document' },
            { source: 'WorkItem', target: 'WorkItem' },
            { source: 'Document', target: 'System' },
            { source: 'BusinessRule', target: 'Concept' }
        ],
        examples: [
            'ST/AI/2023/1 REFERENCES Staff Rules',
            'Bug #123 REFERENCES Feature #100',
            'Travel Policy REFERENCES DSA concept'
        ],
        extractionPatterns: [
            'X references Y',
            'X mentions Y',
            'X cites Y',
            'see also Y',
            'as defined in Y'
        ]
    },

    ASSIGNED_TO: {
        category: 'Communication',
        description: 'Work item or task is assigned to person or team.',
        validPairs: [
            { source: 'WorkItem', target: 'Person' },
            { source: 'WorkItem', target: 'Team' },
            { source: 'Process', target: 'Team' }
        ],
        examples: [
            'Task #123 ASSIGNED_TO John Smith',
            'Bug #456 ASSIGNED_TO OICT Support Team',
            'Leave Approval ASSIGNED_TO HR Unit'
        ],
        extractionPatterns: [
            'X assigned to Y',
            'X owned by Y',
            'Y is responsible for X',
            'Y handles X'
        ]
    },

    AUTHORED_BY: {
        category: 'Communication',
        description: 'Entity was created or authored by person.',
        validPairs: [
            { source: 'Document', target: 'Person' },
            { source: 'Commit', target: 'Person' },
            { source: 'WorkItem', target: 'Person' }
        ],
        examples: [
            'ST/AI/2023/1 AUTHORED_BY Secretary-General',
            'Commit abc123 AUTHORED_BY maria.garcia@un.org',
            'Bug Report AUTHORED_BY John Smith'
        ],
        extractionPatterns: [
            'X authored by Y',
            'X created by Y',
            'X written by Y',
            'Y wrote X'
        ]
    },

    RESOLVES: {
        category: 'Tracking',
        description: 'Commit or change resolves a work item or issue.',
        validPairs: [
            { source: 'Commit', target: 'WorkItem' },
            { source: 'Commit', target: 'WorkItem' }
        ],
        examples: [
            'Commit abc123 RESOLVES Bug #456',
            'PR #789 RESOLVES Feature #100',
            'Changeset 45678 RESOLVES Task #111'
        ],
        extractionPatterns: [
            'X resolves Y',
            'X fixes Y',
            'X closes Y',
            'X addresses Y'
        ]
    },

    RELATED_TO: {
        category: 'Semantic',
        description: 'General semantic relationship between entities.',
        validPairs: [
            { source: '*', target: '*' }  // Fallback for any pair
        ],
        examples: [
            'Umoja RELATED_TO IMIS migration',
            'Leave Policy RELATED_TO Attendance System',
            'Budget Module RELATED_TO Finance Team'
        ],
        extractionPatterns: [
            'X related to Y',
            'X and Y',
            'X with Y',
            'X concerning Y'
        ],
        isFallback: true
    },

    PART_OF: {
        category: 'Structural',
        description: 'Entity is part of or belongs to parent entity.',
        validPairs: [
            { source: 'Person', target: 'Team' },
            { source: 'Team', target: 'Organization' },
            { source: 'Module', target: 'System' },
            { source: 'Feature', target: 'Epic' }
        ],
        examples: [
            'John Smith PART_OF OICT Team',
            'Budget Module PART_OF Umoja',
            'Leave Feature PART_OF HR Epic'
        ],
        extractionPatterns: [
            'X is part of Y',
            'X belongs to Y',
            'X member of Y',
            'X in Y'
        ]
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get relevant entity snippets based on input text
 * Analyzes text to determine which entity types are most likely present
 * @param {string} text - Input text to analyze
 * @param {Object} options - Options
 * @param {number} options.maxSnippets - Maximum snippets to return (default: 5)
 * @param {string} options.context - Context type ('text', 'code', 'workitem')
 * @returns {Object[]} Relevant entity snippets with relevance scores
 */
function getRelevantSnippets(text, options = {}) {
    const { maxSnippets = 5, context = 'text' } = options;

    if (!text || typeof text !== 'string') {
        return [];
    }

    const textLower = text.toLowerCase();
    const results = [];

    // Score each entity type by keyword and pattern matches
    for (const [typeName, snippet] of Object.entries(ENTITY_SNIPPETS)) {
        let score = 0;
        const matches = [];

        // Check keywords
        for (const keyword of snippet.keywords || []) {
            if (textLower.includes(keyword.toLowerCase())) {
                score += 2;
                matches.push(keyword);
            }
        }

        // Check examples (partial match)
        for (const example of snippet.examples || []) {
            const exampleWords = example.toLowerCase().split(/\s+/);
            for (const word of exampleWords) {
                if (word.length > 3 && textLower.includes(word)) {
                    score += 1;
                    break;
                }
            }
        }

        // Context-based boost
        if (context === 'code' && snippet.layer === 'Code') {
            score += 3;
        } else if (context === 'workitem' && ['WorkItem', 'Person', 'Team', 'Feature'].includes(typeName)) {
            score += 3;
        } else if (context === 'text' && snippet.layer === 'Business') {
            score += 1;
        }

        if (score > 0) {
            results.push({
                type: typeName,
                snippet,
                score,
                matches
            });
        }
    }

    // Sort by score descending and limit
    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSnippets);
}

/**
 * Get relevant relation snippets based on entity types present
 * @param {string[]} entityTypes - List of entity types found
 * @param {Object} options - Options
 * @param {number} options.maxSnippets - Maximum snippets to return
 * @returns {Object[]} Relevant relation snippets
 */
function getRelevantRelationSnippets(entityTypes, options = {}) {
    const { maxSnippets = 4 } = options;

    if (!entityTypes || entityTypes.length < 2) {
        return [];
    }

    const typeSet = new Set(entityTypes.map(t => t.toUpperCase()));
    const results = [];

    for (const [relType, snippet] of Object.entries(RELATION_SNIPPETS)) {
        let score = 0;

        // Check if valid pairs exist for given entity types
        for (const pair of snippet.validPairs || []) {
            const sourceMatch = pair.source === '*' || typeSet.has(pair.source.toUpperCase());
            const targetMatch = pair.target === '*' || typeSet.has(pair.target.toUpperCase());

            if (sourceMatch && targetMatch) {
                score += 3;
            }
        }

        // Fallback relations get lower priority
        if (snippet.isFallback) {
            score = Math.max(1, score - 2);
        }

        if (score > 0) {
            results.push({
                type: relType,
                snippet,
                score
            });
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSnippets);
}

/**
 * Format entity snippets for LLM prompt injection
 * @param {Object[]} snippets - Snippets from getRelevantSnippets()
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeExamples - Include examples (default: true)
 * @param {boolean} options.includeHints - Include extraction hints (default: true)
 * @returns {string} Formatted prompt section
 */
function formatSnippetsForPrompt(snippets, options = {}) {
    const { includeExamples = true, includeHints = true } = options;

    if (!snippets || snippets.length === 0) {
        return '';
    }

    const lines = ['## Relevant Entity Types\n'];

    for (const { type, snippet } of snippets) {
        lines.push(`### ${type}`);
        lines.push(`**Layer**: ${snippet.layer}`);
        lines.push(`**Description**: ${snippet.description}`);
        lines.push(`**Properties**: ${snippet.properties.join(', ')}`);

        if (includeExamples && snippet.examples) {
            lines.push(`**Examples**: ${snippet.examples.slice(0, 3).join('; ')}`);
        }

        if (includeHints && snippet.extractionHints) {
            lines.push(`**Hints**: ${snippet.extractionHints.slice(0, 2).join('; ')}`);
        }

        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Format relation snippets for LLM prompt injection
 * @param {Object[]} snippets - Relation snippets
 * @param {Object} options - Formatting options
 * @returns {string} Formatted prompt section
 */
function formatRelationSnippetsForPrompt(snippets, options = {}) {
    const { includeExamples = true } = options;

    if (!snippets || snippets.length === 0) {
        return '';
    }

    const lines = ['## Relevant Relationship Types\n'];

    for (const { type, snippet } of snippets) {
        lines.push(`### ${type}`);
        lines.push(`**Category**: ${snippet.category}`);
        lines.push(`**Description**: ${snippet.description}`);

        if (includeExamples && snippet.examples) {
            lines.push(`**Examples**: ${snippet.examples.slice(0, 2).join('; ')}`);
        }

        if (snippet.extractionPatterns) {
            lines.push(`**Patterns**: ${snippet.extractionPatterns.slice(0, 3).join(', ')}`);
        }

        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Validate a triple (subject, predicate, object) against ontology
 * @param {Object} triple - Triple to validate
 * @param {string} triple.subject - Subject entity name
 * @param {string} triple.subjectType - Subject entity type
 * @param {string} triple.predicate - Relationship type
 * @param {string} triple.object - Object entity name
 * @param {string} triple.objectType - Object entity type
 * @returns {Object} Validation result with isValid, confidence, issues
 */
function validateTriple(triple) {
    const result = {
        isValid: true,
        confidence: 1.0,
        issues: [],
        suggestions: []
    };

    const { subjectType, predicate, objectType } = triple;

    // Check if subject type exists
    if (!ENTITY_SNIPPETS[subjectType] && !NODE_TYPES[subjectType]) {
        result.isValid = false;
        result.confidence *= 0.5;
        result.issues.push(`Unknown subject type: ${subjectType}`);

        // Suggest similar types
        const similar = findSimilarEntityType(subjectType);
        if (similar) {
            result.suggestions.push(`Consider using "${similar}" instead of "${subjectType}"`);
        }
    }

    // Check if object type exists
    if (!ENTITY_SNIPPETS[objectType] && !NODE_TYPES[objectType]) {
        result.isValid = false;
        result.confidence *= 0.5;
        result.issues.push(`Unknown object type: ${objectType}`);

        const similar = findSimilarEntityType(objectType);
        if (similar) {
            result.suggestions.push(`Consider using "${similar}" instead of "${objectType}"`);
        }
    }

    // Check if predicate exists
    const relSnippet = RELATION_SNIPPETS[predicate] || RELATIONSHIP_TYPES[predicate];
    if (!relSnippet) {
        result.isValid = false;
        result.confidence *= 0.6;
        result.issues.push(`Unknown relationship type: ${predicate}`);
        result.suggestions.push('Consider using RELATED_TO as a fallback');
    }

    // Check if pair is valid for this predicate
    if (relSnippet && RELATION_SNIPPETS[predicate]?.validPairs) {
        const validPairs = RELATION_SNIPPETS[predicate].validPairs;
        const pairValid = validPairs.some(pair => {
            const sourceMatch = pair.source === '*' ||
                pair.source.toUpperCase() === subjectType?.toUpperCase();
            const targetMatch = pair.target === '*' ||
                pair.target.toUpperCase() === objectType?.toUpperCase();
            return sourceMatch && targetMatch;
        });

        if (!pairValid) {
            result.confidence *= 0.7;
            result.issues.push(
                `Unusual pair: ${subjectType} -[${predicate}]-> ${objectType}`
            );

            // Suggest better predicates
            const betterPredicate = suggestPredicate(subjectType, objectType);
            if (betterPredicate && betterPredicate !== predicate) {
                result.suggestions.push(`Consider using ${betterPredicate} instead`);
            }
        }
    }

    // Cross-layer validation
    const subjectLayer = ENTITY_SNIPPETS[subjectType]?.layer;
    const objectLayer = ENTITY_SNIPPETS[objectType]?.layer;

    if (subjectLayer && objectLayer) {
        // Warn about unusual cross-layer relationships
        const layerOrder = { 'Strategic': 0, 'Business': 1, 'Code': 2 };

        if (Math.abs(layerOrder[subjectLayer] - layerOrder[objectLayer]) > 1) {
            result.confidence *= 0.85;
            result.issues.push(
                `Cross-layer relationship spanning ${subjectLayer} to ${objectLayer}`
            );
        }
    }

    return result;
}

/**
 * Find similar entity type name (fuzzy matching)
 * @private
 */
function findSimilarEntityType(typeName) {
    if (!typeName) return null;

    const normalized = typeName.toLowerCase().replace(/[^a-z]/g, '');
    const allTypes = Object.keys(ENTITY_SNIPPETS);

    for (const type of allTypes) {
        const typeNorm = type.toLowerCase();
        if (typeNorm.includes(normalized) || normalized.includes(typeNorm)) {
            return type;
        }
    }

    // Common aliases
    const aliases = {
        'class': 'Module',
        'function': 'Module',
        'method': 'Module',
        'service': 'Module',
        'user': 'Person',
        'employee': 'Person',
        'staff': 'Person',
        'dept': 'Organization',
        'department': 'Organization',
        'app': 'System',
        'application': 'System',
        'rule': 'BusinessRule',
        'policy': 'BusinessRule'
    };

    return aliases[normalized] || null;
}

/**
 * Suggest appropriate predicate for entity pair
 * @private
 */
function suggestPredicate(subjectType, objectType) {
    const suggestions = {
        'Person-Team': 'PART_OF',
        'Team-Organization': 'PART_OF',
        'Module-System': 'PART_OF',
        'Feature-Epic': 'PART_OF',
        'Commit-WorkItem': 'RESOLVES',
        'WorkItem-Person': 'ASSIGNED_TO',
        'Module-Module': 'DEPENDS_ON',
        'System-System': 'DEPENDS_ON',
        'API-Database': 'USES',
        'System-Technology': 'USES',
        'Module-BusinessRule': 'IMPLEMENTS',
        'Document-Document': 'REFERENCES'
    };

    const key = `${subjectType}-${objectType}`;
    return suggestions[key] || 'RELATED_TO';
}

/**
 * Get all entity types grouped by layer
 * @returns {Object} Entity types by layer
 */
function getEntityTypesByLayer() {
    const byLayer = {
        Strategic: [],
        Business: [],
        Code: []
    };

    for (const [type, snippet] of Object.entries(ENTITY_SNIPPETS)) {
        if (byLayer[snippet.layer]) {
            byLayer[snippet.layer].push({
                type,
                description: snippet.description,
                keywords: snippet.keywords
            });
        }
    }

    return byLayer;
}

/**
 * Get all relationship types grouped by category
 * @returns {Object} Relationship types by category
 */
function getRelationTypesByCategory() {
    const byCategory = {};

    for (const [type, snippet] of Object.entries(RELATION_SNIPPETS)) {
        if (!byCategory[snippet.category]) {
            byCategory[snippet.category] = [];
        }
        byCategory[snippet.category].push({
            type,
            description: snippet.description,
            validPairs: snippet.validPairs
        });
    }

    return byCategory;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Snippets
    ENTITY_SNIPPETS,
    RELATION_SNIPPETS,

    // Core functions
    getRelevantSnippets,
    getRelevantRelationSnippets,
    formatSnippetsForPrompt,
    formatRelationSnippetsForPrompt,
    validateTriple,

    // Utility functions
    getEntityTypesByLayer,
    getRelationTypesByCategory,
    findSimilarEntityType,
    suggestPredicate
};
