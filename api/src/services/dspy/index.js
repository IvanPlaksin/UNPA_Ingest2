/**
 * DSPy Integration Module
 *
 * Provides JavaScript interface to Python DSPy service
 * for automatic prompt optimization and knowledge extraction.
 *
 * Usage:
 * ```javascript
 * const { dspyService } = require('./services/dspy');
 *
 * // Extract entities (uses DSPy if available, fallback otherwise)
 * const result = await dspyService.extractEntities(text);
 *
 * // Extract full knowledge graph
 * const kg = await dspyService.extractKnowledgeGraph(text, {
 *   useCoT: true,
 *   verify: true
 * });
 *
 * // Start optimization (requires DSPy service)
 * const job = await dspyService.startOptimization('entity', trainingData);
 * ```
 *
 * @module services/dspy
 */

'use strict';

const { DSPyClient, createDSPyClient, dspyClient } = require('./dspy-client');
const { DSPyService, createDSPyService, dspyService } = require('./dspy.service');
const { PromptRegistry, PromptVersion, createPromptRegistry, promptRegistry } = require('./prompt-registry');
const { ABTestingService, createABTestingService, abTestingService } = require('./ab-testing.service');

module.exports = {
    // Low-level HTTP client
    DSPyClient,
    createDSPyClient,
    dspyClient,

    // High-level service with caching and fallback
    DSPyService,
    createDSPyService,
    dspyService,

    // Prompt Registry (version control for prompts)
    PromptRegistry,
    PromptVersion,
    createPromptRegistry,
    promptRegistry,

    // A/B Testing Service
    ABTestingService,
    createABTestingService,
    abTestingService
};
