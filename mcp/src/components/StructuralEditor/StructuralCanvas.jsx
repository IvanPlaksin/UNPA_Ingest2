import React, { useCallback, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useReactFlow } from 'reactflow';
import 'reactflow/dist/style.css';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import RootNode from './nodes/RootNode';
import FieldNode from './nodes/FieldNode';

const nodeTypes = {
  structuralRoot: RootNode,
  structuralField: FieldNode,
};

export default function StructuralCanvas() {
  const nodes = useStructuralEditorStore(s => s.nodes);
  const edges = useStructuralEditorStore(s => s.edges);
  const selectNode = useStructuralEditorStore(s => s.selectNode);
  const moveNode = useStructuralEditorStore(s => s.moveNode);
  const addNode = useStructuralEditorStore(s => s.addNode);
  const selectedNodeId = useStructuralEditorStore(s => s.selectedNodeId);
  const reactFlowWrapper = useRef(null);

  const onNodeClick = useCallback((_, node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onNodeDragStop = useCallback((_, node) => {
    moveNode(node.id, node.position);
  }, [moveNode]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('application/structural-field');
    if (!data) return;

    const fieldType = JSON.parse(data);
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    addNode(fieldType, {
      x: event.clientX - bounds.left - 80,
      y: event.clientY - bounds.top - 20,
    });
  }, [addNode]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Highlight selected
  const styledNodes = nodes.map(n => ({
    ...n,
    selected: n.id === selectedNodeId,
  }));

  return (
    <div ref={reactFlowWrapper} style={{ flex: 1, background: '#0d1117' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
        style={{ background: '#0d1117' }}
      >
        <Background color="#21262d" gap={20} size={1} />
        <Controls
          style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(n) => n.data?.nodeType === 'ROOT' ? '#6366f1' : '#3b82f6'}
          style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6 }}
          maskColor="rgba(13,17,23,.8)"
        />
      </ReactFlow>
    </div>
  );
}
