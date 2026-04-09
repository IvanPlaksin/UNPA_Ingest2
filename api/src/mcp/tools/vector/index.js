const { EmbedTool } = require('./EmbedTool.js');
const { SimilarityTool } = require('./SimilarityTool.js');
const { SearchTool } = require('./SearchTool.js');
const { StoreTool } = require('./StoreTool.js');
const { ClusterTool } = require('./ClusterTool.js');
const { DeleteTool } = require('./DeleteTool.js');
const { BatchEmbedTool } = require('./BatchEmbedTool.js');

function createVectorTools() {
  return [
    new EmbedTool(),
    new SimilarityTool(),
    new SearchTool(),
    new StoreTool(),
    new ClusterTool(),
    new DeleteTool(),
    new BatchEmbedTool()
  ];
}

module.exports = {
  EmbedTool,
  SimilarityTool,
  SearchTool,
  StoreTool,
  ClusterTool,
  DeleteTool,
  BatchEmbedTool,
  createVectorTools
};
