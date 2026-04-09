const { CreateToolTool } = require('./CreateToolTool.js');
const { ComposeTool } = require('./ComposeTool.js');
const { IntrospectTool } = require('./IntrospectTool.js');
const { ValidateToolTool } = require('./ValidateToolTool.js');
const { OptimizeTool } = require('./OptimizeTool.js');
const { SandboxTool } = require('./SandboxTool.js');

function createMetaTools() {
  return [
    new CreateToolTool(),
    new ComposeTool(),
    new IntrospectTool(),
    new ValidateToolTool(),
    new OptimizeTool(),
    new SandboxTool()
  ];
}

module.exports = {
  createMetaTools,
  CreateToolTool,
  ComposeTool,
  IntrospectTool,
  ValidateToolTool,
  OptimizeTool,
  SandboxTool
};
