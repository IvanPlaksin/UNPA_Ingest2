'use strict';

/**
 * Domain Map — curated grouping of the 198 graph labels into ~13 human-meaningful
 * data domains, for the Graph Transfer "map-first" UI (TASK-GT-UI-001).
 *
 * Built from a live inventory (2026-07-20): 94.7% of the graph is one label
 * (SourceDocument), so a raw label list is noise — this config turns it into
 * selectable areas. Labels are MUTUALLY EXCLUSIVE across domains (each label in
 * at most one domain) so per-domain counts don't double-book. `namespaceHints`
 * are the real (case-normalized) namespaces; `vectorCollections` link to Qdrant.
 */

const DOMAIN_MAP = {
    'un-documents': {
        id: 'un-documents',
        name: 'UN Document Corpus',
        icon: '📄',
        description: 'Harvested UN document metadata (ODS and other sources): documents, series, agenda items, source catalogs and ingestion runs.',
        labels: ['SourceDocument', 'Document', 'DocumentSeries', 'AgendaItem', 'DocumentType', 'DocumentTypeRegistry', 'SourceReference', 'SourceCatalog', 'SourceProfile', 'IngestionPhase', 'IngestionSession'],
        namespaceHints: ['CORE', 'DEFAULT'],
        vectorCollections: ['documents_entities'],
        color: '#3b82f6',
    },
    'people-org': {
        id: 'people-org',
        name: 'People & Organization',
        icon: '👥',
        description: 'UN organizational directory: users, org units, roles, permissions, support groups and duty stations.',
        labels: ['User', 'OrganizationUnit', 'Role', 'Permission', 'SupportGroup', 'Staff', 'DutyStation', 'UNStaffProfile', 'Organization'],
        namespaceHints: ['CORE', 'FLOWDESK'],
        vectorCollections: [],
        color: '#f59e0b',
    },
    'extracted-knowledge': {
        id: 'extracted-knowledge',
        name: 'Extracted Knowledge',
        icon: '🧠',
        description: 'The semantic knowledge graph mined from documents & dialogues: entity mentions, entities, concepts, locations and relationship evidence.',
        labels: ['EntityMention', 'ESEntity', 'Entity', 'KnowledgeNode', 'KnowledgeCluster', 'Knowledge', 'KnowledgeGraph', 'KnowledgeObject', 'KnowledgeSection', 'Concept', 'Location', 'RelationshipEvidence', 'EntityMergeLog', 'ESCluster', 'EpistemicLayer'],
        namespaceHints: ['CORE', 'DEFAULT'],
        vectorCollections: ['documents_entities', 'knowledge_entities'],
        color: '#10b981',
    },
    dialogues: {
        id: 'dialogues',
        name: 'Dialogues & Chats',
        icon: '💬',
        description: 'Development dialogues and chat history: dialogue segments, sessions, chat turns, and architectural decisions extracted from them.',
        labels: ['DialogueSegment', 'DialogueSession', 'DialogueTag', 'ArchDecision', 'ChatSession', 'ChatTurn', 'LinkedConversation'],
        namespaceHints: ['DIALOGUE'],
        vectorCollections: ['dialogue_embeddings'],
        color: '#8b5cf6',
    },
    'gxe-graphs': {
        id: 'gxe-graphs',
        name: 'GXE Executable Graphs',
        icon: '⚙️',
        description: 'The "Graph = Program" catalog: graph definitions, versions, catalog entries, subgraphs/ports and AOPEG execution nodes.',
        labels: ['GraphDefinition', 'GraphVersion', 'CatalogEntry', 'CatalogRoot', 'SubGraph', 'SubGraphPort', 'KnowledgeQuantum', 'NodeType', 'EdgeType', 'GraphCategory', 'GraphChange', 'MetaNode', 'AOPEG_GraphNode', 'AOPEG_GraphEdge', 'AOPEG_ExecutionGraph', 'ExecutionRecord', 'ExecutionNodeRecord', 'DomainGraph', 'BusinessProcessGraph', 'ProcessGraph', 'YNBusinessGraph', 'ConsolidationCheckpoint'],
        namespaceHints: ['GXE', 'CORE', 'META'],
        vectorCollections: ['embeddings_unified'],
        color: '#ec4899',
        useCatalogTree: true, // detailed selection via the catalog tree (GT-009)
    },
    'sql-structural': {
        id: 'sql-structural',
        name: 'SQL & Structure',
        icon: '🗃️',
        description: 'Structural extraction from legacy systems: database tables, table profiles, stored procedures, business/semantic rules and code structure.',
        labels: ['DatabaseTable', 'TableProfile', 'StructuralAttribute', 'StoredProcedureKG', 'BusinessRule', 'StructuralEntity', 'Function', 'File', 'Method', 'Module', 'Class', 'Database', 'SemanticRule', 'SEMANTIC', 'SemanticCalculation', 'BehavioralNode', 'BehavioralProcess', 'DomainVocabulary'],
        namespaceHints: ['PROJECT', 'CORE'],
        vectorCollections: [],
        color: '#06b6d4',
    },
    'extraction-meta': {
        id: 'extraction-meta',
        name: 'Extraction Metadata',
        icon: '📊',
        description: 'Provenance of knowledge extraction: metrics, results, records, prompts, lessons learned and methodologies.',
        labels: ['ExtractionMetrics', 'ExtractionResult', 'ExtractionRecord', 'ExtractionPrompt', 'LessonLearned', 'Methodology', 'ProvenanceRound'],
        namespaceHints: ['CORE'],
        vectorCollections: [],
        color: '#64748b',
    },
    flowdesk: {
        id: 'flowdesk',
        name: 'FlowDesk / ITSM',
        icon: '🎫',
        description: 'FlowDesk/Altiora service management: service catalog, slot & enum definitions, requests, work orders, workflows and classifiers.',
        labels: ['ServiceCatalogItem', 'ServiceRequest', 'ServiceDef', 'ServiceDescription', 'WorkOrder', 'Workflow', 'SlotDef', 'SlotGroup', 'EnumOption', 'OptionFilter', 'NotificationTemplate', 'ClassifierRule', 'KeywordRule', 'Handler', 'ResolverDef', 'RankingRecord', 'DataSource', 'FlowdeskSystemPrompt', 'FlowdeskPromptOverlay'],
        namespaceHints: ['FLOWDESK', 'Altiora'],
        vectorCollections: ['flowdesk_services'],
        color: '#ef4444',
    },
    codex: {
        id: 'codex',
        name: 'Codex Rules',
        icon: '📜',
        description: 'Platform governance: Codex rules, definitions, sections, principles, ADRs and the BlackCodex anti-patterns.',
        labels: ['CodexRule', 'CodexDefinition', 'CodexSection', 'CodexPrinciple', 'CodexPart', 'CodexADR', 'CodexProposal', 'CodexPattern', 'CodexStakeholder', 'CodexMetadata', 'BlackCodexEntry'],
        namespaceHints: ['CODEX', 'BlackCodex'],
        vectorCollections: [],
        color: '#a855f7',
    },
    workspace: {
        id: 'workspace',
        name: 'Workspace Drafts',
        icon: '📝',
        description: 'The extraction sandbox: work-in-progress draft entities, concepts, workflows and rules before promotion.',
        labels: ['DraftEntity', 'DraftConcept', 'DraftWorkflow', 'DraftBusinessRule', 'DraftAnomaly', 'DraftDecision', 'DraftSchema', 'WorkSpace', 'Workspace', 'WorkSpaceAgentSession', 'WorkSpaceChatMessage'],
        namespaceHints: ['PROJECT'],
        vectorCollections: [],
        color: '#84cc16',
    },
    backlog: {
        id: 'backlog',
        name: 'BackLog & Tasks',
        icon: '✅',
        description: 'Project task tracking: backlog items/tasks, execution cycles, plans, reviews, gaps and technical debt.',
        labels: ['BackLogItem', 'BackLogTask', 'ExecutionCycle', 'PlanRecord', 'ReviewRecord', 'DecisionLog', 'QuickWin', 'Gap', 'TechnicalDebt'],
        namespaceHints: ['FLOWDESK', 'PROJECT', 'GXE'],
        vectorCollections: [],
        color: '#22c55e',
    },
    investigation: {
        id: 'investigation',
        name: 'Investigation',
        icon: '🔍',
        description: 'The investigation subsystem: sessions, artifacts, steps, hypotheses and their versions.',
        labels: ['InvestigationArtifact', 'InvestigationStep', 'InvestigationVersion', 'InvestigationSession', 'InvestigationChatMessage', 'InvestigationMethodology', 'Hypothesis'],
        namespaceHints: ['UNPA', 'CORE'],
        vectorCollections: [],
        color: '#f97316',
    },
    'system-meta': {
        id: 'system-meta',
        name: 'System & Meta',
        icon: '🔧',
        description: 'Platform configuration & meta: tools, prompt templates/metrics, system components, requirements and AI/pipeline config.',
        labels: ['Tool', 'ToolCategory', 'ToolCatalog', 'System', 'SystemComponent', 'TechnicalComponent', 'Technology', 'Equipment', 'PromptTemplate', 'PromptMetric', 'PromptVersion', 'Notification', 'BusinessRequirement', 'BusinessGoal', 'BusinessEntity', 'PipelineConfig', 'HookSet', 'Settings', 'AIProviderConfig', 'AIConfigSet', 'AINFRA', 'CoreComponent', 'Domain', 'RequirementCategory', 'LifecycleState', 'ProcessStep', 'CoreKnowledge', 'DateTypeRegistry', 'RelTypeWeight', 'NodeSchema', 'PromotionRecord'],
        namespaceHints: ['CORE', 'META', 'GXE'],
        vectorCollections: [],
        color: '#6b7280',
    },
};

module.exports = { DOMAIN_MAP };
