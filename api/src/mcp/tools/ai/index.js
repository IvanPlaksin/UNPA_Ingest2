const { CompleteTool } = require('./CompleteTool.js');
const { ChatTool } = require('./ChatTool.js');
const { SummarizeTool } = require('./SummarizeTool.js');
const { ClassifyTool } = require('./ClassifyTool.js');
const { ExtractTool } = require('./ExtractTool.js');

function createAITools() {
  return [
    new CompleteTool(),
    new ChatTool(),
    new SummarizeTool(),
    new ClassifyTool(),
    new ExtractTool()
  ];
}

module.exports = {
  CompleteTool,
  ChatTool,
  SummarizeTool,
  ClassifyTool,
  ExtractTool,
  createAITools
};
