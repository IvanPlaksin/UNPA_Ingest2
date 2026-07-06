/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK PLANNER - SDA Stage 3
 * Generates ProcessRepresentation (IR) from IntentDescriptor + Tools
 *
 * Key features:
 * - Templates for simple patterns (fast, deterministic)
 * - LLM-based planning via Structured Output (complex cases)
 * - Converts LLM output to ProcessRepresentation (IR)
 * - Validates output via soundness-checker
 *
 * Pipeline integration:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [TaskPlanner(S3)] → [GraphCompiler(S4)]
 *
 * @module services/graph/task-planner
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const {
    createSequence,
    createParallel,
    createChoice,
    createLoop,
    createTaskStep,
    validateIR,
    CAPABILITY_CATEGORIES
} = require('./process-representation');

const { SoundnessChecker } = require('./soundness-checker');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    maxSteps: 20,
    validateOutput: true,
    useTemplates: true,
    llmProvider: 'gemini'
};

// ═══════════════════════════════════════════════════════════════════════════
// PLAN SCHEMA (for LLM structured output)
// ═══════════════════════════════════════════════════════════════════════════

const PLAN_SCHEMA = {
    type: 'object',
    required: ['steps'],
    properties: {
        steps: {
            type: 'array',
            items: {
                type: 'object',
                required: ['id', 'toolId', 'intent', 'capability'],
                properties: {
                    id: { type: 'string', description: 'Unique step identifier' },
                    toolId: { type: 'string', description: 'ID of the tool to use' },
                    intent: { type: 'string', description: 'Human-readable description' },
                    capability: { type: 'string', description: 'Primary capability category' },
                    inputs: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Input references (step outputs or START)'
                    },
                    outputs: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Output names for other steps'
                    },
                    conditions: {
                        type: 'object',
                        properties: {
                            if: { type: 'string' },
                            unless: { type: 'string' }
                        }
                    }
                }
            }
        },
        dependencies: {
            type: 'array',
            items: {
                type: 'object',
                required: ['from', 'to'],
                properties: {
                    from: { type: 'string' },
                    to: { type: 'string' }
                }
            }
        },
        parallelGroups: {
            type: 'array',
            items: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// TASK PLANNER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class TaskPlanner {
    constructor(options = {}) {
        this.options = { ...CONFIG, ...options };
        this._llmService = null;
        this._soundnessChecker = new SoundnessChecker();
        this._templates = this._loadTemplates();

        this._stats = {
            totalPlans: 0,
            templateHits: 0,
            llmGenerations: 0,
            validationFailures: 0,
            avgSteps: 0
        };
    }

    /**
     * Lazy load LLM service
     */
    _getLlmService() {
        if (!this._llmService) {
            try {
                const { getInstance: getLLMProvider } = require('../llm/LLMProviderService');
                this._llmService = getLLMProvider();
            } catch (e) {
                console.warn('TaskPlanner: LLM service not available');
            }
        }
        return this._llmService;
    }

    /**
     * Generate execution plan
     * @param {IntentDescriptor} intentDescriptor - from Stage 1
     * @param {ToolResolutionResult} toolResolution - from Stage 2
     * @param {Object} context - additional context
     * @returns {Promise<ProcessRepresentation>}
     */
    async plan(intentDescriptor, toolResolution, context = {}) {
        this._stats.totalPlans++;

        const { domain, intent, complexity } = intentDescriptor;
        const { tools, byRole } = toolResolution;

        // Try template for simple cases
        if (this.options.useTemplates && complexity !== 'high') {
            const templateResult = this._tryTemplate(intentDescriptor, toolResolution);
            if (templateResult) {
                this._stats.templateHits++;
                this._updateStats(templateResult);
                return templateResult;
            }
        }

        // LLM-based planning
        const llmService = this._getLlmService();
        if (llmService) {
            this._stats.llmGenerations++;
            const ir = await this._generateWithLLM(intentDescriptor, toolResolution, context);
            if (ir) {
                // Validate
                if (this.options.validateOutput) {
                    const validation = this._validatePlan(ir);
                    if (!validation.valid) {
                        this._stats.validationFailures++;
                        console.warn('Plan validation failed:', validation.errors);
                    }
                }
                this._updateStats(ir);
                return ir;
            }
        }

        // Fallback: generate simple sequential plan
        const fallbackPlan = this._generateFallbackPlan(intentDescriptor, toolResolution);
        this._updateStats(fallbackPlan);
        return fallbackPlan;
    }

    /**
     * Generate plan using LLM
     */
    async _generateWithLLM(intentDescriptor, toolResolution, context) {
        const llmService = this._getLlmService();
        if (!llmService?.generateStructured) {
            return null;
        }

        const prompt = this._buildPlanningPrompt(intentDescriptor, toolResolution, context);

        try {
            const response = await llmService.generateStructured(
                prompt,
                PLAN_SCHEMA,
                { provider: this.options.llmProvider, temperature: 0.1, caller: 'graph_services' }
            );

            if (response.success && response.data) {
                return this._convertToIR(response.data, toolResolution.tools);
            }
        } catch (error) {
            console.warn('TaskPlanner: LLM generation failed:', error.message);
        }

        return null;
    }

    /**
     * Build planning prompt
     */
    _buildPlanningPrompt(intentDescriptor, toolResolution, context) {
        const { domain, intent, complexity, requiredCapabilities } = intentDescriptor;
        const { forPrompt } = toolResolution;
        const fewShotExample = this._getFewShotExample(domain, intent);

        return `You are a workflow planner for a UN knowledge management system.
Create an execution plan using the available tools.

## USER REQUEST ANALYSIS
- Domain: ${domain}
- Intent: ${intent}
- Complexity: ${complexity}
- Required Capabilities: ${(requiredCapabilities || []).join(', ')}

## AVAILABLE TOOLS
${forPrompt || this._formatTools(toolResolution.tools)}

## PLANNING RULES
1. Start with INPUT tools to fetch data
2. Use PROCESS/ANALYZE tools for transformation
3. End with STORE/OUTPUT tools to persist results
4. Group independent operations in parallel blocks
5. Each step must have unique ID
6. Inputs must reference outputs from previous steps or "START"
7. Maximum ${this.options.maxSteps} steps

## EXAMPLE
${fewShotExample}

Generate the execution plan for the request:`;
    }

    /**
     * Convert LLM output to ProcessRepresentation
     */
    _convertToIR(planData, tools) {
        const { steps, dependencies, parallelGroups } = planData;

        if (!steps || steps.length === 0) {
            return null;
        }

        const toolMap = new Map(tools.map(t => [t.id, t]));

        // Create TaskSteps
        const taskSteps = steps.map(step => {
            const tool = toolMap.get(step.toolId);
            const capability = this._mapCapability(step.capability);

            return createTaskStep({
                id: step.id,
                intent: step.intent,
                capability: capability,
                inputs: step.inputs || ['START'],
                outputs: step.outputs || [`${step.id}_output`],
                metadata: {
                    toolId: step.toolId,
                    toolName: tool?.name,
                    conditions: step.conditions
                }
            });
        });

        // Build with parallel groups if present
        if (parallelGroups && parallelGroups.length > 0) {
            return this._buildWithParallelGroups(taskSteps, dependencies, parallelGroups);
        }

        // Otherwise build sequence from dependencies
        return this._buildSequenceFromDependencies(taskSteps, dependencies);
    }

    /**
     * Map capability string to CAPABILITY_CATEGORIES
     */
    _mapCapability(capStr) {
        if (!capStr) return CAPABILITY_CATEGORIES.DATA_FETCH;

        const capLower = capStr.toLowerCase();

        if (capLower.includes('fetch') || capLower.includes('read') || capLower.includes('input')) {
            return CAPABILITY_CATEGORIES.DATA_FETCH;
        }
        if (capLower.includes('transform') || capLower.includes('process')) {
            return CAPABILITY_CATEGORIES.DATA_TRANSFORM;
        }
        if (capLower.includes('extract')) {
            return CAPABILITY_CATEGORIES.EXTRACTION;
        }
        if (capLower.includes('embed')) {
            return CAPABILITY_CATEGORIES.EMBEDDING;
        }
        if (capLower.includes('store') || capLower.includes('write') || capLower.includes('create')) {
            return CAPABILITY_CATEGORIES.DATA_STORE;
        }
        if (capLower.includes('analy') || capLower.includes('reason')) {
            return CAPABILITY_CATEGORIES.ANALYSIS;
        }
        if (capLower.includes('control') || capLower.includes('flow')) {
            return CAPABILITY_CATEGORIES.CONTROL_FLOW;
        }
        if (capLower.includes('valid') || capLower.includes('check')) {
            return CAPABILITY_CATEGORIES.VALIDATION;
        }

        return CAPABILITY_CATEGORIES.DATA_TRANSFORM;
    }

    /**
     * Build IR with parallel groups
     */
    _buildWithParallelGroups(steps, dependencies, parallelGroups) {
        const stepMap = new Map(steps.map(s => [s.id, s]));
        const processed = new Set();
        const irSteps = [];

        const order = this._topologicalOrder(steps, dependencies);

        for (const stepId of order) {
            if (processed.has(stepId)) continue;

            const parallelGroup = parallelGroups.find(g => g.includes(stepId));

            if (parallelGroup && parallelGroup.length > 1) {
                const parallelSteps = parallelGroup
                    .filter(id => stepMap.has(id) && !processed.has(id))
                    .map(id => {
                        processed.add(id);
                        return stepMap.get(id);
                    });

                if (parallelSteps.length > 1) {
                    irSteps.push(createParallel(parallelSteps, `parallel_${stepId}`));
                } else if (parallelSteps.length === 1) {
                    irSteps.push(parallelSteps[0]);
                }
            } else {
                processed.add(stepId);
                irSteps.push(stepMap.get(stepId));
            }
        }

        return createSequence(irSteps, 'main_sequence');
    }

    /**
     * Build sequence from dependencies
     */
    _buildSequenceFromDependencies(steps, dependencies) {
        const order = this._topologicalOrder(steps, dependencies);
        const stepMap = new Map(steps.map(s => [s.id, s]));

        const orderedSteps = order
            .map(id => stepMap.get(id))
            .filter(Boolean);

        return createSequence(orderedSteps, 'main_sequence');
    }

    /**
     * Topological sort using Kahn's algorithm
     */
    _topologicalOrder(steps, dependencies) {
        const graph = new Map();
        const inDegree = new Map();

        for (const step of steps) {
            graph.set(step.id, []);
            inDegree.set(step.id, 0);
        }

        for (const dep of (dependencies || [])) {
            if (graph.has(dep.from) && graph.has(dep.to)) {
                graph.get(dep.from).push(dep.to);
                inDegree.set(dep.to, inDegree.get(dep.to) + 1);
            }
        }

        const queue = [];
        for (const [id, degree] of inDegree) {
            if (degree === 0) queue.push(id);
        }

        const result = [];
        while (queue.length > 0) {
            const current = queue.shift();
            result.push(current);

            for (const neighbor of graph.get(current) || []) {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }

        // Add remaining steps
        for (const step of steps) {
            if (!result.includes(step.id)) {
                result.push(step.id);
            }
        }

        return result;
    }

    /**
     * Try template for simple patterns
     */
    _tryTemplate(intentDescriptor, toolResolution) {
        const { domain, intent } = intentDescriptor;
        const templateKey = `${domain}:${intent}`;

        const template = this._templates.get(templateKey);
        if (!template) return null;

        try {
            return template(toolResolution.tools, toolResolution.byRole);
        } catch (error) {
            console.debug('Template failed:', error.message);
            return null;
        }
    }

    /**
     * Load templates for common patterns
     */
    _loadTemplates() {
        const templates = new Map();

        // DevOps: Read work items
        templates.set('devops:read', (tools, byRole) => {
            const inputTool = byRole?.INPUT?.[0] || byRole?.SEARCH?.[0];
            if (!inputTool) return null;

            return createSequence([
                createTaskStep({
                    id: 'fetch',
                    intent: 'Fetch data from source',
                    capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                    inputs: ['START'],
                    outputs: ['data'],
                    metadata: { toolId: inputTool.id }
                })
            ], 'read_pipeline');
        });

        // DevOps: Ingest pattern
        templates.set('devops:ingest', (tools, byRole) => {
            const steps = [];

            if (byRole?.INPUT?.[0]) {
                steps.push(createTaskStep({
                    id: 'fetch',
                    intent: 'Fetch source data',
                    capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                    inputs: ['START'],
                    outputs: ['raw_data'],
                    metadata: { toolId: byRole.INPUT[0].id }
                }));
            }

            if (byRole?.PROCESS?.[0]) {
                steps.push(createTaskStep({
                    id: 'process',
                    intent: 'Process and transform data',
                    capability: CAPABILITY_CATEGORIES.DATA_TRANSFORM,
                    inputs: ['raw_data'],
                    outputs: ['processed_data'],
                    metadata: { toolId: byRole.PROCESS[0].id }
                }));
            }

            if (byRole?.STORE?.length > 0) {
                const storeSteps = byRole.STORE.slice(0, 2).map((tool, i) =>
                    createTaskStep({
                        id: `store_${i}`,
                        intent: `Store to ${tool.name || tool.id}`,
                        capability: CAPABILITY_CATEGORIES.DATA_STORE,
                        inputs: ['processed_data'],
                        outputs: [`stored_${i}`],
                        metadata: { toolId: tool.id }
                    })
                );

                if (storeSteps.length > 1) {
                    steps.push(createParallel(storeSteps, 'parallel_store'));
                } else if (storeSteps.length === 1) {
                    steps.push(storeSteps[0]);
                }
            }

            return steps.length > 0 ? createSequence(steps, 'ingest_pipeline') : null;
        });

        // Knowledge: Extract entities
        templates.set('knowledge:extract', (tools, byRole) => {
            const steps = [];

            if (byRole?.INPUT?.[0]) {
                steps.push(createTaskStep({
                    id: 'fetch',
                    intent: 'Fetch documents',
                    capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                    inputs: ['START'],
                    outputs: ['documents'],
                    metadata: { toolId: byRole.INPUT[0].id }
                }));
            }

            // Extract entities and relations in parallel
            const extractSteps = [];

            const entityTool = tools.find(t =>
                t.id.includes('entity') || t.id.includes('extraction.entities')
            );
            if (entityTool) {
                extractSteps.push(createTaskStep({
                    id: 'extract_entities',
                    intent: 'Extract named entities',
                    capability: CAPABILITY_CATEGORIES.EXTRACTION,
                    inputs: ['documents'],
                    outputs: ['entities'],
                    metadata: { toolId: entityTool.id }
                }));
            }

            const relationTool = tools.find(t =>
                t.id.includes('relation') || t.id.includes('extraction.relations')
            );
            if (relationTool) {
                extractSteps.push(createTaskStep({
                    id: 'extract_relations',
                    intent: 'Extract relationships',
                    capability: CAPABILITY_CATEGORIES.EXTRACTION,
                    inputs: ['documents'],
                    outputs: ['relations'],
                    metadata: { toolId: relationTool.id }
                }));
            }

            if (extractSteps.length > 1) {
                steps.push(createParallel(extractSteps, 'parallel_extract'));
            } else if (extractSteps.length === 1) {
                steps.push(extractSteps[0]);
            }

            if (byRole?.STORE?.[0]) {
                steps.push(createTaskStep({
                    id: 'store',
                    intent: 'Store extracted knowledge',
                    capability: CAPABILITY_CATEGORIES.DATA_STORE,
                    inputs: ['entities', 'relations'],
                    outputs: ['stored'],
                    metadata: { toolId: byRole.STORE[0].id }
                }));
            }

            return steps.length > 0 ? createSequence(steps, 'extract_pipeline') : null;
        });

        // Knowledge: Create graph
        templates.set('knowledge:create', (tools, byRole) => {
            const steps = [];

            if (byRole?.STORE?.[0]) {
                steps.push(createTaskStep({
                    id: 'create_graph',
                    intent: 'Create graph structure',
                    capability: CAPABILITY_CATEGORIES.DATA_STORE,
                    inputs: ['START'],
                    outputs: ['graph_result'],
                    metadata: { toolId: byRole.STORE[0].id }
                }));
            }

            return steps.length > 0 ? createSequence(steps, 'create_pipeline') : null;
        });

        // Knowledge: Read/Search
        templates.set('knowledge:read', (tools, byRole) => {
            const steps = [];

            if (byRole?.SEARCH?.[0]) {
                steps.push(createTaskStep({
                    id: 'search',
                    intent: 'Search knowledge base',
                    capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                    inputs: ['START'],
                    outputs: ['search_results'],
                    metadata: { toolId: byRole.SEARCH[0].id }
                }));
            }

            if (byRole?.ANALYZE?.[0]) {
                steps.push(createTaskStep({
                    id: 'analyze',
                    intent: 'Analyze and synthesize results',
                    capability: CAPABILITY_CATEGORIES.ANALYSIS,
                    inputs: ['search_results'],
                    outputs: ['answer'],
                    metadata: { toolId: byRole.ANALYZE[0].id }
                }));
            }

            return steps.length > 0 ? createSequence(steps, 'search_pipeline') : null;
        });

        // Legal: Analyze
        templates.set('legal:analyze', (tools, byRole) => {
            const steps = [];

            if (byRole?.INPUT?.[0] || byRole?.SEARCH?.[0]) {
                const tool = byRole?.INPUT?.[0] || byRole?.SEARCH?.[0];
                steps.push(createTaskStep({
                    id: 'fetch',
                    intent: 'Fetch legal document',
                    capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                    inputs: ['START'],
                    outputs: ['document'],
                    metadata: { toolId: tool.id }
                }));
            }

            if (byRole?.ANALYZE?.[0]) {
                steps.push(createTaskStep({
                    id: 'analyze',
                    intent: 'Analyze compliance',
                    capability: CAPABILITY_CATEGORIES.ANALYSIS,
                    inputs: ['document'],
                    outputs: ['analysis_result'],
                    metadata: { toolId: byRole.ANALYZE[0].id }
                }));
            }

            return steps.length > 0 ? createSequence(steps, 'legal_analysis_pipeline') : null;
        });

        return templates;
    }

    /**
     * Generate fallback plan when LLM is unavailable
     */
    _generateFallbackPlan(intentDescriptor, toolResolution) {
        const { byRole, tools } = toolResolution;
        const steps = [];

        // Add INPUT step
        if (byRole?.INPUT?.[0]) {
            steps.push(createTaskStep({
                id: 'input',
                intent: 'Fetch input data',
                capability: CAPABILITY_CATEGORIES.DATA_FETCH,
                inputs: ['START'],
                outputs: ['input_data'],
                metadata: { toolId: byRole.INPUT[0].id }
            }));
        }

        // Add PROCESS step
        if (byRole?.PROCESS?.[0]) {
            steps.push(createTaskStep({
                id: 'process',
                intent: 'Process data',
                capability: CAPABILITY_CATEGORIES.DATA_TRANSFORM,
                inputs: ['input_data'],
                outputs: ['processed_data'],
                metadata: { toolId: byRole.PROCESS[0].id }
            }));
        }

        // Add STORE step
        if (byRole?.STORE?.[0]) {
            steps.push(createTaskStep({
                id: 'store',
                intent: 'Store results',
                capability: CAPABILITY_CATEGORIES.DATA_STORE,
                inputs: ['processed_data'],
                outputs: ['result'],
                metadata: { toolId: byRole.STORE[0].id }
            }));
        }

        return createSequence(steps.length > 0 ? steps : [
            createTaskStep({
                id: 'default',
                intent: 'Execute task',
                capability: CAPABILITY_CATEGORIES.DATA_TRANSFORM,
                inputs: ['START'],
                outputs: ['result']
            })
        ], 'fallback_pipeline');
    }

    /**
     * Get few-shot example for domain:intent
     */
    _getFewShotExample(domain, intent) {
        const examples = {
            'devops:read': `{
  "steps": [
    {"id": "fetch", "toolId": "primitive.getWorkItem", "intent": "Fetch work item", "capability": "data_fetch", "inputs": ["START"], "outputs": ["work_item"]}
  ],
  "dependencies": [],
  "parallelGroups": []
}`,

            'devops:ingest': `{
  "steps": [
    {"id": "fetch", "toolId": "ado.fetchWorkItems", "intent": "Fetch work items", "capability": "data_fetch", "inputs": ["START"], "outputs": ["raw_items"]},
    {"id": "process", "toolId": "text.sanitize", "intent": "Sanitize text", "capability": "data_transform", "inputs": ["raw_items"], "outputs": ["clean_items"]},
    {"id": "embed", "toolId": "vector.embed", "intent": "Generate embeddings", "capability": "embedding", "inputs": ["clean_items"], "outputs": ["embeddings"]},
    {"id": "store_vector", "toolId": "vector.write", "intent": "Store vectors", "capability": "data_store", "inputs": ["embeddings"], "outputs": ["vector_result"]},
    {"id": "store_graph", "toolId": "graph.create_node", "intent": "Store in graph", "capability": "data_store", "inputs": ["clean_items"], "outputs": ["graph_result"]}
  ],
  "dependencies": [
    {"from": "fetch", "to": "process"},
    {"from": "process", "to": "embed"},
    {"from": "embed", "to": "store_vector"},
    {"from": "process", "to": "store_graph"}
  ],
  "parallelGroups": [["store_vector", "store_graph"]]
}`,

            'knowledge:extract': `{
  "steps": [
    {"id": "fetch", "toolId": "data.load", "intent": "Load documents", "capability": "data_fetch", "inputs": ["START"], "outputs": ["documents"]},
    {"id": "extract_entities", "toolId": "extraction.entities", "intent": "Extract entities", "capability": "extraction", "inputs": ["documents"], "outputs": ["entities"]},
    {"id": "extract_relations", "toolId": "extraction.relations", "intent": "Extract relations", "capability": "extraction", "inputs": ["documents", "entities"], "outputs": ["relations"]},
    {"id": "store", "toolId": "graph.create_node", "intent": "Store in graph", "capability": "data_store", "inputs": ["entities", "relations"], "outputs": ["result"]}
  ],
  "dependencies": [
    {"from": "fetch", "to": "extract_entities"},
    {"from": "fetch", "to": "extract_relations"},
    {"from": "extract_entities", "to": "store"},
    {"from": "extract_relations", "to": "store"}
  ],
  "parallelGroups": [["extract_entities", "extract_relations"]]
}`,

            'default': `{
  "steps": [
    {"id": "step_1", "toolId": "input_tool", "intent": "Fetch data", "capability": "data_fetch", "inputs": ["START"], "outputs": ["data"]},
    {"id": "step_2", "toolId": "process_tool", "intent": "Process data", "capability": "data_transform", "inputs": ["data"], "outputs": ["result"]}
  ],
  "dependencies": [{"from": "step_1", "to": "step_2"}],
  "parallelGroups": []
}`
        };

        return examples[`${domain}:${intent}`] || examples['default'];
    }

    /**
     * Validate plan
     */
    _validatePlan(ir) {
        const structureValidation = validateIR(ir);
        if (!structureValidation.valid) {
            return structureValidation;
        }

        const soundness = this._soundnessChecker.quickCheck(ir);
        if (!soundness.sound) {
            return {
                valid: false,
                errors: [{ type: 'soundness', message: soundness.reason }]
            };
        }

        return { valid: true, errors: [], warnings: [] };
    }

    /**
     * Format tools for prompt
     */
    _formatTools(tools) {
        return tools.map(t =>
            `- ${t.id}: ${t.description || t.name || 'No description'}`
        ).join('\n');
    }

    /**
     * Update statistics
     */
    _updateStats(ir) {
        if (!ir) return;

        const steps = this._countSteps(ir);
        const total = this._stats.totalPlans;
        this._stats.avgSteps = ((this._stats.avgSteps * (total - 1)) + steps) / total;
    }

    /**
     * Count steps in IR
     */
    _countSteps(ir) {
        if (!ir) return 0;
        if (ir._type === 'TaskStep') return 1;
        if (ir._type === 'Sequence' || ir._type === 'Parallel') {
            return (ir.steps || ir.branches || []).reduce((sum, s) => sum + this._countSteps(s), 0);
        }
        if (ir._type === 'Choice') {
            return ir.branches.reduce((sum, b) => sum + this._countSteps(b), 0);
        }
        if (ir._type === 'Loop') {
            return this._countSteps(ir.body);
        }
        return 0;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this._stats,
            templateRate: this._stats.totalPlans > 0
                ? ((this._stats.templateHits / this._stats.totalPlans) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this._stats = {
            totalPlans: 0,
            templateHits: 0,
            llmGenerations: 0,
            validationFailures: 0,
            avgSteps: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY AND SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let _instance = null;

/**
 * Get TaskPlanner singleton
 */
function getTaskPlanner(options = {}) {
    if (!_instance) {
        _instance = new TaskPlanner(options);
    }
    return _instance;
}

/**
 * Create new TaskPlanner instance
 */
function createTaskPlanner(options = {}) {
    return new TaskPlanner(options);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    TaskPlanner,
    createTaskPlanner,
    getTaskPlanner,
    PLAN_SCHEMA
};
