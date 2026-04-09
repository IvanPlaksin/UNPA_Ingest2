/**
 * useDragRepulsion — resolve node overlaps after dragging.
 * Migrated from AOPEG/hooks/useDragRepulsion.ts (CONS-21).
 * On drag stop: full collision resolution pushes overlapping nodes apart.
 */
import { useCallback } from 'react';
import { resolveCollisions } from '../utils/collisionResolver';

export function useDragRepulsion(nodes, setNodes, options = {}) {
  const { enabled = true, padding = 24 } = options;

  const onNodeDrag = useCallback(() => {
    // Intentionally empty — only the dragged node moves during drag.
  }, []);

  const onNodeDragStop = useCallback(() => {
    if (!enabled) return;
    setNodes(currentNodes => {
      const resolved = resolveCollisions(currentNodes, { padding });
      const hasChanges = resolved.some(
        (n, i) =>
          n.position.x !== currentNodes[i].position.x ||
          n.position.y !== currentNodes[i].position.y
      );
      return hasChanges ? resolved : currentNodes;
    });
  }, [enabled, padding, setNodes]);

  return { onNodeDrag, onNodeDragStop };
}

export default useDragRepulsion;
