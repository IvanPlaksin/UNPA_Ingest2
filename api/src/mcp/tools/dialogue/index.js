const { SearchDialogueTool } = require('./SearchDialogueTool');
const { FindDecisionTool } = require('./FindDecisionTool');
const { TraceProvenanceTool } = require('./TraceProvenanceTool');
const { GetContextTool } = require('./GetContextTool');

// Shared lazy-initialized search service for all dialogue tools
let _sharedSearchService = null;

function _getSearchService() {
  if (!_sharedSearchService) {
    const { DialogueSearchService } = require('../../../core/aopeg/plugins/dialogue/services/dialogue.search');
    const { DialogueQdrantService } = require('../../../core/aopeg/plugins/dialogue/services/dialogue.qdrant');
    const { EmbeddingService } = require('../../../services/structuring/embeddings/EmbeddingService');
    const memgraph = require('../../../services/memgraph.service');
    _sharedSearchService = new DialogueSearchService(
      new DialogueQdrantService(),
      memgraph,
      new EmbeddingService()
    );
  }
  return _sharedSearchService;
}

// Inject shared factory into tool modules
global._getSearchService = _getSearchService;

function createDialogueTools() {
  return [
    new SearchDialogueTool(),
    new FindDecisionTool(),
    new TraceProvenanceTool(),
    new GetContextTool(),
  ];
}

module.exports = {
  SearchDialogueTool,
  FindDecisionTool,
  TraceProvenanceTool,
  GetContextTool,
  createDialogueTools,
};
