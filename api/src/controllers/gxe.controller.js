/**
 * GXE Controller
 * Handles GXE visualization and execution API requests
 * Supports agentic AI with MCP tool integration
 */

const { v4: uuidv4 } = require('uuid');

// Knowledge graph extraction services
const { chunkText } = require('../services/chunking/text-chunker');
const { unifiedExtractor } = require('../services/extraction/unified-extractor');
const { createTextPreprocessor } = require('../services/preprocessing/text-preprocessor');

// Graph generation enhancement services
const { createGraphValidator } = require('../services/graph/graph-validator');
// tool-filter.js is deprecated in favor of tool-resolver.js (SDA Stage 2)
const { createGraphQualityMetrics } = require('../services/graph/graph-quality-metrics');
const { getExpectedPropertiesForPrompt, getCorpusStats } = require('../services/graph/test-corpus');
const { createIntentClassifier } = require('../services/graph/intent-classifier');
const { createToolResolver } = require('../services/graph/tool-resolver');
const { createGraphCompiler } = require('../services/graph/graph-compiler');
const { createTaskPlanner } = require('../services/graph/task-planner');
const { STANDARD_TOOL_SET } = require('../services/graph/gxe-defaults');
const { DAG_THRESHOLDS, KG_THRESHOLDS, analyzeAnomalyWithClaude } = require('../services/graph/pipeline-anomaly-gate');

// Lazy load tensor service
let _tensorService = null;
function getTensorServiceLazy() {
    if (!_tensorService) {
        try {
            const { getTensorService } = require('../services/tensor.service');
            _tensorService = getTensorService();
        } catch (e) { /* tensor service not available */ }
    }
    return _tensorService;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const { getInstance: getLLMProvider } = require('../services/llm/LLMProviderService');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // kept for Pattern B SSE streaming (W4-04b)
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'; // kept for Pattern B SSE streaming (W4-04b)

// Available models
const AVAILABLE_MODELS = {
  'claude-opus-4.6': 'claude-opus-4-6',
  'claude-opus-4.6-fast': 'claude-opus-4-6',
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-opus': 'claude-opus-4-20250514'
};

// Models that require fast mode (speed: "fast" + beta header)
const FAST_MODELS = new Set(['claude-opus-4.6-fast']);

const DEFAULT_MODEL = 'claude-opus-4.6';

/**
 * Multi-stage JSON repair for LLM outputs.
 * Handles: trailing commas, truncated strings, unbalanced brackets, incomplete last elements.
 */
function _repairAndParseJSON(jsonStr, originalError) {
  // Stage 1: Remove trailing commas
  let repaired = jsonStr
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}');

  try { return JSON.parse(repaired); } catch (_) { /* continue */ }

  // Stage 2: Walk backwards from error position to find last complete array element
  const errorPos = parseInt((originalError?.message || '').match(/position (\d+)/)?.[1]) || 0;

  if (errorPos > 0) {
    // Scan backwards from errorPos to find the last "},\n" or "}\n" — end of a complete object
    let cutPos = -1;
    for (let i = errorPos - 1; i > 0; i--) {
      if (repaired[i] === '}') {
        // Verify this is followed by comma, whitespace, or is near the error point
        const after = repaired.substring(i + 1, i + 3).trim();
        if (after === '' || after[0] === ',' || after[0] === ']' || after[0] === '}' || i >= errorPos - 2) {
          cutPos = i + 1;
          break;
        }
      }
    }

    if (cutPos > 0) {
      let truncated = repaired.substring(0, cutPos);
      // Remove trailing comma if present
      truncated = truncated.replace(/,\s*$/, '');

      // Balance brackets
      const ob = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
      const oq = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
      truncated += ']'.repeat(Math.max(0, oq));
      truncated += '}'.repeat(Math.max(0, ob));

      try {
        const result = JSON.parse(truncated);
        console.log(`[GXE] JSON repaired by truncation at pos ${cutPos}: ${result.nodes?.length || 0} nodes, ${result.edges?.length || 0} edges`);
        return result;
      } catch (_) { /* continue to next stage */ }
    }

    // Stage 2b: more aggressive — find the last "}\s*," anywhere before errorPos
    const lastCompleteObj = repaired.substring(0, errorPos).lastIndexOf('},');
    if (lastCompleteObj > 0) {
      let truncated = repaired.substring(0, lastCompleteObj + 1); // include the }
      const ob = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
      const oq = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
      truncated += ']'.repeat(Math.max(0, oq));
      truncated += '}'.repeat(Math.max(0, ob));

      try {
        const result = JSON.parse(truncated);
        console.log(`[GXE] JSON repaired by aggressive truncation at },: ${result.nodes?.length || 0} nodes, ${result.edges?.length || 0} edges`);
        return result;
      } catch (_) { /* continue */ }
    }
  }

  // Stage 3: Simple bracket balancing on full string
  {
    const ob = (repaired.match(/\{/g) || []).length - (repaired.match(/\}/g) || []).length;
    const oq = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;
    let balanced = repaired;
    balanced += ']'.repeat(Math.max(0, oq));
    balanced += '}'.repeat(Math.max(0, ob));

    try {
      const result = JSON.parse(balanced);
      console.log('[GXE] JSON repaired by balancing brackets');
      return result;
    } catch (_) { /* continue */ }
  }

  // Stage 4: Extract individual objects by finding balanced braces
  console.warn('[GXE] Structural repair failed, trying balanced-brace extraction');
  const partial = { nodes: [], edges: [] };

  // Find balanced {...} objects by tracking brace depth
  function extractBalancedObjects(str) {
    const objects = [];
    let i = 0;
    while (i < str.length) {
      if (str[i] === '{') {
        let depth = 1, j = i + 1, inString = false, escape = false;
        while (j < str.length && depth > 0) {
          const ch = str[j];
          if (escape) { escape = false; }
          else if (ch === '\\') { escape = true; }
          else if (ch === '"') { inString = !inString; }
          else if (!inString) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          j++;
        }
        if (depth === 0) {
          const obj = str.substring(i, j);
          try {
            objects.push(JSON.parse(obj));
          } catch (_) { /* skip malformed */ }
        }
        i = j;
      } else {
        i++;
      }
    }
    return objects;
  }

  const allObjects = extractBalancedObjects(jsonStr);
  for (const obj of allObjects) {
    if (obj.id && obj.label) {
      partial.nodes.push(obj);
    } else if (obj.source && obj.target) {
      partial.edges.push(obj);
    }
  }

  if (partial.nodes.length > 0) {
    console.log(`[GXE] Balanced-brace extraction recovered ${partial.nodes.length} nodes, ${partial.edges.length} edges`);
    return partial;
  }

  // Nothing could be salvaged
  const ctx = jsonStr.substring(Math.max(0, errorPos - 80), Math.min(jsonStr.length, errorPos + 80));
  console.error('[GXE] JSON repair failed completely. Error context:', ctx);
  throw new Error(`Invalid JSON from Claude (pos ${errorPos}): ${originalError?.message || 'unknown'}`);
}

/**
 * Estimate token count for a Claude API request and log detailed stats.
 * Uses ~4 chars/token heuristic for text; tools counted from JSON schema size.
 * @param {Object} requestBody - The request body to send to Claude
 * @param {string} label - Log label (e.g., 'DAG Generation', 'KG Analysis')
 * @returns {{ estimatedTokens: number, breakdown: Object }}
 */
function logRequestStats(requestBody, label = 'Request') {
  const charToTokens = (chars) => Math.ceil(chars / 4);

  // System prompt
  const systemChars = typeof requestBody.system === 'string'
    ? requestBody.system.length
    : JSON.stringify(requestBody.system || '').length;
  const systemTokens = charToTokens(systemChars);

  // Messages
  const messagesJson = JSON.stringify(requestBody.messages || []);
  const messagesChars = messagesJson.length;
  const messagesTokens = charToTokens(messagesChars);

  // Tools (input_schema is the expensive part)
  const toolsJson = JSON.stringify(requestBody.tools || []);
  const toolsChars = toolsJson.length;
  const toolsTokens = charToTokens(toolsChars);
  const toolCount = (requestBody.tools || []).length;

  // Total
  const totalChars = systemChars + messagesChars + toolsChars;
  const totalTokens = systemTokens + messagesTokens + toolsTokens;

  console.log(`[GXE Stats] ── ${label} ──────────────────────────────────`);
  console.log(`[GXE Stats]   Model:    ${requestBody.model}`);
  console.log(`[GXE Stats]   System:   ${systemChars.toLocaleString()} chars ≈ ${systemTokens.toLocaleString()} tokens`);
  console.log(`[GXE Stats]   Messages: ${messagesChars.toLocaleString()} chars ≈ ${messagesTokens.toLocaleString()} tokens`);
  if (toolCount > 0) {
    console.log(`[GXE Stats]   Tools:    ${toolCount} tools, ${toolsChars.toLocaleString()} chars ≈ ${toolsTokens.toLocaleString()} tokens`);
  }
  console.log(`[GXE Stats]   TOTAL:    ${totalChars.toLocaleString()} chars ≈ ${totalTokens.toLocaleString()} input tokens`);
  console.log(`[GXE Stats]   MaxOut:   ${requestBody.max_tokens || 'default'} tokens`);
  if (requestBody.speed) {
    console.log(`[GXE Stats]   Speed:    ${requestBody.speed}`);
  }
  console.log(`[GXE Stats] ──────────────────────────────────────────────`);

  return {
    estimatedTokens: totalTokens,
    breakdown: { systemTokens, messagesTokens, toolsTokens, toolCount, totalChars }
  };
}

/**
 * Handle a detected pipeline anomaly: log, call Claude for diagnosis, return structured result.
 */
async function handleAnomaly(pipeline, stageName, anomalyReason, stageInput, stageOutput, taskDescription) {
  console.error(`[GXE AnomalyGate] ${pipeline.toUpperCase()} pipeline halted at "${stageName}": ${anomalyReason}`);
  console.error(`[GXE AnomalyGate] ── Stage Input ──`);
  console.error(`[GXE AnomalyGate]   ${JSON.stringify(stageInput, null, 2).substring(0, 1000).replace(/\n/g, '\n[GXE AnomalyGate]   ')}`);
  console.error(`[GXE AnomalyGate] ── Stage Output ──`);
  console.error(`[GXE AnomalyGate]   ${JSON.stringify(stageOutput, null, 2).substring(0, 1000).replace(/\n/g, '\n[GXE AnomalyGate]   ')}`);
  const analysis = await analyzeAnomalyWithClaude(
    { pipeline, stageName, anomalyReason, stageInput, stageOutput, taskDescription },
    { model: 'haiku' }
  );
  return { anomalyDetected: true, stage: stageName, reason: anomalyReason, analysis, timestamp: new Date().toISOString() };
}

// MCP Server instance (lazy init)
let mcpServer = null;

/**
 * Initialize MCP Server with all tools
 * Uses GOD_MODE for agentic graph generation
 */
async function getMcpServer() {
  if (!mcpServer) {
    try {
      const { createGXEServer } = require('../mcp/index.js');
      // Enable GOD_MODE for agentic graph generation - allows all safety levels
      mcpServer = await createGXEServer({
        safety: {
          godModeEnabled: true,
          godModeExpiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        }
      });
      console.log('[GXE] MCP Server initialized with', mcpServer.registry.listTools().length, 'tools (GOD_MODE)');
    } catch (error) {
      console.warn('[GXE] Failed to initialize MCP Server:', error.message);
    }
  }
  return mcpServer;
}

/**
 * Bidirectional tool name mapping (sanitized ↔ original).
 * Populated by sanitizeToolName(), consumed by restoreToolName().
 */
const _toolNameMap = new Map(); // sanitized → original

/**
 * Sanitize tool name for Claude API (dots not allowed in tool names)
 * catalog.search_graphs -> catalog_search_graphs
 */
function sanitizeToolName(name) {
  const sanitized = name.replace(/\./g, '_');
  _toolNameMap.set(sanitized, name);
  return sanitized;
}

/**
 * Restore original tool name from sanitized version
 * catalog_search_graphs -> catalog.search_graphs
 */
function restoreToolName(sanitizedName) {
  // Prefer dynamic map (populated during sanitization)
  if (_toolNameMap.has(sanitizedName)) {
    return _toolNameMap.get(sanitizedName);
  }
  // Fallback: heuristic prefix match for tools sanitized before map existed
  const prefixes = ['text', 'extraction', 'vector', 'graph', 'ai', 'control', 'pattern', 'meta', 'catalog'];
  for (const prefix of prefixes) {
    if (sanitizedName.startsWith(prefix + '_')) {
      return prefix + '.' + sanitizedName.slice(prefix.length + 1);
    }
  }
  return sanitizedName;
}

/**
 * Get MCP tools formatted for Claude tool_use (includes input_schema — for agentic/legacy mode)
 * @param {string[]} enabledToolIds - Optional array of tool IDs to include.
 *   - If null/undefined: uses STANDARD_TOOL_SET (default - optimized for token usage)
 *   - If empty array []: returns all tools (full set)
 *   - If array with IDs: returns only those tools
 * @param {boolean} useFullSet - Force full tool set (ignore enabledToolIds)
 */
async function getMcpToolsForClaude(enabledToolIds = null, useFullSet = false) {
  const server = await getMcpServer();
  if (!server) return [];

  let tools = server.registry.listTools();
  const totalTools = tools.length;

  // Apply tool filtering
  if (useFullSet) {
    // Full set requested - no filtering
    console.log(`[GXE] Using FULL tool set: ${totalTools} tools`);
  } else if (enabledToolIds && Array.isArray(enabledToolIds) && enabledToolIds.length > 0) {
    // User-specified filter
    const enabledSet = new Set(enabledToolIds);
    tools = tools.filter(tool => enabledSet.has(tool.id));
    console.log(`[GXE] User filter: ${tools.length}/${totalTools} tools enabled`);
  } else {
    // Default: use STANDARD_TOOL_SET for token optimization
    const defaultSet = new Set(STANDARD_TOOL_SET);
    tools = tools.filter(tool => defaultSet.has(tool.id));
    console.log(`[GXE] Default STANDARD set: ${tools.length}/${totalTools} tools (token optimization)`);
  }

  return tools.map(tool => ({
    name: sanitizeToolName(tool.id),
    description: `[${tool.category}] ${tool.description}`,
    input_schema: tool.inputSchema
  }));
}

/**
 * Get MCP tools in lightweight format (no input_schema — for SDA mode / Tool Resolver)
 * Saves memory and avoids sending schemas that are never used in SDA pipeline.
 * @param {string[]} enabledToolIds - Same filtering as getMcpToolsForClaude
 */
async function getMcpToolsLightweight(enabledToolIds = null) {
  const server = await getMcpServer();
  if (!server) return [];

  let tools = server.registry.listTools();
  const totalTools = tools.length;

  if (enabledToolIds && Array.isArray(enabledToolIds) && enabledToolIds.length > 0) {
    const enabledSet = new Set(enabledToolIds);
    tools = tools.filter(tool => enabledSet.has(tool.id));
  } else {
    const defaultSet = new Set(STANDARD_TOOL_SET);
    tools = tools.filter(tool => defaultSet.has(tool.id));
  }

  console.log(`[GXE] Lightweight tool set: ${tools.length}/${totalTools} tools (no schemas)`);

  return tools.map(tool => ({
    id: tool.id,
    name: sanitizeToolName(tool.id),
    description: `[${tool.category}] ${tool.description}`,
    category: tool.category
  }));
}

/**
 * Execute MCP tool by name (handles sanitized names from Claude)
 */
async function executeMcpTool(toolName, args, parentTensorId = null) {
  const tensorService = getTensorServiceLazy();
  const tensor = tensorService?.start('gxe.mcp.tool', {
    tool: toolName,
    argKeys: args ? Object.keys(args) : []
  }, parentTensorId);

  const server = await getMcpServer();
  if (!server) {
    tensorService?.fail(tensor?.id, 'MCP Server not available');
    return { error: 'MCP Server not available' };
  }

  // Restore original tool name (with dots)
  const originalName = restoreToolName(toolName);

  try {
    const result = await server.executeTool(originalName, args);
    if (result.isError) {
      const errorMsg = result.content[0]?.text || 'Tool execution failed';
      tensorService?.fail(tensor?.id, errorMsg);
      return { error: errorMsg };
    }

    tensorService?.complete(tensor?.id, { success: true });
    return { data: JSON.parse(result.content[0]?.text || '{}') };
  } catch (error) {
    tensorService?.fail(tensor?.id, error);
    return { error: error.message };
  }
}

/**
 * Build system prompt with full context
 */
/**
 * Build only the sub-graph context section (extracted from buildSystemPrompt).
 * Used when loading the base prompt from DB and dynamically prepending context.
 */
function buildParentContextSection(parentContext) {
  if (!parentContext) return '';

  const upstreamInfo = parentContext.upstreamNodes?.length
    ? `\n**Input Sources (upstream nodes):**\n${parentContext.upstreamNodes.map(n =>
        `- "${n.label}" (${n.kind}): ${n.description || 'no description'}`
      ).join('\n')}`
    : '\n**Input Sources:** Direct input from pipeline start';

  const downstreamInfo = parentContext.downstreamNodes?.length
    ? `\n**Output Consumers (downstream nodes):**\n${parentContext.downstreamNodes.map(n =>
        `- "${n.label}" (${n.kind}): ${n.description || 'no description'}`
      ).join('\n')}`
    : '\n**Output Consumers:** Direct output to pipeline end';

  const pipelinePosition = parentContext.pipelinePosition || 'middle';
  const positionNote = {
    'start': 'This is an EARLY stage node - focus on data acquisition and initial processing.',
    'middle': 'This is a MIDDLE stage node - focus on transformation and enrichment.',
    'end': 'This is a LATE stage node - focus on aggregation and final output formatting.'
  }[pipelinePosition] || '';

  return `
## SUB-GRAPH GENERATION CONTEXT
**IMPORTANT:** You are creating a detailed internal implementation SUB-GRAPH for a specific node within a larger parent execution graph.

### Current Node to Decompose
- **ID:** ${parentContext.nodeId}
- **Label:** ${parentContext.nodeLabel}
- **Type:** ${parentContext.nodeKind}
- **Description:** ${parentContext.nodeDescription || 'No description provided'}
${upstreamInfo}
${downstreamInfo}

### Pipeline Position
${positionNote}

### Parent Graph Overview
${parentContext.parentGraphSummary || 'Full parent graph context not provided'}

### Data Flow Context
${parentContext.dataFlowContext || 'The sub-graph should accept input data, process it according to the node\'s purpose, and produce output for downstream consumption.'}

### Sub-Graph Requirements
1. **Input Compatibility:** Your sub-graph's input node must accept data from: ${parentContext.upstreamNodes?.map(n => n.label).join(', ') || 'pipeline input'}
2. **Output Compatibility:** Your sub-graph's output must be consumable by: ${parentContext.downstreamNodes?.map(n => n.label).join(', ') || 'pipeline output'}
3. **Purpose Alignment:** The sub-graph must fully implement the functionality described in "${parentContext.nodeLabel}"
4. **Granularity:** Break down the operation into 3-8 concrete executable steps

`;
}

/**
 * Load the active GXE generation prompt from graph DB.
 * Falls back to hardcoded buildSystemPrompt() if DB is empty.
 * @returns {{ content: string, promptVersionId: string|null }}
 */
async function getActiveGenerationPrompt(parentContext = null) {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const prompt = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {id: 'gxe-generation-prompt-default'})-[:DEFAULT_PROMPT]->(pv:PromptVersion {category: 'gxe-generation'})
         RETURN pv.id AS id, pv.content AS content`
      );
      if (result.records.length === 0) return null;
      return {
        id: result.records[0].get('id'),
        content: result.records[0].get('content')
      };
    });

    if (prompt && prompt.content) {
      // Safety check: prompt must be for execution graph generation, NOT knowledge graph extraction
      const isKGPrompt = prompt.content.includes('knowledge graph extraction engine')
        || (prompt.content.includes('entities') && prompt.content.includes('relations') && !prompt.content.includes('"nodes"'));
      if (isKGPrompt) {
        console.warn(`[GXE] ⚠️ DB prompt "${prompt.id}" is a KG extraction prompt, not an execution graph prompt — falling back to hardcoded`);
      } else {
        const contextSection = buildParentContextSection(parentContext);
        return { content: contextSection + prompt.content, promptVersionId: prompt.id };
      }
    }
  } catch (err) {
    console.warn('[GXE] Failed to load generation prompt from DB, using hardcoded:', err.message);
  }
  return { content: buildSystemPrompt(parentContext), promptVersionId: null };
}

/**
 * Seed the first generation prompt from hardcoded buildSystemPrompt()
 */
async function seedDefaultGenerationPrompt() {
  const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
  const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

  const hardcodedContent = buildSystemPrompt(null);
  const versionId = uuidv4();

  await withWriteTransaction(graphDB.driver, async (tx) => {
    await tx.run(
      `CREATE (pv:PromptVersion {
         id: $id, category: 'gxe-generation', name: 'GXE Default v1',
         content: $content, version: '1', status: 'default',
         createdAt: $createdAt, metadata: $metadata
       })`,
      {
        id: versionId,
        content: hardcodedContent,
        createdAt: new Date().toISOString(),
        metadata: JSON.stringify({ source: 'hardcoded-seed', seededAt: new Date().toISOString() })
      }
    );
    await tx.run(
      `MERGE (s:Settings {id: 'gxe-generation-prompt-default'})
       SET s.type = 'prompt-pointer', s.updatedAt = $updatedAt
       WITH s
       MATCH (pv:PromptVersion {id: $pvId, category: 'gxe-generation'})
       CREATE (s)-[:DEFAULT_PROMPT]->(pv)`,
      { pvId: versionId, updatedAt: new Date().toISOString() }
    );
  });

  console.log(`[GXE] Seeded default generation prompt v1 (${versionId})`);
  return { id: versionId, version: 1, content: hardcodedContent, isDefault: true, name: 'GXE Default v1' };
}

/**
 * Record prompt effectiveness metric (fire-and-forget internal helper)
 */
async function recordPromptMetricInternal(promptVersionId, metrics) {
  const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
  const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');
  const metricId = uuidv4();

  await withWriteTransaction(graphDB.driver, async (tx) => {
    await tx.run(
      `MATCH (pv:PromptVersion {id: $promptId, category: 'gxe-generation'})
       CREATE (m:PromptMetric {
         id: $metricId, promptVersionId: $promptId,
         inputTextType: $inputTextType, inputTextLength: $inputTextLength,
         inputTextHash: $inputTextHash,
         qualityScore: $qualityScore, qualityGrade: $qualityGrade,
         structuralScore: $structuralScore, semanticScore: $semanticScore,
         validationPassed: $validationPassed,
         nodeCount: $nodeCount, edgeCount: $edgeCount,
         generationTimeMs: $generationTimeMs,
         tokensInput: $tokensInput, tokensOutput: $tokensOutput,
         model: $model, createdAt: $createdAt
       })
       CREATE (pv)-[:HAS_METRIC]->(m)`,
      {
        promptId: promptVersionId, metricId,
        inputTextType: String(metrics.inputTextType || 'general'),
        inputTextLength: String(metrics.inputTextLength || 0),
        inputTextHash: String(metrics.inputTextHash || ''),
        qualityScore: String(metrics.qualityScore || 0),
        qualityGrade: String(metrics.qualityGrade || 'N/A'),
        structuralScore: String(metrics.structuralScore || 0),
        semanticScore: String(metrics.semanticScore || 0),
        validationPassed: String(metrics.validationPassed || false),
        nodeCount: String(metrics.nodeCount || 0),
        edgeCount: String(metrics.edgeCount || 0),
        generationTimeMs: String(metrics.generationTimeMs || 0),
        tokensInput: String(metrics.tokensInput || 0),
        tokensOutput: String(metrics.tokensOutput || 0),
        model: String(metrics.model || 'unknown'),
        createdAt: new Date().toISOString()
      }
    );
  });
}

function buildSystemPrompt(parentContext = null) {
  let contextSection = '';

  if (parentContext) {
    // Build rich context for sub-graph generation
    const upstreamInfo = parentContext.upstreamNodes?.length
      ? `\n**Input Sources (upstream nodes):**\n${parentContext.upstreamNodes.map(n =>
          `- "${n.label}" (${n.kind}): ${n.description || 'no description'}`
        ).join('\n')}`
      : '\n**Input Sources:** Direct input from pipeline start';

    const downstreamInfo = parentContext.downstreamNodes?.length
      ? `\n**Output Consumers (downstream nodes):**\n${parentContext.downstreamNodes.map(n =>
          `- "${n.label}" (${n.kind}): ${n.description || 'no description'}`
        ).join('\n')}`
      : '\n**Output Consumers:** Direct output to pipeline end';

    const pipelinePosition = parentContext.pipelinePosition || 'middle';
    const positionNote = {
      'start': 'This is an EARLY stage node - focus on data acquisition and initial processing.',
      'middle': 'This is a MIDDLE stage node - focus on transformation and enrichment.',
      'end': 'This is a LATE stage node - focus on aggregation and final output formatting.'
    }[pipelinePosition] || '';

    contextSection = `
## SUB-GRAPH GENERATION CONTEXT
**IMPORTANT:** You are creating a detailed internal implementation SUB-GRAPH for a specific node within a larger parent execution graph.

### Current Node to Decompose
- **ID:** ${parentContext.nodeId}
- **Label:** ${parentContext.nodeLabel}
- **Type:** ${parentContext.nodeKind}
- **Description:** ${parentContext.nodeDescription || 'No description provided'}
${upstreamInfo}
${downstreamInfo}

### Pipeline Position
${positionNote}

### Parent Graph Overview
${parentContext.parentGraphSummary || 'Full parent graph context not provided'}

### Data Flow Context
${parentContext.dataFlowContext || 'The sub-graph should accept input data, process it according to the node\'s purpose, and produce output for downstream consumption.'}

### Sub-Graph Requirements
1. **Input Compatibility:** Your sub-graph's input node must accept data from: ${parentContext.upstreamNodes?.map(n => n.label).join(', ') || 'pipeline input'}
2. **Output Compatibility:** Your sub-graph's output must be consumable by: ${parentContext.downstreamNodes?.map(n => n.label).join(', ') || 'pipeline output'}
3. **Purpose Alignment:** The sub-graph must fully implement the functionality described in "${parentContext.nodeLabel}"
4. **Granularity:** Break down the operation into 3-8 concrete executable steps

`;
  }

  return `# GXE (Graph Execution Engine) - AI Orchestrator

${contextSection}You are the GXE AI - an intelligent orchestrator that analyzes task descriptions and builds optimized executable graphs for automated processing pipelines.

## YOUR MISSION
Transform natural language task descriptions into precise, executable DAG (Directed Acyclic Graph) structures that can be run by the GXE execution engine. Your graphs must be:
- **Correct**: Proper data flow from input to output
- **Efficient**: Parallel execution where possible
- **Complete**: All necessary processing steps included
- **Practical**: Using real tools from the system

## LANGUAGE REQUIREMENT
**IMPORTANT:** Always respond in English only. All node labels, descriptions, and any text in your output must be in English, regardless of the input language. If the user's task is in another language, translate it to English before processing.

## TOOLS (use as node kind references)
L1 Primitives: text.normalize, text.tokenize, text.hash, text.split, text.join, text.template, control.if, control.loop, control.try
L2 Domain: extraction.regex, extraction.entities, extraction.structure, vector.embed, vector.search, vector.upsert, graph.query, graph.create, graph.traverse, ai.complete, ai.classify, ai.summarize, ai.analyze
L3 Patterns: pattern.chain, pattern.parallel, pattern.pipeline, pattern.batch, pattern.map_reduce, pattern.retry, pattern.cache, pattern.rag
L4 Meta: meta.introspect, meta.create_tool, meta.compose, meta.optimize

## NODE KINDS
input (cyan) — entry point, always id="input" | executor (green) — data processing | ai (yellow) — LLM ops | business (blue) — logic/decisions | actor (purple) — multi-step workflows | condition (orange) — branching | output (pink) — final result, always id="output"

## RULES
- Start with one input node (id="input"), end with one output node (id="output")
- All nodes connected, no orphans, no cycles (DAG)
- Parallelize independent ops: x=180 left, x=400 center, x=620 right
- y starts at 0, increments by 130 per row
- Descriptive lowercase IDs: "extract_entities", not "step1"
- Short descriptions (under 60 chars), describe WHAT not WHY
- Define requiredParams with types: "textarea" for text, "select" for choices

## CODEX GOVERNANCE
${_getCodexRulesSync()}

## KNOWLEDGE ACCESS PROTOCOL
Before creating or modifying anything, search internal knowledge first:
- Use codex_search_rules("keywords") to find applicable governance rules
- Use backlog_list_tasks() to check for existing/duplicate tasks
- When a required tool is missing, create a backlog task via backlog_create_task
- Cite Codex rules when they apply (e.g., "per CODEX-RULE-FD-001")
ALL responses and data MUST be in English regardless of input language.

## DOCUMENT-BASED GRAPH GENERATION PROTOCOL (CODEX-RULE-DOC-001)
When the user provides TEXT or a DOCUMENT and asks to generate a graph from it:
1. FIRST call document_classify({document_text: first 2000 chars of text}) to determine document type
2. If classified (confidence >= 0.6): call document_get_prompt({document_type_id, prompt_type: "gxe_generation"})
3. Use the retrieved specialized prompt to guide graph generation — it contains domain-specific extraction rules
4. If also available: call document_get_prompt with prompt_type "structure" or "procedures" to extract structured data first, THEN generate graph from extracted data
5. If document type is "unknown" (confidence < 0.6): ask user to clarify document type, or proceed with generic graph generation
6. Include document_type_id in graph metadata for traceability
This ensures SOP documents get SOP-specific extraction, policy documents get policy-specific extraction, etc.

## MANDATORY: TOOL BINDING DURING GENERATION (CODEX-RULE-GXE-032)
For EVERY executor node you generate, you MUST:
1. Call catalog_search_tools or catalog_list_tools to find the correct tool/executorId
2. Assign the found tool ID to node.data.tool AND node.data.executorId
3. If no tool found: set tool to "UNKNOWN" and note it in your response
NEVER generate executor nodes without tool/executorId. NEVER guess tool IDs.

Common FlowDesk tools: flowdesk.classify_intent, flowdesk.check_location, flowdesk.search_location,
flowdesk.ask_beneficiary, flowdesk.find_user, flowdesk.confirm_request, flowdesk.create_service_request,
flowdesk.request_approval, flowdesk.create_work_order, flowdesk.assign_handler, flowdesk.send_notification,
flowdesk.spawn_process
Common workflow tools: workflow.start, workflow.end, workflow.condition, workflow.wait_input, workflow.set_variable
AI tools: ai.generate

## MANDATORY: WAIT_FOR_INPUT ON DIALOG NODES (CODEX-RULE-GXE-001)
Any node that collects user input (confirm, search, ask, select, describe) MUST have:
- node.data.waitForInput = true
- node.data.config.waitForInput = true
Silent/backend nodes (create, assign, send, check, route, classify) must NOT have waitForInput.

## MANDATORY: CONDITION EDGE LABELS (CODEX-RULE-GXE-002, GXE-022, GXE-025)
- 2-branch conditions: edges MUST have label "true" and "false"
- Multi-branch (3+): edges MUST have named labels matching expression return values
- NEVER use "default" as label (it is a wildcard that matches everything)
- Use "unclassified", "fallback", "other" instead

## MANDATORY: POST-GENERATION SELF-VALIDATION (CODEX-RULE-GXE-031)
Before returning the graph, verify ALL of these:
1. Every executor node has tool and executorId set
2. Every dialog node has waitForInput: true
3. Every condition node has at least 2 outgoing edges with labels
4. Exactly one start node (kind: "input"), at least one end node (kind: "output")
5. No orphan nodes (every non-start node has at least one incoming edge)
6. Condition expressions use NodeID.field format (e.g., N06.confidence), NOT input.field
If ANY check fails, fix it before returning.

## OUTPUT FORMAT (STRICT JSON ONLY)
Respond with ONLY compact JSON, no markdown, no explanations.
{"nodes":[{"id":"N01","label":"...","kind":"input","description":"...","x":400,"y":0,"data":{"tool":"workflow.start","executorId":"workflow.start","waitForInput":true}},...],"edges":[{"source":"N01","target":"N02","label":""}],"requiredParams":{"paramName":{"type":"textarea|select","label":"...","placeholder":"..."}}}

Now analyze the user's task and build the optimal execution graph.`;
}

/**
 * Get Codex rules for GXE prompt (sync-safe with cache)
 */
let _codexRulesCache = { text: '', timestamp: 0 };
function _getCodexRulesSync() {
  // Return cached if fresh (5 minutes)
  if (Date.now() - _codexRulesCache.timestamp < 5 * 60 * 1000 && _codexRulesCache.text) {
    return _codexRulesCache.text;
  }
  // Async refresh in background
  _refreshCodexRules().catch(() => {});
  return _codexRulesCache.text || 'Codex rules loading...';
}

async function _refreshCodexRules() {
  try {
    const codexLoader = require('../services/codex/codex-loader.service');
    const result = await codexLoader.loadForGxeAssistant();
    if (result && result.prompt) {
      _codexRulesCache = { text: result.prompt, timestamp: Date.now() };
    }
  } catch {
    // Codex not available
  }
}

/**
 * Agentic AI loop with tool use support
 * @param {string} task - Task description
 * @param {object} options - { model, parentContext, useTools, enabledTools, parentTensorId }
 */
async function callClaudeForGraph(task, options = {}) {
  const { model = DEFAULT_MODEL, parentContext = null, useTools = false, enabledTools = null, parentTensorId = null, temperature = 0.3, maxTokens = 8192 } = options;
  const startTime = Date.now();

  const tensorService = getTensorServiceLazy();
  const tensor = tensorService?.start('gxe.claude.generateGraph', {
    model,
    taskLength: task?.length || 0,
    useTools,
    isSubGraph: !!parentContext
  }, parentTensorId);

  // LLM metadata collector
  const llmMetadata = {
    duration: 0,
    model: model,
    modelId: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    toolsProvided: 0,
    toolsTotal: 0,
    enhanced: false,
    stopReason: null,
    turns: 0
  };

  const modelId = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];
  llmMetadata.modelId = modelId;
  const { content: systemPrompt, promptVersionId } = await getActiveGenerationPrompt(parentContext);

  // Get MCP tools if agentic mode enabled (single call — enabledTools filter applied directly)
  let tools = [];
  if (useTools) {
    tools = await getMcpToolsForClaude(enabledTools);
    llmMetadata.toolsProvided = tools.length;
    llmMetadata.toolsTotal = tools.length; // filtered count (full count not needed)
    console.log(`[GXE] Agentic mode: ${tools.length} MCP tools${enabledTools ? ' (filtered)' : ' (STANDARD_SET)'}`);
  }

  // Build initial user message with context
  let userContent = `## TASK TO ANALYZE\n\n"${task}"\n\n`;

  if (parentContext) {
    userContent += `## CONTEXT\nThis is a sub-graph for the "${parentContext.nodeLabel}" node (${parentContext.nodeKind}).\n`;
    userContent += `Parent node description: ${parentContext.nodeDescription || 'Not specified'}\n\n`;
  }

  userContent += `## INSTRUCTIONS

1. Analyze the task requirements carefully
2. Identify all processing steps needed
3. Determine which steps can run in parallel
4. Select appropriate tools from each level
5. Define required input parameters
6. Build the execution graph

${useTools ? 'You may use available tools to analyze or introspect the system before building the graph.\n' : ''}
Respond with ONLY the JSON graph structure. No explanations, no markdown, just valid JSON.`;

  const messages = [{ role: 'user', content: userContent }];
  const MAX_TURNS = useTools ? 5 : 1; // Allow multiple turns for tool use
  let turn = 0;
  let toolResults = [];

  try {
    while (turn < MAX_TURNS) {
      turn++;
      const isFast = FAST_MODELS.has(model);
      const chatOptions = {
        model: modelId,
        maxTokens,
        temperature,
        system: systemPrompt,
        tools: (useTools && tools.length > 0) ? tools : undefined,
        ...(isFast && { speed: 'fast', betaHeader: 'fast-mode-2026-02-01' }),
      };

      // Log request stats before sending
      logRequestStats({ model: modelId, max_tokens: maxTokens, temperature, messages }, `DAG Generation (turn ${turn})`);

      let data;
      try {
        const llmResp = await getLLMProvider().chat(messages, chatOptions);
        data = llmResp;
      } catch (err) {
        // If fast mode hits rate limit, retry without fast mode
        if (isFast && err.status === 429) {
          console.warn('[GXE] Fast mode rate limited, retrying without fast mode...');
          logRequestStats({ model: modelId, max_tokens: maxTokens, temperature, messages }, `DAG Generation (turn ${turn}, no fast)`);
          try {
            const retryResp = await getLLMProvider().chat(messages, { ...chatOptions, speed: undefined, betaHeader: undefined });
            data = retryResp;
          } catch (retryErr) {
            const retryMsg = `LLM error (after fast fallback): ${retryErr.message}`;
            console.error('[GXE]', retryMsg);
            return { data: null, error: retryMsg };
          }
        } else {
          const errMsg = `LLM error: ${err.message || err}`;
          console.error('[GXE]', errMsg);
          tensorService?.fail(tensor?.id, errMsg);
          llmMetadata.duration = Date.now() - startTime;
          return { data: null, error: errMsg, llmMetadata };
        }
      }

      // Collect usage data from Claude API response
      if (data.usage) {
        llmMetadata.usage.input_tokens += data.usage.input_tokens || 0;
        llmMetadata.usage.output_tokens += data.usage.output_tokens || 0;
      }
      llmMetadata.stopReason = data.stop_reason;
      llmMetadata.turns = turn;

      // Check for tool use
      const toolUseBlocks = data.content?.filter(b => b.type === 'tool_use') || [];

      if (toolUseBlocks.length > 0 && useTools) {
        // Execute tools
        console.log(`[GXE] Turn ${turn}: Executing ${toolUseBlocks.length} tools`);

        // Add assistant message with tool calls
        messages.push({ role: 'assistant', content: data.content });

        // Execute each tool and collect results
        const toolResultContent = [];
        for (const toolCall of toolUseBlocks) {
          console.log(`[GXE] Calling tool: ${toolCall.name}`);
          const result = await executeMcpTool(toolCall.name, toolCall.input);
          toolResults.push({ tool: toolCall.name, result });

          toolResultContent.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result.data || { error: result.error })
          });
        }

        // Add tool results to messages
        messages.push({ role: 'user', content: toolResultContent });
        continue; // Continue the loop for next turn
      }

      // No tool use, extract final response
      const text = data.content?.find(b => b.type === 'text')?.text || '';

      // Detect output truncation — Claude hit max_tokens limit
      const wasTruncated = data.stop_reason === 'max_tokens';
      if (wasTruncated) {
        console.warn(`[GXE] ⚠️ Claude output was TRUNCATED (max_tokens=${maxTokens}). JSON likely incomplete.`);
      }

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        const msg = wasTruncated
          ? `Claude output truncated at ${maxTokens} tokens — no complete JSON produced. Try a simpler prompt.`
          : 'Claude response did not contain valid JSON';
        console.error('[GXE]', msg);
        return { data: null, error: msg };
      }

      // Parse JSON with multi-stage repair for common LLM output issues
      let parsed;
      let jsonStr = jsonMatch[0];
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        console.warn(`[GXE] Initial JSON parse failed${wasTruncated ? ' (output was truncated)' : ''}, attempting repair:`, parseError.message);
        parsed = _repairAndParseJSON(jsonStr, parseError);
      }
      const nodeCount = parsed.nodes?.length || 0;
      const edgeCount = parsed.edges?.length || 0;
      console.log(`[GXE] ✅ Claude (${model}) generated graph: ${nodeCount} nodes, ${edgeCount} edges`);

      // Diagnostic dump when Claude returns 0 nodes — helps debug generation issues
      if (nodeCount === 0) {
        console.error(`[GXE] ⚠️ 0 nodes from Claude. stop_reason=${data.stop_reason}, output_tokens=${data.usage?.output_tokens || '?'}`);
        console.error(`[GXE] ── Stage Input Parameters ──`);
        console.error(`[GXE]   Model: ${model} → ${modelId}`);
        console.error(`[GXE]   Temperature: ${temperature}, MaxTokens: ${maxTokens}`);
        console.error(`[GXE]   Tools: ${useTools ? `${tools.length} tools provided` : 'disabled'}`);
        console.error(`[GXE]   Task (first 300 chars): ${task.substring(0, 300)}`);
        console.error(`[GXE] ── System Prompt (first 800 chars) ──`);
        console.error(`[GXE]   ${systemPrompt.substring(0, 800).replace(/\n/g, '\n[GXE]   ')}`);
        console.error(`[GXE] ── User Message (first 500 chars) ──`);
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        const msgContent = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg?.content)
            ? lastUserMsg.content.map(b => b.text || `[${b.type}]`).join(' ')
            : JSON.stringify(lastUserMsg?.content || '');
        console.error(`[GXE]   ${msgContent.substring(0, 500).replace(/\n/g, '\n[GXE]   ')}`);
        console.error(`[GXE] ── Claude Response ──`);
        console.error(`[GXE]   Raw (first 500 chars): ${text.substring(0, 500)}`);
        console.error(`[GXE]   Parsed keys: ${Object.keys(parsed).join(', ')}`);

        // Recovery: Claude sometimes returns a knowledge graph format (entities/relations/processes)
        // instead of an execution graph (nodes/edges). Detect and convert.
        const hasEntities = Array.isArray(parsed.entities) && parsed.entities.length > 0;
        const hasRelations = Array.isArray(parsed.relations) && parsed.relations.length > 0;
        const hasProcesses = Array.isArray(parsed.processes) && parsed.processes.length > 0;

        if (hasEntities || hasProcesses) {
          const entities = parsed.entities || [];
          const processes = (parsed.processes || []).map(p => ({ ...p, kind: p.kind || p.type || 'process' }));
          parsed.nodes = [...entities, ...processes];
          parsed._recoveredFromKG = true;
          console.log(`[GXE] 🔄 KG Recovery: ${entities.length} entities + ${processes.length} processes → ${parsed.nodes.length} nodes`);
        }
        if (hasRelations && !parsed.edges?.length) {
          parsed.edges = parsed.relations;
          console.log(`[GXE] 🔄 KG Recovery: ${parsed.relations.length} relations → edges`);
        }

        // Fallback: check for any array with id-bearing items
        if (!parsed.nodes?.length) {
          const altNodeKeys = Object.keys(parsed).filter(k =>
            Array.isArray(parsed[k]) && parsed[k].length > 0 && parsed[k][0]?.id
            && !['unresolved'].includes(k) // Skip non-node arrays
          );
          if (altNodeKeys.length > 0) {
            console.log(`[GXE] 🔄 Fallback: found nodes under key "${altNodeKeys[0]}" (${parsed[altNodeKeys[0]].length} items)`);
            parsed.nodes = parsed[altNodeKeys[0]];
          }
        }

        if (parsed.nodes?.length) {
          console.log(`[GXE] ✅ Recovery successful: ${parsed.nodes.length} nodes, ${parsed.edges?.length || 0} edges`);
        } else {
          console.error(`[GXE] ❌ Recovery failed: still 0 nodes after all attempts`);
        }
      }

      // Convert to frontend format
      // Handles both execution graph format (label/kind) and KG entity format (name/type)
      const nodes = (parsed.nodes || []).map((n, i) => ({
        id: n.id || `node-${i}`,
        type: 'graphNode',
        position: { x: n.x || 400, y: n.y || (i * 130) },
        data: {
          label: n.label || n.name || n.id,
          kind: n.kind || n.type || n.layer || 'entity',
          description: n.description || n.context || '',
          confidence: n.confidence,
          status: 'idle'
        }
      }));

      const edges = (parsed.edges || []).map((e, i) => ({
        id: e.id || `e-${e.source || e.from}-${e.target || e.to}-${i}`,
        source: e.source || e.from || e.subject || '',
        target: e.target || e.to || e.object || '',
        label: e.label || e.type || e.predicate || ''
      }));

      // Finalize LLM metadata
      llmMetadata.duration = Date.now() - startTime;

      tensorService?.complete(tensor?.id, {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        turns: turn,
        toolCount: toolResults.length
      });

      return {
        data: { nodes, edges, requiredParams: parsed.requiredParams || {} },
        error: null,
        llmMetadata,
        promptVersionId,
        meta: {
          model,
          modelId,
          turns: turn,
          toolsUsed: toolResults.map(t => t.tool),
          inputTokens: llmMetadata.usage.input_tokens,
          outputTokens: llmMetadata.usage.output_tokens
        }
      };
    }

    llmMetadata.duration = Date.now() - startTime;
    tensorService?.fail(tensor?.id, `Max turns (${MAX_TURNS}) exceeded`);
    return { data: null, error: `Max turns (${MAX_TURNS}) exceeded without producing graph`, llmMetadata };
  } catch (err) {
    const errorMsg = err.name === 'AbortError'
      ? 'Claude API request timed out (120s) — try a shorter task description or a faster model'
      : `Claude API call failed: ${err.message}`;
    console.error('[GXE]', errorMsg);
    llmMetadata.duration = Date.now() - startTime;
    tensorService?.fail(tensor?.id, errorMsg);
    return { data: null, error: errorMsg, llmMetadata };
  }
}

/**
 * Enhanced graph generation with dynamic tool filtering and validation
 * Wraps callClaudeForGraph with pre/post processing
 *
 * @param {string} task - Task description
 * @param {object} options - { model, parentContext, useTools, enabledTools, parentTensorId }
 */
async function callClaudeForGraphEnhanced(task, options = {}) {
  const tensorService = getTensorServiceLazy();
  const enhancedTensor = tensorService?.start('gxe.claude.generateGraphEnhanced', {
    taskLength: task?.length || 0,
    hasEnabledTools: !!options.enabledTools
  }, options.parentTensorId);

  // Intent classifier instance (reusable)
  const intentClassifier = createIntentClassifier();

  try {
    // STEP 1: Classify task intent using SDA Stage 1
    const intentDescriptor = await intentClassifier.classify(task);
    console.log(`[GXE Enhanced] Intent: ${intentDescriptor.intent}, domain: ${intentDescriptor.domain}, confidence: ${(intentDescriptor.confidence * 100).toFixed(0)}%, method: ${intentDescriptor.method}`);
    console.log(`[GXE Enhanced] Matched domains: ${intentDescriptor.allDomains.join(', ')}`);
    if (intentDescriptor.entities.length > 0) {
      console.log(`[GXE Enhanced] Entities: ${intentDescriptor.entities.map(e => `${e.name}(${e.type})`).join(', ')}`);
    }

    // GATE: intent (skip for sub-graph drill-down — intent is always "analyze/elaborate")
    const intentCheck = DAG_THRESHOLDS.intent.check(intentDescriptor);
    if (intentCheck.anomaly && !options.parentContext) {
      const anomaly = await handleAnomaly('dag', 'Intent Classification', intentCheck.reason, { task: task.substring(0, 500) }, intentDescriptor, task);
      tensorService?.fail(enhancedTensor?.id, intentCheck.reason);
      return { data: null, error: intentCheck.reason, anomaly };
    }
    if (intentCheck.anomaly && options.parentContext) {
      console.log(`[GXE Enhanced] Intent gate bypassed for sub-graph (parentContext provided). confidence=${(intentDescriptor.confidence * 100).toFixed(0)}%`);
      intentDescriptor.intent = 'analyze';
      intentDescriptor.confidence = 0.5;
      intentDescriptor.allDomains = ['ai_generation', 'graph_ops'];
    }

    // STEP 2: Get available tools
    // SDA mode uses tools locally (Tool Resolver + TaskPlanner via Gemini) — no schemas needed
    // Legacy mode sends tools to Claude API with full input_schema
    const useSDA = options.useSDA === true;
    const allTools = useSDA
      ? await getMcpToolsLightweight()
      : await getMcpToolsForClaude();

    // STEP 3: SDA Stage 2 - Tool Resolution using IntentDescriptor
    const toolResolver = createToolResolver();
    let toolsForGeneration = allTools;
    let filterStats = null;
    let resolvedToolSet = null;

    if (!options.enabledTools || options.enabledTools.length === 0) {
      // Use Tool Resolver for structured tool resolution
      resolvedToolSet = toolResolver.resolve(intentDescriptor, allTools);

      toolsForGeneration = resolvedToolSet.tools;
      filterStats = {
        total: resolvedToolSet.totalAvailable,
        filtered: resolvedToolSet.totalResolved,
        reduction: `${resolvedToolSet.totalResolved}/${resolvedToolSet.totalAvailable} (${(resolvedToolSet.filterRatio * 100).toFixed(0)}%)`,
        completeness: resolvedToolSet.completeness.score
      };

      console.log(`[GXE Enhanced] Tool Resolver: ${resolvedToolSet.totalResolved}/${resolvedToolSet.totalAvailable} tools (${(resolvedToolSet.filterRatio * 100).toFixed(0)}%)`);
      console.log(`[GXE Enhanced] Completeness: ${(resolvedToolSet.completeness.score * 100).toFixed(0)}%${resolvedToolSet.missingCapabilities.length > 0 ? ' (missing: ' + resolvedToolSet.missingCapabilities.join(', ') + ')' : ''}`);
      console.log(`[GXE Enhanced] By role: INPUT=${resolvedToolSet.byRole.INPUT.length}, PROCESS=${resolvedToolSet.byRole.PROCESS.length}, ANALYZE=${resolvedToolSet.byRole.ANALYZE.length}, SEARCH=${resolvedToolSet.byRole.SEARCH.length}, STORE=${resolvedToolSet.byRole.STORE.length}, CONTROL=${resolvedToolSet.byRole.CONTROL.length}`);

      // GATE: toolResolution
      const toolCheck = DAG_THRESHOLDS.toolResolution.check(resolvedToolSet);
      if (toolCheck.anomaly) {
        const anomaly = await handleAnomaly('dag', 'Tool Resolution', toolCheck.reason, { intent: intentDescriptor.intent, domain: intentDescriptor.domain }, resolvedToolSet, task);
        tensorService?.fail(enhancedTensor?.id, toolCheck.reason);
        return { data: null, error: toolCheck.reason, anomaly };
      }
    } else {
      console.log(`[GXE Enhanced] Using user-provided tool filter: ${options.enabledTools.length} tools`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SDA MODE vs LEGACY MODE
    // ═══════════════════════════════════════════════════════════════════════════

    const graphCompiler = createGraphCompiler(toolResolver);

    if (useSDA && resolvedToolSet) {
      // ═══════════════════════════════════════════════════════════════════════
      // FULL SDA PIPELINE: S1 → S2 → S3 → S4 → S5
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[GXE SDA] Using full SDA pipeline');

      // STEP 3 (SDA): Task Planning via LLM
      // Normalize model alias to full model ID (e.g., 'claude-sonnet' -> 'claude-sonnet-4-20250514')
      const normalizedModel = AVAILABLE_MODELS[options.model] || options.model || AVAILABLE_MODELS[DEFAULT_MODEL];
      const taskPlanner = createTaskPlanner({ model: normalizedModel });
      const { taskPlan, llmMetadata: plannerMetadata, validation: planValidation } =
        await taskPlanner.plan(task, intentDescriptor, resolvedToolSet);

      console.log(`[GXE SDA] TaskPlan: ${taskPlan.steps.length} steps, ${taskPlan.dependencies.length} deps, valid=${planValidation.valid}`);

      // GATE: taskPlanning
      const planCheck = DAG_THRESHOLDS.taskPlanning.check(taskPlan, planValidation);
      if (planCheck.anomaly) {
        const anomaly = await handleAnomaly('dag', 'Task Planning', planCheck.reason, { intent: intentDescriptor.intent, toolCount: resolvedToolSet.totalResolved }, { taskPlan, planValidation }, task);
        tensorService?.fail(enhancedTensor?.id, planCheck.reason);
        return { data: null, error: planCheck.reason, anomaly, llmMetadata: plannerMetadata };
      }

      // STEP 4 (SDA): Graph Compilation from TaskPlan
      const compiledGraph = graphCompiler.compileFromTaskPlan(taskPlan, resolvedToolSet);

      // GATE: compilation
      const compileCheck = DAG_THRESHOLDS.compilation.check(compiledGraph);
      if (compileCheck.anomaly) {
        const anomaly = await handleAnomaly('dag', 'Graph Compilation', compileCheck.reason, { stepCount: taskPlan.steps.length }, compiledGraph, task);
        tensorService?.fail(enhancedTensor?.id, compileCheck.reason);
        return { data: null, error: compileCheck.reason, anomaly, llmMetadata: plannerMetadata };
      }

      const compilerStats = graphCompiler.getStats(compiledGraph);
      console.log(`[GXE SDA] Compiled graph: ${compilerStats.nodeCount} nodes, ${compilerStats.edgeCount} edges`);

      // STEP 5: Validate compiled graph
      const server = await getMcpServer();
      const validator = createGraphValidator(server);
      const fixedData = validator.autoFix({ nodes: compiledGraph.nodes, edges: compiledGraph.edges });
      const validation = validator.validate(fixedData);

      // GATE: validation
      const valCheck = DAG_THRESHOLDS.validation.check(validation);
      if (valCheck.anomaly) {
        const anomaly = await handleAnomaly('dag', 'Validation', valCheck.reason, { nodeCount: compiledGraph.nodes.length, edgeCount: compiledGraph.edges.length }, validation, task);
        tensorService?.fail(enhancedTensor?.id, valCheck.reason);
        return { data: null, error: valCheck.reason, anomaly, llmMetadata: plannerMetadata };
      }

      if (!validation.valid) {
        console.warn(`[GXE SDA] Validation warnings:`, validation.errors.map(e => e.message).join(', '));
      } else {
        console.log(`[GXE SDA] Validation passed: ${validation.stats.nodeCount} nodes, ${validation.stats.edgeCount} edges`);
      }

      // Apply layout if needed
      let finalData = fixedData;
      const needsLayout = fixedData.nodes.some(n => !n.position || (n.position.x === 0 && n.position.y === 0));
      if (needsLayout && validation.stats.isDAG) {
        finalData = validator.applyTopologicalLayout(fixedData);
        console.log('[GXE SDA] Applied topological layout');
      }

      // Compute quality metrics
      const metricsCalculator = createGraphQualityMetrics(validator);
      const expectedProperties = getExpectedPropertiesForPrompt(task);
      const qualityMetrics = metricsCalculator.computeAll(
        finalData,
        validation,
        expectedProperties,
        plannerMetadata,
        0 // autoFixCount
      );

      // GATE: quality (soft — graph still returned with warning)
      const qualityCheck = DAG_THRESHOLDS.quality.check(qualityMetrics);
      let qualityAnomaly = null;
      if (qualityCheck.anomaly) {
        qualityAnomaly = await handleAnomaly('dag', 'Quality', qualityCheck.reason, { grade: qualityMetrics.overall.grade, score: qualityMetrics.overall.score }, qualityMetrics, task);
        console.warn(`[GXE SDA] Quality anomaly (soft): ${qualityCheck.reason}`);
      }

      tensorService?.complete(enhancedTensor?.id, {
        success: true,
        mode: 'sda',
        nodeCount: validation.stats.nodeCount,
        edgeCount: validation.stats.edgeCount
      });

      return {
        data: finalData,
        source: 'ai-sda',
        taskPlan,
        validation,
        llmMetadata: plannerMetadata,
        qualityMetrics,
        anomaly: qualityAnomaly,
        enhancement: {
          intentDescriptor,
          toolResolver: {
            totalResolved: resolvedToolSet.totalResolved,
            totalAvailable: resolvedToolSet.totalAvailable,
            filterRatio: resolvedToolSet.filterRatio,
            completeness: resolvedToolSet.completeness,
            byRoleCounts: {
              INPUT: resolvedToolSet.byRole.INPUT.length,
              PROCESS: resolvedToolSet.byRole.PROCESS.length,
              ANALYZE: resolvedToolSet.byRole.ANALYZE.length,
              SEARCH: resolvedToolSet.byRole.SEARCH.length,
              STORE: resolvedToolSet.byRole.STORE.length,
              CONTROL: resolvedToolSet.byRole.CONTROL.length,
              AUXILIARY: resolvedToolSet.byRole.AUXILIARY.length
            }
          },
          graphCompiler: { mode: 'sda', compiled: compiledGraph.compiled },
          taskPlanStats: {
            stepCount: taskPlan.steps.length,
            depCount: taskPlan.dependencies.length,
            parallelGroups: taskPlan.parallelGroups?.length || 0
          },
          wasFixed: false,
          layoutApplied: needsLayout,
          expectedPropertiesMatched: !!expectedProperties
        },
        meta: {
          mode: 'sda',
          toolReduction: filterStats?.reduction || 'N/A',
          validationPassed: validation.valid,
          qualityGrade: qualityMetrics.overall.grade,
          qualityScore: qualityMetrics.overall.score
        }
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LEGACY ENHANCED PIPELINE (default)
    // ═══════════════════════════════════════════════════════════════════════════

    // STEP 4: Call original generator with filtered tools
    const enabledToolIds = options.enabledTools || toolsForGeneration.map(t => t.name);

    const result = await callClaudeForGraph(task, {
      ...options,
      enabledTools: enabledToolIds
    });

    // GATE: generation
    const genCheck = DAG_THRESHOLDS.generation.check(result);
    if (genCheck.anomaly) {
      const anomaly = await handleAnomaly('dag', 'Generation', genCheck.reason, { task: task.substring(0, 500), model: options.model }, result, task);
      tensorService?.fail(enhancedTensor?.id, genCheck.reason);
      return { data: null, error: genCheck.reason, anomaly };
    }

    // STEP 4.5: SDA Stage 4 - Graph Compiler (Legacy mode)
    // Normalizes LLM output: deduplicates IDs, removes invalid edges, ensures entry/exit
    // Note: graphCompiler already created above
    const compiledGraphLegacy = graphCompiler.compileFromRawLLM(
      result.data.nodes || [],
      result.data.edges || []
    );

    if (!compiledGraphLegacy.compiled) {
      console.warn(`[GXE Enhanced] Graph compilation failed: ${compiledGraphLegacy.error}`);
    } else {
      const compilerStats = graphCompiler.getStats(compiledGraphLegacy);
      console.log(`[GXE Enhanced] Graph compiled (${compiledGraphLegacy.mode}): ${compilerStats.nodeCount} nodes, ${compilerStats.edgeCount} edges`);

      // Replace result data with compiled graph
      result.data = {
        ...result.data,
        nodes: compiledGraphLegacy.nodes,
        edges: compiledGraphLegacy.edges
      };
    }

    // STEP 5: Validate generated graph
    const server = await getMcpServer();
    const validator = createGraphValidator(server);

    // Auto-fix common issues first
    const fixedData = validator.autoFix(result.data);
    const autoFixCount = JSON.stringify(fixedData) !== JSON.stringify(result.data) ? 1 : 0;

    // Then validate
    const validation = validator.validate(fixedData);

    // GATE: validation
    const legacyValCheck = DAG_THRESHOLDS.validation.check(validation);
    if (legacyValCheck.anomaly) {
      const anomaly = await handleAnomaly('dag', 'Validation', legacyValCheck.reason, { nodeCount: fixedData.nodes?.length, edgeCount: fixedData.edges?.length }, validation, task);
      tensorService?.fail(enhancedTensor?.id, legacyValCheck.reason);
      return { data: null, error: legacyValCheck.reason, anomaly };
    }

    if (!validation.valid) {
      console.warn(`[GXE Enhanced] Validation errors:`, validation.errors.map(e => e.message).join(', '));

      // Log but don't fail - let the UI show warnings
      tensorService?.complete(enhancedTensor?.id, {
        success: true,
        hasValidationErrors: true,
        errorCount: validation.errors.length
      });
    } else {
      console.log(`[GXE Enhanced] Validation passed: ${validation.stats.nodeCount} nodes, ${validation.stats.edgeCount} edges`);
      tensorService?.complete(enhancedTensor?.id, {
        success: true,
        nodeCount: validation.stats.nodeCount,
        edgeCount: validation.stats.edgeCount
      });
    }

    // STEP 6: Optionally apply topological layout if positions look broken
    let finalData = fixedData;
    const needsLayout = fixedData.nodes.some(n => !n.position || (n.position.x === 0 && n.position.y === 0));
    if (needsLayout && validation.stats.isDAG) {
      finalData = validator.applyTopologicalLayout(fixedData);
      console.log('[GXE Enhanced] Applied topological layout');
    }

    // STEP 7: Compute quality metrics
    const metricsCalculator = createGraphQualityMetrics(validator);
    const expectedProperties = getExpectedPropertiesForPrompt(task);

    // Build enhanced llmMetadata
    const llmMetadata = {
      ...(result.llmMetadata || {}),
      enhanced: true,
      toolsProvided: filterStats?.filtered || result.llmMetadata?.toolsProvided || 0,
      toolsTotal: filterStats?.total || result.llmMetadata?.toolsTotal || 0
    };

    const qualityMetrics = metricsCalculator.computeAll(
      finalData,
      validation,
      expectedProperties,
      llmMetadata,
      autoFixCount
    );

    console.log(`[GXE Enhanced] Quality metrics: structural=${(qualityMetrics.structural.compositeScore * 100).toFixed(1)}%, semantic=${(qualityMetrics.semantic.compositeScore * 100).toFixed(1)}%, overall=${qualityMetrics.overall.grade}`);

    // GATE: quality (soft — graph still returned with warning)
    const legacyQualityCheck = DAG_THRESHOLDS.quality.check(qualityMetrics);
    let legacyQualityAnomaly = null;
    if (legacyQualityCheck.anomaly) {
      legacyQualityAnomaly = await handleAnomaly('dag', 'Quality', legacyQualityCheck.reason, { grade: qualityMetrics.overall.grade, score: qualityMetrics.overall.score }, qualityMetrics, task);
      console.warn(`[GXE Enhanced] Quality anomaly (soft): ${legacyQualityCheck.reason}`);
    }

    return {
      ...result,
      data: finalData,
      validation,
      llmMetadata,
      qualityMetrics,
      anomaly: legacyQualityAnomaly,
      enhancement: {
        intentDescriptor,
        toolResolver: resolvedToolSet ? {
          totalResolved: resolvedToolSet.totalResolved,
          totalAvailable: resolvedToolSet.totalAvailable,
          filterRatio: resolvedToolSet.filterRatio,
          completeness: resolvedToolSet.completeness,
          byRoleCounts: {
            INPUT: resolvedToolSet.byRole.INPUT.length,
            PROCESS: resolvedToolSet.byRole.PROCESS.length,
            ANALYZE: resolvedToolSet.byRole.ANALYZE.length,
            SEARCH: resolvedToolSet.byRole.SEARCH.length,
            STORE: resolvedToolSet.byRole.STORE.length,
            CONTROL: resolvedToolSet.byRole.CONTROL.length,
            AUXILIARY: resolvedToolSet.byRole.AUXILIARY.length
          }
        } : null,
        graphCompiler: compiledGraphLegacy ? {
          mode: compiledGraphLegacy.mode,
          compiled: compiledGraphLegacy.compiled
        } : null,
        toolFilter: filterStats,
        wasFixed: autoFixCount > 0,
        layoutApplied: needsLayout,
        expectedPropertiesMatched: !!expectedProperties
      },
      meta: {
        ...result.meta,
        toolReduction: filterStats?.reduction || 'N/A',
        validationPassed: validation.valid,
        qualityGrade: qualityMetrics.overall.grade,
        qualityScore: qualityMetrics.overall.score
      }
    };

  } catch (err) {
    console.error('[GXE Enhanced] Error:', err);
    tensorService?.fail(enhancedTensor?.id, err.message);
    return { data: null, error: err.message };
  }
}

// Active execution sessions
const sessions = new Map();

// Tool definitions from GXE MCP system
const toolHierarchy = {
  level1: {
    name: 'Primitives',
    tools: [
      { id: 'text.normalize', name: 'Normalize Text', category: 'text', description: 'Normalize text with various operations' },
      { id: 'text.tokenize', name: 'Tokenize', category: 'text', description: 'Split text into tokens' },
      { id: 'text.hash', name: 'Hash', category: 'text', description: 'Generate hash of text' },
      { id: 'text.split', name: 'Split', category: 'text', description: 'Split text by delimiter' },
      { id: 'text.join', name: 'Join', category: 'text', description: 'Join array elements' },
      { id: 'text.template', name: 'Template', category: 'text', description: 'Render template' },
      { id: 'control.if', name: 'Conditional', category: 'control', description: 'Conditional execution' },
      { id: 'control.loop', name: 'Loop', category: 'control', description: 'Iterate over collection' },
      { id: 'control.try', name: 'Try/Catch', category: 'control', description: 'Error handling' }
    ]
  },
  level2: {
    name: 'Domain Tools',
    tools: [
      { id: 'extraction.regex', name: 'Regex Extract', category: 'extraction', description: 'Extract patterns with regex' },
      { id: 'extraction.entities', name: 'Entity Extraction', category: 'extraction', description: 'Extract named entities' },
      { id: 'extraction.structure', name: 'Structure Extract', category: 'extraction', description: 'Parse document structure' },
      { id: 'extraction.ast', name: 'AST Parser', category: 'extraction', description: 'Parse code to AST' },
      { id: 'vector.embed', name: 'Embed', category: 'vector', description: 'Generate embeddings' },
      { id: 'vector.search', name: 'Vector Search', category: 'vector', description: 'Semantic search' },
      { id: 'vector.upsert', name: 'Upsert Vectors', category: 'vector', description: 'Store vectors' },
      { id: 'graph.query', name: 'Graph Query', category: 'graph', description: 'Execute Cypher query' },
      { id: 'graph.create', name: 'Graph Create', category: 'graph', description: 'Create graph entities' },
      { id: 'graph.traverse', name: 'Graph Traverse', category: 'graph', description: 'Traverse graph' },
      { id: 'ai.complete', name: 'AI Complete', category: 'ai', description: 'LLM text completion' },
      { id: 'ai.classify', name: 'AI Classify', category: 'ai', description: 'Text classification' },
      { id: 'ai.summarize', name: 'AI Summarize', category: 'ai', description: 'Text summarization' }
    ]
  },
  level3: {
    name: 'Patterns',
    tools: [
      { id: 'pattern.chain', name: 'Chain', category: 'pattern', description: 'Sequential execution' },
      { id: 'pattern.parallel', name: 'Parallel', category: 'pattern', description: 'Parallel execution' },
      { id: 'pattern.pipeline', name: 'Pipeline', category: 'pattern', description: 'DAG pipeline execution' },
      { id: 'pattern.batch', name: 'Batch', category: 'pattern', description: 'Batch processing' },
      { id: 'pattern.map_reduce', name: 'MapReduce', category: 'pattern', description: 'Map-reduce pattern' },
      { id: 'pattern.retry', name: 'Retry', category: 'pattern', description: 'Retry with backoff' },
      { id: 'pattern.cache', name: 'Cache', category: 'pattern', description: 'Cached execution' },
      { id: 'pattern.rag', name: 'RAG', category: 'pattern', description: 'Retrieval-augmented generation' }
    ]
  },
  level4: {
    name: 'Meta-Tools',
    tools: [
      { id: 'meta.introspect', name: 'Introspect', category: 'meta', description: 'System introspection' },
      { id: 'meta.create_tool', name: 'Create Tool', category: 'meta', description: 'Dynamic tool creation' },
      { id: 'meta.compose', name: 'Compose', category: 'meta', description: 'Tool composition' },
      { id: 'meta.optimize', name: 'Optimize', category: 'meta', description: 'Pipeline optimization' },
      { id: 'meta.sandbox', name: 'Sandbox', category: 'meta', description: 'Isolated execution' },
      { id: 'meta.validate_tool', name: 'Validate Tool', category: 'meta', description: 'Validate tool definition' }
    ]
  }
};

// Predefined scenarios
const scenarios = [
  {
    id: 'customer-support',
    name: 'Customer Support Ticket Analysis',
    description: 'AI analyzes support tickets, extracts entities, classifies priority, and suggests solutions',
    category: 'support',
    estimatedDuration: 5000,
    steps: [
      { type: 'ai-think', message: 'Analyzing ticket structure and content...' },
      { type: 'create-tool', tool: 'text.normalize', level: 1, category: 'primitive', duration: 100 },
      { type: 'execute', tool: 'text.normalize', duration: 45 },
      { type: 'create-tool', tool: 'extraction.entities', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'extraction.entities', duration: 120 },
      { type: 'ai-think', message: 'Detected enterprise customer with blocking issue. Escalating priority...' },
      { type: 'create-tool', tool: 'ai.classify', level: 2, category: 'ai', duration: 100 },
      { type: 'execute', tool: 'ai.classify', duration: 340 },
      { type: 'create-pattern', pattern: 'rag', tools: ['vector.embed', 'vector.search', 'ai.complete'], duration: 200 },
      { type: 'ai-think', message: 'Searching knowledge base for similar issues and solutions...' },
      { type: 'execute-pattern', pattern: 'rag', duration: 890 },
      { type: 'create-tool', tool: 'graph.query', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'graph.query', duration: 150 },
      { type: 'ai-think', message: 'Found 3 related incidents. Generating response with solution...' },
      { type: 'create-tool', tool: 'ai.complete', level: 2, category: 'ai', duration: 100 },
      { type: 'execute', tool: 'ai.complete', duration: 560 },
      { type: 'complete', result: 'High priority ticket created with auto-suggested solution' }
    ]
  },
  {
    id: 'document-processing',
    name: 'Document Processing Pipeline',
    description: 'Process and extract structured data from business documents',
    category: 'document',
    estimatedDuration: 3000,
    steps: [
      { type: 'ai-think', message: 'Detecting document type and structure...' },
      { type: 'create-tool', tool: 'extraction.structure', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'extraction.structure', duration: 180 },
      { type: 'create-tool', tool: 'extraction.regex', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'extraction.regex', duration: 65 },
      { type: 'ai-think', message: 'Extracting financial entities and line items...' },
      { type: 'create-pattern', pattern: 'pipeline', tools: ['text.tokenize', 'extraction.entities', 'ai.classify'], duration: 200 },
      { type: 'execute-pattern', pattern: 'pipeline', duration: 420 },
      { type: 'create-tool', tool: 'graph.create', level: 2, category: 'domain', duration: 100 },
      { type: 'ai-think', message: 'Building document graph with relationships...' },
      { type: 'execute', tool: 'graph.create', duration: 230 },
      { type: 'create-tool', tool: 'vector.upsert', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'vector.upsert', duration: 310 },
      { type: 'complete', result: 'Invoice processed: 3 entities, 5 relationships created' }
    ]
  },
  {
    id: 'code-analysis',
    name: 'Code Review & Analysis',
    description: 'AI reviews code changes, identifies issues, and suggests improvements',
    category: 'development',
    estimatedDuration: 4000,
    steps: [
      { type: 'ai-think', message: 'Analyzing code structure and patterns...' },
      { type: 'create-tool', tool: 'text.tokenize', level: 1, category: 'primitive', duration: 100 },
      { type: 'execute', tool: 'text.tokenize', duration: 35 },
      { type: 'create-tool', tool: 'extraction.ast', level: 2, category: 'domain', duration: 100 },
      { type: 'execute', tool: 'extraction.ast', duration: 95 },
      { type: 'ai-think', message: 'Detected SQL injection vulnerability! Analyzing security patterns...' },
      { type: 'create-pattern', pattern: 'parallel', tools: ['ai.classify', 'vector.search'], duration: 200 },
      { type: 'execute-pattern', pattern: 'parallel', duration: 450 },
      { type: 'ai-think', message: 'Searching for best practices and similar fixes...' },
      { type: 'create-tool', tool: 'ai.complete', level: 2, category: 'ai', duration: 100 },
      { type: 'execute', tool: 'ai.complete', duration: 680 },
      { type: 'complete', result: '2 critical issues found, fix suggestions generated' }
    ]
  }
];

/**
 * Get available AI models
 */
exports.getModels = (req, res) => {
  try {
    const MODEL_META = {
      'claude-opus-4.6':      { name: 'Claude Opus 4.6',      description: 'Latest and most capable — agentic coding, 200K context' },
      'claude-opus-4.6-fast': { name: 'Claude Opus 4.6 Fast',  description: 'Same Opus 4.6 intelligence, 2.5x faster output (preview)', fast: true },
      'claude-sonnet':        { name: 'Claude Sonnet 4',        description: 'Balanced performance and speed (recommended)' },
      'claude-haiku':         { name: 'Claude Haiku 4.5',       description: 'Fast and cost-effective' },
      'claude-opus':          { name: 'Claude Opus 4',          description: 'Most capable 4.x, best for complex tasks' },
    };

    const models = Object.entries(AVAILABLE_MODELS).map(([key, id]) => ({
      id: key,
      modelId: id,
      name: MODEL_META[key]?.name || key,
      description: MODEL_META[key]?.description || '',
      fast: MODEL_META[key]?.fast || false,
      isDefault: key === DEFAULT_MODEL
    }));

    res.json({ success: true, data: models });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Analyze generation result with Claude 4.6 Fast and suggest system prompt optimizations.
 *
 * Body params:
 *  - task: string (required)          — Original task description
 *  - systemPrompt: string (required)  — System prompt that was used for generation
 *  - generationResult: object (required) — { nodes, edges, source, requiredParams }
 *  - model: string — Model used for generation (for context)
 */
exports.analyzePromptOptimization = async (req, res) => {
  const startTime = Date.now();
  try {
    const { task, systemPrompt, generationResult, model: generationModel } = req.body;

    if (!task || !generationResult) {
      return res.status(400).json({
        success: false,
        error: 'task and generationResult are required'
      });
    }

    const nodes = generationResult.nodes || [];
    const edges = generationResult.edges || [];
    const source = generationResult.source || 'unknown';
    const isSDA = source === 'ai-sda';
    const taskPlan = generationResult.taskPlan || null;
    const enhancement = generationResult.enhancement || null;
    const qualityMetrics = generationResult.qualityMetrics || null;
    const validation = generationResult.validation || null;

    // Build analysis prompt — adapts to SDA vs Legacy mode
    const analysisSystemPrompt = `You are an expert AI pipeline engineer analyzing the quality of a graph generation run.
Your task is to evaluate the generated graph against the user's intent and provide concrete, actionable recommendations.

${isSDA
  ? `This graph was generated using the SDA (Structured DAG Assembly) pipeline:
  1. Intent Classification (local NLP — no LLM)
  2. Tool Resolution (local matching — no LLM)
  3. Task Planning (Gemini LLM — generates step-by-step plan)
  4. Graph Compilation (local — converts plan to DAG nodes/edges)
  5. Validation & Quality (local — structural checks)
The system prompt is used only in Legacy mode. Focus your analysis on the Task Plan quality, tool selection, and graph structure.`
  : `This graph was generated using Claude with a system prompt (Legacy mode).
The system prompt directly controls graph quality. Analyze the prompt for optimization opportunities.`}

You must respond with ONLY valid JSON in this exact format:
{
  "qualityScore": <number 0-100>,
  "qualitySummary": "<one-line quality assessment>",
  "strengths": ["<what went well>", ...],
  "weaknesses": ["<what went poorly or is missing>", ...],
  "suggestions": [
    {
      "priority": "high" | "medium" | "low",
      "category": "structure" | "clarity" | "completeness" | "constraints" | "examples" | "task_plan" | "tool_selection",
      "current": "<problematic aspect or fragment>",
      "suggested": "<concrete improvement>",
      "rationale": "<why this improves generation quality>"
    }
  ],
  "promptPatch": "<${isSDA ? 'a paragraph describing the most impactful changes to improve the pipeline' : 'a concise paragraph with the most impactful changes to add/modify in the system prompt'}>",
  "mode": "${isSDA ? 'sda' : 'legacy'}"
}`;

    // Build user content — include task plan for SDA, system prompt for Legacy
    let userContent = `## Generation Context
- **Task**: "${task}"
- **Model**: ${generationModel || 'unknown'}
- **Source**: ${source}
- **Mode**: ${isSDA ? 'SDA Pipeline' : 'Legacy (Claude direct)'}
- **Result**: ${nodes.length} nodes, ${edges.length} edges
${validation ? `- **Validation**: ${validation.valid ? 'passed' : 'failed'} (${(validation.errors || []).length} errors, ${(validation.warnings || []).length} warnings)` : ''}
${qualityMetrics?.overall ? `- **Quality**: ${qualityMetrics.overall.grade} (${(qualityMetrics.overall.score * 100).toFixed(0)}%)` : ''}

## Nodes Generated
${nodes.slice(0, 20).map(n => `- ${n.id} (${n.data?.kind || n.type || '?'}): ${n.data?.label || n.data?.description || 'no label'}`).join('\n')}
${nodes.length > 20 ? `... and ${nodes.length - 20} more` : ''}

## Edges Generated
${edges.slice(0, 20).map(e => `- ${e.source} → ${e.target}${e.label ? ` [${e.label}]` : ''}`).join('\n')}
${edges.length > 20 ? `... and ${edges.length - 20} more` : ''}

## Required Parameters
${JSON.stringify(generationResult.requiredParams || {}, null, 2)}`;

    if (isSDA && taskPlan) {
      // SDA mode: include task plan details for analysis
      userContent += `\n\n## Task Plan (SDA Stage 3 — Gemini)
Steps: ${taskPlan.steps?.length || 0}, Dependencies: ${taskPlan.dependencies?.length || 0}
${(taskPlan.steps || []).slice(0, 15).map((s, i) => `${i + 1}. [${s.tool || '?'}] ${s.description || s.name || '?'} → outputs: ${(s.outputs || []).join(', ') || 'none'}`).join('\n')}
${(taskPlan.steps || []).length > 15 ? `... and ${taskPlan.steps.length - 15} more steps` : ''}`;

      if (enhancement?.intentDescriptor) {
        userContent += `\n\n## Intent Classification
- Intent: ${enhancement.intentDescriptor.intent}
- Domain: ${enhancement.intentDescriptor.domain}
- Confidence: ${((enhancement.intentDescriptor.confidence || 0) * 100).toFixed(0)}%`;
      }

      if (enhancement?.toolResolver) {
        userContent += `\n\n## Tool Resolution
- Resolved: ${enhancement.toolResolver.totalResolved}/${enhancement.toolResolver.totalAvailable}
- Completeness: ${((enhancement.toolResolver.completeness?.score || 0) * 100).toFixed(0)}%`;
      }
    } else if (systemPrompt && systemPrompt !== '(system prompt not loaded)') {
      // Legacy mode: include system prompt for analysis
      userContent += `\n\n## System Prompt Used (analyze this for optimization)
\`\`\`
${systemPrompt.substring(0, 8000)}
\`\`\``;
    }

    userContent += `\n\nAnalyze the generation quality relative to the task and provide specific, actionable recommendations.`;

    // Use Opus 4.6 for optimization analysis (only available model — Sonnet/Haiku hit usage limits)
    const modelId = AVAILABLE_MODELS['claude-opus-4.6'] || AVAILABLE_MODELS['claude-opus'] || AVAILABLE_MODELS['claude-sonnet'];

    // Log request stats before sending
    logRequestStats({ model: modelId, max_tokens: 2048, temperature: 0.3, messages: [{ role: 'user' }] }, 'Prompt Optimization Analysis');

    const llmResp = await getLLMProvider().chat(
      [{ role: 'user', content: userContent }],
      { model: modelId, maxTokens: 2048, temperature: 0.3, system: analysisSystemPrompt }
    );

    const rawText = llmResp.content?.find(b => b.type === 'text')?.text || '';

    // Parse JSON from response
    let analysis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (parseErr) {
      analysis = { qualityScore: null, qualitySummary: rawText.substring(0, 200), suggestions: [], rawResponse: rawText };
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        ...analysis,
        duration,
        model: modelId,
        usage: llmResp.usage || null
      }
    });
  } catch (err) {
    console.error('[GXE] analyzePromptOptimization error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION ASSISTANT CHAT (SSE streaming with Claude + MCP tools)
// Pre-validation, post-failure diagnosis, tool resolution
// ═══════════════════════════════════════════════════════════════════════════

const EXECUTION_ASSISTANT_SYSTEM_PROMPT = `You are an Execution Assistant for the GXE (Graph eXecution Engine).
Your job is to validate graphs BEFORE execution, diagnose failures AFTER execution, and resolve missing tools.

You have access to MCP tools that can query the knowledge base, search for registered tools, and analyze graph structure.

## TOOL RESOLUTION RULES
The RuntimeEngine resolves tools via: node.executorType || node.data.toolId || node.data.kind
Generic types like "input", "action", "ai_node", "condition", "output", "wait_input" are NOT actual tools — they are node kind labels from the graph generator.
Each node MUST have a valid toolId that maps to a registered MCP tool or AOPEG executor.

## WHEN VALIDATING (pre-execution):
1. Check every node has a valid toolId (not just a generic kind like "input", "action", "condition")
2. Check edges form a valid DAG (no cycles)
3. Check connectivity (no orphaned nodes)
4. Flag any nodes with generic types that need real tool assignment
5. For each flagged node, analyze its label and position in the graph to infer what tool it should use
6. Summarize findings clearly

## WHEN DIAGNOSING FAILURES (post-execution):
1. Parse the execution error details
2. Identify which nodes failed and why
3. For "Tool not found" errors:
   a. Use MCP tools to search the knowledge base for matching registered tools
   b. Match the node's label/purpose to available tools
   c. If a match exists, propose a mutation: update_node with the correct toolId
   d. If the node represents a composite operation, suggest it should be a SubGraph and describe its internal structure
   e. If no tool exists, describe a specification for creating one (name, inputs, outputs, behavior)
4. For other errors, explain the root cause and propose fixes

## MUTATION FORMAT
When proposing graph changes, include them in a fenced code block at the END of your response:
\`\`\`mutations
[
  { "type": "update_node", "nodeId": "G1-N01", "changes": { "toolId": "text.parse" }, "description": "Assign text.parse for document input" },
  { "type": "add_edge", "source": "G1-N01", "target": "G1-N02", "description": "Connect parser output to processor" },
  { "type": "remove_edge", "source": "G1-N03", "target": "G1-N04", "description": "Remove invalid connection" },
  { "type": "remove_node", "nodeId": "G1-N05", "description": "Remove unreachable node" }
]
\`\`\`

IMPORTANT: Always use valid JSON in the mutations block. Always include a "description" for each mutation.

## SUB-GRAPH RECOGNITION
When analyzing a graph node, determine if it needs a sub-graph instead of a single tool:
- Does the label describe a MULTI-STEP process? (e.g., "Process Work Item", "Review and Approve", "Update Database Record")
- Would the operation require 3+ transactionally linked steps? (read → transform → write)
- Is it a composite business operation beyond a single MCP tool's capability?
If YES → propose creating a sub-graph (with its own nodes and edges) instead of assigning a single toolId.

## REUSE STRATEGY PROTOCOL (MANDATORY)
Before creating ANY sub-graph, you MUST analyze reuse options:

### Step 1: Call \`catalog_analyze_reuse\`
Provide: nodeId, nodeLabel, nodeDescription, expectedToolIds (infer from node context).
This tool searches the catalog and returns a strategy recommendation with confidence score.

### Step 2: Follow the recommended strategy

| Strategy | Condition | Action |
|----------|-----------|--------|
| **DIRECT_REUSE** | similarity ≥ 90% | Propose \`link_subgraph\` mutation with the existing graph's catalogGraphId |
| **CLONE_MODIFY** | similarity 60–90% | Use \`catalog_clone_graph\` to clone, then propose \`update_node\` mutations for modifications |
| **ABSTRACT_INHERIT** | template match | Use \`catalog_get_graph\` to fetch template, instantiate with parameters |
| **CREATE_NEW** | similarity < 60% or no matches | Propose \`create_subgraph\` mutation with full node/edge definitions |

### Step 3: Always explain your reasoning
Tell the user WHY you chose this strategy, mention the confidence score and alternatives.

If you skip \`catalog_analyze_reuse\` and propose a new sub-graph directly, the user will reject it.

## EXTENDED MUTATIONS
In addition to update_node, add_edge, remove_edge, remove_node, you can propose these mutation types:

\`\`\`
{ "type": "create_subgraph", "parentNodeId": "G1-N05", "subgraph": {
    "name": "Read-Modify-Write Record", "description": "...", "type": "business",
    "namespace": "default", "tags": ["crud", "transactional"],
    "nodes": [ { "id": "S-N01", "data": { "label": "Read Record", "toolId": "graph.query", "kind": "action" } }, ... ],
    "edges": [ { "source": "S-N01", "target": "S-N02" }, ... ]
  }, "description": "Create sub-graph for multi-step database operation" }

{ "type": "link_subgraph", "parentNodeId": "G1-N05", "catalogGraphId": "uuid-of-existing-graph",
  "catalogGraphName": "Existing Graph Name", "description": "Reuse existing catalog graph as sub-graph" }

{ "type": "save_graph", "name": "My Business Process", "graphDescription": "...",
  "graphType": "business", "namespace": "default", "tags": ["process"],
  "version": "1.0.0", "description": "Save current graph to catalog" }
\`\`\`

Respond in clear, structured markdown. Be concise but thorough.`;

/**
 * Validate a graph structure (DAG check, edge integrity, tool IDs, etc.)
 * Body: { nodes, edges }
 * Returns: { valid, errors, warnings, stats, fixable?, fixed? }
 */
exports.validateGraph = async (req, res) => {
  try {
    const { nodes, edges } = req.body;
    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({ error: 'nodes (array) is required' });
    }
    if (!edges || !Array.isArray(edges)) {
      return res.status(400).json({ error: 'edges (array) is required' });
    }

    let server = null;
    try { server = await getMcpServer(); } catch (_) { /* optional — toolId validation skipped */ }
    const validator = createGraphValidator(server);
    const result = validator.validate({ nodes, edges });

    const response = {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      stats: result.stats
    };

    if (!result.valid) {
      const hasCritical = result.errors.some(e =>
        e.code === 'GRAPH_HAS_CYCLES' || e.code === 'EMPTY_GRAPH'
      );
      response.fixable = !hasCritical;

      if (!hasCritical) {
        response.fixed = validator.autoFix({ nodes, edges });
      }
    }

    res.json(response);
  } catch (error) {
    console.error('[GXE] Validation error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Execution Assistant Chat — SSE streaming endpoint with Claude + MCP tool-use loop.
 * Handles pre-validation, post-failure diagnosis, and tool resolution.
 *
 * Body: { message, history, graphContext, executionError?, model?, namespace? }
 * Response: SSE stream with token/tool_call/tool_result/mutations/usage/done/error events
 *
 * TODO W4-04b: Migrate to LLMProviderService.streamRaw() after Azure streaming format testing.
 */
exports.executionAssistantChat = async (req, res) => {
  const { message, history = [], graphContext = {}, executionError, model = DEFAULT_MODEL, namespace } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message (string) is required' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  try {
    // Build system prompt with tool registry and graph context
    let systemPrompt = EXECUTION_ASSISTANT_SYSTEM_PROMPT;

    // Append available tool registry
    try {
      const server = await getMcpServer();
      const allTools = server.registry.listTools();
      const toolRegistryText = allTools.map(t =>
        `- ${sanitizeToolName(t.id)} [${t.category || '-'}]: ${(t.description || '').slice(0, 100)}`
      ).join('\n');
      systemPrompt += `\n\n## AVAILABLE TOOL REGISTRY (${allTools.length} tools)\nNote: tool names use underscores (e.g., catalog_search_graphs) — dots are replaced by underscores.\n${toolRegistryText}`;
    } catch (e) {
      systemPrompt += '\n\n## AVAILABLE TOOL REGISTRY\n(Unable to load tool registry)';
    }

    // Append graph context with full node info
    if (graphContext.nodes?.length > 0 || graphContext.edges?.length > 0) {
      const nodesSummary = (graphContext.nodes || []).slice(0, 80).map(n =>
        `- ${n.id}: "${n.data?.label || 'unknown'}" (toolId: ${n.data?.toolId || 'NOT SET'}, kind: ${n.data?.kind || '-'}, executorType: ${n.data?.executorType || '-'})`
      ).join('\n');
      const edgesSummary = (graphContext.edges || []).slice(0, 50).map(e =>
        `- ${e.source} → ${e.target}`
      ).join('\n');

      systemPrompt += `\n\n## CURRENT GRAPH
**Namespace:** ${namespace || 'default'}
**Nodes (${graphContext.nodes?.length || 0}):**
${nodesSummary || '(empty)'}${(graphContext.nodes?.length || 0) > 80 ? `\n... and ${graphContext.nodes.length - 80} more` : ''}

**Edges (${graphContext.edges?.length || 0}):**
${edgesSummary || '(none)'}${(graphContext.edges?.length || 0) > 50 ? `\n... and ${graphContext.edges.length - 50} more` : ''}`;
    }

    // Append execution error context if provided
    if (executionError) {
      const errorText = typeof executionError === 'string' ? executionError : JSON.stringify(executionError, null, 2);
      systemPrompt += `\n\n## EXECUTION ERROR CONTEXT\n${errorText.slice(0, 3000)}`;
    }

    if (namespace) {
      systemPrompt += `\n\nWhen querying the graph database, use namespace="${namespace}" to scope queries.`;
    }

    // Get full MCP tool set
    const tools = await getMcpToolsForClaude(null, true);
    console.log(`[ExecAssistant] Chat: ${tools.length} MCP tools, model=${model}, namespace=${namespace || 'default'}`);

    // Build messages from history
    const messages = [];
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content || '' });
      }
    }
    messages.push({ role: 'user', content: message });

    const modelId = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];
    const MAX_TURNS = 10;
    let turn = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (turn < MAX_TURNS) {
      turn++;

      const requestBody = {
        model: modelId,
        max_tokens: 8192,
        temperature: 0.3,
        system: systemPrompt,
        messages,
        stream: true,
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      };

      console.log(`[ExecAssistant] Turn ${turn}: calling Claude (stream), tools=${tools.length}...`);

      const apiRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text().catch(() => '');
        console.error(`[ExecAssistant] Claude API HTTP ${apiRes.status}:`, errBody.substring(0, 500));
        emit({ type: 'error', message: `Claude API error ${apiRes.status}: ${errBody.substring(0, 200)}` });
        emit({ type: 'done' });
        res.end();
        return;
      }

      // Parse Anthropic SSE stream
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let stopReason = null;
      const contentBlocks = [];
      let currentTextContent = '';
      let currentToolUse = null;
      let currentToolInput = '';
      let eventCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const rawData = line.slice(6).trim();
          if (!rawData || rawData === '[DONE]') continue;

          let event;
          try { event = JSON.parse(rawData); } catch (parseErr) {
            if (eventCount === 0) console.warn('[ExecAssistant] First SSE line parse failed:', rawData.substring(0, 200));
            continue;
          }
          eventCount++;

          // Log first event for debugging
          if (eventCount === 1) {
            console.log(`[ExecAssistant] First SSE event type="${event.type}"`, event.error ? `error: ${JSON.stringify(event.error)}` : '');
          }

          // Anthropic sends error events inside the stream
          if (event.type === 'error') {
            const errMsg = event.error?.message || JSON.stringify(event.error || event);
            console.error('[ExecAssistant] Claude stream error event:', errMsg);
            emit({ type: 'error', message: `Claude: ${errMsg}` });
            emit({ type: 'done' });
            res.end();
            return;
          }

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                };
                currentToolInput = '';
              }
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta') {
                const text = event.delta.text || '';
                currentTextContent += text;
                emit({ type: 'token', content: text });
              } else if (event.delta?.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json || '';
              }
              break;

            case 'content_block_stop':
              if (currentToolUse) {
                let parsedArgs = {};
                try { parsedArgs = JSON.parse(currentToolInput); } catch {}
                currentToolUse.args = parsedArgs;
                contentBlocks.push({ type: 'tool_use', ...currentToolUse });
                currentToolUse = null;
                currentToolInput = '';
              } else if (currentTextContent) {
                contentBlocks.push({ type: 'text', text: currentTextContent });
              }
              break;

            case 'message_delta':
              stopReason = event.delta?.stop_reason || null;
              if (event.usage) {
                totalOutputTokens += event.usage.output_tokens || 0;
              }
              break;

            case 'message_start':
              if (event.message?.usage) {
                totalInputTokens += event.message.usage.input_tokens || 0;
              }
              break;
          }
        }
      }

      console.log(`[ExecAssistant] Turn ${turn} stream done: ${eventCount} events, stopReason=${stopReason}, blocks=${contentBlocks.length}`);

      // Process tool calls if stop_reason is tool_use
      const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        const assistantContent = contentBlocks.map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.args };
          return b;
        });
        messages.push({ role: 'assistant', content: assistantContent });

        const toolResults = [];
        for (const toolCall of toolUseBlocks) {
          emit({ type: 'tool_call', tool: restoreToolName(toolCall.name), args: toolCall.args });

          const result = await executeMcpTool(toolCall.name, toolCall.args);
          const isSuccess = !result.error;

          emit({
            type: 'tool_result',
            tool: restoreToolName(toolCall.name),
            success: isSuccess,
            data: isSuccess ? result.data : null,
            error: result.error || null,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result.data || { error: result.error }),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        currentTextContent = '';
        continue;
      }

      // Final response — try to extract mutations from the text
      if (currentTextContent) {
        const mutationsMatch = currentTextContent.match(/```mutations\s*\n([\s\S]*?)```/);
        if (mutationsMatch) {
          try {
            const mutations = JSON.parse(mutationsMatch[1].trim());
            if (Array.isArray(mutations)) {
              emit({ type: 'mutations', mutations });
            }
          } catch (e) {
            console.warn('[ExecAssistant] Failed to parse mutations block:', e.message);
          }
        }
      }

      emit({
        type: 'usage',
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        turns: turn,
      });
      emit({ type: 'done' });
      console.log(`[ExecAssistant] Complete: ${turn} turn(s), ~${totalInputTokens}+${totalOutputTokens} tokens`);
      res.end();
      return;
    }

    // Max turns exceeded
    emit({ type: 'error', message: `Max analysis turns (${MAX_TURNS}) exceeded` });
    emit({ type: 'done' });
    res.end();
  } catch (err) {
    console.error('[ExecAssistant] Chat error:', err.message);
    emit({ type: 'error', message: err.message });
    emit({ type: 'done' });
    res.end();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH ANALYST CHAT (SSE streaming with Claude + MCP tools)
// ═══════════════════════════════════════════════════════════════════════════

const GRAPH_ANALYST_SYSTEM_PROMPT = `You are an expert Graph Analyst for the UNPA Knowledge Graph system.
You have access to MCP tools that can query, analyze, and manipulate graphs stored in Memgraph.

Your capabilities:
- Analyze graph structure, connectivity, density, and patterns
- Describe business logic and data flows encoded in the graph
- Identify clusters, hubs, bridge nodes, and anomalies
- Find paths between entities and assess relationship strength
- Suggest improvements to graph quality and completeness
- Query the graph database directly using available tools

IMPORTANT — Infrastructure / Proxy Nodes:
The system uses infrastructure nodes that serve as proxies for parent-graph ↔ sub-graph relationships.
These nodes are NOT part of the domain knowledge and MUST be excluded from analysis metrics.

Infrastructure node labels (exclude from all counts, degree, clustering, community detection):
  SubGraph, SubGraphPort, CatalogEntry, ConsolidationCheckpoint

Infrastructure edge types (exclude from edge counts, density, path analysis):
  CONTAINS_MEMBER, PORT_OF, BRIDGES_TO, CONNECTS_INTERNAL, SUBGRAPH_LINK

When writing Cypher queries, always add:
  AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
  AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']

If the user specifically asks about infrastructure/proxy nodes, you may include them, but clearly separate infra metrics from domain metrics.

When analyzing a graph:
1. Use tools to gather concrete data (node counts, edge types, structural metrics)
2. Always exclude infrastructure nodes/edges from structural analysis
3. Provide clear, structured analysis with headings and bullet points
4. Include specific node/edge references when discussing findings
5. Offer actionable recommendations

Respond in clear, structured markdown. Use headings, bullet points, and code blocks when appropriate.`;

/**
 * Graph Analyst Chat — SSE streaming endpoint with Claude + MCP tool-use loop.
 *
 * Body: { message, history, graphContext, model?, namespace? }
 * Response: SSE stream with token/tool_call/tool_result/usage/done/error events
 *
 * TODO W4-04b: Migrate to LLMProviderService.streamRaw() after Azure streaming format testing.
 */
exports.graphAnalystChat = async (req, res) => {
  const { message, history = [], graphContext = {}, model = DEFAULT_MODEL, namespace } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message (string) is required' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  try {
    // Build system prompt with graph context
    let systemPrompt = GRAPH_ANALYST_SYSTEM_PROMPT;

    if (graphContext.nodes?.length > 0 || graphContext.edges?.length > 0) {
      const nodesSummary = (graphContext.nodes || []).slice(0, 50).map(n =>
        `- ${n.data?.label || n.id} (${n.data?.kind || 'node'})`
      ).join('\n');
      const edgesSummary = (graphContext.edges || []).slice(0, 30).map(e =>
        `- ${e.source} → ${e.target}${e.label ? ` [${e.label}]` : ''}`
      ).join('\n');

      systemPrompt += `\n\n## CURRENT GRAPH CONTEXT
**Namespace:** ${namespace || 'default'}
**Nodes (${graphContext.nodes?.length || 0}):**
${nodesSummary || '(empty)'}${(graphContext.nodes?.length || 0) > 50 ? `\n... and ${graphContext.nodes.length - 50} more` : ''}

**Edges (${graphContext.edges?.length || 0}):**
${edgesSummary || '(none)'}${(graphContext.edges?.length || 0) > 30 ? `\n... and ${graphContext.edges.length - 30} more` : ''}`;
    }

    if (namespace) {
      systemPrompt += `\n\nWhen querying the graph database, use namespace="${namespace}" to scope queries.`;
    }

    // Get full MCP tool set for analysis
    const tools = await getMcpToolsForClaude(null, true); // full set
    console.log(`[GraphAnalyst] Chat: ${tools.length} MCP tools, model=${model}, namespace=${namespace || 'default'}`);

    // Build messages from history
    const messages = [];
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content || '' });
      }
    }
    messages.push({ role: 'user', content: message });

    const modelId = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];
    const MAX_TURNS = 10;
    let turn = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (turn < MAX_TURNS) {
      turn++;

      const requestBody = {
        model: modelId,
        max_tokens: 4096,
        temperature: 0.4,
        system: systemPrompt,
        messages,
        stream: true,
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      };

      console.log(`[GraphAnalyst] Turn ${turn}: calling Claude (stream)...`);

      const apiRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text().catch(() => '');
        emit({ type: 'error', message: `Claude API error ${apiRes.status}: ${errBody.substring(0, 200)}` });
        emit({ type: 'done' });
        res.end();
        return;
      }

      // Parse Anthropic SSE stream
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let stopReason = null;
      const contentBlocks = []; // collect all content blocks
      let currentTextContent = '';
      let currentToolUse = null;
      let currentToolInput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const rawData = line.slice(6).trim();
          if (!rawData || rawData === '[DONE]') continue;

          let event;
          try { event = JSON.parse(rawData); } catch { continue; }

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                };
                currentToolInput = '';
              }
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta') {
                const text = event.delta.text || '';
                currentTextContent += text;
                emit({ type: 'token', content: text });
              } else if (event.delta?.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json || '';
              }
              break;

            case 'content_block_stop':
              if (currentToolUse) {
                let parsedArgs = {};
                try { parsedArgs = JSON.parse(currentToolInput); } catch {}
                currentToolUse.args = parsedArgs;
                contentBlocks.push({ type: 'tool_use', ...currentToolUse });
                currentToolUse = null;
                currentToolInput = '';
              } else if (currentTextContent) {
                contentBlocks.push({ type: 'text', text: currentTextContent });
                // don't reset currentTextContent here — it accumulates across blocks
              }
              break;

            case 'message_delta':
              stopReason = event.delta?.stop_reason || null;
              if (event.usage) {
                totalOutputTokens += event.usage.output_tokens || 0;
              }
              break;

            case 'message_start':
              if (event.message?.usage) {
                totalInputTokens += event.message.usage.input_tokens || 0;
              }
              break;
          }
        }
      }

      // Process tool calls if stop_reason is tool_use
      const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        // Add assistant message with all content blocks
        const assistantContent = contentBlocks.map(b => {
          if (b.type === 'text') return { type: 'text', text: b.text };
          if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.args };
          return b;
        });
        messages.push({ role: 'assistant', content: assistantContent });

        // Execute each tool
        const toolResults = [];
        for (const toolCall of toolUseBlocks) {
          emit({ type: 'tool_call', tool: restoreToolName(toolCall.name), args: toolCall.args });

          const result = await executeMcpTool(toolCall.name, toolCall.args);
          const isSuccess = !result.error;

          emit({
            type: 'tool_result',
            tool: restoreToolName(toolCall.name),
            success: isSuccess,
            data: isSuccess ? result.data : null,
            error: result.error || null,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result.data || { error: result.error }),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        currentTextContent = '';
        continue; // next turn
      }

      // Final response — done
      emit({
        type: 'usage',
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        turns: turn,
      });
      emit({ type: 'done' });
      console.log(`[GraphAnalyst] Complete: ${turn} turn(s), ~${totalInputTokens}+${totalOutputTokens} tokens`);
      res.end();
      return;
    }

    // Max turns exceeded
    emit({ type: 'error', message: `Max analysis turns (${MAX_TURNS}) exceeded` });
    emit({ type: 'done' });
    res.end();
  } catch (err) {
    console.error('[GraphAnalyst] Chat error:', err.message);
    emit({ type: 'error', message: err.message });
    emit({ type: 'done' });
    res.end();
  }
};

/**
 * Generate executable graph from a text task description
 * Supports model selection, parent context, and agentic mode
 *
 * Body params:
 *  - task: string (required) - Task description
 *  - model: string - Model ID (claude-sonnet, claude-haiku, claude-opus)
 *  - parentContext: object - Parent graph context for sub-graphs
 *  - useTools: boolean - Enable agentic mode with MCP tools
 *  - enabledTools: string[] - Array of enabled tool IDs for filtering
 *  - useEnhanced: boolean - Use enhanced generation with filtering & validation (default: true)
 */
/**
 * Core generation logic — used by both HTTP endpoint and A/B test runner
 * @param {Object} options - Generation options
 * @param {string} options.task - Task description
 * @param {string} [options.model] - Claude model to use
 * @param {Object} [options.parentContext] - Parent context for subgraphs
 * @param {boolean} [options.useTools=false] - Enable tool use
 * @param {string[]} [options.enabledTools] - Enabled tool IDs
 * @param {boolean} [options.useEnhanced=true] - Use enhanced pipeline
 * @param {boolean} [options.useSDA=false] - Use full SDA pipeline
 * @returns {Promise<Object>} Generation result
 */
async function internalGenerateGraph(options) {
  const {
    task,
    model,
    parentContext,
    useTools = false,
    enabledTools = null,
    useEnhanced = true,
    useSDA = false,
    temperature,
    maxTokens
  } = options;

  if (!task || typeof task !== 'string') {
    throw new Error('task (string) is required');
  }

  // ── Input Validation ──
  const trimmedTask = task.trim();
  if (trimmedTask.length < 10) {
    return {
      success: false,
      error: `Task description too short (${trimmedTask.length} chars, minimum 10). Provide a meaningful task description.`,
      source: 'validation'
    };
  }

  // Detect garbage input: mostly non-printable or non-alphanumeric characters
  const alphaRatio = (trimmedTask.match(/[a-zA-Zа-яА-ЯёЁ0-9\s]/g) || []).length / trimmedTask.length;
  if (alphaRatio < 0.5) {
    return {
      success: false,
      error: `Task description appears to be malformed (${(alphaRatio * 100).toFixed(0)}% readable characters). Provide a clear, human-readable task.`,
      source: 'validation'
    };
  }

  console.log(`[GXE Internal] Task: "${trimmedTask.substring(0, 100)}${trimmedTask.length > 100 ? '...' : ''}"`);
  console.log(`[GXE Internal] Mode: ${useSDA ? 'SDA' : (useEnhanced ? 'Enhanced' : 'Basic')}, Model: ${model || DEFAULT_MODEL}`);

  // Select generator function
  const generatorFn = useEnhanced ? callClaudeForGraphEnhanced : callClaudeForGraph;

  const aiResult = await generatorFn(task, {
    model: model || DEFAULT_MODEL,
    parentContext,
    useTools,
    enabledTools,
    useSDA,  // Pass SDA flag to enhanced generator
    temperature,
    maxTokens
  });

  if (aiResult.data) {
    // Record prompt effectiveness metric (fire-and-forget)
    if (aiResult.promptVersionId) {
      const crypto = require('crypto');
      recordPromptMetricInternal(aiResult.promptVersionId, {
        inputTextType: 'general',
        inputTextLength: task.length,
        inputTextHash: crypto.createHash('md5').update(task).digest('hex').substring(0, 16),
        qualityScore: aiResult.meta?.qualityScore || 0,
        qualityGrade: aiResult.meta?.qualityGrade || 'N/A',
        structuralScore: aiResult.qualityMetrics?.structural?.compositeScore || 0,
        semanticScore: aiResult.qualityMetrics?.semantic?.compositeScore || 0,
        validationPassed: aiResult.validation?.valid || false,
        nodeCount: aiResult.data.nodes?.length || 0,
        edgeCount: aiResult.data.edges?.length || 0,
        generationTimeMs: aiResult.llmMetadata?.duration || 0,
        tokensInput: aiResult.llmMetadata?.usage?.input_tokens || 0,
        tokensOutput: aiResult.llmMetadata?.usage?.output_tokens || 0,
        model: aiResult.llmMetadata?.modelId || 'unknown'
      }).catch(err => console.warn('[GXE] Failed to record prompt metric:', err.message));
    }

    return {
      success: true,
      data: aiResult.data,
      source: useSDA ? 'ai-sda' : 'ai',
      aiStatus: {
        success: true,
        model: aiResult.meta?.model,
        modelId: aiResult.meta?.modelId,
        turns: aiResult.meta?.turns,
        toolsUsed: aiResult.meta?.toolsUsed || [],
        toolReduction: aiResult.meta?.toolReduction,
        validationPassed: aiResult.meta?.validationPassed,
        inputTokens: aiResult.llmMetadata?.usage?.input_tokens,
        outputTokens: aiResult.llmMetadata?.usage?.output_tokens,
        durationMs: aiResult.llmMetadata?.duration,
        qualityGrade: aiResult.meta?.qualityGrade,
        qualityScore: aiResult.meta?.qualityScore,
        mode: aiResult.meta?.mode || (useSDA ? 'sda' : 'legacy')
      },
      validation: aiResult.validation,
      enhancement: aiResult.enhancement,
      qualityMetrics: aiResult.qualityMetrics,
      taskPlan: aiResult.taskPlan,
      anomaly: aiResult.anomaly || null  // Soft gate warning (graph still returned)
    };
  }

  // If pipeline was halted by an anomaly gate — return anomaly info, no fallback
  if (aiResult.anomaly) {
    console.warn(`[GXE Internal] Pipeline halted by anomaly gate: ${aiResult.anomaly.stage} — ${aiResult.anomaly.reason}`);
    return {
      success: false,
      error: aiResult.error || aiResult.anomaly.reason,
      anomaly: aiResult.anomaly,
      source: 'ai-anomaly',
      aiStatus: { success: false, error: aiResult.error }
    };
  }

  // Fallback to rule-based generation
  console.log('[GXE Internal] ⚠️ AI unavailable, using rule-based fallback:', aiResult.error);
  const fallbackResult = generateRuleBasedGraph(task);

  // Validate rule-based graph too
  const validator = createGraphValidator();
  const validation = validator.validate(fallbackResult);

  return {
    success: true,
    data: fallbackResult,
    source: 'rules',
    aiStatus: {
      success: false,
      error: aiResult.error
    },
    validation
  };
}

// Export for A/B test runner
exports.internalGenerateGraph = internalGenerateGraph;

exports.generateGraph = async (req, res) => {
  try {
    const { task, model, parentContext, useTools = false, enabledTools = null, useEnhanced = true, useSDA = false, temperature, maxTokens } = req.body;

    const result = await internalGenerateGraph({
      task,
      model,
      parentContext,
      useTools,
      enabledTools,
      useEnhanced,
      useSDA,
      temperature,
      maxTokens
    });

    res.json(result);
  } catch (error) {
    console.error('[GXE] generateGraph error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Rule-based graph generation (fallback when AI is unavailable)
 */
function generateRuleBasedGraph(task) {
  const t = task.toLowerCase();
  const nodes = [];
  const edges = [];
  let y = 0;

  const addNode = (id, label, kind, description, x = 400) => {
    nodes.push({
      id,
      type: 'graphNode',
      position: { x, y },
      data: { label, kind, description, status: 'idle' }
    });
    y += 130;
  };
  const link = (a, b) => edges.push({ id: `e-${a}-${b}`, source: a, target: b });

  addNode('input', 'Task Input', 'input', 'Incoming parameters');

  let requiredParams = {};

  if (t.match(/тикет|ticket|обращен|support|жалоб/)) {
    addNode('normalize', 'Normalize Text', 'executor', 'Clean + lowercase + trim');
    link('input', 'normalize');
    addNode('entities', 'Extract Entities', 'executor', 'Customer, error codes, dates', 180);
    y -= 130;
    addNode('priority', 'Classify Priority', 'ai', 'P1-Critical … P4-Low', 620);
    link('normalize', 'entities'); link('normalize', 'priority');
    addNode('rag', 'RAG Search', 'actor', 'embed → vector.search → summarise');
    link('entities', 'rag'); link('priority', 'rag');
    addNode('history', 'Customer History', 'executor', 'Graph query: past tickets', 180);
    y -= 130;
    addNode('response', 'Generate Response', 'ai', 'AI recommendation', 620);
    link('rag', 'history'); link('rag', 'response');
    addNode('route', 'Route Ticket', 'business', 'Assign team + set SLA');
    link('history', 'route'); link('response', 'route');
    addNode('output', 'Result', 'output', 'Triage decision + suggested reply');
    link('route', 'output');
    requiredParams = {
      ticketText: { type: 'textarea', label: 'Ticket text', placeholder: 'Enter support ticket…' },
      customerTier: { type: 'select', label: 'Customer tier', options: ['basic', 'premium', 'enterprise'] }
    };
  } else if (t.match(/отчет|report|документ|document|invoice|счет/)) {
    addNode('parse', 'Parse Document', 'executor', 'Extract structure');
    link('input', 'parse');
    addNode('extract', 'Extract Entities', 'executor', 'NER + regex', 180);
    y -= 130;
    addNode('classify', 'Classify Content', 'ai', 'AI doc-type classification', 620);
    link('parse', 'extract'); link('parse', 'classify');
    addNode('aggregate', 'Aggregate Results', 'business', 'Merge extraction + classification');
    link('extract', 'aggregate'); link('classify', 'aggregate');
    addNode('store', 'Store in Graph', 'executor', 'Persist entities + relations');
    link('aggregate', 'store');
    addNode('output', 'Result', 'output', 'Structured document output');
    link('store', 'output');
    requiredParams = {
      documentText: { type: 'textarea', label: 'Document text', placeholder: 'Paste document…' },
      documentType: { type: 'select', label: 'Document type', options: ['invoice', 'contract', 'report', 'email'] }
    };
  } else if (t.match(/код|code|review|анализ кода|рефактор|refactor|bug|баг|уязвим|vulnerab/)) {
    addNode('ast', 'Parse AST', 'executor', 'Build abstract syntax tree');
    link('input', 'ast');
    addNode('vulns', 'Detect Vulnerabilities', 'ai', 'SQL-inj, XSS, secrets', 180);
    y -= 130;
    addNode('search', 'Search KB Patterns', 'executor', 'Vector similarity search', 620);
    link('ast', 'vulns'); link('ast', 'search');
    addNode('fix', 'Generate Fixes', 'ai', 'AI fix suggestions');
    link('vulns', 'fix'); link('search', 'fix');
    addNode('review', 'Format Review', 'business', 'Structure findings + severity');
    link('fix', 'review');
    addNode('output', 'Result', 'output', 'Code review report');
    link('review', 'output');
    requiredParams = {
      code: { type: 'textarea', label: 'Code', placeholder: 'Paste code to review…' },
      language: { type: 'select', label: 'Language', options: ['javascript', 'python', 'java', 'go'] }
    };
  } else if (t.match(/данн|data|etl|загруз|extract|transform|load|миграц|migrat/)) {
    addNode('source', 'Data Source', 'executor', 'Connect to data source');
    link('input', 'source');
    addNode('validate', 'Validate Schema', 'executor', 'Check data structure', 180);
    y -= 130;
    addNode('profile', 'Profile Data', 'ai', 'AI data profiling', 620);
    link('source', 'validate'); link('source', 'profile');
    addNode('transform', 'Transform Data', 'executor', 'Apply transformations');
    link('validate', 'transform'); link('profile', 'transform');
    addNode('enrich', 'Enrich Data', 'ai', 'AI-powered enrichment', 180);
    y -= 130;
    addNode('quality', 'Quality Check', 'business', 'Validate output quality', 620);
    link('transform', 'enrich'); link('transform', 'quality');
    addNode('load', 'Load Data', 'executor', 'Store to destination');
    link('enrich', 'load'); link('quality', 'load');
    addNode('output', 'Result', 'output', 'ETL pipeline result');
    link('load', 'output');
    requiredParams = {
      sourceConfig: { type: 'textarea', label: 'Source config', placeholder: 'Enter source connection...' },
      targetType: { type: 'select', label: 'Target', options: ['database', 'graph', 'vector', 'file'] }
    };
  } else if (t.match(/поиск|search|найти|find|query|запрос/)) {
    addNode('parse', 'Parse Query', 'executor', 'Parse search query');
    link('input', 'parse');
    addNode('expand', 'Query Expansion', 'ai', 'AI expands query terms');
    link('parse', 'expand');
    addNode('vector', 'Vector Search', 'executor', 'Semantic search', 180);
    y -= 130;
    addNode('keyword', 'Keyword Search', 'executor', 'Full-text search', 620);
    link('expand', 'vector'); link('expand', 'keyword');
    addNode('fuse', 'Fuse Results', 'business', 'Merge & rank results');
    link('vector', 'fuse'); link('keyword', 'fuse');
    addNode('rerank', 'Rerank', 'ai', 'AI reranking');
    link('fuse', 'rerank');
    addNode('output', 'Result', 'output', 'Search results');
    link('rerank', 'output');
    requiredParams = {
      query: { type: 'textarea', label: 'Search query', placeholder: 'Enter search query...' },
      limit: { type: 'select', label: 'Results', options: ['10', '25', '50', '100'] }
    };
  } else if (t.match(/классиф|classif|categor|категор|сортир|sort|группир|group/)) {
    addNode('preprocess', 'Preprocess', 'executor', 'Clean and normalize input');
    link('input', 'preprocess');
    addNode('embed', 'Generate Embeddings', 'executor', 'Create vector embeddings');
    link('preprocess', 'embed');
    addNode('classify', 'AI Classification', 'ai', 'Multi-label classification');
    link('embed', 'classify');
    addNode('confidence', 'Check Confidence', 'condition', 'Confidence threshold check');
    link('classify', 'confidence');
    addNode('review', 'Human Review', 'actor', 'Queue for review', 180);
    y -= 130;
    addNode('apply', 'Apply Labels', 'business', 'Assign categories', 620);
    link('confidence', 'review'); link('confidence', 'apply');
    addNode('output', 'Result', 'output', 'Classification result');
    link('review', 'output'); link('apply', 'output');
    requiredParams = {
      text: { type: 'textarea', label: 'Text to classify', placeholder: 'Enter text...' },
      categories: { type: 'textarea', label: 'Categories', placeholder: 'Enter categories (one per line)...' }
    };
  } else {
    // Generic task graph
    addNode('analyze', 'Analyze Task', 'ai', 'Understand intent');
    link('input', 'analyze');
    addNode('plan', 'Plan Execution', 'business', 'Decide strategy');
    link('analyze', 'plan');
    addNode('exec1', 'Execute Step 1', 'executor', 'Primary processing', 180);
    y -= 130;
    addNode('exec2', 'Execute Step 2', 'executor', 'Secondary processing', 620);
    link('plan', 'exec1'); link('plan', 'exec2');
    addNode('merge', 'Merge Results', 'business', 'Combine outputs');
    link('exec1', 'merge'); link('exec2', 'merge');
    addNode('output', 'Result', 'output', 'Final output');
    link('merge', 'output');
    requiredParams = {
      inputText: { type: 'textarea', label: 'Input data', placeholder: 'Enter data…' }
    };
  }

  return { nodes, edges, requiredParams };
}

/**
 * Get all available tools
 */
exports.getTools = (req, res) => {
  try {
    res.json({
      success: true,
      data: toolHierarchy,
      totalTools: Object.values(toolHierarchy).reduce((sum, level) => sum + level.tools.length, 0)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get system capabilities
 */
exports.getCapabilities = (req, res) => {
  try {
    const capabilities = {
      levels: Object.keys(toolHierarchy).map(key => ({
        level: parseInt(key.replace('level', '')),
        name: toolHierarchy[key].name,
        toolCount: toolHierarchy[key].tools.length
      })),
      categories: [...new Set(
        Object.values(toolHierarchy)
          .flatMap(level => level.tools.map(t => t.category))
      )],
      features: {
        hasAI: true,
        hasGraph: true,
        hasVector: true,
        hasMeta: true,
        canSelfModify: true,
        supportsStreaming: true
      }
    };

    res.json({ success: true, data: capabilities });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Execute a scenario
 */
exports.executeScenario = async (req, res) => {
  try {
    const { scenarioId, input } = req.body;
    const sessionId = uuidv4();

    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Scenario not found' });
    }

    // Create session
    sessions.set(sessionId, {
      id: sessionId,
      scenarioId,
      input,
      status: 'running',
      currentStep: 0,
      steps: scenario.steps,
      startTime: Date.now(),
      events: []
    });

    res.json({
      success: true,
      data: {
        sessionId,
        scenario: scenario.name,
        steps: scenario.steps.length,
        estimatedDuration: scenario.estimatedDuration
      }
    });

    // Execute steps asynchronously (for SSE clients)
    executeSteps(sessionId);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Execute scenario steps (for SSE streaming)
 */
async function executeSteps(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  for (let i = 0; i < session.steps.length; i++) {
    if (session.status === 'stopped') break;

    session.currentStep = i;
    const step = session.steps[i];

    // Add event
    session.events.push({
      step: i,
      type: step.type,
      data: step,
      timestamp: Date.now()
    });

    // Simulate execution time
    await new Promise(r => setTimeout(r, step.duration || 500));
  }

  session.status = 'completed';
  session.endTime = Date.now();
}

/**
 * SSE stream for execution updates
 */
exports.streamExecution = (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let lastEventIndex = 0;

  const sendUpdate = () => {
    // Send new events
    while (lastEventIndex < session.events.length) {
      const event = session.events[lastEventIndex];
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      lastEventIndex++;
    }

    // Check if complete
    if (session.status === 'completed') {
      res.write(`data: ${JSON.stringify({ type: 'complete', sessionId, duration: session.endTime - session.startTime })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  };

  const interval = setInterval(sendUpdate, 100);

  req.on('close', () => {
    clearInterval(interval);
  });
};

/**
 * Get scenario templates
 */
exports.getScenarios = (req, res) => {
  try {
    res.json({
      success: true,
      data: scenarios.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        estimatedDuration: s.estimatedDuration,
        stepCount: s.steps.length
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Create custom scenario
 */
exports.createScenario = (req, res) => {
  try {
    const { name, description, steps } = req.body;

    if (!name || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ success: false, error: 'Name and steps are required' });
    }

    const scenario = {
      id: `custom-${uuidv4()}`,
      name,
      description: description || '',
      category: 'custom',
      estimatedDuration: steps.reduce((sum, s) => sum + (s.duration || 500), 0),
      steps
    };

    scenarios.push(scenario);

    res.json({
      success: true,
      data: { id: scenario.id, name: scenario.name }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get execution history
 */
exports.getHistory = (req, res) => {
  try {
    const history = Array.from(sessions.values())
      .filter(s => s.status === 'completed')
      .map(s => ({
        sessionId: s.id,
        scenarioId: s.scenarioId,
        status: s.status,
        duration: s.endTime - s.startTime,
        stepsExecuted: s.currentStep + 1,
        timestamp: s.startTime
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MCP TOOLS SETTINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get full list of MCP tools with metadata
 * Returns complete tool definitions from MCP server
 */
exports.getMcpToolsList = async (req, res) => {
  try {
    const server = await getMcpServer();
    if (!server) {
      return res.status(503).json({
        success: false,
        error: 'MCP Server not available'
      });
    }

    const tools = server.registry.listTools();
    const stats = server.registry.getStats();

    // Group tools by category and level
    const groupedByCategory = {};
    const groupedByLevel = { 1: [], 2: [], 3: [], 4: [] };

    tools.forEach(tool => {
      // Group by category
      if (!groupedByCategory[tool.category]) {
        groupedByCategory[tool.category] = [];
      }
      groupedByCategory[tool.category].push({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        version: tool.version,
        level: tool.level,
        category: tool.category,
        safetyLevel: tool.safetyLevel,
        sideEffects: tool.sideEffects,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        resourceEstimate: tool.resourceEstimate
      });

      // Group by level
      if (groupedByLevel[tool.level]) {
        groupedByLevel[tool.level].push(tool.id);
      }
    });

    res.json({
      success: true,
      data: {
        tools: tools.map(tool => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          version: tool.version,
          level: tool.level,
          category: tool.category,
          safetyLevel: tool.safetyLevel,
          sideEffects: tool.sideEffects,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          resourceEstimate: tool.resourceEstimate
        })),
        groupedByCategory,
        groupedByLevel,
        stats
      }
    });
  } catch (error) {
    console.error('[GXE] getMcpToolsList error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Save MCP tools settings to knowledge graph
 * Stores which tools are enabled/disabled for AI generation
 */
exports.saveMcpSettings = async (req, res) => {
  try {
    const { enabledTools, settingsId = 'default', metadata = {} } = req.body;

    if (!enabledTools || !Array.isArray(enabledTools)) {
      return res.status(400).json({
        success: false,
        error: 'enabledTools (array of tool IDs) is required'
      });
    }

    // Import memgraph service for storing settings
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

    const settingsData = {
      id: `mcp-settings-${settingsId}`,
      type: 'mcp-tools-settings',
      enabledTools: enabledTools,
      enabledCount: enabledTools.length,
      updatedAt: new Date().toISOString(),
      ...metadata
    };

    await withWriteTransaction(graphDB.driver, async (tx) => {
      await tx.run(
        `
        MERGE (s:Settings {id: $id})
        SET s.type = $type,
            s.enabledTools = $enabledTools,
            s.enabledCount = $enabledCount,
            s.updatedAt = $updatedAt,
            s.name = $name,
            s.description = $description
        RETURN s
        `,
        {
          id: settingsData.id,
          type: settingsData.type,
          enabledTools: JSON.stringify(enabledTools),
          enabledCount: settingsData.enabledCount,
          updatedAt: settingsData.updatedAt,
          name: metadata.name || 'MCP Tools Settings',
          description: metadata.description || 'Settings for MCP tool filtering in AI generation'
        }
      );
    });

    console.log(`[GXE] Saved MCP settings "${settingsId}" with ${enabledTools.length} enabled tools`);

    res.json({
      success: true,
      data: {
        settingsId,
        enabledCount: enabledTools.length,
        updatedAt: settingsData.updatedAt
      }
    });
  } catch (error) {
    console.error('[GXE] saveMcpSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Load MCP tools settings from knowledge graph
 */
exports.loadMcpSettings = async (req, res) => {
  try {
    const { settingsId = 'default' } = req.params;

    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const settings = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `
        MATCH (s:Settings {id: $id, type: 'mcp-tools-settings'})
        RETURN s
        `,
        { id: `mcp-settings-${settingsId}` }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0].get('s').properties;
      return {
        settingsId,
        enabledTools: JSON.parse(record.enabledTools || '[]'),
        enabledCount: record.enabledCount,
        updatedAt: record.updatedAt,
        name: record.name,
        description: record.description
      };
    });

    if (!settings) {
      // Return minimal default settings for graph generation
      // Only include tools that are relevant for the generation process
      const DEFAULT_GENERATION_TOOLS = [
        'meta.introspect',   // Essential: lets AI discover available tools
        'text.normalize',    // Basic text processing
      ];

      const server = await getMcpServer();
      const allToolIds = server ? server.registry.listTools().map(t => t.id) : [];

      // Filter to only include tools that actually exist
      const validDefaultTools = DEFAULT_GENERATION_TOOLS.filter(id =>
        allToolIds.includes(id)
      );

      return res.json({
        success: true,
        data: {
          settingsId,
          enabledTools: validDefaultTools,
          enabledCount: validDefaultTools.length,
          totalAvailable: allToolIds.length,
          isDefault: true,
          message: 'No saved settings found, returning minimal tools for generation'
        }
      });
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('[GXE] loadMcpSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Delete MCP tools settings
 */
exports.deleteMcpSettings = async (req, res) => {
  try {
    const { settingsId = 'default' } = req.params;

    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

    await withWriteTransaction(graphDB.driver, async (tx) => {
      await tx.run(
        `
        MATCH (s:Settings {id: $id, type: 'mcp-tools-settings'})
        DELETE s
        `,
        { id: `mcp-settings-${settingsId}` }
      );
    });

    console.log(`[GXE] Deleted MCP settings "${settingsId}"`);

    res.json({
      success: true,
      data: { settingsId, deleted: true }
    });
  } catch (error) {
    console.error('[GXE] deleteMcpSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * List all saved MCP settings profiles
 */
exports.listMcpSettings = async (req, res) => {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const profiles = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `
        MATCH (s:Settings {type: 'mcp-tools-settings'})
        RETURN s
        ORDER BY s.updatedAt DESC
        `
      );

      return result.records.map(record => {
        const props = record.get('s').properties;
        return {
          settingsId: props.id.replace('mcp-settings-', ''),
          name: props.name,
          description: props.description,
          enabledCount: props.enabledCount,
          updatedAt: props.updatedAt
        };
      });
    });

    res.json({
      success: true,
      data: profiles
    });
  } catch (error) {
    console.error('[GXE] listMcpSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AI Settings Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/gxe/ai-settings
 */
exports.getAiSettings = async (req, res) => {
  try {
    const { settingsId = 'default' } = req.query;
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const settings = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {id: $id}) WHERE s.type = 'ai-settings' RETURN s`,
        { id: `ai-settings-${settingsId}` }
      );
      if (result.records.length === 0) return null;
      const p = result.records[0].get('s').properties;
      return {
        selectedModel: p.selectedModel || DEFAULT_MODEL,
        temperature: parseFloat(p.temperature) || 0.3,
        maxTokens: parseInt(p.maxTokens) || 8192,
        useTools: p.useTools === 'true' || p.useTools === true,
        useSDA: p.useSDA === 'true' || p.useSDA === true,
        updatedAt: p.updatedAt
      };
    });

    res.json({
      success: true,
      data: settings || {
        selectedModel: DEFAULT_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
        useTools: true,
        useSDA: true,
        isDefault: true
      }
    });
  } catch (error) {
    console.error('[GXE] getAiSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/ai-settings
 */
exports.saveAiSettings = async (req, res) => {
  try {
    const { selectedModel, temperature, maxTokens, useTools, useSDA, settingsId = 'default' } = req.body;
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

    await withWriteTransaction(graphDB.driver, async (tx) => {
      await tx.run(
        `MERGE (s:Settings {id: $id})
         SET s.type = 'ai-settings',
             s.selectedModel = $selectedModel,
             s.temperature = $temperature,
             s.maxTokens = $maxTokens,
             s.useTools = $useTools,
             s.useSDA = $useSDA,
             s.updatedAt = $updatedAt
         RETURN s`,
        {
          id: `ai-settings-${settingsId}`,
          selectedModel: selectedModel || DEFAULT_MODEL,
          temperature: String(temperature ?? 0.3),
          maxTokens: String(maxTokens ?? 8192),
          useTools: String(useTools ?? true),
          useSDA: String(useSDA ?? true),
          updatedAt: new Date().toISOString()
        }
      );
    });

    console.log(`[GXE] Saved AI settings: model=${selectedModel}, temp=${temperature}, maxTokens=${maxTokens}`);
    res.json({ success: true, data: { settingsId, updatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('[GXE] saveAiSettings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AI Layout — LLM-powered graph layout
// ═══════════════════════════════════════════════════════════════════════════

const aiLayoutService = require('../services/graph/ai-layout.service');

/**
 * POST /api/v1/gxe/ai-layout
 * Compute graph layout using LLM (Claude).
 */
exports.computeAILayout = async (req, res) => {
  try {
    const { canvas, nodes, edges, hints, configOverrides } = req.body;

    if (!nodes?.length) {
      return res.status(400).json({ success: false, error: 'No nodes provided' });
    }

    const result = await aiLayoutService.computeLayout(
      { canvas: canvas || { width: 1920, height: 1080, padding: 50 }, nodes, edges: edges || [], hints },
      configOverrides
    );

    res.json(result);
  } catch (error) {
    console.error('[GXE] computeAILayout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/ai-hex-layout
 * Compute graph layout on hex grid using LLM (Claude).
 */
exports.computeAIHexLayout = async (req, res) => {
  try {
    const { canvas, nodes, edges, hints, configOverrides } = req.body;
    if (!nodes || nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'No nodes provided' });
    }

    const result = await aiLayoutService.computeHexLayout(
      { canvas: canvas || { width: 1920, height: 1080, padding: 50 }, nodes, edges: edges || [], hints },
      configOverrides
    );

    res.json(result);
  } catch (error) {
    console.error('[GXE] computeAIHexLayout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/ai-layout-config
 * Load AI Layout settings from Core KB.
 */
exports.getAILayoutConfig = async (req, res) => {
  try {
    const config = await aiLayoutService.loadConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('[GXE] getAILayoutConfig error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/ai-layout-config
 * Save AI Layout settings to Core KB.
 */
exports.saveAILayoutConfig = async (req, res) => {
  try {
    const { selectedModel, temperature, maxTokens, systemPrompt } = req.body;
    await aiLayoutService.saveConfig({ selectedModel, temperature, maxTokens, systemPrompt });
    console.log(`[GXE] Saved AI Layout config: model=${selectedModel}, temp=${temperature}`);
    res.json({ success: true, data: { updatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('[GXE] saveAILayoutConfig error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/display-rules
 * Load display rules from KB. Optional ?graphType=business for type-specific.
 */
exports.getDisplayRules = async (req, res) => {
  try {
    const { graphType } = req.query;
    const rules = await aiLayoutService.loadDisplayRules(graphType || null);
    res.json({ success: true, data: rules });
  } catch (error) {
    console.error('[GXE] getDisplayRules error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/display-rules
 * Save display rules to KB. Body includes graphType ('global' or specific type).
 */
exports.saveDisplayRules = async (req, res) => {
  try {
    const { graphType = 'global', ...rules } = req.body;
    await aiLayoutService.saveDisplayRules(rules, graphType);
    console.log(`[GXE] Saved display rules for graphType="${graphType}"`);
    res.json({ success: true, data: { graphType, updatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('[GXE] saveDisplayRules error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/display-rules/list
 * List all display rule sets (global + per-graph-type).
 */
exports.listDisplayRules = async (req, res) => {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const results = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {type: 'gxe-display-rules'})
         RETURN s ORDER BY s.graphType`
      );
      return result.records.map(r => {
        const p = r.get('s').properties;
        return {
          id: p.id,
          graphType: p.graphType || 'global',
          minGapXMultiplier: parseFloat(p.minGapXMultiplier) || 2,
          minGapYMultiplier: parseFloat(p.minGapYMultiplier) || 3,
          disconnectedGapMultiplier: parseFloat(p.disconnectedGapMultiplier) || 3,
          updatedAt: p.updatedAt,
        };
      });
    });

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('[GXE] listDisplayRules error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// System Prompt Versioning
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/gxe/system-prompt
 */
exports.getSystemPrompt = async (req, res) => {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    const prompt = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {id: 'system-prompt-current'})-[:CURRENT]->(pv:PromptVersion) RETURN pv`
      );
      if (result.records.length === 0) return null;
      const p = result.records[0].get('pv').properties;
      return {
        id: p.id,
        content: p.content,
        version: parseInt(p.version) || 1,
        createdAt: p.createdAt,
        metadata: p.metadata ? JSON.parse(p.metadata) : {}
      };
    });

    res.json({
      success: true,
      data: prompt || { content: '', version: 0, isDefault: true }
    });
  } catch (error) {
    console.error('[GXE] getSystemPrompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/system-prompt
 * Saves a new version, links to previous via NEXT_VERSION, switches CURRENT pointer
 */
exports.saveSystemPrompt = async (req, res) => {
  try {
    const { content, metadata = {} } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content (string) is required' });
    }

    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');
    const versionId = uuidv4();

    const result = await withWriteTransaction(graphDB.driver, async (tx) => {
      // 1. Get current version
      const cur = await tx.run(
        `OPTIONAL MATCH (s:Settings {id: 'system-prompt-current'})-[:CURRENT]->(pv:PromptVersion)
         RETURN pv.version AS ver, pv.id AS prevId`
      );
      const prevId = cur.records[0]?.get('prevId') || null;
      const nextVersion = (parseInt(cur.records[0]?.get('ver')) || 0) + 1;

      // 2. Create new PromptVersion
      await tx.run(
        `CREATE (pv:PromptVersion {
           id: $id, content: $content, version: $version,
           createdAt: $createdAt, metadata: $metadata
         })`,
        {
          id: versionId,
          content,
          version: String(nextVersion),
          createdAt: new Date().toISOString(),
          metadata: JSON.stringify(metadata)
        }
      );

      // 3. Link previous → new
      if (prevId) {
        await tx.run(
          `MATCH (prev:PromptVersion {id: $prevId})
           MATCH (next:PromptVersion {id: $nextId})
           CREATE (prev)-[:NEXT_VERSION]->(next)`,
          { prevId, nextId: versionId }
        );
      }

      // 4. Switch CURRENT pointer
      await tx.run(
        `MERGE (s:Settings {id: 'system-prompt-current'})
         SET s.type = 'system-prompt-pointer', s.updatedAt = $updatedAt
         WITH s
         OPTIONAL MATCH (s)-[r:CURRENT]->()
         DELETE r
         WITH s
         MATCH (pv:PromptVersion {id: $pvId})
         CREATE (s)-[:CURRENT]->(pv)`,
        { pvId: versionId, updatedAt: new Date().toISOString() }
      );

      return { versionId, version: nextVersion };
    });

    console.log(`[GXE] Saved system prompt v${result.version} (${result.versionId})`);
    res.json({
      success: true,
      data: { versionId: result.versionId, version: result.version, createdAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('[GXE] saveSystemPrompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/system-prompt/history
 */
exports.getSystemPromptHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');
    const neo4j = require('neo4j-driver');

    const history = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (pv:PromptVersion) RETURN pv ORDER BY pv.createdAt DESC LIMIT $limit`,
        { limit: neo4j.int(limit) }
      );
      return result.records.map(r => {
        const p = r.get('pv').properties;
        return {
          id: p.id,
          version: parseInt(p.version) || 1,
          content: p.content,
          createdAt: p.createdAt,
          metadata: p.metadata ? JSON.parse(p.metadata) : {}
        };
      });
    });

    // Mark current version
    const currentId = await withSession(graphDB.driver, async (session) => {
      const r = await session.run(
        `MATCH (s:Settings {id: 'system-prompt-current'})-[:CURRENT]->(pv:PromptVersion) RETURN pv.id AS cid`
      );
      return r.records[0]?.get('cid') || null;
    });

    res.json({
      success: true,
      data: history.map(h => ({ ...h, isCurrent: h.id === currentId }))
    });
  } catch (error) {
    console.error('[GXE] getSystemPromptHistory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GXE Generation Prompt Management (category='gxe-generation')
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/gxe/generation-prompts/default
 * Returns the default generation prompt (auto-seeds from hardcoded if none exists)
 */
exports.getDefaultGenerationPrompt = async (req, res) => {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');

    let prompt = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {id: 'gxe-generation-prompt-default'})-[:DEFAULT_PROMPT]->(pv:PromptVersion {category: 'gxe-generation'})
         RETURN pv`
      );
      if (result.records.length === 0) return null;
      const p = result.records[0].get('pv').properties;
      return {
        id: p.id, name: p.name, content: p.content,
        version: parseInt(p.version) || 1, status: p.status,
        createdAt: p.createdAt, metadata: p.metadata ? JSON.parse(p.metadata) : {}
      };
    });

    if (!prompt) {
      prompt = await seedDefaultGenerationPrompt();
    }

    res.json({ success: true, data: { ...prompt, isDefault: true } });
  } catch (error) {
    console.error('[GXE] getDefaultGenerationPrompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/generation-prompts
 * List all gxe-generation prompt versions with aggregated metrics
 */
exports.listGenerationPrompts = async (req, res) => {
  try {
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');
    const neo4j = require('neo4j-driver');
    const limit = parseInt(req.query.limit) || 50;

    const prompts = await withSession(graphDB.driver, async (session) => {
      // Get all prompt versions with metric aggregation
      const result = await session.run(
        `MATCH (pv:PromptVersion {category: 'gxe-generation'})
         OPTIONAL MATCH (pv)-[:HAS_METRIC]->(m:PromptMetric)
         WITH pv,
              count(m) AS usageCount,
              avg(toFloat(m.qualityScore)) AS avgScore,
              avg(toFloat(m.generationTimeMs)) AS avgLatency
         RETURN pv, usageCount, avgScore, avgLatency
         ORDER BY pv.createdAt DESC
         LIMIT $limit`,
        { limit: neo4j.int(limit) }
      );
      return result.records.map(r => {
        const p = r.get('pv').properties;
        const uc = r.get('usageCount');
        return {
          id: p.id, name: p.name || `v${p.version}`,
          version: parseInt(p.version) || 1, status: p.status,
          content: p.content, createdAt: p.createdAt,
          metadata: p.metadata ? JSON.parse(p.metadata) : {},
          metrics: {
            usageCount: uc?.toNumber ? uc.toNumber() : (uc || 0),
            avgScore: r.get('avgScore'),
            avgLatency: r.get('avgLatency')
          }
        };
      });
    });

    // Mark current default
    const defaultId = await withSession(graphDB.driver, async (session) => {
      const r = await session.run(
        `MATCH (s:Settings {id: 'gxe-generation-prompt-default'})-[:DEFAULT_PROMPT]->(pv:PromptVersion) RETURN pv.id AS did`
      );
      return r.records[0]?.get('did') || null;
    });

    res.json({
      success: true,
      data: prompts.map(p => ({ ...p, isDefault: p.id === defaultId }))
    });
  } catch (error) {
    console.error('[GXE] listGenerationPrompts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/generation-prompts
 * Save a new gxe-generation prompt version
 */
exports.saveGenerationPrompt = async (req, res) => {
  try {
    const { content, name, metadata = {} } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content (string) is required' });
    }

    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');
    const versionId = uuidv4();

    const result = await withWriteTransaction(graphDB.driver, async (tx) => {
      const cur = await tx.run(
        `OPTIONAL MATCH (pv:PromptVersion {category: 'gxe-generation'})
         RETURN max(toInteger(pv.version)) AS maxVer`
      );
      const nextVersion = (parseInt(cur.records[0]?.get('maxVer')) || 0) + 1;

      await tx.run(
        `CREATE (pv:PromptVersion {
           id: $id, category: 'gxe-generation',
           name: $name, content: $content, version: $version,
           status: 'active', createdAt: $createdAt, metadata: $metadata
         })`,
        {
          id: versionId,
          name: name || `GXE Prompt v${nextVersion}`,
          content,
          version: String(nextVersion),
          createdAt: new Date().toISOString(),
          metadata: JSON.stringify(metadata)
        }
      );
      return { versionId, version: nextVersion };
    });

    console.log(`[GXE] Saved generation prompt v${result.version} (${result.versionId})`);
    res.json({ success: true, data: { id: result.versionId, version: result.version } });
  } catch (error) {
    console.error('[GXE] saveGenerationPrompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/gxe/generation-prompts/:promptId/set-default
 * Set a prompt version as the default for GXE generation
 */
exports.setDefaultGenerationPrompt = async (req, res) => {
  try {
    const { promptId } = req.params;
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withWriteTransaction } = require('../core/aopeg/utils/cypher.utils');

    await withWriteTransaction(graphDB.driver, async (tx) => {
      const check = await tx.run(
        `MATCH (pv:PromptVersion {id: $promptId, category: 'gxe-generation'}) RETURN pv`,
        { promptId }
      );
      if (check.records.length === 0) throw new Error('Prompt version not found');

      // Reset old default status
      await tx.run(
        `MATCH (pv:PromptVersion {category: 'gxe-generation', status: 'default'})
         SET pv.status = 'active'`
      );

      // Switch DEFAULT_PROMPT pointer and mark new default
      await tx.run(
        `MERGE (s:Settings {id: 'gxe-generation-prompt-default'})
         SET s.type = 'prompt-pointer', s.updatedAt = $updatedAt
         WITH s
         OPTIONAL MATCH (s)-[r:DEFAULT_PROMPT]->()
         DELETE r
         WITH s
         MATCH (pv:PromptVersion {id: $pvId, category: 'gxe-generation'})
         CREATE (s)-[:DEFAULT_PROMPT]->(pv)
         SET pv.status = 'default'`,
        { pvId: promptId, updatedAt: new Date().toISOString() }
      );
    });

    console.log(`[GXE] Set default generation prompt: ${promptId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[GXE] setDefaultGenerationPrompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/gxe/generation-prompts/:promptId/metrics
 * Get effectiveness metrics for a specific prompt version, aggregated by inputType
 */
exports.getGenerationPromptMetrics = async (req, res) => {
  try {
    const { promptId } = req.params;
    const graphDB = require('../services/storage/GraphDBPort').getGraphDB();
    const { withSession } = require('../core/aopeg/utils/cypher.utils');
    const neo4j = require('neo4j-driver');

    const metrics = await withSession(graphDB.driver, async (session) => {
      const result = await session.run(
        `MATCH (pv:PromptVersion {id: $promptId, category: 'gxe-generation'})-[:HAS_METRIC]->(m:PromptMetric)
         RETURN m ORDER BY m.createdAt DESC LIMIT $limit`,
        { promptId, limit: neo4j.int(100) }
      );
      return result.records.map(r => r.get('m').properties);
    });

    // Aggregate by input type
    const byType = {};
    for (const m of metrics) {
      const type = m.inputTextType || 'general';
      if (!byType[type]) byType[type] = { count: 0, totalScore: 0, totalLatency: 0 };
      byType[type].count++;
      byType[type].totalScore += parseFloat(m.qualityScore) || 0;
      byType[type].totalLatency += parseFloat(m.generationTimeMs) || 0;
    }
    for (const type of Object.keys(byType)) {
      byType[type].avgScore = byType[type].totalScore / byType[type].count;
      byType[type].avgLatency = byType[type].totalLatency / byType[type].count;
    }

    res.json({ success: true, data: { metrics, byType, total: metrics.length } });
  } catch (error) {
    console.error('[GXE] getGenerationPromptMetrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/gxe/generation-prompts/:promptId/record-metric
 * Record a generation effectiveness metric
 */
exports.recordGenerationMetric = async (req, res) => {
  try {
    const { promptId } = req.params;
    await recordPromptMetricInternal(promptId, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('[GXE] recordGenerationMetric error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Run A/B test comparing SDA vs Legacy pipelines
 * Uses test corpus to generate graphs with both pipelines and compare quality
 *
 * POST /api/v1/gxe/ab-test
 * Body:
 *  - testCaseIds: string[] - Optional subset of test case IDs to run
 *  - delayBetweenTests: number - Delay in ms between tests (default: 1000)
 */
exports.runABTest = async (req, res) => {
  try {
    const { testCaseIds, delayBetweenTests = 1000 } = req.body;

    const { getAllTestCases, getTestCaseById } = require('../services/graph/test-corpus');
    const { createABTestRunner } = require('../services/graph/ab-test-runner');

    // Get test cases
    let testCases = getAllTestCases();
    if (testCaseIds && testCaseIds.length > 0) {
      testCases = testCaseIds.map(id => getTestCaseById(id)).filter(Boolean);
    }

    if (testCases.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid test cases found'
      });
    }

    console.log(`[GXE A/B Test] Starting test with ${testCases.length} cases`);

    // Create runner with internal generation function
    const runner = createABTestRunner(async (options) => {
      return await internalGenerateGraph(options);
    });

    // Run the test
    const report = await runner.runFullTest(testCases, {
      verbose: true,
      delayBetweenTests
    });

    // Format results
    const table = runner.formatAsTable(report);
    const loggingData = runner.formatForLogging(report);

    console.log('[GXE A/B Test] Completed');
    console.log(table);

    res.json({
      success: true,
      report,
      table,
      loggingData
    });
  } catch (error) {
    console.error('[GXE] runABTest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get test corpus statistics
 *
 * GET /api/v1/gxe/test-corpus
 */
exports.getTestCorpus = (req, res) => {
  try {
    const { getAllTestCases, getCorpusStats, getCategories } = require('../services/graph/test-corpus');

    const testCases = getAllTestCases();
    const stats = getCorpusStats();
    const categories = getCategories();

    res.json({
      success: true,
      data: {
        testCases: testCases.map(tc => ({
          id: tc.id,
          category: tc.category,
          complexity: tc.complexity,
          prompt: (tc.prompt || tc.promptEn || '').substring(0, 100),
          expectedNodeRange: `${tc.expectedProperties.minNodes}-${tc.expectedProperties.maxNodes}`,
          expectedParallel: tc.expectedProperties.expectedParallel
        })),
        stats,
        categories
      }
    });
  } catch (error) {
    console.error('[GXE] getTestCorpus error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH GENERATION (SSE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Circular layout helper for positioning nodes
 */
function circularLayout(index, total, radius = 300) {
  const cx = 400;
  const cy = 350;
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: Math.round(cx + radius * Math.cos(angle)),
    y: Math.round(cy + radius * Math.sin(angle))
  };
}

/**
 * Generate Knowledge Graph from text via extraction pipeline (SSE)
 *
 * Streams real-time progress through 5 stages:
 *   1. Parse — text preprocessing (sanitize, normalize)
 *   2. Chunk — split into semantic chunks
 *   3. Extract — entity + relationship extraction per chunk
 *   4. Deduplicate — merge duplicate entities/relations
 *   5. Build Graph — map to ReactFlow nodes/edges
 *
 * POST /api/v1/gxe/generate-knowledge-graph
 * Body: { text: string, options?: { method?: string } }
 */
exports.generateKnowledgeGraph = async (req, res) => {
  const { text = '', options = {} } = req.body;
  const { sources = [] } = options;

  // Allow request if text is provided OR sources are specified
  const hasText = text && typeof text === 'string' && text.trim();
  const hasSources = Array.isArray(sources) && sources.length > 0;

  if (!hasText && !hasSources) {
    return res.status(400).json({ success: false, error: 'text (string) or options.sources (array) is required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendSSE = (data) => {
    const { type, stage, status, message, title, subtitle } = data;
    const info = [type, stage, status, message || title || subtitle].filter(Boolean).join(' | ');
    console.log(`[GXE KG SSE] ${info}`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const startTime = Date.now();

  try {
    // ── Stage 0 (optional): Fetch content from data sources ──
    let sourceText = '';
    if (hasSources) {
      sendSSE({ type: 'stage_update', stage: 'parse', status: 'running', progress: 2, message: `Fetching from ${sources.length} data source(s)...` });

      try {
        const { sourceManager } = require('../services/connectors');

        for (const sourceName of sources) {
          try {
            const connector = sourceManager.get(sourceName);
            if (!connector) {
              sendSSE({ type: 'info', message: `Source "${sourceName}" not found, skipping` });
              continue;
            }

            const info = connector.getInfo ? connector.getInfo() : {};
            sendSSE({ type: 'info', message: `Fetching from "${sourceName}" (${info.type || 'unknown'})...` });

            // Fetch overview/sample data from the connector
            let content = '';
            if (typeof connector.getOverview === 'function') {
              const overview = await connector.getOverview();
              content = typeof overview === 'string' ? overview : JSON.stringify(overview, null, 2);
            } else if (typeof connector.getSampleData === 'function') {
              const samples = await connector.getSampleData();
              content = typeof samples === 'string' ? samples : JSON.stringify(samples, null, 2);
            }

            if (content) {
              sourceText += `\n\n--- Source: ${sourceName} (${info.type || 'unknown'}) ---\n${content}`;
            }
          } catch (srcErr) {
            console.warn(`[GXE KG] Failed to fetch from source "${sourceName}":`, srcErr.message);
            sendSSE({ type: 'info', message: `Warning: failed to fetch from "${sourceName}": ${srcErr.message}` });
          }
        }

        if (sourceText) {
          sendSSE({ type: 'info', message: `Fetched ${sourceText.length} chars from data sources` });
        }
      } catch (srcModuleErr) {
        console.warn('[GXE KG] Connectors module not available:', srcModuleErr.message);
        sendSSE({ type: 'info', message: 'Warning: connectors module not available' });
      }
    }

    // Combine source-fetched text with user-provided text
    const combinedText = [sourceText, text].filter(Boolean).join('\n\n');

    // ── Stage 1: Parse ──
    sendSSE({ type: 'stage_update', stage: 'parse', status: 'running', progress: 5, message: 'Preprocessing text...' });

    let processedText = combinedText;
    let parseStats = {};
    try {
      const preprocessor = createTextPreprocessor({ resolveCoreferences: false, decomposeSentences: false });
      const parseResult = await preprocessor.process(combinedText);
      processedText = parseResult.sentences.length > 0 ? parseResult.sentences.join('\n\n') : combinedText;
      parseStats = {
        originalLength: combinedText.length,
        processedLength: processedText.length,
        sentences: parseResult.sentences.length,
        duration: parseResult.duration,
        sourcesIncluded: sources.length || 0
      };
    } catch (parseErr) {
      console.warn('[GXE KG] Preprocessing failed, using raw text:', parseErr.message);
      parseStats = { originalLength: combinedText.length, processedLength: combinedText.length, fallback: true };
    }

    sendSSE({ type: 'stage_update', stage: 'parse', status: 'done', progress: 10, message: 'Text preprocessed', stats: parseStats });
    sendSSE({ type: 'parsing', title: 'Text Preprocessing', subtitle: `${parseStats.originalLength} chars → ${parseStats.processedLength} chars`, output: parseStats });

    // GATE: parse
    const parseCheck = KG_THRESHOLDS.parse.check(null, parseStats);
    if (parseCheck.anomaly) {
      sendSSE({ type: 'stage_update', stage: 'parse', status: 'error', progress: 10, message: parseCheck.reason });
      const anomaly = await handleAnomaly('kg', 'Parse', parseCheck.reason, { textLength: text.length, textPreview: text.substring(0, 300) }, parseStats, text.substring(0, 1000));
      sendSSE({ type: 'anomaly_detected', stage: 'parse', anomaly });
      res.end(); return;
    }

    // ── Stage 2: Chunk ──
    sendSSE({ type: 'stage_update', stage: 'chunk', status: 'running', progress: 15, message: 'Splitting into semantic chunks...' });

    const chunks = chunkText(processedText, { maxTokens: 512 });
    const chunkStats = { count: chunks.length, avgLength: chunks.length > 0 ? Math.round(chunks.reduce((s, c) => s + c.content.length, 0) / chunks.length) : 0 };

    sendSSE({ type: 'stage_update', stage: 'chunk', status: 'done', progress: 25, message: `${chunks.length} chunks created`, stats: chunkStats });
    sendSSE({ type: 'chunking', title: 'Semantic Chunking', subtitle: `${chunks.length} chunks (avg ${chunkStats.avgLength} chars)`, output: chunkStats });

    // GATE: chunk
    const chunkCheck = KG_THRESHOLDS.chunk.check(chunks);
    if (chunkCheck.anomaly) {
      sendSSE({ type: 'stage_update', stage: 'chunk', status: 'error', progress: 25, message: chunkCheck.reason });
      const anomaly = await handleAnomaly('kg', 'Chunk', chunkCheck.reason, { processedTextLength: processedText.length }, chunkStats, text.substring(0, 1000));
      sendSSE({ type: 'anomaly_detected', stage: 'chunk', anomaly });
      res.end(); return;
    }

    // ── Stage 3: Extract ──
    sendSSE({ type: 'stage_update', stage: 'extract', status: 'running', progress: 30, message: 'Extracting entities and relationships...' });

    const allEntities = [];
    const allRelations = [];
    const extractionMethod = options.method || 'hybrid';

    // If text is short enough, extract from full text; otherwise extract per chunk
    const textsToExtract = chunks.length <= 1 ? [processedText] : chunks.map(c => c.content);

    for (let i = 0; i < textsToExtract.length; i++) {
      const chunkText_ = textsToExtract[i];
      const progress = 30 + Math.round((i / textsToExtract.length) * 40);

      sendSSE({ type: 'stage_update', stage: 'extract', status: 'running', progress, message: `Extracting chunk ${i + 1}/${textsToExtract.length}...` });

      try {
        const result = await unifiedExtractor.extract(chunkText_, {
          method: extractionMethod,
          verify: false
        });

        if (result.entities) allEntities.push(...result.entities);
        if (result.relations) allRelations.push(...result.relations);

        const subtitle = result.metadata?.error
          ? `LLM error: ${result.metadata.error}`
          : `${result.entities?.length || 0} entities, ${result.relations?.length || 0} relations`;

        sendSSE({
          type: 'extraction_result',
          title: `Chunk ${i + 1} Extraction`,
          subtitle,
          chunk: i + 1,
          totalChunks: textsToExtract.length,
          entities: result.entities?.length || 0,
          relations: result.relations?.length || 0,
          llmError: result.metadata?.error || null
        });
      } catch (extractErr) {
        console.warn(`[GXE KG] Extraction failed for chunk ${i + 1}:`, extractErr.message);
        sendSSE({ type: 'extraction_result', title: `Chunk ${i + 1} Failed`, subtitle: extractErr.message, error: true });
      }
    }

    const extractStats = { totalEntities: allEntities.length, totalRelations: allRelations.length, chunks: textsToExtract.length, method: extractionMethod };
    sendSSE({ type: 'stage_update', stage: 'extract', status: 'done', progress: 70, message: `${allEntities.length} entities, ${allRelations.length} relations`, stats: extractStats });
    sendSSE({ type: 'extraction', title: 'Extraction Complete', subtitle: `${allEntities.length} entities, ${allRelations.length} relations`, output: extractStats });

    // GATE: extract
    const extractCheck = KG_THRESHOLDS.extract.check(allEntities, allRelations, extractStats);
    if (extractCheck.anomaly) {
      sendSSE({ type: 'stage_update', stage: 'extract', status: 'error', progress: 70, message: extractCheck.reason });
      const anomaly = await handleAnomaly('kg', 'Extract', extractCheck.reason, { chunks: textsToExtract.length, method: extractionMethod }, extractStats, text.substring(0, 1000));
      sendSSE({ type: 'anomaly_detected', stage: 'extract', anomaly });
      res.end(); return;
    }

    // ── Stage 4: Deduplicate ──
    sendSSE({ type: 'stage_update', stage: 'deduplicate', status: 'running', progress: 75, message: 'Deduplicating entities and relationships...' });

    // Deduplicate entities by name (case-insensitive)
    const entityMap = new Map();
    for (const entity of allEntities) {
      const key = (entity.name || '').toLowerCase().trim();
      if (!key) continue;
      if (entityMap.has(key)) {
        // Merge properties
        const existing = entityMap.get(key);
        existing.properties = { ...(existing.properties || {}), ...(entity.properties || {}) };
        if (entity.type && !existing.type) existing.type = entity.type;
      } else {
        entityMap.set(key, { ...entity });
      }
    }
    const uniqueEntities = Array.from(entityMap.values());

    // Deduplicate relations by source|target|type key
    // Normalize field names: extractors return either {source,target,type} or {subject,object,predicate}
    const relationSet = new Set();
    const uniqueRelations = [];
    for (const rel of allRelations) {
      const src = (rel.source || rel.subject || '').toLowerCase().trim();
      const tgt = (rel.target || rel.object || '').toLowerCase().trim();
      const type = (rel.type || rel.predicate || '').toLowerCase().trim();
      if (!src || !tgt) continue;
      // Normalize to source/target/type for downstream graph build
      const normalized = { ...rel, source: src, target: tgt, type: type || 'RELATED_TO' };
      const key = `${src}|${tgt}|${type}`;
      if (!relationSet.has(key)) {
        relationSet.add(key);
        uniqueRelations.push(normalized);
      }
    }

    const dedupStats = {
      entitiesBefore: allEntities.length,
      entitiesAfter: uniqueEntities.length,
      entitiesRemoved: allEntities.length - uniqueEntities.length,
      relationsBefore: allRelations.length,
      relationsAfter: uniqueRelations.length,
      relationsRemoved: allRelations.length - uniqueRelations.length
    };

    sendSSE({ type: 'stage_update', stage: 'deduplicate', status: 'done', progress: 85, message: `${uniqueEntities.length} unique entities, ${uniqueRelations.length} unique relations`, stats: dedupStats });
    sendSSE({ type: 'deduplication', title: 'Deduplication', subtitle: `Removed ${dedupStats.entitiesRemoved} duplicate entities, ${dedupStats.relationsRemoved} duplicate relations`, output: dedupStats });

    // GATE: deduplicate
    const dedupCheck = KG_THRESHOLDS.deduplicate.check(dedupStats);
    if (dedupCheck.anomaly) {
      sendSSE({ type: 'stage_update', stage: 'deduplicate', status: 'error', progress: 85, message: dedupCheck.reason });
      const anomaly = await handleAnomaly('kg', 'Deduplicate', dedupCheck.reason, { entitiesBefore: allEntities.length, relationsBefore: allRelations.length }, dedupStats, text.substring(0, 1000));
      sendSSE({ type: 'anomaly_detected', stage: 'deduplicate', anomaly });
      res.end(); return;
    }

    // ── Stage 5: Build Graph ──
    sendSSE({ type: 'stage_update', stage: 'graph_build', status: 'running', progress: 90, message: 'Building ReactFlow graph...' });

    // Build entity name → node ID map (use normalized names as IDs)
    const entityNameToId = new Map();
    uniqueEntities.forEach((entity, i) => {
      const id = `entity-${(entity.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${i}`;
      entityNameToId.set((entity.name || '').toLowerCase().trim(), id);
    });

    // Map entities to ReactFlow nodes
    const nodes = uniqueEntities.map((entity, i) => {
      const pos = circularLayout(i, uniqueEntities.length);
      const id = entityNameToId.get((entity.name || '').toLowerCase().trim());
      return {
        id,
        type: 'default',
        position: pos,
        data: {
          label: entity.name,
          entityType: entity.type || 'unknown',
          properties: entity.properties || {},
          confidence: entity.confidence
        }
      };
    });

    // Fuzzy entity name resolver: exact match → substring match → create new node
    const entityNames = Array.from(entityNameToId.keys());
    let autoNodeCounter = uniqueEntities.length;

    function resolveEntityId(name) {
      const key = (name || '').toLowerCase().trim();
      if (!key) return null;

      // 1. Exact match
      if (entityNameToId.has(key)) return entityNameToId.get(key);

      // 2. Substring / contains match (entity name contains relation endpoint or vice versa)
      for (const eName of entityNames) {
        if (eName.includes(key) || key.includes(eName)) {
          return entityNameToId.get(eName);
        }
      }

      // 3. Auto-create a new node for unresolved relation endpoint
      const newId = `entity-auto-${key.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${autoNodeCounter++}`;
      entityNameToId.set(key, newId);
      entityNames.push(key);
      const pos = circularLayout(nodes.length, nodes.length + 1);
      nodes.push({
        id: newId,
        type: 'default',
        position: pos,
        data: {
          label: name,
          entityType: 'unknown',
          properties: { autoCreated: true },
          confidence: 0
        }
      });
      return newId;
    }

    // Map relations to ReactFlow edges
    const edges = [];
    let droppedEdges = 0;
    uniqueRelations.forEach((rel, i) => {
      const sourceId = resolveEntityId(rel.source);
      const targetId = resolveEntityId(rel.target);
      if (sourceId && targetId && sourceId !== targetId) {
        edges.push({
          id: `e-${i}`,
          source: sourceId,
          target: targetId,
          label: rel.type || rel.predicate || '',
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#8b5cf6', strokeWidth: 2 },
          labelStyle: { fill: '#d8b4fe', fontSize: 10 },
          markerEnd: { type: 'arrowclosed', color: '#8b5cf6' }
        });
      } else {
        droppedEdges++;
      }
    });
    if (droppedEdges > 0) {
      console.log(`[GXE KG] Dropped ${droppedEdges} self-referencing edges`);
    }

    // Fallback: if we have nodes but 0 edges, infer co-occurrence relations
    if (edges.length === 0 && nodes.length >= 2) {
      console.log(`[GXE KG] No edges from relations, inferring co-occurrence edges for ${nodes.length} nodes`);
      // Connect each entity to the next one (chain), so every node is reachable
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: `e-inferred-${i}`,
          source: nodes[i].id,
          target: nodes[i + 1].id,
          label: 'RELATED_TO',
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 3' },
          labelStyle: { fill: '#9ca3af', fontSize: 10 },
          markerEnd: { type: 'arrowclosed', color: '#6b7280' },
          data: { inferred: true }
        });
      }
      sendSSE({ type: 'stage_update', stage: 'graph_build', status: 'running', progress: 90, message: `Inferred ${edges.length} co-occurrence edges` });
    }

    const graphBuildDuration = Date.now() - startTime;
    const graphStats = { nodes: nodes.length, edges: edges.length, entities: uniqueEntities.length, relations: uniqueRelations.length, inferredEdges: edges.filter(e => e.data?.inferred).length, duration: graphBuildDuration };

    sendSSE({ type: 'stage_update', stage: 'graph_build', status: 'done', progress: 90, message: `${nodes.length} nodes, ${edges.length} edges`, stats: graphStats });
    sendSSE({ type: 'graph_build', title: 'Graph Construction', subtitle: `${nodes.length} nodes, ${edges.length} edges`, output: graphStats });

    // GATE: graphBuild
    const graphBuildCheck = KG_THRESHOLDS.graphBuild.check(nodes, edges);
    if (graphBuildCheck.anomaly) {
      sendSSE({ type: 'stage_update', stage: 'graph_build', status: 'error', progress: 90, message: graphBuildCheck.reason });
      const anomaly = await handleAnomaly('kg', 'Graph Build', graphBuildCheck.reason, { uniqueEntities: uniqueEntities.length, uniqueRelations: uniqueRelations.length }, graphStats, text.substring(0, 1000));
      sendSSE({ type: 'anomaly_detected', stage: 'graph_build', anomaly });
      res.end(); return;
    }

    // ── Stage 6: AI Analysis (Claude Haiku — fast & cheap, skippable) ──
    let aiAnalysis = null;
    const skipAiAnalysis = options.skipAiAnalysis === true;

    if (skipAiAnalysis) {
      sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'done', progress: 100, message: 'AI analysis skipped (skipAiAnalysis=true)' });
    } else {
    sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'running', progress: 92, message: 'Analyzing graph quality with Claude Haiku...' });

    try {
      // Build compact graph summary (no properties bloat)
      const graphSummary = {
        entities: uniqueEntities.map(e => `${e.name} [${e.type || '?'}]`),
        relations: uniqueRelations.map(r => `${r.source} -[${r.type || r.predicate || '?'}]-> ${r.target}`),
        counts: { entities: uniqueEntities.length, relations: uniqueRelations.length, nodes: nodes.length, edges: edges.length }
      };

      const analysisPrompt = `You are a knowledge graph quality analyst. Given source text and extracted graph, evaluate completeness.
Respond ONLY in JSON: {"completenessScore":<0-100>,"summary":"<1 sentence>","missingEntities":["name (TYPE)"],"missingRelations":["A->B (TYPE)"],"incorrectItems":["description"],"recommendations":["suggestion"]}`;

      const userMessage = `## Source Text (excerpt)
${text.substring(0, 3000)}

## Extracted Graph
${JSON.stringify(graphSummary)}

Evaluate completeness and identify gaps.`;

      sendSSE({ type: 'ai_analysis', title: 'AI Analysis Started', subtitle: 'Sending to Claude Haiku for quality analysis...' });

      logRequestStats({ model: 'haiku', max_tokens: 2048 }, 'KG AI Analysis (Haiku)');

      const aiResp = await getLLMProvider().chat(
        [{ role: 'user', content: userMessage }],
        { model: 'haiku', maxTokens: 2048, system: analysisPrompt }
      );
      const aiText = aiResp.content?.[0]?.text || '';

      sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'running', progress: 97, message: 'Parsing AI analysis results...' });

      // Try to parse JSON from AI response
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
        } else {
          aiAnalysis = { summary: aiText, completenessScore: null, recommendations: [] };
        }
      } catch (parseErr) {
        aiAnalysis = { summary: aiText, completenessScore: null, recommendations: [], parseError: true };
      }

      const analysisStats = {
        completenessScore: aiAnalysis.completenessScore,
        missingEntities: aiAnalysis.missingEntities?.length || 0,
        missingRelations: aiAnalysis.missingRelations?.length || 0,
        incorrectItems: aiAnalysis.incorrectItems?.length || 0,
        recommendations: aiAnalysis.recommendations?.length || 0,
        model: AVAILABLE_MODELS['claude-haiku']
      };

      sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'done', progress: 100, message: `Completeness: ${aiAnalysis.completenessScore ?? 'N/A'}%`, stats: analysisStats });
      sendSSE({
        type: 'ai_analysis',
        title: 'AI Quality Analysis',
        subtitle: `Completeness: ${aiAnalysis.completenessScore ?? 'N/A'}% | ${analysisStats.missingEntities} missing entities, ${analysisStats.missingRelations} missing relations`,
        output: aiAnalysis
      });

    } catch (aiErr) {
      console.warn('[GXE KG] AI analysis failed:', aiErr.message);
      sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'error', progress: 100, message: `AI analysis failed: ${aiErr.message}` });
      sendSSE({ type: 'ai_analysis', title: 'AI Analysis Failed', subtitle: aiErr.message, error: true });
    }

    // GATE: aiAnalysis (soft — graph still sent, anomaly is a warning)
    if (aiAnalysis) {
      const aiCheck = KG_THRESHOLDS.aiAnalysis.check(aiAnalysis);
      if (aiCheck.anomaly) {
        sendSSE({ type: 'stage_update', stage: 'ai_analysis', status: 'error', progress: 100, message: aiCheck.reason });
        const anomaly = await handleAnomaly('kg', 'AI Analysis Quality', aiCheck.reason, { nodes: nodes.length, edges: edges.length }, aiAnalysis, text.substring(0, 1000));
        sendSSE({ type: 'anomaly_detected', stage: 'ai_analysis', anomaly: { ...anomaly, soft: true } });
      }
    }
    } // end else (skipAiAnalysis)

    const totalDuration = Date.now() - startTime;

    // ── Complete ──
    sendSSE({
      type: 'complete',
      nodes,
      edges,
      aiAnalysis,
      stats: {
        ...graphStats,
        duration: totalDuration,
        parse: parseStats,
        chunks: chunkStats,
        extraction: extractStats,
        dedup: dedupStats,
        aiAnalysis: aiAnalysis ? {
          completenessScore: aiAnalysis.completenessScore,
          missingEntities: aiAnalysis.missingEntities?.length || 0,
          missingRelations: aiAnalysis.missingRelations?.length || 0
        } : null
      }
    });

    res.end();

  } catch (error) {
    console.error('[GXE KG] Knowledge graph generation error:', error);
    sendSSE({ type: 'stage_update', stage: 'error', status: 'error', message: error.message });
    sendSSE({ type: 'error', title: 'Generation Failed', subtitle: error.message, error: error.message });
    res.end();
  }
};
