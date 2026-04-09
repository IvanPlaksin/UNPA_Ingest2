/**
 * GXE (Graph Execution Engine) Routes
 * API endpoints for GXE tool orchestration and visualization
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/gxe.controller');
const { getCachedHealthCheck } = require('../services/redis.service');

// Import Phase 0 execution controller (TypeScript)
let gxeExecuteRouter;
try {
  const execution = require('../services/gxe/execution');
  gxeExecuteRouter = execution.gxeExecuteRouter;
} catch (err) {
  console.warn('[GXE] Phase 0 execution module not available:', err.message);
}

// Generate executable graph from text task (AI)
router.post('/generate', controller.generateGraph);

// Generate knowledge graph from text via extraction pipeline (SSE)
router.post('/generate-knowledge-graph', controller.generateKnowledgeGraph);

// Get available AI models
router.get('/models', controller.getModels);

// Get available tools and their hierarchy
router.get('/tools', controller.getTools);

// Get tool categories and levels
router.get('/capabilities', controller.getCapabilities);

// Execute a scenario
router.post('/execute', controller.executeScenario);

// SSE stream for real-time execution updates
router.get('/stream/:sessionId', controller.streamExecution);

// Get scenario templates
router.get('/scenarios', controller.getScenarios);

// Create custom scenario
router.post('/scenarios', controller.createScenario);

// Get execution history
router.get('/history', controller.getHistory);

// ═══════════════════════════════════════════════════════════════════════════
// MCP Tools Settings Management
// ═══════════════════════════════════════════════════════════════════════════

// Get full list of MCP tools with metadata
router.get('/mcp-tools', controller.getMcpToolsList);

// List all saved MCP settings profiles
router.get('/mcp-settings', controller.listMcpSettings);

// Load MCP tools settings by ID
router.get('/mcp-settings/:settingsId', controller.loadMcpSettings);

// Save MCP tools settings
router.post('/mcp-settings', controller.saveMcpSettings);

// Delete MCP tools settings
router.delete('/mcp-settings/:settingsId', controller.deleteMcpSettings);

// ═══════════════════════════════════════════════════════════════════════════
// AI Settings & System Prompt Management
// ═══════════════════════════════════════════════════════════════════════════

// Load AI settings (model, temperature, maxTokens, etc.)
router.get('/ai-settings', controller.getAiSettings);

// Save AI settings
router.post('/ai-settings', controller.saveAiSettings);

// Get current system prompt
router.get('/system-prompt', controller.getSystemPrompt);

// Save new system prompt version
router.post('/system-prompt', controller.saveSystemPrompt);

// Get system prompt version history
router.get('/system-prompt/history', controller.getSystemPromptHistory);

// ═══════════════════════════════════════════════════════════════════════════
// GXE Generation Prompt Management (category='gxe-generation')
// ═══════════════════════════════════════════════════════════════════════════

// List all generation prompt versions with aggregated metrics
router.get('/generation-prompts', controller.listGenerationPrompts);

// Get default generation prompt (auto-seeds hardcoded v1 if empty)
router.get('/generation-prompts/default', controller.getDefaultGenerationPrompt);

// Save a new generation prompt version
router.post('/generation-prompts', controller.saveGenerationPrompt);

// Set a prompt version as default
router.put('/generation-prompts/:promptId/set-default', controller.setDefaultGenerationPrompt);

// Get effectiveness metrics for a prompt version
router.get('/generation-prompts/:promptId/metrics', controller.getGenerationPromptMetrics);

// Record a generation effectiveness metric
router.post('/generation-prompts/:promptId/record-metric', controller.recordGenerationMetric);

// Analyze generation result and suggest prompt optimizations (Claude 4.6 Fast)
router.post('/analyze-prompt-optimization', controller.analyzePromptOptimization);

// Execution Assistant Chat (SSE streaming — pre-validation, post-failure, tool resolution)
router.post('/execution-assistant-chat', controller.executionAssistantChat);

// Graph Analyst Chat (SSE streaming with Claude + MCP tools)
router.post('/graph-analyst-chat', controller.graphAnalystChat);

// ═══════════════════════════════════════════════════════════════════════════
// AI Layout — LLM-powered graph layout computation
// ═══════════════════════════════════════════════════════════════════════════

// Compute layout via LLM (Claude)
router.post('/ai-layout', controller.computeAILayout);

// Compute hex layout via LLM (Claude)
router.post('/ai-hex-layout', controller.computeAIHexLayout);

// Load AI Layout settings from Core KB
router.get('/ai-layout-config', controller.getAILayoutConfig);

// Save AI Layout settings to Core KB
router.post('/ai-layout-config', controller.saveAILayoutConfig);

// Load GXE Display Rules from KB (optional ?graphType=business)
router.get('/display-rules', controller.getDisplayRules);

// Save GXE Display Rules to KB
router.post('/display-rules', controller.saveDisplayRules);

// List all display rule sets (global + per-type)
router.get('/display-rules/list', controller.listDisplayRules);

// ═══════════════════════════════════════════════════════════════════════════
// Graph Validation
// ═══════════════════════════════════════════════════════════════════════════

router.post('/validate-graph', controller.validateGraph);

// ═══════════════════════════════════════════════════════════════════════════
// A/B Testing & Test Corpus
// ═══════════════════════════════════════════════════════════════════════════

// Run A/B test comparing SDA vs Legacy pipelines
router.post('/ab-test', controller.runABTest);

// Get test corpus for manual testing
router.get('/test-corpus', controller.getTestCorpus);

// Phase 0 Execution endpoints (validate, execute with SSE, status)
if (gxeExecuteRouter) {
  router.use('/v2', gxeExecuteRouter);
}

// Health check (cached for 1 minute)
router.get('/health', async (req, res) => {
  const computeGXEHealth = () => Promise.resolve({
    status: 'ok',
    service: 'gxe',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });

  const { data, cached } = await getCachedHealthCheck('gxe', computeGXEHealth);

  res.json({
    ...data,
    cached,
    cacheInfo: cached ? 'Result from Redis cache (TTL: 60s)' : 'Fresh result',
  });
});

module.exports = router;
