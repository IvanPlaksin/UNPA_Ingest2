/**
 * Pattern Types for Extraction Pattern Library
 *
 * Defines core pattern classes:
 * - EntityPattern - patterns for extracting entities (regex, keywords, examples)
 * - RelationPattern - patterns for relations (subject/object types, verb patterns)
 * - SubgraphPattern - patterns for graph structures (chain, star, tree, template)
 *
 * @module services/patterns/pattern-types
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY PATTERN CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class EntityPattern {
    constructor(config) {
        this.id = config.id || `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.name = config.name;
        this.entityType = config.entityType;
        this.domain = config.domain || 'general';
        this.namePatterns = config.namePatterns || [];
        this.contextKeywords = config.contextKeywords || [];
        this.examples = config.examples || [];
        this.confidence = config.confidence || 0.8;
        this.priority = config.priority || 5;
        this.source = config.source || 'manual';
        this.createdAt = config.createdAt || new Date().toISOString();
        this.stats = {
            matches: 0,
            successfulExtractions: 0,
            falsePositives: 0,
            ...config.stats
        };
    }

    /**
     * Check if this pattern matches the given text
     */
    matches(text, context = {}) {
        let score = 0;
        const matchDetails = [];

        // Check name patterns (regex)
        for (const pattern of this.namePatterns) {
            try {
                if (new RegExp(pattern, 'gi').test(text)) {
                    score += 0.4;
                    matchDetails.push({ type: 'name_pattern', pattern });
                    break;
                }
            } catch (e) {
                // Invalid regex, skip
            }
        }

        // Check context keywords
        const textLower = text.toLowerCase();
        let keywordHits = 0;
        for (const kw of this.contextKeywords) {
            if (textLower.includes(kw.toLowerCase())) {
                keywordHits++;
            }
        }
        if (this.contextKeywords.length > 0) {
            score += 0.3 * (keywordHits / this.contextKeywords.length);
        }

        // Domain match bonus
        if (context.domain === this.domain) {
            score += 0.2;
        } else if (this.domain === 'general') {
            score += 0.1;
        }

        return {
            matches: score >= 0.3,
            score: Math.min(score, 1),
            details: matchDetails,
            pattern: this
        };
    }

    /**
     * Extract entities from text using this pattern
     */
    extract(text, context = {}) {
        const entities = [];
        const seen = new Set();

        for (const pattern of this.namePatterns) {
            try {
                const regex = new RegExp(pattern, 'gi');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const name = match[0].trim();
                    const key = name.toLowerCase();
                    if (name.length > 1 && !seen.has(key)) {
                        seen.add(key);
                        entities.push({
                            name,
                            type: this.entityType,
                            patternId: this.id,
                            confidence: this.confidence,
                            attributes: this._extractAttributes(text, match.index)
                        });
                    }
                }
            } catch (e) {
                // Invalid regex, skip
            }
        }

        if (entities.length > 0) {
            this.stats.matches++;
        }

        return entities;
    }

    /**
     * Extract additional attributes from context around the entity
     */
    _extractAttributes(text, pos) {
        const attrs = {};
        const ctx = text.slice(Math.max(0, pos - 80), pos + 80);

        // Try to extract role
        const roleMatch = ctx.match(/(?:as|role)[:\s]+([A-Za-z\s]+?)(?:[,.]|$)/i);
        if (roleMatch) {
            attrs.role = roleMatch[1].trim();
        }

        // Try to extract ID
        const idMatch = ctx.match(/#(\d+)/);
        if (idMatch) {
            attrs.id = idMatch[1];
        }

        return attrs;
    }

    /**
     * Record feedback for learning
     */
    recordFeedback(wasCorrect) {
        if (wasCorrect) {
            this.stats.successfulExtractions++;
        } else {
            this.stats.falsePositives++;
        }
    }

    /**
     * Get success rate
     */
    getSuccessRate() {
        const total = this.stats.successfulExtractions + this.stats.falsePositives;
        return total > 0 ? this.stats.successfulExtractions / total : 0;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            entityType: this.entityType,
            domain: this.domain,
            namePatterns: this.namePatterns,
            contextKeywords: this.contextKeywords,
            examples: this.examples,
            confidence: this.confidence,
            priority: this.priority,
            source: this.source,
            createdAt: this.createdAt,
            stats: this.stats
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new EntityPattern(json);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATION PATTERN CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class RelationPattern {
    constructor(config) {
        this.id = config.id || `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.name = config.name;
        this.relationType = config.relationType;
        this.domain = config.domain || 'general';
        this.subjectTypes = config.subjectTypes || [];
        this.objectTypes = config.objectTypes || [];
        this.verbPatterns = config.verbPatterns || [];
        this.maxDistance = config.maxDistance || 200;
        this.examples = config.examples || [];
        this.confidence = config.confidence || 0.8;
        this.priority = config.priority || 5;
        this.source = config.source || 'manual';
        this.createdAt = config.createdAt || new Date().toISOString();
        this.stats = {
            matches: 0,
            successfulExtractions: 0,
            falsePositives: 0,
            ...config.stats
        };
    }

    /**
     * Check if this pattern matches the given text and entities
     */
    matches(text, entities = [], context = {}) {
        let score = 0;
        const matchDetails = [];

        // Check verb patterns
        for (const pattern of this.verbPatterns) {
            try {
                if (new RegExp(pattern, 'gi').test(text)) {
                    score += 0.4;
                    matchDetails.push({ type: 'verb_pattern', pattern });
                    break;
                }
            } catch (e) {
                // Invalid regex, skip
            }
        }

        // Check entity type compatibility
        const subjects = entities.filter(e =>
            !this.subjectTypes.length || this.subjectTypes.includes(e.type)
        );
        const objects = entities.filter(e =>
            !this.objectTypes.length || this.objectTypes.includes(e.type)
        );

        if (subjects.length > 0 && objects.length > 0) {
            score += 0.3;
            matchDetails.push({
                type: 'entity_types',
                subjects: subjects.length,
                objects: objects.length
            });
        }

        // Domain match bonus
        if (context.domain === this.domain) {
            score += 0.15;
        }

        return {
            matches: score >= 0.35,
            score: Math.min(score, 1),
            details: matchDetails,
            pattern: this,
            candidates: { subjects, objects }
        };
    }

    /**
     * Extract relations from text using this pattern
     */
    extract(text, entities, context = {}) {
        const matchResult = this.matches(text, entities, context);
        if (!matchResult.matches) {
            return [];
        }

        const relations = [];
        const seen = new Set();
        const { subjects, objects } = matchResult.candidates;

        for (const subj of subjects) {
            for (const obj of objects) {
                if (subj.name === obj.name) continue;

                const conn = this._checkConnection(text, subj, obj);
                if (conn.connected) {
                    const key = `${subj.name}|${this.relationType}|${obj.name}`.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        relations.push({
                            subject: subj.name,
                            subjectType: subj.type,
                            predicate: this.relationType,
                            object: obj.name,
                            objectType: obj.type,
                            patternId: this.id,
                            confidence: matchResult.score * this.confidence * conn.score
                        });
                    }
                }
            }
        }

        if (relations.length > 0) {
            this.stats.matches++;
        }

        return relations;
    }

    /**
     * Check if two entities are connected in the text
     */
    _checkConnection(text, subj, obj) {
        const tl = text.toLowerCase();
        const si = tl.indexOf(subj.name.toLowerCase());
        const oi = tl.indexOf(obj.name.toLowerCase());

        if (si === -1 || oi === -1) {
            return { connected: false };
        }

        const dist = Math.abs(si - oi);
        if (dist > this.maxDistance) {
            return { connected: false };
        }

        const start = Math.min(si, oi);
        const end = Math.max(si + subj.name.length, oi + obj.name.length);
        const between = text.slice(start, end);

        // Check if verb pattern appears between entities
        for (const pattern of this.verbPatterns) {
            try {
                if (new RegExp(pattern, 'gi').test(between)) {
                    return {
                        connected: true,
                        score: 1 - (dist / this.maxDistance) * 0.3
                    };
                }
            } catch (e) {
                // Invalid regex, skip
            }
        }

        return { connected: false };
    }

    /**
     * Record feedback for learning
     */
    recordFeedback(wasCorrect) {
        if (wasCorrect) {
            this.stats.successfulExtractions++;
        } else {
            this.stats.falsePositives++;
        }
    }

    /**
     * Get success rate
     */
    getSuccessRate() {
        const total = this.stats.successfulExtractions + this.stats.falsePositives;
        return total > 0 ? this.stats.successfulExtractions / total : 0;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            relationType: this.relationType,
            domain: this.domain,
            subjectTypes: this.subjectTypes,
            objectTypes: this.objectTypes,
            verbPatterns: this.verbPatterns,
            maxDistance: this.maxDistance,
            examples: this.examples,
            confidence: this.confidence,
            priority: this.priority,
            source: this.source,
            createdAt: this.createdAt,
            stats: this.stats
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new RelationPattern(json);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBGRAPH PATTERN CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class SubgraphPattern {
    constructor(config) {
        this.id = config.id || `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.name = config.name;
        this.description = config.description || '';
        this.domain = config.domain || 'general';
        this.structure = config.structure || 'custom'; // chain, star, tree, template, custom
        this.minNodes = config.minNodes || 2;
        this.maxNodes = config.maxNodes || 10;
        this.nodeTypes = config.nodeTypes || [];
        this.edgeTypes = config.edgeTypes || [];
        this.template = config.template || null;
        this.examples = config.examples || [];
        this.confidence = config.confidence || 0.8;
        this.priority = config.priority || 5;
        this.source = config.source || 'manual';
        this.createdAt = config.createdAt || new Date().toISOString();
        this.stats = {
            matches: 0,
            ...config.stats
        };
    }

    /**
     * Check if entities and relations match this subgraph pattern
     */
    matches(entities, relations, context = {}) {
        // Check node count constraints
        if (entities.length < this.minNodes || entities.length > this.maxNodes) {
            return {
                matches: false,
                score: 0,
                pattern: this,
                reason: 'size_mismatch'
            };
        }

        // Use template matching if template is defined
        if (this.template) {
            return this._matchTemplate(entities, relations);
        }

        // Otherwise use structure-based matching
        return this._matchStructure(entities, relations);
    }

    /**
     * Match against template definition
     */
    _matchTemplate(entities, relations) {
        let score = 0;

        // Check entity types coverage
        const entityTypes = new Set(entities.map(e => e.type));
        const requiredTypes = new Set(this.template.nodes.map(n => n.type));
        const typeOverlap = [...requiredTypes].filter(t => entityTypes.has(t)).length;
        score += (typeOverlap / requiredTypes.size) * 0.5;

        // Check relation types coverage
        const relTypes = new Set(relations.map(r => r.predicate || r.type));
        const reqRels = new Set(this.template.edges.map(e => e.type));
        const relOverlap = [...reqRels].filter(r => relTypes.has(r)).length;
        score += (reqRels.size > 0 ? relOverlap / reqRels.size : 1) * 0.5;

        return {
            matches: score >= 0.5,
            score,
            pattern: this
        };
    }

    /**
     * Match against structural patterns (chain, star, tree)
     */
    _matchStructure(entities, relations) {
        switch (this.structure) {
            case 'chain':
                return this._matchChain(relations);
            case 'star':
                return this._matchStar(relations);
            case 'tree':
                return this._matchTree(relations);
            default:
                return this._matchGeneric(entities, relations);
        }
    }

    /**
     * Match chain structure (linear sequence)
     */
    _matchChain(relations) {
        if (relations.length < 1) {
            return { matches: false, score: 0, pattern: this };
        }

        const out = new Map();
        const inc = new Map();

        for (const r of relations) {
            const s = r.subject || r.source;
            const o = r.object || r.target;
            if (!out.has(s)) out.set(s, []);
            out.get(s).push(o);
            if (!inc.has(o)) inc.set(o, []);
            inc.get(o).push(s);
        }

        const nodes = new Set([...out.keys(), ...inc.keys()]);
        const starts = [...nodes].filter(n => !inc.has(n) && out.has(n));
        const ends = [...nodes].filter(n => inc.has(n) && !out.has(n));

        if (starts.length === 1 && ends.length === 1) {
            return {
                matches: true,
                score: 0.8,
                pattern: this,
                details: { structure: 'chain' }
            };
        }

        return { matches: false, score: 0.2, pattern: this };
    }

    /**
     * Match star structure (one central hub)
     */
    _matchStar(relations) {
        if (relations.length < 2) {
            return { matches: false, score: 0, pattern: this };
        }

        const degree = new Map();

        for (const r of relations) {
            const s = r.subject || r.source;
            const o = r.object || r.target;
            degree.set(s, (degree.get(s) || 0) + 1);
            degree.set(o, (degree.get(o) || 0) + 1);
        }

        let hub = null;
        let maxDeg = 0;
        for (const [n, d] of degree) {
            if (d > maxDeg) {
                maxDeg = d;
                hub = n;
            }
        }

        if (maxDeg >= 3) {
            return {
                matches: true,
                score: 0.8,
                pattern: this,
                details: { structure: 'star', hub, degree: maxDeg }
            };
        }

        return { matches: false, score: 0.2, pattern: this };
    }

    /**
     * Match tree structure (n nodes, n-1 edges, connected)
     */
    _matchTree(relations) {
        const nodes = new Set();
        for (const r of relations) {
            nodes.add(r.subject || r.source);
            nodes.add(r.object || r.target);
        }

        // Tree has exactly n-1 edges for n nodes
        if (relations.length === nodes.size - 1) {
            return {
                matches: true,
                score: 0.8,
                pattern: this,
                details: { structure: 'tree' }
            };
        }

        return { matches: false, score: 0.3, pattern: this };
    }

    /**
     * Match generic pattern by node/edge type coverage
     */
    _matchGeneric(entities, relations) {
        let score = 0;

        // Check node type coverage
        if (this.nodeTypes.length > 0) {
            const types = new Set(entities.map(e => e.type));
            const overlap = this.nodeTypes.filter(t => types.has(t)).length;
            score += 0.5 * (overlap / this.nodeTypes.length);
        } else {
            score += 0.25;
        }

        // Check edge type coverage
        if (this.edgeTypes.length > 0) {
            const types = new Set(relations.map(r => r.predicate || r.type));
            const overlap = this.edgeTypes.filter(t => types.has(t)).length;
            score += 0.5 * (overlap / this.edgeTypes.length);
        } else {
            score += 0.25;
        }

        return {
            matches: score >= 0.5,
            score,
            pattern: this
        };
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            domain: this.domain,
            structure: this.structure,
            minNodes: this.minNodes,
            maxNodes: this.maxNodes,
            nodeTypes: this.nodeTypes,
            edgeTypes: this.edgeTypes,
            template: this.template,
            examples: this.examples,
            confidence: this.confidence,
            priority: this.priority,
            source: this.source,
            createdAt: this.createdAt,
            stats: this.stats
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new SubgraphPattern(json);
    }
}

module.exports = {
    EntityPattern,
    RelationPattern,
    SubgraphPattern
};
