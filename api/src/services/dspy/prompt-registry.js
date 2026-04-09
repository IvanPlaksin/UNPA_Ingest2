/**
 * Prompt Registry — Version Control for Prompts
 *
 * Features:
 * - Store multiple versions of prompts
 * - Track performance metrics per version
 * - A/B testing with traffic splitting
 * - Automatic promotion based on metrics
 *
 * @module services/dspy/prompt-registry
 */

'use strict';

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT VERSION CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PromptVersion {
    constructor(config) {
        this.id = config.id || this._generateId();
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.content = config.content;
        this.type = config.type || 'system'; // 'system', 'user', 'few_shot'
        this.domain = config.domain || 'general';
        this.task = config.task || 'extraction'; // 'extraction', 'relation', 'verification', 'planning'
        this.status = config.status || 'draft'; // 'draft', 'testing', 'active', 'deprecated'
        this.trafficPercent = config.trafficPercent || 0;
        this.createdAt = config.createdAt || new Date().toISOString();
        this.updatedAt = config.updatedAt || new Date().toISOString();
        this.metadata = config.metadata || {};

        // Performance metrics
        this.metrics = {
            invocations: 0,
            successes: 0,
            failures: 0,
            totalScore: 0,
            avgScore: 0,
            avgLatency: 0,
            totalLatency: 0,
            ...config.metrics
        };

        // Few-shot examples (for 'few_shot' type)
        this.examples = config.examples || [];
    }

    _generateId() {
        return `prompt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    recordInvocation(success, score, latency) {
        this.metrics.invocations++;

        if (success) {
            this.metrics.successes++;
        } else {
            this.metrics.failures++;
        }

        this.metrics.totalScore += score || 0;
        this.metrics.avgScore = this.metrics.totalScore / this.metrics.invocations;

        this.metrics.totalLatency += latency || 0;
        this.metrics.avgLatency = this.metrics.totalLatency / this.metrics.invocations;

        this.updatedAt = new Date().toISOString();
    }

    getSuccessRate() {
        if (this.metrics.invocations === 0) return 0;
        return this.metrics.successes / this.metrics.invocations;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            content: this.content,
            type: this.type,
            domain: this.domain,
            task: this.task,
            status: this.status,
            trafficPercent: this.trafficPercent,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata,
            metrics: this.metrics,
            examples: this.examples
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PromptRegistry {
    constructor(options = {}) {
        this.options = {
            enableABTesting: options.enableABTesting !== false,
            autoPromote: options.autoPromote || false,
            promotionThreshold: options.promotionThreshold || 0.1, // 10% improvement
            minInvocationsForPromotion: options.minInvocationsForPromotion || 100,
            ...options
        };

        // Storage: Map<task:domain, Map<promptId, PromptVersion>>
        this.prompts = new Map();

        // Active prompt per task:domain
        this.activePrompts = new Map();

        // A/B test configurations
        this.abTests = new Map();

        // Load default prompts
        this._loadDefaultPrompts();
    }

    /**
     * Register a new prompt version
     */
    register(config) {
        const prompt = new PromptVersion(config);
        const key = this._getKey(prompt.task, prompt.domain);

        if (!this.prompts.has(key)) {
            this.prompts.set(key, new Map());
        }

        this.prompts.get(key).set(prompt.id, prompt);

        // If first prompt for this key, make it active
        if (!this.activePrompts.has(key)) {
            this.activePrompts.set(key, prompt.id);
            prompt.status = 'active';
            prompt.trafficPercent = 100;
        }

        console.log(`[PromptRegistry] Registered: ${prompt.name} v${prompt.version} for ${key}`);
        return prompt;
    }

    /**
     * Get prompt for a task/domain (with A/B testing support)
     */
    getPrompt(task, domain = 'general') {
        const key = this._getKey(task, domain);

        // Check for active A/B test
        if (this.options.enableABTesting && this.abTests.has(key)) {
            return this._selectABVariant(key);
        }

        // Return active prompt
        const activeId = this.activePrompts.get(key);
        if (activeId) {
            const prompts = this.prompts.get(key);
            if (prompts && prompts.has(activeId)) {
                return prompts.get(activeId);
            }
        }

        // Fallback to default
        return this._getDefaultPrompt(task, domain);
    }

    /**
     * Get prompt by ID
     */
    getPromptById(promptId, task, domain = 'general') {
        const key = this._getKey(task, domain);
        const prompts = this.prompts.get(key);
        return prompts ? prompts.get(promptId) : null;
    }

    /**
     * Get all versions of a prompt
     */
    getVersions(task, domain = 'general') {
        const key = this._getKey(task, domain);
        const prompts = this.prompts.get(key);

        if (!prompts) return [];

        return Array.from(prompts.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Record invocation metrics
     */
    recordMetrics(promptId, task, domain, success, score, latency) {
        const key = this._getKey(task, domain);
        const prompts = this.prompts.get(key);

        if (prompts && prompts.has(promptId)) {
            const prompt = prompts.get(promptId);
            prompt.recordInvocation(success, score, latency);

            // Check for auto-promotion
            if (this.options.autoPromote) {
                this._checkAutoPromotion(key);
            }
        }
    }

    /**
     * Start A/B test between prompts
     */
    startABTest(task, domain, variantConfigs) {
        const key = this._getKey(task, domain);

        // Validate variants exist
        const prompts = this.prompts.get(key);
        if (!prompts) {
            throw new Error(`No prompts registered for ${key}`);
        }

        const variants = variantConfigs.map(config => {
            const prompt = prompts.get(config.promptId);
            if (!prompt) {
                throw new Error(`Prompt not found: ${config.promptId}`);
            }

            prompt.status = 'testing';
            prompt.trafficPercent = config.trafficPercent || 50;

            return {
                promptId: config.promptId,
                trafficPercent: prompt.trafficPercent,
                name: config.name || prompt.name
            };
        });

        // Normalize traffic percentages
        const totalTraffic = variants.reduce((sum, v) => sum + v.trafficPercent, 0);
        if (totalTraffic !== 100) {
            const factor = 100 / totalTraffic;
            variants.forEach(v => {
                v.trafficPercent = Math.round(v.trafficPercent * factor);
            });
        }

        const test = {
            id: `abtest_${Date.now()}`,
            key,
            variants,
            startedAt: new Date().toISOString(),
            status: 'running'
        };

        this.abTests.set(key, test);
        console.log(`[PromptRegistry] Started A/B test for ${key}:`, test);

        return test;
    }

    /**
     * Stop A/B test and optionally promote winner
     */
    stopABTest(task, domain, promoteWinner = true) {
        const key = this._getKey(task, domain);
        const test = this.abTests.get(key);

        if (!test) {
            throw new Error(`No A/B test running for ${key}`);
        }

        const prompts = this.prompts.get(key);
        const results = test.variants.map(variant => {
            const prompt = prompts.get(variant.promptId);
            return {
                ...variant,
                metrics: prompt?.metrics,
                avgScore: prompt?.metrics.avgScore || 0,
                successRate: prompt?.getSuccessRate() || 0
            };
        });

        // Determine winner
        results.sort((a, b) => b.avgScore - a.avgScore);
        const winner = results[0];

        test.status = 'completed';
        test.completedAt = new Date().toISOString();
        test.results = results;
        test.winner = winner;

        // Promote winner if requested
        if (promoteWinner && winner) {
            this._promotePrompt(key, winner.promptId);
        }

        // Reset other variants
        for (const variant of test.variants) {
            const prompt = prompts.get(variant.promptId);
            if (prompt && prompt.id !== winner?.promptId) {
                prompt.status = 'deprecated';
                prompt.trafficPercent = 0;
            }
        }

        this.abTests.delete(key);
        console.log(`[PromptRegistry] Completed A/B test for ${key}. Winner: ${winner?.name}`);

        return test;
    }

    /**
     * Get A/B test status
     */
    getABTestStatus(task, domain) {
        const key = this._getKey(task, domain);
        const test = this.abTests.get(key);

        if (!test) return null;

        const prompts = this.prompts.get(key);

        return {
            ...test,
            currentResults: test.variants.map(variant => {
                const prompt = prompts.get(variant.promptId);
                return {
                    ...variant,
                    metrics: prompt?.metrics,
                    avgScore: prompt?.metrics.avgScore || 0,
                    successRate: prompt?.getSuccessRate() || 0
                };
            })
        };
    }

    /**
     * Promote a prompt to active
     */
    promote(promptId, task, domain) {
        const key = this._getKey(task, domain);
        return this._promotePrompt(key, promptId);
    }

    /**
     * Get registry statistics
     */
    getStats() {
        const stats = {
            totalPrompts: 0,
            byTask: {},
            byStatus: {},
            activeABTests: this.abTests.size,
            topPerformers: []
        };

        for (const [key, prompts] of this.prompts) {
            const [task] = key.split(':');

            for (const prompt of prompts.values()) {
                stats.totalPrompts++;

                // By task
                stats.byTask[task] = (stats.byTask[task] || 0) + 1;

                // By status
                stats.byStatus[prompt.status] = (stats.byStatus[prompt.status] || 0) + 1;

                // Track top performers
                if (prompt.metrics.invocations >= 10) {
                    stats.topPerformers.push({
                        id: prompt.id,
                        name: prompt.name,
                        task: prompt.task,
                        domain: prompt.domain,
                        avgScore: prompt.metrics.avgScore,
                        invocations: prompt.metrics.invocations
                    });
                }
            }
        }

        // Sort top performers
        stats.topPerformers.sort((a, b) => b.avgScore - a.avgScore);
        stats.topPerformers = stats.topPerformers.slice(0, 10);

        return stats;
    }

    /**
     * Export all prompts
     */
    export() {
        const data = {
            prompts: [],
            activePrompts: Object.fromEntries(this.activePrompts),
            abTests: Array.from(this.abTests.entries()).map(([k, v]) => ({ key: k, ...v })),
            exportedAt: new Date().toISOString()
        };

        for (const [key, prompts] of this.prompts) {
            for (const prompt of prompts.values()) {
                data.prompts.push(prompt.toJSON());
            }
        }

        return data;
    }

    /**
     * Import prompts
     */
    import(data) {
        for (const promptData of data.prompts || []) {
            const prompt = new PromptVersion(promptData);
            const key = this._getKey(prompt.task, prompt.domain);

            if (!this.prompts.has(key)) {
                this.prompts.set(key, new Map());
            }

            this.prompts.get(key).set(prompt.id, prompt);
        }

        // Restore active prompts
        if (data.activePrompts) {
            for (const [key, promptId] of Object.entries(data.activePrompts)) {
                this.activePrompts.set(key, promptId);
            }
        }

        console.log(`[PromptRegistry] Imported ${data.prompts?.length || 0} prompts`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    _getKey(task, domain) {
        return `${task}:${domain}`;
    }

    _selectABVariant(key) {
        const test = this.abTests.get(key);
        const prompts = this.prompts.get(key);

        if (!test || !prompts) return null;

        // Weighted random selection
        const rand = Math.random() * 100;
        let cumulative = 0;

        for (const variant of test.variants) {
            cumulative += variant.trafficPercent;
            if (rand <= cumulative) {
                return prompts.get(variant.promptId);
            }
        }

        // Fallback to first variant
        return prompts.get(test.variants[0].promptId);
    }

    _promotePrompt(key, promptId) {
        const prompts = this.prompts.get(key);
        if (!prompts || !prompts.has(promptId)) {
            throw new Error(`Prompt not found: ${promptId}`);
        }

        // Demote current active
        const currentActiveId = this.activePrompts.get(key);
        if (currentActiveId && prompts.has(currentActiveId)) {
            const currentActive = prompts.get(currentActiveId);
            currentActive.status = 'deprecated';
            currentActive.trafficPercent = 0;
        }

        // Promote new
        const newActive = prompts.get(promptId);
        newActive.status = 'active';
        newActive.trafficPercent = 100;
        this.activePrompts.set(key, promptId);

        console.log(`[PromptRegistry] Promoted ${promptId} to active for ${key}`);
        return newActive;
    }

    _checkAutoPromotion(key) {
        const prompts = this.prompts.get(key);
        if (!prompts) return;

        const activeId = this.activePrompts.get(key);
        const activePrompt = prompts.get(activeId);

        if (!activePrompt) return;

        // Find best performing non-active prompt
        let bestCandidate = null;
        let bestScore = activePrompt.metrics.avgScore;

        for (const prompt of prompts.values()) {
            if (prompt.id === activeId) continue;
            if (prompt.status === 'deprecated') continue;
            if (prompt.metrics.invocations < this.options.minInvocationsForPromotion) continue;

            const improvement = (prompt.metrics.avgScore - activePrompt.metrics.avgScore) /
                (activePrompt.metrics.avgScore || 1);

            if (improvement >= this.options.promotionThreshold && prompt.metrics.avgScore > bestScore) {
                bestCandidate = prompt;
                bestScore = prompt.metrics.avgScore;
            }
        }

        if (bestCandidate) {
            console.log(`[PromptRegistry] Auto-promoting ${bestCandidate.name} (score: ${bestScore.toFixed(3)})`);
            this._promotePrompt(key, bestCandidate.id);
        }
    }

    _getDefaultPrompt(task, domain) {
        const defaults = {
            'extraction:general': new PromptVersion({
                name: 'default_extraction',
                version: '1.0.0',
                content: `Extract entities from the following text.
For each entity, identify:
- name: The entity's name
- type: The entity type (Person, Organization, System, Document, etc.)
- attributes: Any relevant attributes

Return as JSON array.`,
                type: 'system',
                task: 'extraction',
                domain: 'general'
            }),

            'relation:general': new PromptVersion({
                name: 'default_relation',
                version: '1.0.0',
                content: `Extract relationships between the given entities.
For each relationship, identify:
- subject: The source entity
- predicate: The relationship type (CONTAINS, USES, DEPENDS_ON, etc.)
- object: The target entity

Return as JSON array.`,
                type: 'system',
                task: 'relation',
                domain: 'general'
            }),

            'verification:general': new PromptVersion({
                name: 'default_verification',
                version: '1.0.0',
                content: `Verify if the claim is supported by the evidence.
Respond with:
- verdict: SUPPORTED, CONTRADICTED, or NOT_ENOUGH_INFO
- confidence: 0-1
- explanation: Brief explanation`,
                type: 'system',
                task: 'verification',
                domain: 'general'
            }),

            'planning:general': new PromptVersion({
                name: 'default_planning',
                version: '1.0.0',
                content: `Create an execution plan for the user request using the available tools.
Return a JSON object with:
- steps: Array of {id, toolId, intent, inputs, outputs}
- dependencies: Array of {from, to}
- parallelGroups: Array of step ID arrays that can run in parallel`,
                type: 'system',
                task: 'planning',
                domain: 'general'
            })
        };

        const key = this._getKey(task, domain);
        return defaults[key] || defaults[`${task}:general`] || null;
    }

    _loadDefaultPrompts() {
        // Entity extraction prompts
        this.register({
            name: 'entity_extraction_v1',
            version: '1.0.0',
            task: 'extraction',
            domain: 'general',
            content: `You are an expert entity extractor for knowledge graphs.

Extract all entities from the text, including:
- People (names, roles)
- Organizations (companies, departments, teams)
- Systems (applications, platforms, databases)
- Documents (reports, specifications)
- Processes (workflows, procedures)

For each entity provide:
- name: Exact name as mentioned
- type: Entity type from the list above
- attributes: Relevant properties (role, id, etc.)
- confidence: Your confidence level (0-1)

Return a JSON array of entities.`,
            type: 'system',
            status: 'active',
            trafficPercent: 100
        });

        // DevOps-specific extraction
        this.register({
            name: 'entity_extraction_devops',
            version: '1.0.0',
            task: 'extraction',
            domain: 'devops',
            content: `You are a DevOps knowledge extractor.

Focus on extracting:
- Work items (bugs, tasks, user stories, features)
- Code artifacts (commits, branches, files, modules)
- People (developers, testers, managers)
- Systems (repos, pipelines, environments)
- Technologies (languages, frameworks, tools)

Include IDs when present (e.g., Bug #1234, commit abc123).

Return entities as JSON array with name, type, attributes, confidence.`,
            type: 'system',
            status: 'active',
            trafficPercent: 100
        });

        // Relation extraction
        this.register({
            name: 'relation_extraction_v1',
            version: '1.0.0',
            task: 'relation',
            domain: 'general',
            content: `Extract relationships between the given entities.

Valid relationship types:
- CONTAINS: Parent contains child
- DEPENDS_ON: Dependency relationship
- USES: Utilization relationship
- IMPLEMENTS: Implementation relationship
- ASSIGNED_TO: Assignment relationship
- AUTHORED_BY: Authorship relationship
- PART_OF: Membership relationship
- REFERENCES: Reference relationship
- RELATED_TO: General relationship

For each relationship:
- subject: Source entity name
- predicate: Relationship type
- object: Target entity name
- confidence: Confidence level (0-1)

Return as JSON array.`,
            type: 'system',
            status: 'active',
            trafficPercent: 100
        });

        // Verification prompt
        this.register({
            name: 'verification_v1',
            version: '1.0.0',
            task: 'verification',
            domain: 'general',
            content: `Verify if the claim is supported by the given evidence.

Analyze:
1. Is the claim explicitly stated in the evidence?
2. Can the claim be inferred from the evidence?
3. Does the evidence contradict the claim?

Respond with:
- verdict: "SUPPORTED", "CONTRADICTED", or "NOT_ENOUGH_INFO"
- confidence: 0.0 to 1.0
- reasoning: Brief explanation of your verdict`,
            type: 'system',
            status: 'active',
            trafficPercent: 100
        });

        // Planning prompt
        this.register({
            name: 'planning_v1',
            version: '1.0.0',
            task: 'planning',
            domain: 'general',
            content: `Create an execution plan for the given task.

Available tools:
- entity_extraction: Extract entities from text
- relation_extraction: Extract relationships between entities
- verification: Verify claims against evidence
- graph_update: Update knowledge graph

For each step, specify:
- step_id: Unique identifier
- tool: Tool to use
- inputs: Required inputs
- outputs: Expected outputs
- dependencies: IDs of steps that must complete first

Return as JSON with steps array.`,
            type: 'system',
            status: 'active',
            trafficPercent: 100
        });

        console.log('[PromptRegistry] Loaded default prompts');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

function createPromptRegistry(options) {
    return new PromptRegistry(options);
}

const promptRegistry = new PromptRegistry();

module.exports = {
    PromptRegistry,
    PromptVersion,
    createPromptRegistry,
    promptRegistry
};
