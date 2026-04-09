const { QueryTool } = require('./QueryTool.js');
const { CreateNodeTool } = require('./CreateNodeTool.js');
const { CreateEdgeTool } = require('./CreateEdgeTool.js');
const { FindPathTool } = require('./FindPathTool.js');
const { NeighborsTool } = require('./NeighborsTool.js');
const { TraverseTool } = require('./TraverseTool.js');
const { AnalyzeStructureTool } = require('./AnalyzeStructureTool.js');
const { DetectCommunitiesTool } = require('./DetectCommunitiesTool.js');
const { ConsolidateSubgraphTool } = require('./ConsolidateSubgraphTool.js');
const { ExpandSubgraphTool } = require('./ExpandSubgraphTool.js');
const { RollbackConsolidationTool } = require('./RollbackConsolidationTool.js');
const { SubGraphExecutorTool } = require('./SubGraphExecutorTool.js');

function createGraphTools() {
  return [
    new QueryTool(),
    new CreateNodeTool(),
    new CreateEdgeTool(),
    new FindPathTool(),
    new NeighborsTool(),
    new TraverseTool(),
    new AnalyzeStructureTool(),
    new DetectCommunitiesTool(),
    new ConsolidateSubgraphTool(),
    new ExpandSubgraphTool(),
    new RollbackConsolidationTool(),
    new SubGraphExecutorTool(),
  ];
}

module.exports = {
  QueryTool,
  CreateNodeTool,
  CreateEdgeTool,
  FindPathTool,
  NeighborsTool,
  TraverseTool,
  AnalyzeStructureTool,
  DetectCommunitiesTool,
  ConsolidateSubgraphTool,
  ExpandSubgraphTool,
  RollbackConsolidationTool,
  SubGraphExecutorTool,
  createGraphTools
};
