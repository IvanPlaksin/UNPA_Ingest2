/**
 * Pattern Library - Storage and Manager for Extraction Patterns
 *
 * Features:
 * - Pattern registration (entity, relation, subgraph)
 * - Pattern matching against text/entities
 * - Entity and relation extraction
 * - Learning from extractions
 * - Export/import patterns
 *
 * @module services/patterns/pattern-library
 */

'use strict';

const { EntityPattern, RelationPattern, SubgraphPattern } = require('./pattern-types');

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[PatternLibrary]', ...args),
    info: (...args) => console.log('[PatternLibrary]', ...args),
    warn: (...args) => console.warn('[PatternLibrary]', ...args),
    error: (...args) => console.error('[PatternLibrary]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN LIBRARY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PatternLibrary {
    constructor(options = {}) {
        this.options = {
            minConfidenceForMatch: options.minConfidenceForMatch || 0.4,
            maxPatternsPerType: options.maxPatternsPerType || 100,
            enableLearning: options.enableLearning !== false,
            learningThreshold: options.learningThreshold || 5,
            ...options
        };

        // Pattern storage
        this.entityPatterns = new Map();
        this.relationPatterns = new Map();
        this.subgraphPatterns = new Map();

        // Domain index for fast lookup
        this.domainIndex = new Map();

        // Learning buffer for pattern generation
        this.learningBuffer = {
            entities: new Map(),
            relations: new Map(),
            subgraphs: new Map()
        };

        // Load default patterns
        this._loadDefaultPatterns();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Register an entity pattern
     */
    registerEntityPattern(config) {
        const pattern = config instanceof EntityPattern
            ? config
            : new EntityPattern(config);

        this.entityPatterns.set(pattern.id, pattern);
        this._indexByDomain(pattern, 'entities');
        logger.debug(`Registered entity pattern: ${pattern.name}`);
        return pattern;
    }

    /**
     * Register a relation pattern
     */
    registerRelationPattern(config) {
        const pattern = config instanceof RelationPattern
            ? config
            : new RelationPattern(config);

        this.relationPatterns.set(pattern.id, pattern);
        this._indexByDomain(pattern, 'relations');
        logger.debug(`Registered relation pattern: ${pattern.name}`);
        return pattern;
    }

    /**
     * Register a subgraph pattern
     */
    registerSubgraphPattern(config) {
        const pattern = config instanceof SubgraphPattern
            ? config
            : new SubgraphPattern(config);

        this.subgraphPatterns.set(pattern.id, pattern);
        this._indexByDomain(pattern, 'subgraphs');
        logger.debug(`Registered subgraph pattern: ${pattern.name}`);
        return pattern;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MATCHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Match entity patterns against text
     */
    matchEntityPatterns(text, context = {}) {
        const matches = [];
        const candidates = this._getCandidatePatterns('entities', context.domain);

        for (const id of candidates) {
            const pattern = this.entityPatterns.get(id);
            if (!pattern) continue;

            const result = pattern.matches(text, context);
            if (result.matches && result.score >= this.options.minConfidenceForMatch) {
                matches.push(result);
            }
        }

        // Sort by score * priority
        return matches.sort((a, b) =>
            (b.score * b.pattern.priority) - (a.score * a.pattern.priority)
        );
    }

    /**
     * Match relation patterns against text and entities
     */
    matchRelationPatterns(text, entities = [], context = {}) {
        const matches = [];
        const candidates = this._getCandidatePatterns('relations', context.domain);

        for (const id of candidates) {
            const pattern = this.relationPatterns.get(id);
            if (!pattern) continue;

            const result = pattern.matches(text, entities, context);
            if (result.matches && result.score >= this.options.minConfidenceForMatch) {
                matches.push(result);
            }
        }

        return matches.sort((a, b) =>
            (b.score * b.pattern.priority) - (a.score * a.pattern.priority)
        );
    }

    /**
     * Match subgraph patterns against entities and relations
     */
    matchSubgraphPatterns(entities, relations, context = {}) {
        const matches = [];
        const candidates = this._getCandidatePatterns('subgraphs', context.domain);

        for (const id of candidates) {
            const pattern = this.subgraphPatterns.get(id);
            if (!pattern) continue;

            const result = pattern.matches(entities, relations, context);
            if (result.matches && result.score >= this.options.minConfidenceForMatch) {
                matches.push(result);
            }
        }

        return matches.sort((a, b) => b.score - a.score);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities using matching patterns
     */
    extractEntities(text, context = {}) {
        const patternMatches = this.matchEntityPatterns(text, context);
        const allEntities = [];
        const usedPatterns = [];

        for (const match of patternMatches) {
            const entities = match.pattern.extract(text, context);
            if (entities?.length > 0) {
                allEntities.push(...entities);
                usedPatterns.push({
                    id: match.pattern.id,
                    name: match.pattern.name,
                    score: match.score
                });
            }
        }

        return {
            entities: this._deduplicateEntities(allEntities),
            patternsUsed: usedPatterns,
            patternMatches: patternMatches.length
        };
    }

    /**
     * Extract relations using matching patterns
     */
    extractRelations(text, entities, context = {}) {
        const patternMatches = this.matchRelationPatterns(text, entities, context);
        const allRelations = [];
        const usedPatterns = [];

        for (const match of patternMatches) {
            const relations = match.pattern.extract(text, entities, context);
            if (relations?.length > 0) {
                allRelations.push(...relations);
                usedPatterns.push({
                    id: match.pattern.id,
                    name: match.pattern.name,
                    score: match.score
                });
            }
        }

        return {
            relations: this._deduplicateRelations(allRelations),
            patternsUsed: usedPatterns,
            patternMatches: patternMatches.length
        };
    }

    /**
     * Full extraction: entities + relations + subgraph matching
     */
    extract(text, context = {}) {
        const entityResult = this.extractEntities(text, context);
        const relationResult = this.extractRelations(text, entityResult.entities, context);
        const subgraphMatches = this.matchSubgraphPatterns(
            entityResult.entities,
            relationResult.relations,
            context
        );

        return {
            entities: entityResult.entities,
            relations: relationResult.relations,
            subgraphPatterns: subgraphMatches.map(m => ({
                patternId: m.pattern.id,
                patternName: m.pattern.name,
                structure: m.pattern.structure,
                score: m.score
            })),
            metadata: {
                entityPatternsUsed: entityResult.patternsUsed,
                relationPatternsUsed: relationResult.patternsUsed,
                totalPatternMatches: entityResult.patternMatches + relationResult.patternMatches,
                method: 'pattern_library'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LEARNING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Learn patterns from successful extractions
     */
    learnFromExtraction(text, extraction, feedback = {}) {
        if (!this.options.enableLearning) {
            return { learned: false };
        }

        const learned = { entities: 0, relations: 0, subgraphs: 0 };

        // Learn entity patterns
        for (const entity of extraction.entities || []) {
            if (this._learnEntityPattern(text, entity)) {
                learned.entities++;
            }
        }

        // Learn relation patterns
        for (const relation of extraction.relations || []) {
            if (this._learnRelationPattern(text, relation, extraction.entities)) {
                learned.relations++;
            }
        }

        // Learn subgraph patterns from complex extractions
        if (extraction.entities?.length >= 3 && extraction.relations?.length >= 2) {
            if (this._learnSubgraphPattern(extraction)) {
                learned.subgraphs++;
            }
        }

        return {
            learned: learned.entities + learned.relations + learned.subgraphs > 0,
            ...learned
        };
    }

    /**
     * Learn entity pattern from example
     */
    _learnEntityPattern(text, entity) {
        const signature = `${entity.type}:${this._extractNamePattern(entity.name)}`;

        if (!this.learningBuffer.entities.has(signature)) {
            this.learningBuffer.entities.set(signature, {
                count: 0,
                type: entity.type,
                names: [],
                contexts: []
            });
        }

        const buffer = this.learningBuffer.entities.get(signature);
        buffer.count++;
        buffer.names.push(entity.name);

        const ctx = this._getContextWindow(text, entity.name, 50);
        if (ctx) {
            buffer.contexts.push(ctx);
        }

        // Promote to pattern if threshold reached
        if (buffer.count >= this.options.learningThreshold) {
            this._promoteEntityPattern(signature, buffer);
            return true;
        }

        return false;
    }

    /**
     * Learn relation pattern from example
     */
    _learnRelationPattern(text, relation, entities) {
        const subj = (entities || []).find(e => e.name === relation.subject);
        const obj = (entities || []).find(e => e.name === relation.object);

        if (!subj || !obj) return false;

        const predicate = relation.predicate || relation.type;
        const signature = `${subj.type}:${predicate}:${obj.type}`;

        if (!this.learningBuffer.relations.has(signature)) {
            this.learningBuffer.relations.set(signature, {
                count: 0,
                subjectType: subj.type,
                objectType: obj.type,
                predicate,
                verbs: []
            });
        }

        const buffer = this.learningBuffer.relations.get(signature);
        buffer.count++;

        const verb = this._extractVerbBetween(text, subj.name, obj.name);
        if (verb) {
            buffer.verbs.push(verb);
        }

        if (buffer.count >= this.options.learningThreshold) {
            this._promoteRelationPattern(signature, buffer);
            return true;
        }

        return false;
    }

    /**
     * Learn subgraph pattern from extraction
     */
    _learnSubgraphPattern(extraction) {
        const entityTypes = [...new Set(extraction.entities.map(e => e.type))].sort();
        const relationTypes = [...new Set(extraction.relations.map(r => r.predicate))].sort();
        const signature = `${entityTypes.join(',')}|${relationTypes.join(',')}`;

        if (!this.learningBuffer.subgraphs.has(signature)) {
            this.learningBuffer.subgraphs.set(signature, {
                count: 0,
                entityTypes,
                relationTypes
            });
        }

        const buffer = this.learningBuffer.subgraphs.get(signature);
        buffer.count++;

        if (buffer.count >= this.options.learningThreshold) {
            this._promoteSubgraphPattern(signature, buffer);
            return true;
        }

        return false;
    }

    /**
     * Promote buffered entity data to a registered pattern
     */
    _promoteEntityPattern(signature, buffer) {
        const namePatterns = [...new Set(
            buffer.names.map(n => this._extractNamePattern(n))
        )].slice(0, 5);

        const contextKeywords = this._extractCommonKeywords(buffer.contexts);

        this.registerEntityPattern({
            name: `learned_${buffer.type.toLowerCase()}_${Date.now()}`,
            entityType: buffer.type,
            namePatterns,
            contextKeywords,
            source: 'learned',
            confidence: 0.7,
            priority: 4
        });

        this.learningBuffer.entities.delete(signature);
        logger.info(`Promoted learned entity pattern for type: ${buffer.type}`);
    }

    /**
     * Promote buffered relation data to a registered pattern
     */
    _promoteRelationPattern(signature, buffer) {
        const verbPatterns = [...new Set(
            buffer.verbs.filter(Boolean).map(v =>
                v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            )
        )].slice(0, 5);

        this.registerRelationPattern({
            name: `learned_${buffer.predicate.toLowerCase()}_${Date.now()}`,
            relationType: buffer.predicate,
            subjectTypes: [buffer.subjectType],
            objectTypes: [buffer.objectType],
            verbPatterns,
            source: 'learned',
            confidence: 0.7,
            priority: 4
        });

        this.learningBuffer.relations.delete(signature);
        logger.info(`Promoted learned relation pattern for type: ${buffer.predicate}`);
    }

    /**
     * Promote buffered subgraph data to a registered pattern
     */
    _promoteSubgraphPattern(signature, buffer) {
        this.registerSubgraphPattern({
            name: `learned_subgraph_${Date.now()}`,
            nodeTypes: buffer.entityTypes,
            edgeTypes: buffer.relationTypes,
            structure: 'custom',
            source: 'learned',
            confidence: 0.7,
            priority: 4
        });

        this.learningBuffer.subgraphs.delete(signature);
        logger.info(`Promoted learned subgraph pattern`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract regex pattern from entity name
     */
    _extractNamePattern(name) {
        // Detect ID patterns like #123 or @john
        if (/[#@]\d+/.test(name)) {
            return name.replace(/\d+/g, '\\d+');
        }
        // Detect proper names (First Last)
        if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(name)) {
            return '[A-Z][a-z]+(\\s+[A-Z][a-z]+)+';
        }
        // Detect acronyms
        if (/^[A-Z]{2,}$/.test(name)) {
            return '[A-Z]{2,}';
        }
        // Escape special characters
        return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get context window around target text
     */
    _getContextWindow(text, target, size) {
        const idx = text.toLowerCase().indexOf(target.toLowerCase());
        if (idx === -1) return null;
        return text.slice(
            Math.max(0, idx - size),
            Math.min(text.length, idx + target.length + size)
        );
    }

    /**
     * Extract common keywords from context samples
     */
    _extractCommonKeywords(contexts) {
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'to', 'of', 'in', 'for', 'on', 'with',
            'at', 'by', 'from', 'as', 'and', 'or', 'but', 'if',
            'this', 'that'
        ]);

        const wordCount = new Map();

        for (const ctx of contexts) {
            const words = (ctx.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
            for (const w of words) {
                if (!stopWords.has(w)) {
                    wordCount.set(w, (wordCount.get(w) || 0) + 1);
                }
            }
        }

        const threshold = Math.max(2, contexts.length * 0.5);
        return [...wordCount.entries()]
            .filter(([_, c]) => c >= threshold)
            .map(([w]) => w)
            .slice(0, 10);
    }

    /**
     * Extract verb pattern between two entity mentions
     */
    _extractVerbBetween(text, subj, obj) {
        const tl = text.toLowerCase();
        const si = tl.indexOf(subj.toLowerCase());
        const oi = tl.indexOf(obj.toLowerCase());

        if (si === -1 || oi === -1) return null;

        const start = Math.min(si + subj.length, oi + obj.length);
        const end = Math.max(si, oi);

        if (end <= start) return null;

        const between = text.slice(start, end).trim();

        // Common verb patterns
        const patterns = [
            /\b(assigned\s+to)\b/i,
            /\b(depends\s+on)\b/i,
            /\b(created\s+by)\b/i,
            /\b(uses)\b/i,
            /\b(contains)\b/i,
            /\b(belongs\s+to)\b/i,
            /\b(manages)\b/i
        ];

        for (const p of patterns) {
            const m = between.match(p);
            if (m) return m[1];
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INDEX & UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Index pattern by domain for fast lookup
     */
    _indexByDomain(pattern, type) {
        const domain = pattern.domain || 'general';

        if (!this.domainIndex.has(domain)) {
            this.domainIndex.set(domain, {
                entities: new Set(),
                relations: new Set(),
                subgraphs: new Set()
            });
        }

        this.domainIndex.get(domain)[type].add(pattern.id);
    }

    /**
     * Get candidate patterns for a domain
     */
    _getCandidatePatterns(type, domain) {
        const candidates = new Set();

        // Add domain-specific patterns
        if (domain && this.domainIndex.has(domain)) {
            for (const id of this.domainIndex.get(domain)[type]) {
                candidates.add(id);
            }
        }

        // Always include general patterns
        if (this.domainIndex.has('general')) {
            for (const id of this.domainIndex.get('general')[type]) {
                candidates.add(id);
            }
        }

        return candidates;
    }

    /**
     * Deduplicate entities by name
     */
    _deduplicateEntities(entities) {
        const seen = new Map();

        for (const e of entities) {
            const key = e.name.toLowerCase();
            if (!seen.has(key) || seen.get(key).confidence < e.confidence) {
                seen.set(key, e);
            }
        }

        return [...seen.values()];
    }

    /**
     * Deduplicate relations
     */
    _deduplicateRelations(relations) {
        const seen = new Map();

        for (const r of relations) {
            const key = `${r.subject}|${r.predicate}|${r.object}`.toLowerCase();
            if (!seen.has(key) || seen.get(key).confidence < r.confidence) {
                seen.set(key, r);
            }
        }

        return [...seen.values()];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATS & EXPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get library statistics
     */
    getStats() {
        return {
            entityPatterns: this.entityPatterns.size,
            relationPatterns: this.relationPatterns.size,
            subgraphPatterns: this.subgraphPatterns.size,
            total: this.entityPatterns.size + this.relationPatterns.size + this.subgraphPatterns.size,
            learningBuffer: {
                entities: this.learningBuffer.entities.size,
                relations: this.learningBuffer.relations.size,
                subgraphs: this.learningBuffer.subgraphs.size
            }
        };
    }

    /**
     * Get pattern by ID
     */
    getPattern(id) {
        return this.entityPatterns.get(id) ||
            this.relationPatterns.get(id) ||
            this.subgraphPatterns.get(id);
    }

    /**
     * Get pattern recommendations based on usage
     */
    getRecommendations(context = {}) {
        const recs = [];

        for (const p of this.entityPatterns.values()) {
            if (context.domain && p.domain !== context.domain && p.domain !== 'general') {
                continue;
            }
            if (p.stats.matches > 0) {
                recs.push({
                    type: 'entity',
                    name: p.name,
                    entityType: p.entityType,
                    matches: p.stats.matches,
                    successRate: p.getSuccessRate()
                });
            }
        }

        for (const p of this.relationPatterns.values()) {
            if (context.domain && p.domain !== context.domain && p.domain !== 'general') {
                continue;
            }
            if (p.stats.matches > 0) {
                recs.push({
                    type: 'relation',
                    name: p.name,
                    relationType: p.relationType,
                    matches: p.stats.matches,
                    successRate: p.getSuccessRate()
                });
            }
        }

        return recs.sort((a, b) => b.successRate - a.successRate).slice(0, 15);
    }

    /**
     * Export all patterns to JSON
     */
    export() {
        return {
            version: '1.0',
            entityPatterns: [...this.entityPatterns.values()].map(p => p.toJSON()),
            relationPatterns: [...this.relationPatterns.values()].map(p => p.toJSON()),
            subgraphPatterns: [...this.subgraphPatterns.values()].map(p => p.toJSON()),
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import patterns from JSON
     */
    import(data, merge = true) {
        if (!merge) {
            this.clear();
        }

        let imported = { entities: 0, relations: 0, subgraphs: 0 };

        for (const p of data.entityPatterns || []) {
            this.registerEntityPattern({ ...p, source: 'imported' });
            imported.entities++;
        }

        for (const p of data.relationPatterns || []) {
            this.registerRelationPattern({ ...p, source: 'imported' });
            imported.relations++;
        }

        for (const p of data.subgraphPatterns || []) {
            this.registerSubgraphPattern({ ...p, source: 'imported' });
            imported.subgraphs++;
        }

        logger.info(`Imported ${imported.entities + imported.relations + imported.subgraphs} patterns`);
        return imported;
    }

    /**
     * Clear all patterns
     */
    clear() {
        this.entityPatterns.clear();
        this.relationPatterns.clear();
        this.subgraphPatterns.clear();
        this.domainIndex.clear();
        this.learningBuffer.entities.clear();
        this.learningBuffer.relations.clear();
        this.learningBuffer.subgraphs.clear();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEFAULT PATTERNS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Load default patterns for common extraction scenarios
     */
    _loadDefaultPatterns() {
        // ─────────────────────────────────────────────────────────────────────────
        // Entity Patterns
        // ─────────────────────────────────────────────────────────────────────────

        this.registerEntityPattern({
            name: 'person_name',
            entityType: 'Person',
            namePatterns: ['[A-Z][a-z]+\\s+[A-Z][a-z]+'],
            contextKeywords: ['manager', 'director', 'engineer', 'analyst', 'team', 'lead'],
            priority: 7
        });

        this.registerEntityPattern({
            name: 'person_with_title',
            entityType: 'Person',
            namePatterns: ['(?:Mr|Ms|Mrs|Dr|Prof)\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?'],
            priority: 8
        });

        this.registerEntityPattern({
            name: 'work_item',
            entityType: 'WorkItem',
            domain: 'devops',
            namePatterns: ['(?:Bug|Task|Feature|Story|Issue)\\s*#?\\d+', '#\\d{4,}'],
            contextKeywords: ['assigned', 'created', 'resolved', 'sprint', 'backlog'],
            priority: 9
        });

        this.registerEntityPattern({
            name: 'system_name',
            entityType: 'System',
            namePatterns: ['\\b[A-Z]{2,6}\\b', '[A-Z][a-z]+(?:System|Platform|Application)'],
            contextKeywords: ['system', 'platform', 'application', 'database', 'server'],
            priority: 6
        });

        this.registerEntityPattern({
            name: 'organization',
            entityType: 'Organization',
            namePatterns: ['[A-Z][a-z]+\\s+(?:Department|Division|Office|Team)'],
            contextKeywords: ['department', 'team', 'unit', 'organization'],
            priority: 6
        });

        // ─────────────────────────────────────────────────────────────────────────
        // Relation Patterns
        // ─────────────────────────────────────────────────────────────────────────

        this.registerRelationPattern({
            name: 'assigned_to',
            relationType: 'ASSIGNED_TO',
            subjectTypes: ['WorkItem', 'Task', 'Bug'],
            objectTypes: ['Person', 'Team'],
            verbPatterns: ['assigned\\s+to', 'belongs\\s+to', 'owned\\s+by'],
            priority: 8
        });

        this.registerRelationPattern({
            name: 'depends_on',
            relationType: 'DEPENDS_ON',
            subjectTypes: ['System', 'Module', 'WorkItem'],
            objectTypes: ['System', 'Module', 'API', 'Database'],
            verbPatterns: ['depends\\s+on', 'requires', 'needs', 'relies\\s+on'],
            priority: 7
        });

        this.registerRelationPattern({
            name: 'authored_by',
            relationType: 'AUTHORED_BY',
            subjectTypes: ['Document', 'Commit', 'WorkItem'],
            objectTypes: ['Person'],
            verbPatterns: ['authored\\s+by', 'created\\s+by', 'written\\s+by', 'submitted\\s+by'],
            priority: 7
        });

        this.registerRelationPattern({
            name: 'uses',
            relationType: 'USES',
            subjectTypes: ['System', 'Module', 'Person'],
            objectTypes: ['System', 'API', 'Database', 'Technology'],
            verbPatterns: ['\\buses\\b', 'utilizes', 'leverages'],
            priority: 6
        });

        this.registerRelationPattern({
            name: 'contains',
            relationType: 'CONTAINS',
            subjectTypes: ['System', 'Organization', 'Document'],
            objectTypes: ['Module', 'Person', 'Team'],
            verbPatterns: ['contains', 'includes', 'comprises'],
            priority: 6
        });

        // ─────────────────────────────────────────────────────────────────────────
        // Subgraph Patterns
        // ─────────────────────────────────────────────────────────────────────────

        this.registerSubgraphPattern({
            name: 'work_item_chain',
            description: 'Author->WorkItem->Dependency',
            domain: 'devops',
            structure: 'chain',
            minNodes: 3,
            maxNodes: 5,
            nodeTypes: ['Person', 'WorkItem'],
            edgeTypes: ['AUTHORED_BY', 'DEPENDS_ON'],
            priority: 7
        });

        this.registerSubgraphPattern({
            name: 'system_star',
            description: 'Central system with dependencies',
            structure: 'star',
            minNodes: 4,
            maxNodes: 10,
            nodeTypes: ['System', 'API', 'Database'],
            edgeTypes: ['USES', 'DEPENDS_ON'],
            priority: 6
        });

        logger.info(`Loaded ${this.entityPatterns.size} entity, ${this.relationPatterns.size} relation, ${this.subgraphPatterns.size} subgraph default patterns`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new PatternLibrary instance
 */
function createPatternLibrary(options) {
    return new PatternLibrary(options);
}

// Singleton instance
const patternLibrary = new PatternLibrary();

module.exports = {
    PatternLibrary,
    createPatternLibrary,
    patternLibrary
};
