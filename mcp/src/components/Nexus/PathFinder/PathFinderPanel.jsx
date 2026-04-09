import React, { useState, useCallback } from 'react';
import { useNexusStore } from '../../../stores/nexusStore';
import { findPaths } from '../../../services/nexus.service';
import NodeSelector from './NodeSelector';
import PathOptions from './PathOptions';
import PathList from './PathList';
import './PathFinderPanel.css';

/**
 * Path Finder Panel - Find and visualize paths between nodes
 */
const PathFinderPanel = ({
  nodes = [],
  edges = [],
  initialSource = null,
  onClose,
  onNodeClick,
}) => {
  const [sourceNode, setSourceNode] = useState(initialSource);
  const [targetNode, setTargetNode] = useState(null);
  const [options, setOptions] = useState({
    maxDepth: 5,
    direction: 'any',
    limit: 10,
  });
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const namespace = useNexusStore(state => state.namespace);
  const clearVisualClusters = useNexusStore(state => state.clearVisualClusters);

  const handleSwap = useCallback(() => {
    const temp = sourceNode;
    setSourceNode(targetNode);
    setTargetNode(temp);
  }, [sourceNode, targetNode]);

  const handleFindPaths = useCallback(async () => {
    if (!sourceNode || !targetNode) return;

    setLoading(true);
    setError(null);
    setPaths([]);
    clearVisualClusters();

    try {
      const result = await findPaths(
        namespace,
        sourceNode.id,
        targetNode.id,
        options
      );

      if (result.fallback || result.paths.length === 0) {
        const clientPaths = findPathsClientSide(
          sourceNode.id,
          targetNode.id,
          nodes,
          edges,
          options
        );
        setPaths(clientPaths);
      } else {
        setPaths(result.paths);
      }
    } catch (err) {
      console.error('Path finding failed:', err);
      setError(err.message || 'Failed to find paths');
    } finally {
      setLoading(false);
    }
  }, [sourceNode, targetNode, namespace, options, nodes, edges, clearVisualClusters]);

  const handleClearResults = useCallback(() => {
    setPaths([]);
    setError(null);
    clearVisualClusters();
  }, [clearVisualClusters]);

  const canSearch = sourceNode && targetNode && sourceNode.id !== targetNode.id;

  return (
    <div className="path-finder-panel">
      <div className="path-finder-panel__header">
        <h3 className="path-finder-panel__title">🛤️ Path Finder</h3>
        {onClose && (
          <button className="path-finder-panel__close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="path-finder-panel__selectors">
        <NodeSelector
          label="From"
          value={sourceNode}
          nodes={nodes}
          onChange={setSourceNode}
          onClear={() => setSourceNode(null)}
          placeholder="Select source node..."
        />

        <button
          className="path-finder-panel__swap"
          onClick={handleSwap}
          disabled={!sourceNode && !targetNode}
          title="Swap source and target"
        >
          ⇅
        </button>

        <NodeSelector
          label="To"
          value={targetNode}
          nodes={nodes}
          onChange={setTargetNode}
          onClear={() => setTargetNode(null)}
          placeholder="Select target node..."
        />
      </div>

      <PathOptions options={options} onChange={setOptions} />

      <button
        className="path-finder-panel__search-btn"
        onClick={handleFindPaths}
        disabled={!canSearch || loading}
      >
        {loading ? '⟳ Searching...' : '🔍 Find Paths'}
      </button>

      {sourceNode && targetNode && sourceNode.id === targetNode.id && (
        <div className="path-finder-panel__warning">
          Source and target cannot be the same node
        </div>
      )}

      <PathList
        paths={paths}
        loading={loading}
        error={error}
        onShowPath={() => {}}
        onNodeClick={onNodeClick}
        onClearResults={handleClearResults}
      />
    </div>
  );
};

/**
 * Client-side BFS path finding (fallback)
 */
const findPathsClientSide = (sourceId, targetId, nodes, edges, options) => {
  const { maxDepth = 5, limit = 10, direction = 'any' } = options;

  // Build adjacency list
  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.id, []));

  edges.forEach(edge => {
    const src = edge.source;
    const tgt = edge.target;
    if (direction === 'any' || direction === 'outgoing') {
      adjacency.get(src)?.push({ nodeId: tgt, edge });
    }
    if (direction === 'any' || direction === 'incoming') {
      adjacency.get(tgt)?.push({ nodeId: src, edge });
    }
  });

  const paths = [];
  const queue = [[{ id: sourceId, path: [sourceId], edges: [] }]];

  while (queue.length > 0 && paths.length < limit) {
    const level = queue.shift();
    const nextLevel = [];

    for (const { id, path, edges: pathEdges } of level) {
      if (path.length > maxDepth + 1) continue;

      if (id === targetId && path.length > 1) {
        const pathNodes = path.map(nodeId =>
          nodes.find(n => n.id === nodeId) || { id: nodeId }
        );
        paths.push({ nodes: pathNodes, edges: pathEdges });
        continue;
      }

      const neighbors = adjacency.get(id) || [];
      for (const { nodeId, edge } of neighbors) {
        if (!path.includes(nodeId)) {
          nextLevel.push({
            id: nodeId,
            path: [...path, nodeId],
            edges: [...pathEdges, edge],
          });
        }
      }
    }

    if (nextLevel.length > 0) {
      queue.push(nextLevel);
    }
  }

  paths.sort((a, b) => a.nodes.length - b.nodes.length);
  return paths.slice(0, limit);
};

export default PathFinderPanel;
