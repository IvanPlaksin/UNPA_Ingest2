const { ChunkTool } = require('./ChunkTool.js');
const { TokenizeTool } = require('./TokenizeTool.js');
const { NormalizeTool } = require('./NormalizeTool.js');
const { TemplateTool } = require('./TemplateTool.js');
const { ExtractKeywordsTool } = require('./ExtractKeywordsTool.js');
const { HashTool } = require('./HashTool.js');
const { SanitizeTool } = require('./SanitizeTool.js');
const { DetectLanguageTool } = require('./DetectLanguageTool.js');
const { TranslateTool } = require('./TranslateTool.js');

function createTextTools() {
  return [
    new ChunkTool(),
    new TokenizeTool(),
    new NormalizeTool(),
    new TemplateTool(),
    new ExtractKeywordsTool(),
    new HashTool(),
    new SanitizeTool(),
    new DetectLanguageTool(),
    new TranslateTool()
  ];
}

module.exports = {
  ChunkTool,
  TokenizeTool,
  NormalizeTool,
  TemplateTool,
  ExtractKeywordsTool,
  HashTool,
  SanitizeTool,
  DetectLanguageTool,
  TranslateTool,
  createTextTools
};
