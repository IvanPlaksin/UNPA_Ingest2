const { GXEMcpServer } = require('./server/GXEMcpServer.js');
const { ToolRegistry } = require('./server/ToolRegistry.js');
const { SafetyGuard } = require('./server/SafetyGuard.js');
const { MetricsCollector } = require('./server/MetricsCollector.js');
const { ToolExecutionContext } = require('./server/ToolExecutionContext.js');
const primitives = require('./tools/primitives/index.js');
const textTools = require('./tools/text/index.js');
const extractionTools = require('./tools/extraction/index.js');
const vectorTools = require('./tools/vector/index.js');
const graphTools = require('./tools/graph/index.js');
const aiTools = require('./tools/ai/index.js');
const patternTools = require('./tools/patterns/index.js');
const metaTools = require('./tools/meta/index.js');
const dataTools = require('./tools/data/index.js');
const catalogTools = require('./tools/catalog/index.js');
const backlogTools = require('./tools/backlog/index.js');
const executionControlTools = require('./tools/execution-control/index.js');
const documentTools = require('./tools/document/index.js');
const codexTools = require('./tools/codex/index.js');
const workspaceTools = require('./tools/workspace/index.js');
const dialogueTools = require('./tools/dialogue/index.js');
const sourceTools = require('./tools/sources/index.js');

function createAllTools() {
  return [
    ...primitives.createAllPrimitives(),
    ...textTools.createTextTools(),
    ...extractionTools.createExtractionTools(),
    ...vectorTools.createVectorTools(),
    ...graphTools.createGraphTools(),
    ...aiTools.createAITools(),
    ...patternTools.createPatternTools(),
    ...metaTools.createMetaTools(),
    ...dataTools.createDataTools(),
    ...catalogTools.createCatalogTools(),
    ...backlogTools.createBacklogTools(),
    ...executionControlTools.createExecutionControlTools(),
    ...documentTools.createDocumentTools(),
    ...codexTools.createCodexTools(),
    ...workspaceTools.createWorkspaceTools(),
    ...dialogueTools.createDialogueTools(),
    ...sourceTools.createSourceCatalogTools(),
  ];
}

async function createGXEServer(config = {}) {
  const server = new GXEMcpServer(config);

  // Register all tools
  const allTools = createAllTools();
  server.registerTools(allTools);

  return server;
}

module.exports = {
  createGXEServer,
  createAllTools,
  GXEMcpServer,
  ToolRegistry,
  SafetyGuard,
  MetricsCollector,
  ToolExecutionContext,
  ...primitives,
  ...textTools,
  ...extractionTools,
  ...vectorTools,
  ...graphTools,
  ...aiTools,
  ...patternTools,
  ...metaTools,
  ...dataTools,
  ...catalogTools
};

// CLI entry point
if (require.main === module) {
  (async () => {
    const server = await createGXEServer();
    await server.start();
  })();
}
