/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH BUILDER TOOLS
 * JSON Schema definitions for AI Graph Builder Agent tools
 *
 * Phase 8 - AI Graph Builder Agent
 * Tool calling definitions for CRUD operations on AOPEG graphs
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Tool definitions for the Graph Builder Agent
 * Compatible with OpenAI/Ollama function calling format
 */
const GRAPH_BUILDER_TOOLS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // READ TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'get_graph_state',
      description: 'Get current graph state including all nodes, edges, and metadata. Use this to understand the current structure before making changes.',
      parameters: {
        type: 'object',
        properties: {
          includePositions: {
            type: 'boolean',
            description: 'Include node positions in response',
            default: false
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_available_executors',
      description: 'Get list of available executor types grouped by domain. Use this to find the right executor for a task.',
      parameters: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['common', 'ai', 'ingestion', 'rag', 'flowdesk', 'workflow', 'subgraph', 'notification', 'sql-extraction'],
            description: 'Filter by domain (optional, omit for all domains)'
          },
          search: {
            type: 'string',
            description: 'Search term to filter executors by name or description'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_node',
      description: 'Get detailed information about a specific node including its executor type, parameters, and connections.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The unique ID of the node to retrieve'
          }
        },
        required: ['nodeId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_edge',
      description: 'Get details of a specific edge including its condition, data mapping, and connected nodes.',
      parameters: {
        type: 'object',
        properties: {
          edgeId: {
            type: 'string',
            description: 'The unique ID of the edge to retrieve'
          }
        },
        required: ['edgeId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_executor_info',
      description: 'Get detailed information about a specific executor type including its parameters, inputs, and outputs.',
      parameters: {
        type: 'object',
        properties: {
          executorType: {
            type: 'string',
            description: 'Executor type (e.g., "ingestion.sanitize", "rag.vector_search")'
          }
        },
        required: ['executorType']
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'add_node',
      description: 'Add a new node (processing step) to the graph. The node will use the specified executor type.',
      parameters: {
        type: 'object',
        properties: {
          executorType: {
            type: 'string',
            description: 'Executor type (e.g., "ingestion.sanitize", "rag.vector_search", "ingestion.chunk_text")'
          },
          displayName: {
            type: 'string',
            description: 'Human-readable name for the node (shown in UI)'
          },
          description: {
            type: 'string',
            description: 'Description of what this node does in the workflow'
          },
          parameters: {
            type: 'object',
            description: 'Parameters to configure the executor (specific to each executor type)',
            additionalProperties: true
          },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'X position on canvas' },
              y: { type: 'number', description: 'Y position on canvas' }
            },
            description: 'Position on canvas (auto-calculated if omitted)'
          },
          timeout: {
            type: 'number',
            description: 'Execution timeout in milliseconds (default: 30000)'
          },
          retryPolicy: {
            type: 'object',
            properties: {
              maxAttempts: { type: 'number', description: 'Max retry attempts', default: 3 },
              delayMs: { type: 'number', description: 'Initial delay between retries', default: 1000 },
              backoffMultiplier: { type: 'number', description: 'Backoff multiplier', default: 2 }
            },
            description: 'Retry policy for failed executions'
          }
        },
        required: ['executorType', 'displayName']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'add_edge',
      description: 'Create a connection (edge) between two nodes. Data flows from source to target node.',
      parameters: {
        type: 'object',
        properties: {
          sourceNodeId: {
            type: 'string',
            description: 'ID of the source node (data comes from here)'
          },
          targetNodeId: {
            type: 'string',
            description: 'ID of the target node (data goes here)'
          },
          label: {
            type: 'string',
            description: 'Optional label for the edge (shown in UI)'
          },
          condition: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['always', 'success', 'failure', 'quality', 'expression'],
                description: 'Type of condition for edge traversal'
              },
              config: {
                type: 'object',
                description: 'Condition configuration (e.g., {threshold: 0.8} for quality)'
              }
            },
            description: 'Condition that must be met for data to flow through this edge'
          },
          dataMapping: {
            type: 'object',
            description: 'Data transformation/mapping from source output to target input',
            additionalProperties: true
          },
          priority: {
            type: 'number',
            description: 'Edge priority (higher = processed first when multiple edges)',
            default: 0
          }
        },
        required: ['sourceNodeId', 'targetNodeId']
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'update_node',
      description: 'Update properties of an existing node. Only specified fields will be updated.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to update'
          },
          updates: {
            type: 'object',
            properties: {
              displayName: { type: 'string', description: 'New display name' },
              description: { type: 'string', description: 'New description' },
              parameters: { type: 'object', description: 'Updated executor parameters' },
              timeout: { type: 'number', description: 'New timeout in milliseconds' },
              retryPolicy: {
                type: 'object',
                properties: {
                  maxAttempts: { type: 'number' },
                  delayMs: { type: 'number' },
                  backoffMultiplier: { type: 'number' }
                }
              },
              enabled: { type: 'boolean', description: 'Enable/disable node' }
            },
            description: 'Fields to update'
          }
        },
        required: ['nodeId', 'updates']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'update_edge',
      description: 'Update properties of an existing edge. Only specified fields will be updated.',
      parameters: {
        type: 'object',
        properties: {
          edgeId: {
            type: 'string',
            description: 'ID of the edge to update'
          },
          updates: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'New label' },
              condition: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['always', 'success', 'failure', 'quality', 'expression'] },
                  config: { type: 'object' }
                }
              },
              dataMapping: { type: 'object' },
              priority: { type: 'number' }
            },
            description: 'Fields to update'
          }
        },
        required: ['edgeId', 'updates']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'update_graph_metadata',
      description: 'Update the graph name, description, or domain.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'New graph name'
          },
          description: {
            type: 'string',
            description: 'New graph description'
          },
          domain: {
            type: 'string',
            enum: ['ingestion', 'rag', 'analysis', 'general'],
            description: 'Primary domain of the graph'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'move_node',
      description: 'Move a node to a new position on the canvas.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to move'
          },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y']
          }
        },
        required: ['nodeId', 'position']
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: 'Remove a node from the graph. This will also remove all edges connected to this node.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to remove'
          },
          confirm: {
            type: 'boolean',
            description: 'Confirm removal (set to true to proceed)',
            default: false
          }
        },
        required: ['nodeId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'remove_edge',
      description: 'Remove an edge (connection) from the graph.',
      parameters: {
        type: 'object',
        properties: {
          edgeId: {
            type: 'string',
            description: 'ID of the edge to remove'
          }
        },
        required: ['edgeId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'clear_graph',
      description: 'Remove all nodes and edges from the graph. Use with caution!',
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm clearing the graph'
          }
        },
        required: ['confirm']
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION & TESTING TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'validate_graph',
      description: 'Validate the graph structure and check for issues like missing connections, cycles, or invalid configurations.',
      parameters: {
        type: 'object',
        properties: {
          checkLevel: {
            type: 'string',
            enum: ['basic', 'standard', 'strict'],
            description: 'Validation strictness level',
            default: 'standard'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'test_with_mock',
      description: 'Test the graph execution with mock input data to verify the flow works correctly.',
      parameters: {
        type: 'object',
        properties: {
          mockInput: {
            description: 'Mock input data to test the graph with',
            oneOf: [
              { type: 'string' },
              { type: 'object' }
            ]
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, simulate execution without calling actual services',
            default: true
          }
        },
        required: ['mockInput']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'explain_flow',
      description: 'Generate a human-readable explanation of how data flows through the graph.',
      parameters: {
        type: 'object',
        properties: {
          detailed: {
            type: 'boolean',
            description: 'Include detailed parameter information',
            default: false
          }
        },
        required: []
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT & CONFIGURATION TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'auto_layout',
      description: 'Automatically arrange nodes in the graph for better visualization.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['TB', 'LR', 'BT', 'RL'],
            description: 'Layout direction: TB=Top-Bottom, LR=Left-Right, BT=Bottom-Top, RL=Right-Left',
            default: 'TB'
          },
          spacing: {
            type: 'object',
            properties: {
              horizontal: { type: 'number', default: 100 },
              vertical: { type: 'number', default: 80 }
            },
            description: 'Spacing between nodes'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'set_entry_exit',
      description: 'Set the entry node (where execution starts) and exit nodes (where execution ends) for the graph.',
      parameters: {
        type: 'object',
        properties: {
          entryNodeId: {
            type: 'string',
            description: 'ID of the entry node'
          },
          exitNodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of exit nodes (can be multiple for parallel flows)'
          }
        },
        required: ['entryNodeId']
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'apply_template',
      description: 'Apply a predefined graph template. This will add nodes and edges from the template.',
      parameters: {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            enum: ['basic_ingestion', 'rag_pipeline', 'text_analysis', 'document_processing'],
            description: 'Template to apply'
          },
          clearExisting: {
            type: 'boolean',
            description: 'Clear existing nodes before applying template',
            default: false
          }
        },
        required: ['templateId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'suggest_next_node',
      description: 'Get suggestions for what node to add next based on the current graph structure.',
      parameters: {
        type: 'object',
        properties: {
          fromNodeId: {
            type: 'string',
            description: 'Suggest nodes that could follow this node'
          },
          intent: {
            type: 'string',
            description: 'Describe what you want to accomplish next'
          }
        },
        required: []
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPE CATALOG TOOLS (Core Knowledge Base)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'list_node_types',
      description: 'List all available node types from the Core Knowledge Base. Use this to discover what types of nodes can be created in workflows.',
      parameters: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['common', 'ingestion', 'rag', 'workflow', 'integration'],
            description: 'Filter by domain (optional)'
          },
          category: {
            type: 'string',
            enum: ['executor', 'condition', 'transformer', 'aggregator', 'event', 'gateway', 'control'],
            description: 'Filter by category (optional)'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_node_type_schema',
      description: 'Get detailed schema for a specific node type including parameters, input/output schemas, and configuration options.',
      parameters: {
        type: 'object',
        properties: {
          fullName: {
            type: 'string',
            description: 'Full node type name (e.g., "ingestion.parse_document", "common.condition", "workflow.decision")'
          }
        },
        required: ['fullName']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'create_node_type',
      description: 'Create a new custom node type in the Core Knowledge Base. Use this when you need a specialized node type that does not exist.',
      parameters: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['common', 'ingestion', 'rag', 'workflow', 'integration'],
            description: 'Domain for the new node type'
          },
          name: {
            type: 'string',
            description: 'Unique name within the domain (e.g., "custom_transformer")'
          },
          category: {
            type: 'string',
            enum: ['executor', 'condition', 'transformer', 'aggregator', 'event', 'gateway', 'control'],
            description: 'Node category'
          },
          displayName: {
            type: 'string',
            description: 'Human-readable display name'
          },
          description: {
            type: 'string',
            description: 'Description of what this node type does'
          },
          icon: {
            type: 'string',
            description: 'Icon name from Lucide icons'
          },
          color: {
            type: 'string',
            description: 'Hex color code (e.g., "#6366f1")'
          },
          parameters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['string', 'number', 'boolean', 'object', 'array', 'enum'] },
                required: { type: 'boolean' },
                default: {},
                description: { type: 'string' },
                enumValues: { type: 'array', items: { type: 'string' } }
              },
              required: ['name', 'type', 'required']
            },
            description: 'Parameter definitions'
          },
          inputSchema: {
            type: 'object',
            description: 'JSON Schema for expected input'
          },
          outputSchema: {
            type: 'object',
            description: 'JSON Schema for output'
          },
          executorClass: {
            type: 'string',
            description: 'Name of the executor class that implements this node type'
          }
        },
        required: ['domain', 'name', 'category', 'displayName', 'description']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'list_edge_types',
      description: 'List all available edge types. Edge types define how nodes can be connected and what data/control flows between them.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'list_domains',
      description: 'List all available domains. Domains group related node types together (e.g., ingestion, rag, workflow).',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'validate_node_against_type',
      description: 'Validate that a node configuration matches its type schema from the Core Knowledge Base.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to validate'
          },
          nodeType: {
            type: 'string',
            description: 'Full node type name to validate against (optional, uses node executorType if omitted)'
          }
        },
        required: ['nodeId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'find_compatible_nodes',
      description: 'Find node types that are compatible with a given source node type. Useful for building valid workflow connections.',
      parameters: {
        type: 'object',
        properties: {
          sourceType: {
            type: 'string',
            description: 'Full name of the source node type'
          },
          edgeType: {
            type: 'string',
            enum: ['data_flow', 'control_flow', 'conditional', 'error_handling'],
            description: 'Type of edge connection (optional)'
          }
        },
        required: ['sourceType']
      }
    }
  }
,

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKLOG TOOLS — Create/read tasks for missing tools, tech debt, etc.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'backlog_create_task',
      description: 'Create a task in the project backlog. Use when you discover a missing executor, broken tool, or needed improvement. Agent-created tasks start as PROPOSED and require human approval. Required by CODEX-RULE-042.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Task title (min 10 chars). Example: "Implement flowdesk.check_location executor"'
          },
          description: {
            type: 'string',
            description: 'Detailed description of what needs to be done (min 20 chars)'
          },
          taskType: {
            type: 'string',
            enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'],
            description: 'Type of task'
          },
          targetType: {
            type: 'string',
            enum: ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'],
            description: 'What kind of target this task modifies'
          },
          targetPath: {
            type: 'string',
            description: 'File path or component name (e.g., "flowdesk.check_location")'
          },
          acceptanceCriteria: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of verifiable acceptance criteria (min 1)'
          },
          priority: {
            type: 'string',
            enum: ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'],
            description: 'Priority level'
          },
          effort: {
            type: 'string',
            enum: ['XS', 'S', 'M', 'L', 'XL'],
            description: 'Effort estimate (t-shirt size)'
          },
          relatedCodexRules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related Codex rule IDs (e.g., ["CODEX-RULE-042"])'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for classification'
          },
          sourceContext: {
            type: 'string',
            description: 'Context of how this task was discovered'
          }
        },
        required: ['title', 'description', 'taskType', 'targetType', 'acceptanceCriteria']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_list_tasks',
      description: 'List tasks from the project backlog. Use to check existing tasks before creating duplicates.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'REJECTED', 'CANCELLED'],
            description: 'Filter by status'
          },
          priority: {
            type: 'string',
            enum: ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'],
            description: 'Filter by priority'
          },
          taskType: {
            type: 'string',
            enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'],
            description: 'Filter by task type'
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20)'
          }
        },
        required: []
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_get_stats',
      description: 'Get backlog statistics: total items, open count, distribution by status and priority.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION TRACKING TOOLS — Record progress when working on BackLog tasks
  // ═══════════════════════════════════════════════════════════════════════════

  {
    type: 'function',
    function: {
      name: 'backlog_start_execution',
      description: 'Start execution tracking for a BackLog task. Call this FIRST before doing any work on a task.',
      parameters: {
        type: 'object',
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID (e.g., BACKLOG-0022)' }
        },
        required: ['backlogId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_add_decision',
      description: 'Record a significant implementation decision with rationale. Call for every choice that affects the outcome.',
      parameters: {
        type: 'object',
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID' },
          decision: { type: 'string', description: 'What was decided' },
          rationale: { type: 'string', description: 'WHY this decision was made (mandatory)' },
          confidenceLevel: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Confidence in the decision' },
          alternativesConsidered: {
            type: 'array', items: { type: 'string' },
            description: 'Other options that were considered and rejected'
          }
        },
        required: ['backlogId', 'decision', 'rationale']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_record_file_change',
      description: 'Record a file that was created or modified during task execution.',
      parameters: {
        type: 'object',
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID' },
          changeType: { type: 'string', enum: ['CREATE', 'MODIFY'], description: 'Type of change' },
          filePath: { type: 'string', description: 'Path to the file (e.g., api/src/services/audit.service.js)' }
        },
        required: ['backlogId', 'changeType', 'filePath']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_record_graph_change',
      description: 'Record a change to the knowledge graph (nodes/edges/relationships created or modified).',
      parameters: {
        type: 'object',
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID' },
          changeType: { type: 'string', enum: ['CREATE_NODE', 'CREATE_EDGE', 'MODIFY_NODE', 'DELETE_NODE', 'CREATE_RELATIONSHIP'], description: 'Type of graph change' },
          description: { type: 'string', description: 'Description of what was changed' },
          targetLabel: { type: 'string', description: 'Node label or edge type (e.g., ExecutionRecord, SOURCED_FROM)' },
          targetId: { type: 'string', description: 'ID of the affected node/edge' },
          relationship: { type: 'string', description: 'Relationship type if applicable (e.g., HAS_EXECUTION, SOURCED_FROM)' }
        },
        required: ['backlogId', 'changeType', 'description']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'backlog_complete_execution',
      description: 'Complete execution of a BackLog task. Include comprehensive summary of what was done, learned, and relationships established.',
      parameters: {
        type: 'object',
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID' },
          summary: { type: 'string', description: 'Comprehensive summary: what was done, what was learned, relationships established' },
          status: { type: 'string', enum: ['COMPLETED', 'FAILED', 'PARTIAL'], description: 'Execution outcome' }
        },
        required: ['backlogId', 'summary']
      }
    }
  }
];

/**
 * Get tool definitions in OpenAI format
 */
function getToolDefinitions() {
  return GRAPH_BUILDER_TOOLS;
}

/**
 * Get tool by name
 */
function getToolByName(name) {
  return GRAPH_BUILDER_TOOLS.find(t => t.function.name === name);
}

/**
 * Get all tool names
 */
function getToolNames() {
  return GRAPH_BUILDER_TOOLS.map(t => t.function.name);
}

/**
 * Validate tool call arguments
 */
function validateToolArgs(toolName, args) {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const params = tool.function.parameters;
  const required = params.required || [];

  for (const req of required) {
    if (args[req] === undefined) {
      return { valid: false, error: `Missing required parameter: ${req}` };
    }
  }

  return { valid: true };
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  GRAPH_BUILDER_TOOLS,
  getToolDefinitions,
  getToolByName,
  getToolNames,
  validateToolArgs,
};
