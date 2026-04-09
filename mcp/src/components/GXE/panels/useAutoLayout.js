/**
 * useAutoLayout — auto-position nodes created by AI Assistant.
 *
 * Provides:
 * - getNextPosition: position for a single new node
 * - layoutNewNodes: position array of new nodes in a row
 * - relayoutGraph: full topological re-layout of all nodes
 */

import { useCallback } from 'react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;
const HORIZONTAL_GAP = 80;
const START_X = 100;
const START_Y = 100;

/**
 * Topological sort (Kahn's algorithm) for DAG layout.
 */
function topologicalSort(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  const adjacency = new Map(nodes.map(n => [n.id, []]));

  for (const edge of edges) {
    if (inDegree.has(edge.target)) {
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    }
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source).push(edge.target);
    }
  }

  const queue = [];
  const result = [];

  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeMap.get(nodeId);
    if (node) result.push(node);

    for (const targetId of (adjacency.get(nodeId) || [])) {
      inDegree.set(targetId, inDegree.get(targetId) - 1);
      if (inDegree.get(targetId) === 0) {
        queue.push(targetId);
      }
    }
  }

  // Append disconnected nodes
  for (const node of nodes) {
    if (!result.find(n => n.id === node.id)) {
      result.push(node);
    }
  }

  return result;
}

function useAutoLayout() {
  const getNextPosition = useCallback((existingNodes, insertAfter = null) => {
    if (!existingNodes || existingNodes.length === 0) {
      return { x: START_X, y: START_Y };
    }

    if (insertAfter) {
      const afterNode = existingNodes.find(n => n.id === insertAfter);
      if (afterNode) {
        return {
          x: (afterNode.position?.x || 0) + NODE_WIDTH + HORIZONTAL_GAP,
          y: afterNode.position?.y || START_Y,
        };
      }
    }

    // Place after rightmost node
    const rightmost = existingNodes.reduce((max, node) =>
      (node.position?.x || 0) > (max.position?.x || 0) ? node : max
    , existingNodes[0]);

    return {
      x: (rightmost.position?.x || 0) + NODE_WIDTH + HORIZONTAL_GAP,
      y: rightmost.position?.y || START_Y,
    };
  }, []);

  const layoutNewNodes = useCallback((newNodes, existingNodes) => {
    let currentX = START_X;

    if (existingNodes && existingNodes.length > 0) {
      const rightmost = existingNodes.reduce((max, node) =>
        (node.position?.x || 0) > (max.position?.x || 0) ? node : max
      , existingNodes[0]);
      currentX = (rightmost.position?.x || 0) + NODE_WIDTH + HORIZONTAL_GAP * 2;
    }

    return newNodes.map((node, index) => ({
      ...node,
      position: {
        x: currentX + index * (NODE_WIDTH + HORIZONTAL_GAP),
        y: START_Y,
      },
    }));
  }, []);

  const relayoutGraph = useCallback((nodes, edges) => {
    if (!nodes || nodes.length === 0) return nodes;

    const sorted = topologicalSort(nodes, edges || []);

    return sorted.map((node, index) => ({
      ...node,
      position: {
        x: START_X + index * (NODE_WIDTH + HORIZONTAL_GAP),
        y: START_Y,
      },
    }));
  }, []);

  return { getNextPosition, layoutNewNodes, relayoutGraph };
}

export { useAutoLayout, topologicalSort };
export default useAutoLayout;
