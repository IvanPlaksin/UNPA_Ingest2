const { CreateTaskTool } = require('./CreateTaskTool');
const { ListTasksTool } = require('./ListTasksTool');
const { GetTaskTool } = require('./GetTaskTool');
const { UpdateStatusTool } = require('./UpdateStatusTool');
const { GetStatsTool } = require('./GetStatsTool');
const { AddDependencyTool } = require('./AddDependencyTool');
// TM8: Extended backlog tools
const { AddSourceTool } = require('./AddSourceTool');
const { StartExecutionTool } = require('./StartExecutionTool');
const { AddDecisionTool } = require('./AddDecisionTool');
const { CompleteExecutionTool } = require('./CompleteExecutionTool');
const { SplitTaskTool } = require('./SplitTaskTool');
const { GetHierarchyTool } = require('./GetHierarchyTool');

function createBacklogTools() {
  return [
    new CreateTaskTool(),
    new ListTasksTool(),
    new GetTaskTool(),
    new UpdateStatusTool(),
    new GetStatsTool(),
    new AddDependencyTool(),
    // TM8: Provenance, execution tracking, hierarchy
    new AddSourceTool(),
    new StartExecutionTool(),
    new AddDecisionTool(),
    new CompleteExecutionTool(),
    new SplitTaskTool(),
    new GetHierarchyTool()
  ];
}

module.exports = {
  CreateTaskTool,
  ListTasksTool,
  GetTaskTool,
  UpdateStatusTool,
  GetStatsTool,
  AddDependencyTool,
  AddSourceTool,
  StartExecutionTool,
  AddDecisionTool,
  CompleteExecutionTool,
  SplitTaskTool,
  GetHierarchyTool,
  createBacklogTools
};
