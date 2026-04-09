/**
 * Execution Control MCP Tools — Agent cycle management
 */

const { StartCycleTool } = require('./StartCycleTool');
const { SubmitPlanTool } = require('./SubmitPlanTool');
const { AddMemoryTool } = require('./AddMemoryTool');
const { TransitionPhaseTool } = require('./TransitionPhaseTool');
const { SubmitReviewTool } = require('./SubmitReviewTool');
const { GetCycleDetailTool } = require('./GetCycleDetailTool');
const { ListCyclesTool } = require('./ListCyclesTool');
const { SplitTaskInCycleTool } = require('./SplitTaskInCycleTool');

function createExecutionControlTools() {
  return [
    new StartCycleTool(),
    new SubmitPlanTool(),
    new AddMemoryTool(),
    new TransitionPhaseTool(),
    new SubmitReviewTool(),
    new GetCycleDetailTool(),
    new ListCyclesTool(),
    new SplitTaskInCycleTool()
  ];
}

module.exports = { createExecutionControlTools };
