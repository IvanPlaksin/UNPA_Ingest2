/**
 * Initialize MCP Tools Settings for Graph Generation
 *
 * This script creates default MCP tool settings optimized for graph generation.
 * Only tools relevant for the generation process are enabled, significantly
 * reducing the system prompt size and avoiding Claude API rate limits.
 *
 * Usage: node api/scripts/init-mcp-settings.js
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

/**
 * Tools relevant for GRAPH GENERATION process:
 *
 * In agentic mode, AI can use tools to analyze the system before generating
 * the execution graph. Most tools are for EXECUTION inside the graph, not generation.
 *
 * Categories:
 * - meta.*: For system introspection (understanding available tools)
 * - text.normalize, text.tokenize: Basic text analysis of the task
 *
 * NOT needed for generation:
 * - extraction.*: Used inside graph nodes, not during generation
 * - vector.*: Used inside graph nodes for embeddings/search
 * - graph.*: Used inside graph nodes for graph operations
 * - ai.*: Used inside graph nodes for AI operations
 * - pattern.*: Used inside graph nodes for execution patterns
 * - Most primitives: Used for data flow during execution
 */
const GRAPH_GENERATION_TOOLS = [
  // Meta tools - ESSENTIAL for agentic mode (understanding available tools)
  'meta.introspect',      // Lets AI discover what tools exist in the system

  // Basic text tools - for analyzing task text before graph creation
  'text.normalize',       // Clean/normalize task text
];

/**
 * Extended set with more tools for complex generation scenarios
 */
const EXTENDED_GENERATION_TOOLS = [
  ...GRAPH_GENERATION_TOOLS,

  // Additional meta tools
  'meta.validate_tool',   // Validate tool definitions

  // Additional text analysis
  'text.tokenize',         // Analyze task structure
  'text.extract_keywords', // Extract key concepts from task
  'text.detect_language',  // Detect task language

  // Extraction for understanding task intent
  'extraction.entities',   // Extract named entities from task
  'extraction.intent',     // Classify task intent
  'extraction.topics',     // Extract task topics

  // AI assistance for complex tasks
  'ai.classify',           // Classify task type
  'ai.summarize',          // Summarize long tasks
];

/**
 * Full toolset - all tools enabled (default behavior)
 */
const FULL_TOOLSET = null; // null means all tools

async function initSettings() {
  console.log('='.repeat(60));
  console.log('MCP Tools Settings Initialization');
  console.log('='.repeat(60));

  try {
    // First, get list of all available tools
    console.log('\n1. Fetching available MCP tools...');
    const toolsResponse = await axios.get(`${API_BASE_URL}/gxe/mcp-tools`);

    if (!toolsResponse.data.success) {
      throw new Error('Failed to fetch tools: ' + toolsResponse.data.error);
    }

    const allTools = toolsResponse.data.data.tools;
    const stats = toolsResponse.data.data.stats;

    console.log(`   Total tools available: ${stats.total}`);
    console.log(`   By level: ${JSON.stringify(stats.byLevel)}`);
    console.log(`   By category: ${JSON.stringify(stats.byCategory)}`);

    // Validate that our selected tools exist
    const allToolIds = new Set(allTools.map(t => t.id));
    const validMinimalTools = GRAPH_GENERATION_TOOLS.filter(id => allToolIds.has(id));
    const validExtendedTools = EXTENDED_GENERATION_TOOLS.filter(id => allToolIds.has(id));

    console.log(`\n2. Validating tool selections...`);
    console.log(`   Minimal set: ${validMinimalTools.length} of ${GRAPH_GENERATION_TOOLS.length} valid`);
    console.log(`   Extended set: ${validExtendedTools.length} of ${EXTENDED_GENERATION_TOOLS.length} valid`);

    // Show which tools were not found
    const notFoundMinimal = GRAPH_GENERATION_TOOLS.filter(id => !allToolIds.has(id));
    const notFoundExtended = EXTENDED_GENERATION_TOOLS.filter(id => !allToolIds.has(id));

    if (notFoundMinimal.length > 0) {
      console.log(`   WARNING: Minimal tools not found: ${notFoundMinimal.join(', ')}`);
    }
    if (notFoundExtended.length > 0) {
      console.log(`   WARNING: Extended tools not found: ${notFoundExtended.join(', ')}`);
    }

    // Create settings profiles
    console.log('\n3. Creating settings profiles...');

    // Profile 1: Minimal (default) - for most generation tasks
    console.log('\n   Creating "default" profile (minimal tools)...');
    const defaultResult = await axios.post(`${API_BASE_URL}/gxe/mcp-settings`, {
      enabledTools: validMinimalTools,
      settingsId: 'default',
      metadata: {
        name: 'Graph Generation (Minimal)',
        description: 'Minimal tool set for basic graph generation. Optimized for low token usage.'
      }
    });
    console.log(`   ✓ Default profile: ${validMinimalTools.length} tools enabled`);

    // Profile 2: Extended - for complex generation tasks
    console.log('\n   Creating "extended" profile...');
    const extendedResult = await axios.post(`${API_BASE_URL}/gxe/mcp-settings`, {
      enabledTools: validExtendedTools,
      settingsId: 'extended',
      metadata: {
        name: 'Graph Generation (Extended)',
        description: 'Extended tool set for complex graph generation with AI assistance.'
      }
    });
    console.log(`   ✓ Extended profile: ${validExtendedTools.length} tools enabled`);

    // Profile 3: Full - all tools (for power users)
    console.log('\n   Creating "full" profile (all tools)...');
    const fullResult = await axios.post(`${API_BASE_URL}/gxe/mcp-settings`, {
      enabledTools: Array.from(allToolIds),
      settingsId: 'full',
      metadata: {
        name: 'Full Toolset',
        description: 'All MCP tools enabled. May cause rate limit issues with large prompts.'
      }
    });
    console.log(`   ✓ Full profile: ${allToolIds.size} tools enabled`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log('\nCreated profiles:');
    console.log(`  1. default  - ${validMinimalTools.length} tools (recommended for generation)`);
    console.log(`  2. extended - ${validExtendedTools.length} tools (for complex tasks)`);
    console.log(`  3. full     - ${allToolIds.size} tools (all enabled)`);

    console.log('\nToken usage estimate:');
    const estimatedTokensPerTool = 150; // Average tokens per tool definition
    console.log(`  - Minimal:  ~${validMinimalTools.length * estimatedTokensPerTool} tokens`);
    console.log(`  - Extended: ~${validExtendedTools.length * estimatedTokensPerTool} tokens`);
    console.log(`  - Full:     ~${allToolIds.size * estimatedTokensPerTool} tokens`);
    console.log(`  - Savings:  ~${(allToolIds.size - validMinimalTools.length) * estimatedTokensPerTool} tokens with minimal`);

    console.log('\nTools in minimal profile:');
    validMinimalTools.forEach(id => {
      const tool = allTools.find(t => t.id === id);
      console.log(`  - ${id}: ${tool?.description || 'N/A'}`);
    });

    console.log('\n✓ Initialization complete!');
    console.log('\nThe "default" profile will be automatically loaded on GXE page start.');

  } catch (error) {
    console.error('\n✗ Error:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initSettings();
}

module.exports = { initSettings, GRAPH_GENERATION_TOOLS, EXTENDED_GENERATION_TOOLS };
