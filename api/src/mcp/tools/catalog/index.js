const { SearchGraphsTool } = require('./SearchGraphsTool.js');
const { GetGraphTool } = require('./GetGraphTool.js');
const { SaveGraphTool } = require('./SaveGraphTool.js');
const { CloneGraphTool } = require('./CloneGraphTool.js');
const { FindSimilarGraphsTool } = require('./FindSimilarGraphsTool.js');
const { AnalyzeReuseTool } = require('./AnalyzeReuseTool.js');
// CONS-MCP: Tool catalog MCP tools
const { ListToolsTool } = require('./ListToolsTool.js');
const { GetToolDetailTool } = require('./GetToolDetailTool.js');
const { SearchToolsTool } = require('./SearchToolsTool.js');
const { SuggestToolsTool } = require('./SuggestToolsTool.js');
// UTC-001: Pattern matching tools
const { AnalyzePatternsTool } = require('./AnalyzePatternsTool.js');
const { MatchSubgraphTool } = require('./MatchSubgraphTool.js');
const { PreviewReplacementTool } = require('./PreviewReplacementTool.js');

function createCatalogTools() {
  return [
    new SearchGraphsTool(),
    new GetGraphTool(),
    new SaveGraphTool(),
    new CloneGraphTool(),
    new FindSimilarGraphsTool(),
    new AnalyzeReuseTool(),
    new ListToolsTool(),
    new GetToolDetailTool(),
    new SearchToolsTool(),
    new SuggestToolsTool(),
    // Pattern matching (UTC-001)
    new AnalyzePatternsTool(),
    new MatchSubgraphTool(),
    new PreviewReplacementTool(),
  ];
}

module.exports = {
  SearchGraphsTool,
  GetGraphTool,
  SaveGraphTool,
  CloneGraphTool,
  FindSimilarGraphsTool,
  AnalyzeReuseTool,
  ListToolsTool,
  GetToolDetailTool,
  SearchToolsTool,
  SuggestToolsTool,
  AnalyzePatternsTool,
  MatchSubgraphTool,
  PreviewReplacementTool,
  createCatalogTools
};
