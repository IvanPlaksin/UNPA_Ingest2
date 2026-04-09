const { SearchRulesTool } = require('./SearchRulesTool');
const { GetRuleTool } = require('./GetRuleTool');
const { GetPrinciplesTool } = require('./GetPrinciplesTool');
const { GetBlackCodexTool } = require('./GetBlackCodexTool');
const { CheckComplianceTool } = require('./CheckComplianceTool');
const { ProposeChangeTool } = require('./ProposeChangeTool');

function createCodexTools() {
  return [
    new SearchRulesTool(),
    new GetRuleTool(),
    new GetPrinciplesTool(),
    new GetBlackCodexTool(),
    new CheckComplianceTool(),
    new ProposeChangeTool()
  ];
}

module.exports = { createCodexTools };
