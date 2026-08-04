/**
 * WorkSpace MCP Tools
 *
 * 20 tools for agent interaction with WorkSpace system.
 * Enables isolated knowledge extraction with read-only KB access.
 *
 * Categories:
 * - Lifecycle: create, get, list, update_status (4)
 * - Sources: add_source, list_sources (2)
 * - Drafts: create_draft, get_draft, list_drafts, update_draft, search_drafts (5)
 * - KB Access: kb_search, kb_get_node, kb_get_neighbors (3)
 * - Edges: create_edge, get_edges (2)
 * - Analysis: validate_graph, detect_contradictions, analyze_sources (3)
 * - Retrieval: retrieve (1)
 *
 * Total: 20 tools
 */

const { CreateWorkspaceTool } = require('./CreateWorkspaceTool');
const { GetWorkspaceTool } = require('./GetWorkspaceTool');
const { ListWorkspacesTool } = require('./ListWorkspacesTool');
const { UpdateWorkspaceStatusTool } = require('./UpdateWorkspaceStatusTool');
const { AddSourceTool } = require('./AddSourceTool');
const { ListSourcesTool } = require('./ListSourcesTool');
const { CreateDraftTool } = require('./CreateDraftTool');
const { GetDraftTool } = require('./GetDraftTool');
const { ListDraftsTool } = require('./ListDraftsTool');
const { UpdateDraftTool } = require('./UpdateDraftTool');
const { SearchDraftsTool } = require('./SearchDraftsTool');
const { KBSearchTool } = require('./KBSearchTool');
const { KBGetNodeTool } = require('./KBGetNodeTool');
const { KBGetNeighborsTool } = require('./KBGetNeighborsTool');
const { CreateEdgeTool } = require('./CreateEdgeTool');
const { GetEdgesTool } = require('./GetEdgesTool');
const { ValidateGraphTool } = require('./ValidateGraphTool');
const { DetectContradictionsTool } = require('./DetectContradictionsTool');
const { AnalyzeSourcesTool } = require('./AnalyzeSourcesTool');
const { RetrieveContextTool } = require('./RetrieveContextTool');

function createWorkspaceTools() {
  return [
    // Lifecycle
    new CreateWorkspaceTool(),
    new GetWorkspaceTool(),
    new ListWorkspacesTool(),
    new UpdateWorkspaceStatusTool(),
    // Sources
    new AddSourceTool(),
    new ListSourcesTool(),
    // Drafts
    new CreateDraftTool(),
    new GetDraftTool(),
    new ListDraftsTool(),
    new UpdateDraftTool(),
    new SearchDraftsTool(),
    // KB Access (read-only)
    new KBSearchTool(),
    new KBGetNodeTool(),
    new KBGetNeighborsTool(),
    // Edges
    new CreateEdgeTool(),
    new GetEdgesTool(),
    // Analysis (WS2-007)
    new ValidateGraphTool(),
    new DetectContradictionsTool(),
    new AnalyzeSourcesTool(),
    // Retrieval (Radix R1.5)
    new RetrieveContextTool()
  ];
}

module.exports = {
  CreateWorkspaceTool,
  GetWorkspaceTool,
  ListWorkspacesTool,
  UpdateWorkspaceStatusTool,
  AddSourceTool,
  ListSourcesTool,
  CreateDraftTool,
  GetDraftTool,
  ListDraftsTool,
  UpdateDraftTool,
  SearchDraftsTool,
  KBSearchTool,
  KBGetNodeTool,
  KBGetNeighborsTool,
  CreateEdgeTool,
  GetEdgesTool,
  ValidateGraphTool,
  DetectContradictionsTool,
  AnalyzeSourcesTool,
  RetrieveContextTool,
  createWorkspaceTools
};
