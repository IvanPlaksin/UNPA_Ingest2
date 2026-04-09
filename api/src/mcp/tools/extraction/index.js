const { RegexTool } = require('./RegexTool.js');
const { JsonPathTool } = require('./JsonPathTool.js');
const { EntitiesTool } = require('./EntitiesTool.js');
const { StructureTool } = require('./StructureTool.js');
const { RelationsTool } = require('./RelationsTool.js');
const { TopicsTool } = require('./TopicsTool.js');
const { SentimentTool } = require('./SentimentTool.js');
const { IntentTool } = require('./IntentTool.js');

function createExtractionTools() {
  return [
    new RegexTool(),
    new JsonPathTool(),
    new EntitiesTool(),
    new StructureTool(),
    new RelationsTool(),
    new TopicsTool(),
    new SentimentTool(),
    new IntentTool()
  ];
}

module.exports = {
  RegexTool,
  JsonPathTool,
  EntitiesTool,
  StructureTool,
  RelationsTool,
  TopicsTool,
  SentimentTool,
  IntentTool,
  createExtractionTools
};
