const { BaseTool, CommonSchemas } = require('./BaseTool.js');
const { GetValueTool } = require('./GetValueTool.js');
const { SetValueTool } = require('./SetValueTool.js');
const { TransformTool } = require('./TransformTool.js');
const { ValidateTool } = require('./ValidateTool.js');
const { CompareTool } = require('./CompareTool.js');
const { AggregateTool } = require('./AggregateTool.js');
const { FilterTool } = require('./FilterTool.js');
const { MapTool } = require('./MapTool.js');
const { ReduceTool } = require('./ReduceTool.js');
const { MergeTool } = require('./MergeTool.js');
const { SplitTool } = require('./SplitTool.js');
const { EmitEventTool } = require('./EmitEventTool.js');
const { WaitSignalTool } = require('./WaitSignalTool.js');
const { LogTool } = require('./LogTool.js');
const { CheckpointTool } = require('./CheckpointTool.js');
const { DelayTool } = require('./DelayTool.js');
const { GenerateIdTool } = require('./GenerateIdTool.js');

// Function to create all primitives
function createAllPrimitives() {
  return [
    new GetValueTool(),
    new SetValueTool(),
    new TransformTool(),
    new ValidateTool(),
    new CompareTool(),
    new AggregateTool(),
    new FilterTool(),
    new MapTool(),
    new ReduceTool(),
    new MergeTool(),
    new SplitTool(),
    new EmitEventTool(),
    new WaitSignalTool(),
    new LogTool(),
    new CheckpointTool(),
    new DelayTool(),
    new GenerateIdTool()
  ];
}

module.exports = {
  BaseTool,
  CommonSchemas,
  GetValueTool,
  SetValueTool,
  TransformTool,
  ValidateTool,
  CompareTool,
  AggregateTool,
  FilterTool,
  MapTool,
  ReduceTool,
  MergeTool,
  SplitTool,
  EmitEventTool,
  WaitSignalTool,
  LogTool,
  CheckpointTool,
  DelayTool,
  GenerateIdTool,
  createAllPrimitives
};
