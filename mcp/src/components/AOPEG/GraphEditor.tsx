/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG Graph Editor
 * Main graph editor component integrating React Flow with AOPEG
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  ReactFlowProvider,
  ReactFlowInstance,
  MarkerType,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { AOPEGNode } from './AOPEGNode';
import { AOPEGEdge } from './AOPEGEdge';
import { NodeCatalogSidebar } from './NodeCatalogSidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { GraphEditorToolbar } from './GraphEditorToolbar';
import { AIChatPanel } from './AIChatPanel';
import type { AgentGraph } from '../../hooks/useGraphBuilderAgent';

import {
  useExecutorCatalog,
  useGraph,
  useExecution,
  useExecutionStream,
} from '../../hooks/useAOPEG';

import { useAOPEGLayout, hasZeroPositions } from './hooks/useAOPEGLayout';
import { useDragRepulsion } from '../GXE/hooks/useDragRepulsion';
import { assignPorts } from './utils/portAssigner';

import {
  AOPEGNode as AOPEGNodeType,
  AOPEGEdge as AOPEGEdgeType,
  AOPEGNodeData,
  AOPEGEdgeData,
  ExecutorInfo,
  GraphResponse,
  ExecutionEvent,
  ValidationResult,
  graphResponseToReactFlow,
  reactFlowToGraphRequest,
  createDefaultNodeData,
  createDefaultEdgeData,
} from '../../types/aopeg.types';

// ────────────────────────────────────────────────────────────────────────────
// NODE & EDGE TYPES
// ────────────────────────────────────────────────────────────────────────────

const nodeTypes = {
  aopegNode: AOPEGNode,
};

const edgeTypes = {
  aopegEdge: AOPEGEdge,
};

const defaultEdgeOptions = {
  type: 'aopegEdge',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// GRAPH EDITOR COMPONENT
// ────────────────────────────────────────────────────────────────────────────

interface GraphEditorProps {
  graphId?: string;
  onGraphSaved?: (graph: GraphResponse) => void;
}

const GraphEditorInner: React.FC<GraphEditorProps> = ({ graphId, onGraphSaved }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(
    null
  );

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState<AOPEGNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AOPEGEdgeData>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [graphName, setGraphName] = useState('New Graph');
  const [graphDomain, setGraphDomain] = useState('common');
  const [isDirty, setIsDirty] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | undefined>();
  const [executionInput, setExecutionInput] = useState<string>('{}');
  const [showExecutionDialog, setShowExecutionDialog] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(true);

  // Hooks
  const { catalog } = useExecutorCatalog();
  const { graph, loading, saveGraph, validateGraph, activateGraph } = useGraph(
    graphId || null
  );
  const { execution, startExecution, cancelExecution } = useExecution();

  // Auto-layout hook (ELK Sugiyama)
  const { applyLayout, isLayouting } = useAOPEGLayout(
    nodes, edges, setNodes, setEdges, reactFlowInstance,
    { defaultDirection: 'LR', layerSpacing: 120, nodeSpacing: 80 }
  );

  // Drag repulsion — push neighbors apart when dragging
  const { onNodeDrag, onNodeDragStop } = useDragRepulsion(nodes, setNodes, {
    padding: 24,
    cascadeDepth: 3,
  });

  // Load graph when available
  useEffect(() => {
    if (graph) {
      const { nodes: flowNodes, edges: flowEdges } = graphResponseToReactFlow(graph);
      setNodes(flowNodes);
      setEdges(flowEdges);
      setGraphName(graph.name);
      setGraphDomain(graph.domain);
      setIsDirty(false);
    }
  }, [graph, setNodes, setEdges]);

  // Apply port assignment (recalculates handle positions based on current edges)
  const applyPortAssignment = useCallback(() => {
    if (nodes.length === 0) return;
    const { enrichedNodes, enrichedEdges } = assignPorts(nodes, edges);
    setNodes(enrichedNodes);
    setEdges(enrichedEdges);
  }, [nodes, edges, setNodes, setEdges]);

  // Auto-layout on first load when all nodes are at (0,0)
  useEffect(() => {
    if (nodes.length > 0 && hasZeroPositions(nodes) && !isLayouting) {
      // Small delay to let DOM render node elements for measurement
      const timer = setTimeout(async () => {
        await applyLayout();
        // Port assignment after layout so handles reflect new positions
        // (slight delay for state to propagate)
        setTimeout(() => applyPortAssignment(), 50);
      }, 100);
      return () => clearTimeout(timer);
    }
    // Only run when nodes count changes (initial load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // Track dirty state
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      setIsDirty(true);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      setIsDirty(true);
    },
    [onEdgesChange]
  );

  // Get selected items
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return node ? { id: node.id, data: node.data } : null;
  }, [nodes, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    return edge && edge.data ? { id: edge.id, data: edge.data } : null;
  }, [edges, selectedEdgeId]);

  // Get executor info for selected node
  const selectedExecutorInfo = useMemo(() => {
    if (!selectedNode || !catalog) return undefined;
    return catalog.executors.find((e) => e.type === selectedNode.data.executorType);
  }, [selectedNode, catalog]);

  // Handle execution events
  const handleExecutionEvent = useCallback(
    (event: ExecutionEvent) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (event.nodeId === node.id) {
            const updates: Partial<AOPEGNodeData> = {};

            switch (event.type) {
              case 'node:started':
                updates.isRunning = true;
                updates.isCompleted = false;
                updates.isFailed = false;
                updates.isRetrying = false;
                updates.errorMessage = undefined;
                break;
              case 'node:completed':
                updates.isRunning = false;
                updates.isCompleted = true;
                updates.metrics = event.data.metrics as AOPEGNodeData['metrics'];
                break;
              case 'node:failed':
                updates.isRunning = false;
                updates.isFailed = true;
                updates.errorMessage = event.data.error as string;
                break;
              case 'node:retry':
                updates.isRetrying = true;
                break;
            }

            return { ...node, data: { ...node.data, ...updates } };
          }
          return node;
        })
      );

      // Update edges for taken paths
      if (event.type === 'node:completed' && event.data.nextNodeId) {
        setEdges((eds) =>
          eds.map((edge) => {
            if (
              edge.source === event.nodeId &&
              edge.target === event.data.nextNodeId
            ) {
              return {
                ...edge,
                data: { ...edge.data, wasTaken: true },
              };
            }
            return edge;
          })
        );
      }
    },
    [setNodes, setEdges]
  );

  // SSE stream for live updates
  useExecutionStream(execution?.id || null, handleExecutionEvent);

  // Connection handling
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        id: uuidv4(),
        type: 'aopegEdge',
        data: createDefaultEdgeData(),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setIsDirty(true);
      // Reassign ports after edge added (next tick so state is updated)
      setTimeout(() => applyPortAssignment(), 0);
    },
    [setEdges, applyPortAssignment]
  );

  // Drag and drop from catalog
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const executorData = event.dataTransfer.getData('application/aopeg-executor');
      if (!executorData || !reactFlowInstance || !reactFlowWrapper.current) return;

      const executor: ExecutorInfo = JSON.parse(executorData);
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: AOPEGNodeType = {
        id: uuidv4(),
        type: 'aopegNode',
        position,
        data: createDefaultNodeData(executor),
      };

      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
    },
    [reactFlowInstance, setNodes]
  );

  // Selection handling
  const onNodeClick = useCallback((_: React.MouseEvent, node: AOPEGNodeType) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: AOPEGEdgeType) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // Node update handler
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Partial<AOPEGNodeData>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, ...data } };
          }
          return node;
        })
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  // Edge update handler
  const handleEdgeUpdate = useCallback(
    (edgeId: string, data: Partial<AOPEGEdgeData>) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            return { ...edge, data: { ...edge.data, ...data } };
          }
          return edge;
        })
      );
      setIsDirty(true);
    },
    [setEdges]
  );

  // Node delete handler
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
      setIsDirty(true);
      setTimeout(() => applyPortAssignment(), 0);
    },
    [setNodes, setEdges, applyPortAssignment]
  );

  // Edge delete handler
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
      setIsDirty(true);
      setTimeout(() => applyPortAssignment(), 0);
    },
    [setEdges, applyPortAssignment]
  );

  // Node duplicate handler
  const handleNodeDuplicate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const newNode: AOPEGNodeType = {
        ...node,
        id: uuidv4(),
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        data: {
          ...node.data,
          displayName: `${node.data.displayName} (Copy)`,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
    },
    [nodes, setNodes]
  );

  // Save handler
  const handleSave = useCallback(async () => {
    const graphData = reactFlowToGraphRequest(nodes as AOPEGNodeType[], edges as AOPEGEdgeType[], {
      id: graphId,
      name: graphName,
      domain: graphDomain,
    });

    const saved = await saveGraph(graphData);
    if (saved) {
      setIsDirty(false);
      onGraphSaved?.(saved);
    }
  }, [nodes, edges, graphId, graphName, graphDomain, saveGraph, onGraphSaved]);

  // Validate handler
  const handleValidate = useCallback(async () => {
    if (!graphId) {
      // For new graphs, do client-side validation only
      const errors: string[] = [];
      if (nodes.length === 0) errors.push('Graph must have at least one node');
      if (!graphName.trim()) errors.push('Graph must have a name');
      setValidationResult({
        valid: errors.length === 0,
        errors,
        warnings: [],
      });
      return;
    }

    const result = await validateGraph(graphId);
    setValidationResult(result);
  }, [graphId, nodes, graphName, validateGraph]);

  // Execute handler
  const handleExecute = useCallback(async () => {
    if (!graphId) {
      alert('Please save the graph first');
      return;
    }

    // Activate if not active
    if (graph?.status !== 'ACTIVE') {
      await activateGraph(graphId);
    }

    // Clear previous execution state
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isRunning: false,
          isCompleted: false,
          isFailed: false,
          isRetrying: false,
          metrics: undefined,
          errorMessage: undefined,
        },
      }))
    );
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        data: { ...edge.data, wasTaken: false, isEvaluating: false },
      }))
    );

    try {
      const input = JSON.parse(executionInput);
      await startExecution(graphId, input);
    } catch {
      alert('Invalid input JSON');
    }
  }, [
    graphId,
    graph,
    activateGraph,
    executionInput,
    startExecution,
    setNodes,
    setEdges,
  ]);

  // Cancel handler
  const handleCancel = useCallback(async () => {
    if (execution?.id) {
      await cancelExecution(execution.id);
    }
  }, [execution, cancelExecution]);

  // Export handler
  const handleExport = useCallback(() => {
    const graphData = reactFlowToGraphRequest(nodes as AOPEGNodeType[], edges as AOPEGEdgeType[], {
      id: graphId,
      name: graphName,
      domain: graphDomain,
    });

    const blob = new Blob([JSON.stringify(graphData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graphName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, graphId, graphName, graphDomain]);

  // Import handler
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      try {
        const data = JSON.parse(text) as GraphResponse;
        const { nodes: flowNodes, edges: flowEdges } = graphResponseToReactFlow(data);
        setNodes(flowNodes);
        setEdges(flowEdges);
        setGraphName(data.name || 'Imported Graph');
        setGraphDomain(data.domain || 'common');
        setIsDirty(true);
      } catch {
        alert('Invalid graph file');
      }
    };
    input.click();
  }, [setNodes, setEdges]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    reactFlowInstance?.zoomIn();
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance?.zoomOut();
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView();
  }, [reactFlowInstance]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117]" style={{ minHeight: '100%', height: '100%' }}>
      {/* Toolbar */}
      <GraphEditorToolbar
        graphName={graphName}
        onNameChange={(name) => {
          setGraphName(name);
          setIsDirty(true);
        }}
        domain={graphDomain}
        onDomainChange={(domain) => {
          setGraphDomain(domain);
          setIsDirty(true);
        }}
        isDirty={isDirty}
        isSaving={loading}
        isExecuting={execution?.status === 'RUNNING'}
        isLayouting={isLayouting}
        validationResult={validationResult}
        onSave={handleSave}
        onValidate={handleValidate}
        onExecute={handleExecute}
        onCancel={handleCancel}
        onExport={handleExport}
        onImport={handleImport}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        onAutoLayout={async () => {
          await applyLayout();
          setTimeout(() => applyPortAssignment(), 50);
        }}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0, height: '100%', width: '100%' }}>
        {/* Node Catalog - fetches from Core KB */}
        <NodeCatalogSidebar
          onNodeDragStart={() => {}}
        />

        {/* Graph Canvas - use absolute positioning for React Flow */}
        <div
          className="flex-1"
          ref={reactFlowWrapper}
          style={{ position: 'relative', flex: 1, backgroundColor: '#0d1117', width: '100%'  }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={(event, node) => {
                onNodeDragStop(event, node);
                // Reassign ports after drag (positions changed)
                setTimeout(() => applyPortAssignment(), 50);
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              snapToGrid
              snapGrid={[20, 20]}
              style={{ backgroundColor: '#0d1117' }}
            >
              <Controls
                className="!bg-[#21262d] !border-[#30363d] !shadow-lg [&>button]:!bg-[#21262d] [&>button]:!border-[#30363d] [&>button]:!text-[#8b949e] [&>button:hover]:!bg-[#30363d]"
              />
              <Background
                gap={20}
                size={1}
                color="#30363d"
                style={{ backgroundColor: '#0d1117' }}
              />
              <MiniMap
                nodeStrokeWidth={3}
                zoomable
                pannable
                style={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                }}
                nodeColor="#21262d"
                maskColor="rgba(13, 17, 23, 0.8)"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Properties Panel */}
        <PropertiesPanel
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          executorInfo={selectedExecutorInfo}
          onNodeUpdate={handleNodeUpdate}
          onEdgeUpdate={handleEdgeUpdate}
          onNodeDelete={handleNodeDelete}
          onEdgeDelete={handleEdgeDelete}
          onNodeDuplicate={handleNodeDuplicate}
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
        />

        {/* AI Chat Panel */}
        <AIChatPanel
          width={360}
          isOpen={showAIPanel}
          onToggle={() => setShowAIPanel(!showAIPanel)}
          onGraphUpdate={(agentGraph: AgentGraph) => {
            console.log('[GraphEditor] onGraphUpdate received:', {
              nodes: agentGraph.nodes?.length || 0,
              edges: agentGraph.edges?.length || 0,
              name: agentGraph.name,
            });
            // Convert AgentGraph to ReactFlow format
            if (agentGraph.nodes) {
              const flowNodes: AOPEGNodeType[] = agentGraph.nodes.map((n) => ({
                id: n.id,
                type: 'aopegNode' as const,
                position: n.position,
                data: {
                  executorType: n.data.executorType,
                  displayName: n.data.displayName,
                  description: n.data.description || '',
                  domain: n.data.executorType.split('.')[0] || 'common',
                  parameters: n.data.parameters || {},
                  timeout: n.data.timeout || 30000,
                  retryPolicy: {
                    maxRetries: n.data.retryPolicy?.maxAttempts || 3,
                    backoffMs: n.data.retryPolicy?.delayMs || 1000,
                    backoffMultiplier: n.data.retryPolicy?.backoffMultiplier || 2,
                  },
                  enabled: n.data.enabled !== false,
                },
              }));
              setNodes(flowNodes);
            }
            if (agentGraph.edges) {
              const flowEdges = agentGraph.edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'aopegEdge',
                data: e.data || createDefaultEdgeData(),
                markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
              }));
              setEdges(flowEdges as AOPEGEdgeType[]);
            }
            if (agentGraph.name) {
              setGraphName(agentGraph.name);
            }
            setIsDirty(true);
          }}
        />
      </div>
    </div>
  );
};

// Wrap with ReactFlowProvider
export const GraphEditor: React.FC<GraphEditorProps> = (props) => (
  <ReactFlowProvider>
    <GraphEditorInner {...props} />
  </ReactFlowProvider>
);

export default GraphEditor;
