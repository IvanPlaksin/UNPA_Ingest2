/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT RULES - Rule-based Intent Classification
 * Part of SDA (Staged DAG Assembly) Architecture - Stage 1
 *
 * Provides domain-specific rules for UN/UNPA context:
 * - DevOps (Azure DevOps work items, pipelines)
 * - HR (personnel, recruitment, performance)
 * - Finance (budget, procurement, payments)
 * - Legal (resolutions, treaties, compliance)
 * - Operations (missions, logistics, facilities)
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Domain definitions with keywords and patterns
 */
const DOMAINS = {
    devops: {
        name: 'DevOps',
        description: 'Azure DevOps work items, pipelines, repositories',
        keywords: [
            'work item', 'workitem', 'user story', 'bug', 'task', 'feature',
            'sprint', 'backlog', 'pipeline', 'build', 'release', 'deploy',
            'repository', 'repo', 'commit', 'branch', 'pull request', 'pr',
            'azure devops', 'ado', 'iteration', 'area path', 'assigned to',
            'story points', 'acceptance criteria', 'epic', 'defect'
        ],
        patterns: [
            /work\s*item\s*#?\d+/i,
            /user\s*story\s*#?\d+/i,
            /bug\s*#?\d+/i,
            /task\s*#?\d+/i,
            /feature\s*#?\d+/i,
            /sprint\s*\d+/i,
            /ado[-_]?\d+/i,
            /\bpr[-_#]?\d+/i
        ],
        ontologyLayer: 'code',  // z=200
        priority: 10
    },

    hr: {
        name: 'Human Resources',
        description: 'Personnel management, recruitment, performance',
        keywords: [
            'staff', 'employee', 'personnel', 'recruitment', 'vacancy',
            'position', 'contract', 'salary', 'grade', 'step', 'performance',
            'evaluation', 'leave', 'absence', 'training', 'onboarding',
            'offboarding', 'termination', 'promotion', 'transfer', 'roster',
            'competency', 'qualification', 'certification', 'manager'
        ],
        patterns: [
            /staff\s*id[-_:]?\s*\d+/i,
            /position[-_]?\d+/i,
            /vacancy[-_]?\d+/i,
            /contract[-_#]?\d+/i,
            /p[-_]?\d+\s*grade/i,
            /d[-_]?\d+\s*level/i,
            /g[-_]?\d+\s*staff/i
        ],
        ontologyLayer: 'business',  // z=0
        priority: 8
    },

    finance: {
        name: 'Finance',
        description: 'Budget, procurement, payments, accounting',
        keywords: [
            'budget', 'fund', 'allocation', 'expenditure', 'revenue',
            'procurement', 'purchase', 'vendor', 'supplier', 'invoice',
            'payment', 'disbursement', 'receipt', 'accounting', 'cost',
            'financial', 'appropriation', 'allotment', 'obligation',
            'commitment', 'grant', 'contribution', 'assessed', 'voluntary'
        ],
        patterns: [
            /budget[-_]?\d{4}/i,
            /fund[-_#]?\d+/i,
            /po[-_#]?\d+/i,  // Purchase Order
            /invoice[-_#]?\d+/i,
            /grant[-_#]?\d+/i,
            /usd\s*[\d,.]+/i,
            /\$[\d,.]+/i
        ],
        ontologyLayer: 'business',  // z=0
        priority: 7
    },

    legal: {
        name: 'Legal & Governance',
        description: 'Resolutions, treaties, compliance, governance',
        keywords: [
            'resolution', 'treaty', 'convention', 'agreement', 'mandate',
            'compliance', 'regulation', 'policy', 'rule', 'charter',
            'statute', 'legal', 'law', 'governance', 'oversight',
            'accountability', 'transparency', 'audit', 'ethics',
            'general assembly', 'security council', 'ecosoc', 'secretariat'
        ],
        patterns: [
            /resolution\s*(a|s|e|st)\/\d+/i,
            /a\/res\/\d+/i,
            /s\/res\/\d+/i,
            /st\/sgb\/\d+/i,
            /st\/ai\/\d+/i,
            /treaty[-_#]?\d+/i
        ],
        ontologyLayer: 'strategic',  // z=-200
        priority: 9
    },

    operations: {
        name: 'Operations',
        description: 'Missions, logistics, facilities, field operations',
        keywords: [
            'mission', 'operation', 'logistics', 'supply', 'transport',
            'facility', 'building', 'office', 'equipment', 'asset',
            'inventory', 'warehouse', 'shipment', 'delivery', 'field',
            'peacekeeping', 'dpko', 'dos', 'dfs', 'special political',
            'humanitarian', 'emergency', 'crisis', 'deployment'
        ],
        patterns: [
            /mission[-_]?\w{4,}/i,  // MINUSMA, UNMISS, etc.
            /un[a-z]{2,6}/i,  // UN mission acronyms
            /dpko[-_]?\d+/i,
            /dos[-_]?\d+/i,
            /asset[-_#]?\d+/i,
            /facility[-_#]?\d+/i
        ],
        ontologyLayer: 'business',  // z=0
        priority: 6
    },

    knowledge: {
        name: 'Knowledge Management',
        description: 'Documents, reports, knowledge base, search',
        keywords: [
            'document', 'report', 'knowledge', 'search', 'find', 'query',
            'information', 'data', 'record', 'archive', 'library',
            'publication', 'article', 'memo', 'note', 'brief',
            'presentation', 'guidelines', 'manual', 'handbook', 'faq'
        ],
        patterns: [
            /doc[-_#]?\d+/i,
            /report[-_#]?\d+/i,
            /kb[-_#]?\d+/i,
            /article[-_#]?\d+/i
        ],
        ontologyLayer: 'business',  // z=0
        priority: 5
    }
};

// ────────────────────────────────────────────────────────────────────────────
// INTENT TYPE DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Intent types (CRUD + extended operations)
 */
const INTENT_TYPES = {
    // CRUD Operations
    create: {
        name: 'Create',
        description: 'Create new entity or record',
        keywords: ['create', 'add', 'new', 'insert', 'generate', 'make', 'build', 'establish'],
        patterns: [/^create\s+/i, /^add\s+/i, /^new\s+/i, /^make\s+/i],
        capability: 'data_store',
        isModifying: true
    },
    read: {
        name: 'Read',
        description: 'Retrieve or view existing data',
        keywords: ['get', 'fetch', 'retrieve', 'show', 'display', 'view', 'read', 'list', 'find', 'search'],
        patterns: [/^get\s+/i, /^fetch\s+/i, /^show\s+/i, /^list\s+/i, /^find\s+/i, /^search\s+/i],
        capability: 'data_fetch',
        isModifying: false
    },
    update: {
        name: 'Update',
        description: 'Modify existing entity or record',
        keywords: ['update', 'modify', 'change', 'edit', 'alter', 'revise', 'set', 'adjust'],
        patterns: [/^update\s+/i, /^modify\s+/i, /^change\s+/i, /^edit\s+/i, /^set\s+/i],
        capability: 'data_store',
        isModifying: true
    },
    delete: {
        name: 'Delete',
        description: 'Remove entity or record',
        keywords: ['delete', 'remove', 'drop', 'clear', 'purge', 'destroy', 'erase'],
        patterns: [/^delete\s+/i, /^remove\s+/i, /^drop\s+/i, /^clear\s+/i],
        capability: 'data_store',
        isModifying: true
    },

    // Extended Operations
    analyze: {
        name: 'Analyze',
        description: 'Analyze data, extract insights',
        keywords: ['analyze', 'analysis', 'examine', 'inspect', 'evaluate', 'assess', 'review', 'audit'],
        patterns: [/^analyze\s+/i, /^examine\s+/i, /^evaluate\s+/i, /^assess\s+/i, /^review\s+/i],
        capability: 'analysis',
        isModifying: false
    },
    extract: {
        name: 'Extract',
        description: 'Extract entities, relationships, or patterns',
        keywords: ['extract', 'parse', 'identify', 'detect', 'recognize', 'discover', 'mine'],
        patterns: [/^extract\s+/i, /^parse\s+/i, /^identify\s+/i, /^detect\s+/i],
        capability: 'extraction',
        isModifying: false
    },
    transform: {
        name: 'Transform',
        description: 'Transform or convert data format',
        keywords: ['transform', 'convert', 'map', 'translate', 'normalize', 'format', 'sanitize'],
        patterns: [/^transform\s+/i, /^convert\s+/i, /^normalize\s+/i, /^format\s+/i],
        capability: 'data_transform',
        isModifying: false
    },
    aggregate: {
        name: 'Aggregate',
        description: 'Aggregate, summarize, or combine data',
        keywords: ['aggregate', 'summarize', 'combine', 'merge', 'consolidate', 'group', 'total', 'sum', 'count'],
        patterns: [/^aggregate\s+/i, /^summarize\s+/i, /^combine\s+/i, /^merge\s+/i, /^group\s+/i],
        capability: 'aggregation',
        isModifying: false
    },
    compare: {
        name: 'Compare',
        description: 'Compare entities or versions',
        keywords: ['compare', 'diff', 'contrast', 'match', 'versus', 'vs', 'difference'],
        patterns: [/^compare\s+/i, /^diff\s+/i, /^match\s+/i],
        capability: 'analysis',
        isModifying: false
    },
    link: {
        name: 'Link',
        description: 'Create relationships between entities',
        keywords: ['link', 'connect', 'relate', 'associate', 'join', 'bind', 'attach'],
        patterns: [/^link\s+/i, /^connect\s+/i, /^relate\s+/i, /^associate\s+/i],
        capability: 'data_store',
        isModifying: true
    },
    ingest: {
        name: 'Ingest',
        description: 'Ingest data from external source',
        keywords: ['ingest', 'import', 'load', 'sync', 'synchronize', 'pull', 'fetch all'],
        patterns: [/^ingest\s+/i, /^import\s+/i, /^load\s+/i, /^sync\s+/i, /^pull\s+/i],
        capability: 'data_fetch',
        isModifying: true
    },
    export: {
        name: 'Export',
        description: 'Export data to external format',
        keywords: ['export', 'download', 'dump', 'backup', 'output', 'save as'],
        patterns: [/^export\s+/i, /^download\s+/i, /^dump\s+/i, /^backup\s+/i],
        capability: 'data_store',
        isModifying: false
    }
};

// ────────────────────────────────────────────────────────────────────────────
// COMPOSITE RULES (Domain + Intent combinations)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Composite rules for specific domain+intent combinations
 * These provide more precise tool suggestions
 */
const COMPOSITE_RULES = [
    // DevOps specific
    {
        id: 'devops_fetch_workitem',
        domain: 'devops',
        intent: 'read',
        patterns: [/get\s+(work\s*item|workitem|bug|task|story)/i, /fetch\s+(work\s*item|workitem)/i],
        keywords: ['get work item', 'fetch workitem', 'retrieve bug', 'show task'],
        suggestedTools: ['primitive.getWorkItem', 'ado.fetchWorkItems'],
        priority: 100
    },
    {
        id: 'devops_create_workitem',
        domain: 'devops',
        intent: 'create',
        patterns: [/create\s+(work\s*item|workitem|bug|task|story)/i, /new\s+(bug|task|story)/i],
        keywords: ['create work item', 'new bug', 'add task'],
        suggestedTools: ['ado.createWorkItem'],
        priority: 100
    },
    {
        id: 'devops_update_workitem',
        domain: 'devops',
        intent: 'update',
        patterns: [/update\s+(work\s*item|workitem|bug|task)/i, /change\s+state/i, /move\s+to\s+sprint/i],
        keywords: ['update work item', 'change state', 'move sprint'],
        suggestedTools: ['ado.updateWorkItem'],
        priority: 100
    },
    {
        id: 'devops_ingest_workitems',
        domain: 'devops',
        intent: 'ingest',
        patterns: [/ingest\s+(from\s+)?ado/i, /sync\s+work\s*items/i, /import\s+(from\s+)?azure/i],
        keywords: ['ingest ado', 'sync workitems', 'import azure devops'],
        suggestedTools: ['primitive.fetchAndIngestADO', 'ado.syncAll'],
        priority: 100
    },

    // Knowledge graph specific
    {
        id: 'kg_extract_entities',
        domain: 'knowledge',
        intent: 'extract',
        patterns: [/extract\s+entit/i, /identify\s+entit/i, /find\s+entit/i],
        keywords: ['extract entities', 'identify entities', 'entity extraction'],
        suggestedTools: ['extraction.extractEntities', 'llm.extractEntities'],
        priority: 95
    },
    {
        id: 'kg_search_similar',
        domain: 'knowledge',
        intent: 'read',
        patterns: [/search\s+similar/i, /find\s+related/i, /semantic\s+search/i],
        keywords: ['search similar', 'find related', 'semantic search'],
        suggestedTools: ['qdrant.searchSimilar', 'graph.findRelated'],
        priority: 95
    },
    {
        id: 'kg_build_graph',
        domain: 'knowledge',
        intent: 'create',
        patterns: [/build\s+graph/i, /create\s+knowledge/i, /populate\s+graph/i],
        keywords: ['build graph', 'create knowledge graph', 'populate graph'],
        suggestedTools: ['graph.buildFromEntities', 'neo4j.createNodes'],
        priority: 95
    },

    // Analysis specific
    {
        id: 'analysis_summarize',
        domain: 'knowledge',
        intent: 'aggregate',
        patterns: [/summarize\s+/i, /summary\s+of/i, /overview\s+of/i],
        keywords: ['summarize', 'summary', 'overview'],
        suggestedTools: ['llm.summarize', 'analysis.generateSummary'],
        priority: 90
    },
    {
        id: 'analysis_compare',
        domain: 'knowledge',
        intent: 'compare',
        patterns: [/compare\s+/i, /diff(erence)?\s+between/i, /what\s+changed/i],
        keywords: ['compare', 'difference', 'what changed'],
        suggestedTools: ['analysis.compare', 'diff.compute'],
        priority: 90
    },

    // HR specific
    {
        id: 'hr_get_staff',
        domain: 'hr',
        intent: 'read',
        patterns: [/get\s+(staff|employee|personnel)/i, /fetch\s+(staff|employee)/i, /staff\s+profile/i],
        keywords: ['get staff', 'staff profile', 'employee', 'personnel'],
        suggestedTools: ['hr.getStaff', 'hr.fetchProfile'],
        priority: 85
    },
    {
        id: 'hr_create_vacancy',
        domain: 'hr',
        intent: 'create',
        patterns: [/create\s+(vacancy|position)/i, /new\s+(vacancy|position)/i, /vacancy\s+announcement/i],
        keywords: ['create vacancy', 'new position', 'vacancy announcement'],
        suggestedTools: ['hr.createVacancy'],
        priority: 85
    },

    // Finance specific
    {
        id: 'finance_get_budget',
        domain: 'finance',
        intent: 'read',
        patterns: [/get\s+budget/i, /fetch\s+budget/i, /budget\s+allocation/i, /fund\s+\d+/i],
        keywords: ['get budget', 'budget allocation', 'fund', 'expenditure'],
        suggestedTools: ['finance.getBudget', 'finance.fetchAllocation'],
        priority: 85
    },
    {
        id: 'finance_create_po',
        domain: 'finance',
        intent: 'create',
        patterns: [/create\s+(purchase|po)/i, /new\s+purchase/i, /purchase\s+order/i],
        keywords: ['create purchase', 'purchase order', 'procurement'],
        suggestedTools: ['finance.createPO'],
        priority: 85
    },

    // Legal specific
    {
        id: 'legal_find_resolution',
        domain: 'legal',
        intent: 'read',
        patterns: [/find\s+resolution/i, /get\s+resolution/i, /resolution\s+(a|s|e)\/res/i, /a\/res\//i, /s\/res\//i],
        keywords: ['find resolution', 'resolution', 'treaty', 'convention'],
        suggestedTools: ['legal.findResolution', 'legal.getDocument'],
        priority: 85
    },
    {
        id: 'legal_analyze_compliance',
        domain: 'legal',
        intent: 'analyze',
        patterns: [/analyze\s+compliance/i, /compliance\s+with/i, /st\/sgb/i, /st\/ai/i],
        keywords: ['analyze compliance', 'compliance', 'governance', 'audit'],
        suggestedTools: ['legal.analyzeCompliance'],
        priority: 85
    },

    // Operations specific
    {
        id: 'operations_get_mission',
        domain: 'operations',
        intent: 'read',
        patterns: [/get\s+(status|mission)/i, /mission\s+status/i, /minusma/i, /unmiss/i, /monusco/i],
        keywords: ['get status', 'mission', 'deployment', 'peacekeeping'],
        suggestedTools: ['operations.getMission', 'operations.getStatus'],
        priority: 85
    },
    {
        id: 'operations_track_shipment',
        domain: 'operations',
        intent: 'read',
        patterns: [/track\s+(shipment|delivery)/i, /shipment\s+status/i, /logistics/i],
        keywords: ['track shipment', 'delivery', 'logistics', 'supply'],
        suggestedTools: ['operations.trackShipment', 'logistics.getStatus'],
        priority: 85
    },

    // DevOps - additional
    {
        id: 'devops_sync_all',
        domain: 'devops',
        intent: 'ingest',
        patterns: [/ingest\s+(from\s+)?ado/i, /sync\s+work\s*items/i, /import\s+(from\s+)?azure/i, /ingest\s+all\s+work/i],
        keywords: ['ingest ado', 'sync workitems', 'import azure devops', 'ingest all work'],
        suggestedTools: ['primitive.fetchAndIngestADO', 'ado.syncAll'],
        priority: 95
    },

    // Knowledge - additional
    {
        id: 'kg_search_documents',
        domain: 'knowledge',
        intent: 'read',
        patterns: [/search\s+(for\s+)?document/i, /find\s+document/i, /document\s+search/i],
        keywords: ['search documents', 'find documents', 'document search'],
        suggestedTools: ['qdrant.searchDocuments', 'graph.findDocuments'],
        priority: 90
    },
    {
        id: 'kg_build_graph',
        domain: 'knowledge',
        intent: 'create',
        patterns: [/build\s+(knowledge\s+)?graph/i, /create\s+(knowledge\s+)?graph/i, /populate\s+graph/i],
        keywords: ['build graph', 'create knowledge graph', 'populate graph'],
        suggestedTools: ['graph.buildFromEntities', 'neo4j.createNodes'],
        priority: 90
    }
];

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get all domain IDs
 * @returns {string[]}
 */
function getDomainIds() {
    return Object.keys(DOMAINS);
}

/**
 * Get all intent type IDs
 * @returns {string[]}
 */
function getIntentTypeIds() {
    return Object.keys(INTENT_TYPES);
}

/**
 * Get domain by ID
 * @param {string} domainId
 * @returns {Object|null}
 */
function getDomain(domainId) {
    return DOMAINS[domainId] || null;
}

/**
 * Get intent type by ID
 * @param {string} intentId
 * @returns {Object|null}
 */
function getIntentType(intentId) {
    return INTENT_TYPES[intentId] || null;
}

/**
 * Get composite rules for domain+intent
 * @param {string} domain
 * @param {string} intent
 * @returns {Object[]}
 */
function getCompositeRules(domain = null, intent = null) {
    return COMPOSITE_RULES.filter(rule => {
        if (domain && rule.domain !== domain) return false;
        if (intent && rule.intent !== intent) return false;
        return true;
    });
}

/**
 * Get ontology layer for domain
 * @param {string} domainId
 * @returns {string|null}
 */
function getOntologyLayer(domainId) {
    const domain = DOMAINS[domainId];
    return domain ? domain.ontologyLayer : null;
}

/**
 * Check if intent is modifying (write operation)
 * @param {string} intentId
 * @returns {boolean}
 */
function isModifyingIntent(intentId) {
    const intent = INTENT_TYPES[intentId];
    return intent ? intent.isModifying : false;
}

/**
 * Get capability for intent
 * @param {string} intentId
 * @returns {string|null}
 */
function getCapabilityForIntent(intentId) {
    const intent = INTENT_TYPES[intentId];
    return intent ? intent.capability : null;
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
    DOMAINS,
    INTENT_TYPES,
    COMPOSITE_RULES,
    getDomainIds,
    getIntentTypeIds,
    getDomain,
    getIntentType,
    getCompositeRules,
    getOntologyLayer,
    isModifyingIntent,
    getCapabilityForIntent
};
