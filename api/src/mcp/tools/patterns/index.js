const { RagTool } = require('./RagTool.js');
const { MapReduceTool } = require('./MapReduceTool.js');
const { ChainTool } = require('./ChainTool.js');
const { ParallelTool } = require('./ParallelTool.js');
const { RetryTool } = require('./RetryTool.js');
const { CacheTool } = require('./CacheTool.js');
const { BatchTool } = require('./BatchTool.js');
const { PipelineTool } = require('./PipelineTool.js');

function createPatternTools() {
  return [
    new RagTool(),
    new MapReduceTool(),
    new ChainTool(),
    new ParallelTool(),
    new RetryTool(),
    new CacheTool(),
    new BatchTool(),
    new PipelineTool()
  ];
}

module.exports = {
  RagTool,
  MapReduceTool,
  ChainTool,
  ParallelTool,
  RetryTool,
  CacheTool,
  BatchTool,
  PipelineTool,
  createPatternTools
};
