import React, { useMemo } from 'react';
import ReactFlow, { ReactFlowProvider, Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStructuralEditorStore from '../../../stores/structuralEditorStore';
import RootNode from '../nodes/RootNode';
import FieldNode from '../nodes/FieldNode';

const nodeTypes = { structuralRoot: RootNode, structuralField: FieldNode };

const CONSTRAINT_COLORS = {
  REQUIRED: '#ef4444',
  REQUIRED_IF: '#f97316',
  VISIBLE_IF: '#8b5cf6',
  DISABLED_IF: '#6366f1',
  MIN_LENGTH: '#f59e0b',
  MAX_LENGTH: '#f59e0b',
  PATTERN: '#06b6d4',
  MIN: '#f59e0b',
  MAX: '#f59e0b',
  CUSTOM: '#ec4899',
};

function ConstraintNode({ data }) {
  const color = CONSTRAINT_COLORS[data.ruleType] || '#64748b';
  return (
    <div style={{
      background: '#1a1a2e', border: `2px solid ${color}`,
      borderRadius: 8, padding: '6px 10px', minWidth: 140, maxWidth: 200,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {data.ruleType}
      </div>
      <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 2 }}>
        {data.targetField || data.targetFields?.join(', ') || '(aggregate)'}
      </div>
      {data.value !== undefined && (
        <div style={{ fontSize: 9, color: '#8b949e', marginTop: 2 }}>= {String(data.value)}</div>
      )}
    </div>
  );
}

const constraintNodeTypes = { constraintRule: ConstraintNode };

export default function GraphView() {
  const nodes = useStructuralEditorStore(s => s.nodes);
  const edges = useStructuralEditorStore(s => s.edges);
  const constraintRules = useStructuralEditorStore(s => s.constraintRules);
  const selectedNodeId = useStructuralEditorStore(s => s.selectedNodeId);
  const selectNode = useStructuralEditorStore(s => s.selectNode);
  const moveNode = useStructuralEditorStore(s => s.moveNode);

  const styledNodes = nodes.map(n => ({ ...n, selected: n.id === selectedNodeId }));

  // Build constraint graph nodes/edges
  const { cNodes, cEdges } = useMemo(() => {
    if (!constraintRules.length) return { cNodes: [], cEdges: [] };

    const cn = constraintRules.map((rule, i) => ({
      id: rule.nodeId || `crule_${i}`,
      type: 'constraintRule',
      position: { x: 50 + (i % 3) * 200, y: 30 + Math.floor(i / 3) * 70 },
      data: rule,
    }));

    return { cNodes: cn, cEdges: [] };
  }, [constraintRules]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* STRUCTURAL graph */}
      <div style={{ flex: 1, position: 'relative', borderRight: '1px solid #30363d' }}>
        <div style={{
          position: 'absolute', top: 8, left: 12, zIndex: 10,
          fontSize: 9, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase',
          background: '#0d1117cc', padding: '3px 8px', borderRadius: 4, letterSpacing: 1,
        }}>
          STRUCTURAL
        </div>
        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => selectNode(n.id)}
          onPaneClick={() => selectNode(null)}
          onNodeDragStop={(_, n) => moveNode(n.id, n.position)}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          style={{ background: '#0d1117' }}
        >
          <Background color="#21262d" gap={20} size={1} />
          <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }} showInteractive={false} />
        </ReactFlow>
      </div>

      {/* CONSTRAINT graph */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 8, left: 12, zIndex: 10,
          fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase',
          background: '#0d1117cc', padding: '3px 8px', borderRadius: 4, letterSpacing: 1,
        }}>
          CONSTRAINT ({constraintRules.length} rules)
        </div>
        {constraintRules.length > 0 ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={cNodes}
              edges={cEdges}
              nodeTypes={constraintNodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              style={{ background: '#0a0a1a' }}
            >
              <Background color="#1a1a2e" gap={20} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0a0a1a', color: '#484f58', fontSize: 11,
          }}>
            No CONSTRAINT rules defined
          </div>
        )}
      </div>
    </div>
  );
}
