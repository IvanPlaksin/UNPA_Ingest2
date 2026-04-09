/**
 * Work Item Entity Extractor
 *
 * Specialized extractor for Azure DevOps Work Items (User Stories, Bugs, Tasks, Features, Epics).
 * Extracts entities from all fields: title, description, acceptanceCriteria, comments.
 * Supports Gherkin (Given-When-Then) and User Story formats.
 *
 * @module services/extraction/work-item-extractor
 * @version 1.0.0
 */

'use strict';

const {
    getRelevantSnippets,
    formatSnippetsForPrompt,
    validateTriple
} = require('./prompts/ontology-snippets');

const {
    getPromptForWorkItemType,
    buildGherkinPrompt,
    buildTitlePrompt,
    buildDescriptionPrompt,
    buildCommentPrompt,
    hasGherkinFormat,
    hasUserStoryFormat,
    parseUserStoryFormat,
    parseGherkinFormat
} = require('./prompts/work-item-prompts');

const {
    extractEntitiesWithLLM,
    isLLMAvailable,
    getActiveProviderName
} = require('./llm-provider');

const { parseJSONResponse } = require('./prompts/entity-extraction');

// ═══════════════════════════════════════════════════════════════════════════════
// WORK ITEM EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Specialized entity extractor for Work Items
 * @class
 */
class WorkItemExtractor {
    /**
     * Create WorkItemExtractor instance
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.options = {
            useLLM: options.useLLM ?? true,
            includeComments: options.includeComments ?? true,
            maxComments: options.maxComments ?? 10,
            minTextLength: options.minTextLength ?? 20,
            confidenceThreshold: options.confidenceThreshold ?? 0.5,
            ...options
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN EXTRACTION METHOD
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities from a Work Item
     * @param {Object} workItem - Work Item object from Azure DevOps
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Extraction result
     */
    async extract(workItem, options = {}) {
        if (!workItem || !workItem.id) {
            return this._emptyResult();
        }

        const mergedOptions = { ...this.options, ...options };
        const startTime = Date.now();

        const result = {
            workItemId: workItem.id,
            workItemType: workItem.type || 'Unknown',
            entities: [],
            relationships: [],
            businessRules: [],
            userStory: null,
            scenarios: [],
            sources: {
                title: 0,
                description: 0,
                acceptanceCriteria: 0,
                comments: 0,
                implicit: 0
            },
            stats: {
                llmProvider: 'none',
                duration: 0,
                fieldsProcessed: 0
            }
        };

        try {
            // 1. Extract from title (high priority, usually concise)
            const titleEntities = await this._extractFromTitle(workItem);
            this._addEntities(result, titleEntities, 'title');

            // 2. Extract from description
            const descEntities = await this._extractFromDescription(workItem, mergedOptions);
            this._addEntities(result, descEntities, 'description');

            // 3. Extract from acceptance criteria
            const acResult = await this._extractFromAcceptanceCriteria(workItem, mergedOptions);
            this._addEntities(result, acResult.entities, 'acceptanceCriteria');
            result.scenarios = acResult.scenarios || [];
            result.businessRules.push(...(acResult.businessRules || []));

            // 4. Parse User Story format if present
            const userStory = this._parseUserStory(workItem);
            if (userStory) {
                result.userStory = userStory;
                this._addEntities(result, userStory.entities || [], 'userStory');
            }

            // 5. Extract from comments (if enabled)
            if (mergedOptions.includeComments && workItem.comments?.length > 0) {
                const commentEntities = await this._extractFromComments(
                    workItem.comments.slice(0, mergedOptions.maxComments),
                    mergedOptions
                );
                this._addEntities(result, commentEntities, 'comments');
            }

            // 6. Extract implicit entities from metadata
            const implicitEntities = this._extractImplicitEntities(workItem);
            this._addEntities(result, implicitEntities, 'implicit');

            // 7. Create relationships between work item and extracted entities
            result.relationships = this._buildRelationships(workItem, result.entities);

            // 8. Deduplicate entities
            result.entities = this._mergeAndDeduplicate(result.entities);

            // 9. Filter by confidence
            result.entities = result.entities.filter(
                e => (e.confidence || 0.5) >= mergedOptions.confidenceThreshold
            );

            // Update stats
            result.stats.duration = Date.now() - startTime;
            result.stats.llmProvider = getActiveProviderName() || 'none';
            result.stats.fieldsProcessed = Object.values(result.sources).filter(v => v > 0).length;

        } catch (error) {
            console.error(`[WorkItemExtractor] Error extracting from WI ${workItem.id}:`, error.message);
            result.error = error.message;
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FIELD EXTRACTORS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities from Work Item title
     * @private
     */
    async _extractFromTitle(workItem) {
        const title = workItem.title;
        if (!title || title.length < 5) {
            return [];
        }

        const entities = [];

        // Quick regex extraction for common patterns
        const patterns = {
            workItemRef: /#(\d{4,6})\b/g,
            systemRef: /\b(Umoja|IMIS|Inspira|SAP|Oracle|ServiceNow)\b/gi,
            moduleRef: /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)(?:Service|Module|Controller|Manager)\b/g
        };

        // Extract Work Item references
        let match;
        while ((match = patterns.workItemRef.exec(title)) !== null) {
            entities.push({
                name: `#${match[1]}`,
                type: 'WorkItem',
                normalizedForm: `WI-${match[1]}`,
                confidence: 0.99,
                source: 'title',
                workItemId: workItem.id
            });
        }

        // Extract system references
        while ((match = patterns.systemRef.exec(title)) !== null) {
            entities.push({
                name: match[0],
                type: 'System',
                normalizedForm: match[0].toLowerCase(),
                confidence: 0.95,
                source: 'title',
                workItemId: workItem.id
            });
        }

        // LLM extraction for more context if available
        if (this.options.useLLM && title.length >= 20) {
            try {
                const llmResult = await extractEntitiesWithLLM(title, {
                    sourceType: 'workitem_title',
                    isCode: false
                });

                for (const e of (llmResult.entities || [])) {
                    entities.push({
                        ...e,
                        source: 'title',
                        workItemId: workItem.id
                    });
                }
            } catch (error) {
                console.warn(`[WorkItemExtractor] Title LLM extraction failed:`, error.message);
            }
        }

        return entities;
    }

    /**
     * Extract entities from Work Item description
     * @private
     */
    async _extractFromDescription(workItem, options) {
        let description = workItem.description || '';
        if (!description || description.length < this.options.minTextLength) {
            return [];
        }

        // Strip HTML if present
        description = this._stripHtml(description);

        const entities = [];

        // Get relevant ontology snippets for this content
        const relevantSnippets = getRelevantSnippets(description, {
            maxSnippets: 6,
            context: 'workitem'
        });

        // Get work item type specific prompt
        const typeConfig = getPromptForWorkItemType(workItem.type);

        if (this.options.useLLM && description.length >= 50) {
            try {
                const ontologyGuidance = formatSnippetsForPrompt(relevantSnippets, {
                    includeExamples: true,
                    includeHints: true
                });

                const llmResult = await extractEntitiesWithLLM(description, {
                    sourceType: 'workitem_description',
                    isCode: false,
                    systemContext: typeConfig.systemPrompt
                });

                for (const e of (llmResult.entities || [])) {
                    entities.push({
                        ...e,
                        source: 'description',
                        workItemId: workItem.id
                    });
                }
            } catch (error) {
                console.warn(`[WorkItemExtractor] Description LLM extraction failed:`, error.message);
            }
        }

        // Fallback: regex extraction for known patterns
        const regexEntities = this._extractWithPatterns(description, 'description', workItem.id);
        entities.push(...regexEntities);

        return entities;
    }

    /**
     * Extract from Acceptance Criteria (supports Gherkin format)
     * @private
     */
    async _extractFromAcceptanceCriteria(workItem, options) {
        const ac = workItem.acceptanceCriteria || workItem.acceptance_criteria || '';
        if (!ac || ac.length < 10) {
            return { entities: [], scenarios: [], businessRules: [] };
        }

        const cleanAC = this._stripHtml(ac);
        const result = {
            entities: [],
            scenarios: [],
            businessRules: []
        };

        // Check for Gherkin format
        if (hasGherkinFormat(cleanAC)) {
            // Parse Gherkin with regex first (fast, always available)
            const gherkinResult = parseGherkinFormat(cleanAC);
            result.scenarios = gherkinResult.scenarios;

            // Extract entities from Gherkin scenarios
            for (const scenario of result.scenarios) {
                // Actors from Given clauses
                for (const given of scenario.given) {
                    const actors = this._extractActorsFromText(given);
                    result.entities.push(...actors.map(a => ({
                        ...a,
                        source: 'acceptanceCriteria',
                        context: `Given: ${given}`,
                        workItemId: workItem.id
                    })));
                }

                // Systems from When clauses
                for (const when of scenario.when) {
                    const systems = this._extractSystemsFromText(when);
                    result.entities.push(...systems.map(s => ({
                        ...s,
                        source: 'acceptanceCriteria',
                        context: `When: ${when}`,
                        workItemId: workItem.id
                    })));
                }
            }

            // LLM enhancement for Gherkin
            if (this.options.useLLM) {
                try {
                    const prompt = buildGherkinPrompt(cleanAC);
                    const llmResult = await extractEntitiesWithLLM(prompt, {
                        sourceType: 'gherkin_ac'
                    });

                    for (const e of (llmResult.entities || [])) {
                        result.entities.push({
                            ...e,
                            source: 'acceptanceCriteria',
                            workItemId: workItem.id
                        });
                    }
                } catch (error) {
                    console.warn(`[WorkItemExtractor] Gherkin LLM extraction failed:`, error.message);
                }
            }
        } else {
            // Non-Gherkin AC - regular extraction
            if (this.options.useLLM && cleanAC.length >= 50) {
                try {
                    const llmResult = await extractEntitiesWithLLM(cleanAC, {
                        sourceType: 'acceptance_criteria',
                        isCode: false
                    });

                    for (const e of (llmResult.entities || [])) {
                        result.entities.push({
                            ...e,
                            source: 'acceptanceCriteria',
                            workItemId: workItem.id
                        });
                    }
                } catch (error) {
                    console.warn(`[WorkItemExtractor] AC LLM extraction failed:`, error.message);
                }
            }

            // Regex fallback
            const regexEntities = this._extractWithPatterns(cleanAC, 'acceptanceCriteria', workItem.id);
            result.entities.push(...regexEntities);
        }

        return result;
    }

    /**
     * Parse User Story format (As a X, I want Y, so that Z)
     * @private
     */
    _parseUserStory(workItem) {
        const text = `${workItem.title || ''} ${workItem.description || ''}`;

        if (!hasUserStoryFormat(text)) {
            return null;
        }

        const parsed = parseUserStoryFormat(text);
        if (!parsed) {
            return null;
        }

        // Create entities from parsed User Story
        const entities = [];

        // Actor entity
        if (parsed.actor?.role) {
            entities.push({
                name: parsed.actor.role,
                type: 'Person',
                normalizedForm: parsed.actor.role.toLowerCase().replace(/\s+/g, '_'),
                confidence: 0.85,
                attributes: { role: 'actor' },
                source: 'userStoryFormat',
                workItemId: workItem.id
            });
        }

        return {
            ...parsed,
            entities
        };
    }

    /**
     * Extract from Work Item comments
     * @private
     */
    async _extractFromComments(comments, options) {
        if (!comments || comments.length === 0) {
            return [];
        }

        const entities = [];

        for (const comment of comments) {
            const text = this._stripHtml(comment.text || comment.body || '');
            if (text.length < 20) {
                continue;
            }

            // LLM extraction
            if (this.options.useLLM) {
                try {
                    const llmResult = await extractEntitiesWithLLM(text, {
                        sourceType: 'workitem_comment'
                    });

                    for (const e of (llmResult.entities || [])) {
                        entities.push({
                            ...e,
                            source: 'comment',
                            commentId: comment.id,
                            workItemId: comment.workItemId
                        });
                    }
                } catch (error) {
                    console.warn(`[WorkItemExtractor] Comment extraction failed:`, error.message);
                }
            }

            // Regex fallback
            const regexEntities = this._extractWithPatterns(text, 'comment', comment.workItemId);
            entities.push(...regexEntities);
        }

        return entities;
    }

    /**
     * Extract implicit entities from Work Item metadata
     * @private
     */
    _extractImplicitEntities(workItem) {
        const entities = [];

        // Assigned To
        if (workItem.assignedTo) {
            const assignee = typeof workItem.assignedTo === 'string'
                ? workItem.assignedTo
                : workItem.assignedTo.displayName || workItem.assignedTo.name;

            if (assignee) {
                entities.push({
                    name: assignee,
                    type: 'Person',
                    normalizedForm: assignee.toLowerCase().replace(/\s+/g, '_'),
                    confidence: 1.0,
                    attributes: {
                        role: 'assignee',
                        email: workItem.assignedTo?.uniqueName || workItem.assignedTo?.email
                    },
                    source: 'implicit',
                    workItemId: workItem.id
                });
            }
        }

        // Created By
        if (workItem.createdBy) {
            const creator = typeof workItem.createdBy === 'string'
                ? workItem.createdBy
                : workItem.createdBy.displayName || workItem.createdBy.name;

            if (creator) {
                entities.push({
                    name: creator,
                    type: 'Person',
                    normalizedForm: creator.toLowerCase().replace(/\s+/g, '_'),
                    confidence: 1.0,
                    attributes: {
                        role: 'author',
                        email: workItem.createdBy?.uniqueName || workItem.createdBy?.email
                    },
                    source: 'implicit',
                    workItemId: workItem.id
                });
            }
        }

        // Area Path → Team/Organization
        if (workItem.areaPath) {
            const parts = workItem.areaPath.split('\\').filter(p => p && p.length > 2);
            for (let i = 0; i < parts.length; i++) {
                entities.push({
                    name: parts[i],
                    type: i === 0 ? 'Organization' : 'Team',
                    normalizedForm: parts[i].toLowerCase().replace(/\s+/g, '_'),
                    confidence: 0.9,
                    attributes: {
                        areaPath: workItem.areaPath,
                        level: i
                    },
                    source: 'implicit',
                    workItemId: workItem.id
                });
            }
        }

        // Tags
        if (workItem.tags) {
            const tags = workItem.tags.split(';').map(t => t.trim()).filter(Boolean);
            for (const tag of tags) {
                // Try to infer tag type
                const tagType = this._inferTagType(tag);
                entities.push({
                    name: tag,
                    type: tagType,
                    normalizedForm: tag.toLowerCase().replace(/\s+/g, '_'),
                    confidence: 0.7,
                    source: 'implicit',
                    workItemId: workItem.id
                });
            }
        }

        return entities;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities using regex patterns
     * @private
     */
    _extractWithPatterns(text, source, workItemId) {
        const entities = [];

        const patterns = {
            // Work Item references
            workItemRef: {
                pattern: /#(\d{4,6})\b/g,
                type: 'WorkItem',
                confidence: 0.99,
                transform: (match) => ({ name: match[0], normalizedForm: `WI-${match[1]}` })
            },
            // System names
            systems: {
                pattern: /\b(Umoja|IMIS|Inspira|SAP|Oracle|ServiceNow|TFS|Azure\s*DevOps|Unite\s*Travel|Unite\s*ID|Qdrant|Memgraph|Neo4j|Redis)\b/gi,
                type: 'System',
                confidence: 0.95,
                transform: (match) => ({ name: match[0], normalizedForm: match[0].toLowerCase().replace(/\s+/g, '_') })
            },
            // Technologies
            technologies: {
                pattern: /\b(React|Vue|Angular|Node\.?js|TypeScript|JavaScript|Python|C#|\.NET|Java|GraphQL|REST\s*API)\b/gi,
                type: 'Technology',
                confidence: 0.90,
                transform: (match) => ({ name: match[0], normalizedForm: match[0].toLowerCase().replace(/[.\s]+/g, '_') })
            },
            // UN Document references
            unDocs: {
                pattern: /\b(ST\/(?:AI|SGB|IC)\/\d{4}\/\d+|A\/RES\/\d+\/\d+|A\/C\.\d+\/\d+\/\d+)\b/gi,
                type: 'Document',
                confidence: 0.97,
                transform: (match) => ({ name: match[0], normalizedForm: match[0].toUpperCase() })
            },
            // Email addresses
            emails: {
                pattern: /\b([a-zA-Z0-9._%+-]+@(?:un\.org|unicef\.org|undp\.org|wfp\.org))\b/gi,
                type: 'Person',
                confidence: 0.95,
                transform: (match) => ({ name: match[0], normalizedForm: match[0].toLowerCase() })
            }
        };

        for (const [key, config] of Object.entries(patterns)) {
            let match;
            while ((match = config.pattern.exec(text)) !== null) {
                const transformed = config.transform(match);
                entities.push({
                    ...transformed,
                    type: config.type,
                    confidence: config.confidence,
                    source,
                    workItemId,
                    patternKey: key
                });
            }
        }

        return entities;
    }

    /**
     * Extract actors from text (for Gherkin parsing)
     * @private
     */
    _extractActorsFromText(text) {
        const actors = [];
        const actorPatterns = [
            /(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|has|have|can|should)\b/i,
            /(?:when\s+)?(?:a|an|the)\s+(\w+(?:\s+\w+)?)\s+/i
        ];

        for (const pattern of actorPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                actors.push({
                    name: match[1],
                    type: 'Person',
                    normalizedForm: match[1].toLowerCase().replace(/\s+/g, '_'),
                    confidence: 0.7
                });
            }
        }

        return actors;
    }

    /**
     * Extract systems from text
     * @private
     */
    _extractSystemsFromText(text) {
        const systems = [];
        const systemPatterns = [
            /\b(Umoja|IMIS|Inspira|SAP|Oracle|ServiceNow|system|application|module)\b/gi,
            /\bthe\s+(\w+)\s+(?:system|module|service|API)\b/gi
        ];

        for (const pattern of systemPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                systems.push({
                    name: match[1] || match[0],
                    type: 'System',
                    normalizedForm: (match[1] || match[0]).toLowerCase(),
                    confidence: 0.75
                });
            }
        }

        return systems;
    }

    /**
     * Infer entity type from tag name
     * @private
     */
    _inferTagType(tag) {
        const tagLower = tag.toLowerCase();

        // Technology patterns
        if (/^(react|vue|angular|node|typescript|javascript|python|java|c#|\.net)/i.test(tag)) {
            return 'Technology';
        }

        // System patterns
        if (/^(umoja|imis|inspira|sap|oracle)/i.test(tag)) {
            return 'System';
        }

        // Priority/Status patterns
        if (/^(urgent|critical|high|medium|low|blocked|ready)/i.test(tag)) {
            return 'Tag';
        }

        // Team/Area patterns
        if (/team|unit|group|dept/i.test(tag)) {
            return 'Team';
        }

        return 'Tag';
    }

    /**
     * Build relationships between Work Item and extracted entities
     * @private
     */
    _buildRelationships(workItem, entities) {
        const relationships = [];
        const workItemId = `wi_${workItem.id}`;

        for (const entity of entities) {
            const relType = this._getRelationshipType(entity);
            relationships.push({
                source: workItemId,
                sourceType: 'WorkItem',
                target: entity.normalizedForm || entity.name,
                targetType: entity.type,
                type: relType,
                confidence: entity.confidence || 0.8,
                evidence: entity.source
            });
        }

        // Parent-child relationships
        if (workItem.parentId) {
            relationships.push({
                source: workItemId,
                sourceType: 'WorkItem',
                target: `wi_${workItem.parentId}`,
                targetType: 'WorkItem',
                type: 'CHILD_OF',
                confidence: 1.0,
                evidence: 'hierarchy'
            });
        }

        return relationships;
    }

    /**
     * Get relationship type based on entity type
     * @private
     */
    _getRelationshipType(entity) {
        const typeMap = {
            'Person': entity.attributes?.role === 'assignee' ? 'ASSIGNED_TO' : 'MENTIONS',
            'Team': 'BELONGS_TO',
            'Organization': 'PART_OF',
            'System': 'REFERENCES',
            'Module': 'REFERENCES',
            'Technology': 'USES',
            'Document': 'REFERENCES',
            'BusinessRule': 'DEFINES',
            'WorkItem': 'RELATES_TO'
        };

        return typeMap[entity.type] || 'MENTIONS';
    }

    /**
     * Merge and deduplicate entities
     * @private
     */
    _mergeAndDeduplicate(entities) {
        const seen = new Map();

        for (const entity of entities) {
            const key = `${entity.type}:${(entity.normalizedForm || entity.name).toLowerCase()}`;

            if (seen.has(key)) {
                const existing = seen.get(key);
                // Keep higher confidence
                if ((entity.confidence || 0) > (existing.confidence || 0)) {
                    existing.confidence = entity.confidence;
                }
                // Merge sources
                existing.sources = existing.sources || [existing.source];
                if (!existing.sources.includes(entity.source)) {
                    existing.sources.push(entity.source);
                    // Boost confidence for multi-source entities
                    existing.confidence = Math.min(0.99, (existing.confidence || 0.5) + 0.05);
                }
                // Merge attributes
                existing.attributes = { ...existing.attributes, ...entity.attributes };
            } else {
                seen.set(key, { ...entity });
            }
        }

        return Array.from(seen.values())
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }

    /**
     * Add entities to result and update source counts
     * @private
     */
    _addEntities(result, entities, source) {
        if (!entities || entities.length === 0) {
            return;
        }

        result.entities.push(...entities);
        result.sources[source] = entities.length;
    }

    /**
     * Strip HTML tags from text
     * @private
     */
    _stripHtml(html) {
        if (!html) return '';
        return html
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Return empty result structure
     * @private
     */
    _emptyResult() {
        return {
            workItemId: null,
            workItemType: null,
            entities: [],
            relationships: [],
            businessRules: [],
            userStory: null,
            scenarios: [],
            sources: {
                title: 0,
                description: 0,
                acceptanceCriteria: 0,
                comments: 0,
                implicit: 0
            },
            stats: {
                llmProvider: 'none',
                duration: 0,
                fieldsProcessed: 0
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities from multiple Work Items
     * @param {Object[]} workItems - Array of Work Items
     * @param {Object} options - Extraction options
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object[]>} Array of extraction results
     */
    async extractAll(workItems, options = {}, onProgress = null) {
        if (!workItems || workItems.length === 0) {
            return [];
        }

        const results = [];
        const total = workItems.length;

        for (let i = 0; i < workItems.length; i++) {
            const result = await this.extract(workItems[i], options);
            results.push(result);

            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total,
                    workItemId: workItems[i].id,
                    entitiesFound: result.entities.length
                });
            }
        }

        return results;
    }

    /**
     * Get aggregated statistics from multiple extraction results
     * @param {Object[]} results - Array of extraction results
     * @returns {Object} Aggregated statistics
     */
    getAggregatedStats(results) {
        if (!results || results.length === 0) {
            return {
                workItemsProcessed: 0,
                totalEntities: 0,
                totalRelationships: 0,
                entitiesByType: {},
                entitiesBySource: {}
            };
        }

        const stats = {
            workItemsProcessed: results.length,
            totalEntities: 0,
            totalRelationships: 0,
            totalBusinessRules: 0,
            userStoriesFound: 0,
            gherkinScenariosFound: 0,
            entitiesByType: {},
            entitiesBySource: {},
            avgEntitiesPerWorkItem: 0,
            avgDuration: 0
        };

        let totalDuration = 0;

        for (const result of results) {
            stats.totalEntities += result.entities.length;
            stats.totalRelationships += result.relationships.length;
            stats.totalBusinessRules += result.businessRules.length;
            totalDuration += result.stats?.duration || 0;

            if (result.userStory) {
                stats.userStoriesFound++;
            }
            stats.gherkinScenariosFound += result.scenarios.length;

            // Count by type
            for (const entity of result.entities) {
                stats.entitiesByType[entity.type] = (stats.entitiesByType[entity.type] || 0) + 1;
            }

            // Count by source
            for (const [source, count] of Object.entries(result.sources)) {
                stats.entitiesBySource[source] = (stats.entitiesBySource[source] || 0) + count;
            }
        }

        stats.avgEntitiesPerWorkItem = (stats.totalEntities / results.length).toFixed(2);
        stats.avgDuration = (totalDuration / results.length).toFixed(0);

        return stats;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY AND EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create WorkItemExtractor instance
 * @param {Object} options - Configuration options
 * @returns {WorkItemExtractor}
 */
function createWorkItemExtractor(options = {}) {
    return new WorkItemExtractor(options);
}

// Default singleton instance
const defaultInstance = new WorkItemExtractor();

module.exports = {
    WorkItemExtractor,
    createWorkItemExtractor,
    default: defaultInstance
};
